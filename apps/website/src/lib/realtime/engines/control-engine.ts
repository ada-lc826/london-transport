import { throttle } from '@tanstack/pacer';

import { isSceneId, type SceneId } from '../../../scenes/scene-state';
import { getCityMapView, isMapCity } from '../map-cities';
import { controlStore } from '../stores/control-store';
import type {
    BusMessage,
    ControlSliderMessage,
    ControlStoreState,
    HelloBusMessage,
    MapCity,
    SceneStateMessage,
    ScreenMapViewMessage
} from '../types';
import { BusEngine } from './bus-engine';

const SLIDER_BROADCAST_WAIT_MS = 100;
const SLIDER_MIN = 0;
const SLIDER_MAX = 100;
const MAP_ZOOM_MIN = 6;
const MAP_ZOOM_MAX = 18;

export class ControlEngine extends BusEngine<ControlStoreState> {
    // Slider moves can emit many events per second; throttle keeps interaction smooth locally
    // while reducing websocket chatter for all connected peers.
    private readonly broadcastSliderValueThrottled = throttle(
        (value: number) => {
            this.send({
                type: 'control/slider',
                value,
                peerId: this.getPeerId() ?? undefined
            });
        },
        {
            wait: SLIDER_BROADCAST_WAIT_MS,
            leading: true,
            trailing: true
        }
    );

    private readonly broadcastMapZoomThrottled = throttle(
        (zoom: number) => {
            this.send({
                type: 'screen/map-view',
                city: this.store.state.selectedCity,
                view: { zoom },
                peerId: this.getPeerId() ?? undefined
            });
        },
        {
            wait: SLIDER_BROADCAST_WAIT_MS,
            leading: true,
            trailing: true
        }
    );

    private constructor() {
        super('control', controlStore);
    }

    static getInstance() {
        const globalWithControlEngine = globalThis as typeof globalThis & {
            __controlEngineInstance?: ControlEngine;
        };

        if (!globalWithControlEngine.__controlEngineInstance) {
            globalWithControlEngine.__controlEngineInstance = new ControlEngine();
        }

        return globalWithControlEngine.__controlEngineInstance;
    }

    setSliderInteracting(isSliderInteracting: boolean) {
        // Stored so remote updates can be ignored while local user is dragging.
        this.store.setState((prev) => {
            if (prev.isSliderInteracting === isSliderInteracting) return prev;
            return {
                ...prev,
                isSliderInteracting
            };
        });
    }

    setSliderValue(value: number) {
        const clampedValue = this.clampSliderValue(value);

        this.store.setState((prev) => {
            if (prev.sliderValue === clampedValue) return prev;
            return {
                ...prev,
                sliderValue: clampedValue
            };
        });

        this.broadcastSliderValueThrottled(clampedValue);
        // Slider value is the source-of-truth input for zoom UX in this demo.
        this.broadcastMapZoomThrottled(this.zoomFromSlider(clampedValue));
    }

    selectCity(city: MapCity) {
        let hasChanged = false;
        this.store.setState((prev) => {
            if (prev.selectedCity === city) return prev;
            hasChanged = true;
            return {
                ...prev,
                selectedCity: city
            };
        });

        if (!hasChanged) return;

        // Broadcast full target view when city changes so all screens jump to the same anchor.
        this.send({
            type: 'screen/map-view',
            city,
            view: {
                ...getCityMapView(city),
                zoom: this.zoomFromSlider(this.store.state.sliderValue)
            },
            peerId: this.getPeerId() ?? undefined
        });
    }

    // Scene intents. The bus owns scene state and replies to everyone with `scene/state`, so
    // the local store only changes when that reply arrives.
    gotoScene(sceneId: SceneId, step = 0) {
        this.send({ type: 'scene/goto', sceneId, step });
    }

    stepScene(delta: 1 | -1) {
        this.send({ type: 'scene/step', delta });
    }

    setSceneParam(key: string, value: string) {
        this.send({ type: 'scene/param', key, value });
    }

    setScenePlaying(playing: boolean) {
        this.send({ type: 'scene/play', playing });
    }

    protected override onMessage(message: BusMessage) {
        if (message.type === 'control/slider') {
            const sliderMessage = message as ControlSliderMessage;
            if (typeof sliderMessage.value !== 'number') return;
            this.store.setState((prev) => {
                // If the local user is actively dragging, ignore remote slider echoes
                // to avoid "fighting cursors" and jitter.
                if (prev.isSliderInteracting) return prev;

                const clampedValue = this.clampSliderValue(sliderMessage.value);
                if (prev.sliderValue === clampedValue) return prev;

                return {
                    ...prev,
                    sliderValue: clampedValue
                };
            });
            return;
        }

        if (message.type === 'screen/map-view') {
            // Mirror incoming map events so all control clients display shared state.
            const mapViewMessage = message as ScreenMapViewMessage;
            this.store.setState((prev) => {
                const nextCity = isMapCity(mapViewMessage.city)
                    ? mapViewMessage.city
                    : prev.selectedCity;
                const nextSliderValue =
                    typeof mapViewMessage.view?.zoom === 'number'
                        ? this.sliderFromZoom(mapViewMessage.view.zoom)
                        : prev.sliderValue;

                if (prev.selectedCity === nextCity && prev.sliderValue === nextSliderValue) {
                    return prev;
                }

                return {
                    ...prev,
                    selectedCity: nextCity,
                    sliderValue: nextSliderValue
                };
            });
            return;
        }

        if (message.type === 'scene/state') {
            this.applySceneState((message as SceneStateMessage).scene);
        }
    }

    protected override onHello(hello: HelloBusMessage) {
        const state = hello.state;
        if (!state) return;

        // Rehydrate control UI from bus snapshot so newly opened tablets are immediately in sync.
        this.store.setState((prev) => {
            const nextCity = state.city;
            const nextSliderValue = this.sliderFromZoom(state.zoom);
            if (prev.selectedCity === nextCity && prev.sliderValue === nextSliderValue) {
                return prev;
            }
            return {
                ...prev,
                selectedCity: nextCity,
                sliderValue: nextSliderValue
            };
        });
        this.applySceneState(state.scene, { force: true });
    }

    private applySceneState(scene: SceneStateMessage['scene'] | undefined, { force = false } = {}) {
        if (!scene || !isSceneId(scene.id)) return;
        this.store.setState((prev) => {
            if (!force && prev.scene && scene.revision <= prev.scene.revision) return prev;
            return { ...prev, scene };
        });
    }

    private clampSliderValue(value: number) {
        // Single clamp utility keeps incoming and outgoing slider values consistent.
        return Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, value));
    }

    private zoomFromSlider(sliderValue: number) {
        // Linear mapping keeps control UI simple and predictable.
        const normalized = (sliderValue - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN);
        return MAP_ZOOM_MIN + normalized * (MAP_ZOOM_MAX - MAP_ZOOM_MIN);
    }

    private sliderFromZoom(zoom: number) {
        const clampedZoom = Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, zoom));
        const normalized = (clampedZoom - MAP_ZOOM_MIN) / (MAP_ZOOM_MAX - MAP_ZOOM_MIN);
        return this.clampSliderValue(normalized * (SLIDER_MAX - SLIDER_MIN) + SLIDER_MIN);
    }
}

export const controlEngine = ControlEngine.getInstance();
