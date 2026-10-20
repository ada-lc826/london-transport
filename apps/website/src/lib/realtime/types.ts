import type { SceneId, SceneState } from '../../scenes/scene-state';

export type BusMessage = {
    // Keep message kinds namespaced (`control/*`, `screen/*`).
    type: string;
    peerId?: string;
    peerCount?: number;
    [key: string]: unknown;
};

export type HelloBusMessage = BusMessage & {
    type: 'hello';
    peerId: string;
    state?: BusSharedState;
};

export type ControlSliderMessage = BusMessage & {
    type: 'control/slider';
    value: number;
};

export type MapCity = 'london' | 'paris' | 'berlin' | 'madrid' | 'rome' | 'amsterdam';

export type BusSharedState = {
    city: MapCity;
    zoom: number;
    scene: SceneState;
};

// Control -> bus intents. The bus owns scene state and answers each with `scene/state`.
export type SceneGotoMessage = BusMessage & { type: 'scene/goto'; sceneId: SceneId; step?: number };
export type SceneStepMessage = BusMessage & { type: 'scene/step'; delta: 1 | -1 };
export type ScenePlayMessage = BusMessage & { type: 'scene/play'; playing: boolean };
export type SceneParamMessage = BusMessage & { type: 'scene/param'; key: string; value: string };
export type SceneStateMessage = BusMessage & { type: 'scene/state'; scene: SceneState };

export type ScreenMapViewState = {
    longitude: number;
    latitude: number;
    zoom: number;
    bearing: number;
    pitch: number;
};

export type ScreenMapViewMessage = BusMessage & {
    type: 'screen/map-view';
    view: Partial<ScreenMapViewState>;
    city?: MapCity;
};

export type EngineRole = 'screen' | 'control';

export type EngineConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export type EngineStoreState = {
    role: EngineRole;
    peerId: string | null;
    connection: EngineConnectionState;
    messageCount: number;
    lastMessageType: string | null;
    lastMessageAt: number | null;
    lastError: string | null;
};

export const createInitialEngineStoreState = (role: EngineRole): EngineStoreState => ({
    role,
    peerId: null,
    connection: 'idle',
    messageCount: 0,
    lastMessageType: null,
    lastMessageAt: null,
    lastError: null
});

export type ControlStoreState = EngineStoreState & {
    sliderValue: number;
    isSliderInteracting: boolean;
    selectedCity: MapCity;
    scene: SceneState | null;
};

export type ScreenStoreState = EngineStoreState & {
    mapView: ScreenMapViewState;
    scene: SceneState | null;
    // Best estimate of (server clock - local clock); null until the first pong.
    clockOffsetMs: number | null;
    clockRttMs: number | null;
};

export const createInitialControlStoreState = (): ControlStoreState => ({
    ...createInitialEngineStoreState('control'),
    sliderValue: 25,
    isSliderInteracting: false,
    selectedCity: 'london',
    scene: null
});

export const createInitialScreenStoreState = (): ScreenStoreState => ({
    ...createInitialEngineStoreState('screen'),
    mapView: {
        longitude: -0.1749,
        latitude: 51.4988,
        zoom: 9,
        bearing: 0,
        pitch: 0
    },
    scene: null,
    clockOffsetMs: null,
    clockRttMs: null
});
