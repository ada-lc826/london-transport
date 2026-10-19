import { isSceneId } from '../../../scenes/scene-state';
import { ClockEstimator, decodePong, encodePing, sampleFromPong } from '../clock';
import { getCityMapView, isMapCity } from '../map-cities';
import { screenStore } from '../stores/screen-store';
import type {
    BusMessage,
    HelloBusMessage,
    SceneStateMessage,
    ScreenMapViewMessage,
    ScreenMapViewState,
    ScreenStoreState
} from '../types';
import { BusEngine } from './bus-engine';

// Vizzy pings every 2 s; the estimator keeps the best of the last 8 samples (~16 s window).
const CLOCK_PING_INTERVAL_MS = 2_000;

export class ScreenEngine extends BusEngine<ScreenStoreState> {
    private readonly clock = new ClockEstimator();
    private pingTimer: ReturnType<typeof setInterval> | null = null;

    private constructor() {
        super('screen', screenStore);
    }

    static getInstance() {
        const globalWithScreenEngine = globalThis as typeof globalThis & {
            __screenEngineInstance?: ScreenEngine;
        };

        if (!globalWithScreenEngine.__screenEngineInstance) {
            globalWithScreenEngine.__screenEngineInstance = new ScreenEngine();
        }

        return globalWithScreenEngine.__screenEngineInstance;
    }

    setMapView(view: Partial<ScreenMapViewState>) {
        // Merge patch updates so callers can provide only changed camera fields.
        this.store.setState((prev) => ({
            ...prev,
            mapView: {
                ...prev.mapView,
                ...view
            }
        }));
    }

    /** Current server time, or null before the first clock sample arrives. */
    serverNow(): number | null {
        const offset = this.store.state.clockOffsetMs;
        return offset === null ? null : localNow() + offset;
    }

    protected override onOpen() {
        // A new connection may reach a different server process, so start the estimate afresh.
        this.clock.reset();
        this.sendPing();
        this.pingTimer = setInterval(() => this.sendPing(), CLOCK_PING_INTERVAL_MS);
    }

    protected override onClose() {
        if (this.pingTimer !== null) clearInterval(this.pingTimer);
        this.pingTimer = null;
    }

    protected override onBinary(bytes: Uint8Array) {
        const pong = decodePong(bytes);
        if (!pong) return;
        this.clock.add(sampleFromPong(pong.t0, pong.t1, pong.t2, localNow()));
        const best = this.clock.best();
        if (!best) return;
        this.store.setState((prev) =>
            prev.clockOffsetMs === best.offsetMs && prev.clockRttMs === best.rttMs
                ? prev
                : { ...prev, clockOffsetMs: best.offsetMs, clockRttMs: best.rttMs }
        );
    }

    protected override onMessage(message: BusMessage) {
        if (message.type === 'screen/map-view') {
            const mapViewMessage = message as ScreenMapViewMessage;
            this.applyMapViewMessage(mapViewMessage);
            return;
        }

        if (message.type === 'scene/state') {
            this.applySceneState((message as SceneStateMessage).scene);
        }
    }

    protected override onHello(hello: HelloBusMessage) {
        if (!hello.state) return;
        // Apply the same message handlers used for live events so hello-state and realtime updates
        // follow one code path and stay behaviorally consistent.
        this.applyMapViewMessage({
            type: 'screen/map-view',
            city: hello.state.city,
            view: { zoom: hello.state.zoom }
        });
        this.applySceneState(hello.state.scene, { force: true });
    }

    private sendPing() {
        this.sendBinary(encodePing(localNow()));
    }

    private applySceneState(scene: SceneStateMessage['scene'] | undefined, { force = false } = {}) {
        if (!scene || !isSceneId(scene.id)) return;
        this.store.setState((prev) => {
            // Revisions only grow within one server process; a hello may come from a restarted
            // server whose count began again, so it always wins.
            if (!force && prev.scene && scene.revision <= prev.scene.revision) return prev;
            return { ...prev, scene };
        });
    }

    private applyMapViewMessage(mapViewMessage: ScreenMapViewMessage) {
        // Start from current state and layer updates in deterministic order:
        // city preset first, then granular overrides from `view`.
        let nextView = this.store.state.mapView;

        if (isMapCity(mapViewMessage.city)) {
            nextView = {
                ...nextView,
                ...getCityMapView(mapViewMessage.city)
            };
        }

        if (mapViewMessage.view && typeof mapViewMessage.view === 'object') {
            const view = mapViewMessage.view;
            nextView = {
                ...nextView,
                longitude: typeof view.longitude === 'number' ? view.longitude : nextView.longitude,
                latitude: typeof view.latitude === 'number' ? view.latitude : nextView.latitude,
                zoom: typeof view.zoom === 'number' ? view.zoom : nextView.zoom,
                bearing: typeof view.bearing === 'number' ? view.bearing : nextView.bearing,
                pitch: typeof view.pitch === 'number' ? view.pitch : nextView.pitch
            };
        }

        this.setMapView(nextView);
    }
}

export const screenEngine = ScreenEngine.getInstance();

// Epoch-based local clock, comparable with the server's Date.now() once offset is applied.
// Screens read wall-clock time only here; rendering uses `serverNow()` so all screens agree.
function localNow() {
    return performance.timeOrigin + performance.now();
}
