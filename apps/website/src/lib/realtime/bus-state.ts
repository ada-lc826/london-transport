import { isSceneId, SCENE_META, initialSceneState } from '../../scenes/scene-state';
import { reanchor } from './clock';
import { getCityMapView, isMapCity } from './map-cities';
import type { BusMessage, BusSharedState, ScreenMapViewMessage } from './types';

// The bus's shared state and how each incoming message changes it. Kept free of websocket code
// so it can be unit-tested; `routes/bus.ts` wires it to crossws.

export function initialBusState(serverNowMs: number): BusSharedState {
    return {
        city: 'london',
        zoom: getCityMapView('london').zoom,
        scene: initialSceneState(serverNowMs)
    };
}

export type BusReduction = {
    state: BusSharedState;
    // What to send to every peer, sender included. `null` means relay the message unchanged
    // to the other peers (the starter's behaviour for messages the server does not own).
    broadcast: BusMessage | null;
};

export function reduceBusMessage(
    state: BusSharedState,
    message: Partial<BusMessage>,
    serverNowMs: number
): BusReduction {
    switch (message.type) {
        case 'screen/map-view': {
            const { city, view } = message as Partial<ScreenMapViewMessage>;
            return {
                state: {
                    ...state,
                    city: isMapCity(city) ? city : state.city,
                    zoom: typeof view?.zoom === 'number' ? view.zoom : state.zoom
                },
                broadcast: null
            };
        }
        case 'scene/goto': {
            if (!isSceneId(message.sceneId)) return { state, broadcast: null };
            const step = clampStep(message.sceneId, message.step);
            return withScene(state, {
                id: message.sceneId,
                step,
                // A new scene, or a new step, starts its timeline from zero.
                timeline: {
                    anchorTimelineMs: 0,
                    anchorServerMs: serverNowMs,
                    rate: 1,
                    playing: true
                }
            });
        }
        case 'scene/step': {
            const delta = message.delta === -1 ? -1 : 1;
            const step = clampStep(state.scene.id, state.scene.step + delta);
            if (step === state.scene.step) return { state, broadcast: null };
            return withScene(state, {
                step,
                timeline: {
                    anchorTimelineMs: 0,
                    anchorServerMs: serverNowMs,
                    rate: 1,
                    playing: true
                }
            });
        }
        case 'scene/play': {
            if (typeof message.playing !== 'boolean') return { state, broadcast: null };
            if (message.playing === state.scene.timeline.playing) return { state, broadcast: null };
            return withScene(state, {
                timeline: reanchor(state.scene.timeline, serverNowMs, { playing: message.playing })
            });
        }
        default:
            return { state, broadcast: null };
    }
}

function withScene(
    state: BusSharedState,
    changes: Partial<Omit<BusSharedState['scene'], 'revision'>>
): BusReduction {
    const scene = { ...state.scene, ...changes, revision: state.scene.revision + 1 };
    return { state: { ...state, scene }, broadcast: { type: 'scene/state', scene } };
}

function clampStep(sceneId: keyof typeof SCENE_META, step: unknown) {
    const steps = SCENE_META[sceneId].steps;
    const value = typeof step === 'number' && Number.isInteger(step) ? step : 0;
    return Math.min(steps - 1, Math.max(0, value));
}
