import type { TimelineAnchor } from '../lib/realtime/clock';

// Scene ids are the only scene data on the bus; everything a scene draws is recomputed on each
// screen from these ids plus static assets (BEST_PRACTICES §3).
export const SCENE_IDS = ['attract', 'the-step', 'calibration', 'map-check'] as const;
export type SceneId = (typeof SCENE_IDS)[number];

// What the server and the control tablets need to know about each scene. The components that
// draw them live in `./registry.tsx`, which the server never imports.
export const SCENE_META: Record<SceneId, { title: string; steps: number }> = {
    attract: { title: 'S0 · Attract', steps: 1 },
    'the-step': { title: 'S2 · The Step', steps: 3 },
    calibration: { title: 'Calibration', steps: 1 },
    'map-check': { title: 'Map check', steps: 1 }
};

export function isSceneId(value: unknown): value is SceneId {
    return typeof value === 'string' && (SCENE_IDS as readonly string[]).includes(value);
}

export type SceneState = {
    id: SceneId;
    step: number;
    timeline: TimelineAnchor;
    // Bumped by the server on every change, so clients can drop stale or duplicate updates.
    revision: number;
};

export function initialSceneState(serverNowMs: number): SceneState {
    return {
        id: 'attract',
        step: 0,
        timeline: { anchorTimelineMs: 0, anchorServerMs: serverNowMs, rate: 1, playing: true },
        revision: 0
    };
}
