import type { TimelineAnchor } from '../lib/realtime/clock';

// Scene ids are the only scene data on the bus; everything a scene draws is recomputed on each
// screen from these ids plus static assets (BEST_PRACTICES §3).
export const SCENE_IDS = [
    'attract',
    'the-pulse',
    'the-step',
    'two-londons',
    'the-race',
    'the-lifts',
    'calibration',
    'map-check'
] as const;
export type SceneId = (typeof SCENE_IDS)[number];

export type SceneParamOption = { value: string; label: string };
// A choice the tablets can make within a scene, e.g. S3's origin. The first option is the
// default when the scene starts.
export type SceneParamSpec = { label: string; options: SceneParamOption[] };

export type SceneMeta = {
    title: string;
    steps: number;
    params?: Record<string, SceneParamSpec>;
};

// What the server and the control tablets need to know about each scene. The components that
// draw them live in `./registry.tsx`, which the server never imports.
export const SCENE_META: Record<SceneId, SceneMeta> = {
    attract: { title: 'S0 · Attract', steps: 1 },
    'the-pulse': { title: 'S1 · The Pulse', steps: 2 },
    'the-step': { title: 'S2 · The Step', steps: 3 },
    'two-londons': {
        title: 'S3 · Two Londons',
        steps: 2,
        params: {
            origin: {
                label: 'Starting from',
                // Keep in step with ORIGINS in pipeline/src/mind_the_step/journeys.py: the
                // journey data only covers these.
                options: [
                    { value: '940GZZLUSKS', label: 'South Kensington' },
                    { value: '940GZZLUWWL', label: 'Walthamstow Central' },
                    { value: '940GZZLUTBY', label: 'Tooting Broadway' },
                    { value: '940GZZLUCTN', label: 'Camden Town' },
                    { value: '940GZZLUHAI', label: 'Highbury & Islington' },
                    { value: '940GZZLUASG', label: 'Arnos Grove' },
                    { value: '940GZZLUKSX', label: "King's Cross St. Pancras" },
                    { value: '940GZZLUSTD', label: 'Stratford' },
                    { value: '940GZZLUWYP', label: 'Wembley Park' },
                    { value: '940GZZLUCYF', label: 'Canary Wharf' },
                    { value: '940GZZLUEBY', label: 'Ealing Broadway' },
                    { value: '940GZZLUBXN', label: 'Brixton' }
                ]
            }
        }
    },
    'the-race': {
        title: 'S6 · The Race',
        steps: 3,
        params: {
            race: {
                label: 'The trip',
                // Keep in step with pipeline/experiments/s6-races.json: races.json only has
                // these.
                options: [
                    { value: 'sks-arc', label: 'South Kensington → Archway' },
                    { value: 'ksx-lad', label: "King's Cross → Ladbroke Grove" },
                    { value: 'asg-ods', label: 'Arnos Grove → Old Street' },
                    { value: 'bxn-ktn', label: 'Brixton → Kentish Town' },
                    { value: 'tby-oxc', label: 'Tooting Broadway → Oxford Circus' },
                    { value: 'wwl-was', label: 'Walthamstow Central → Warren Street' },
                    { value: 'std-snb', label: 'Stratford → Snaresbrook' },
                    { value: 'cyf-sws', label: 'Canary Wharf → Swiss Cottage' },
                    { value: 'ksx-gpk', label: "King's Cross → Green Park" }
                ]
            }
        }
    },
    'the-lifts': { title: 'S5 · On Paper', steps: 2 },
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
    // Current value of each of the scene's params (see SceneMeta.params).
    params: Record<string, string>;
    // Bumped by the server on every change, so clients can drop stale or duplicate updates.
    revision: number;
};

export function defaultParams(id: SceneId): Record<string, string> {
    const params: Record<string, string> = {};
    for (const [key, spec] of Object.entries(SCENE_META[id].params ?? {})) {
        const first = spec.options[0];
        if (first) params[key] = first.value;
    }
    return params;
}

export function isValidParam(id: SceneId, key: unknown, value: unknown): key is string {
    if (typeof key !== 'string' || typeof value !== 'string') return false;
    const spec = SCENE_META[id].params?.[key];
    return !!spec && spec.options.some((option) => option.value === value);
}

export function initialSceneState(serverNowMs: number): SceneState {
    return {
        id: 'attract',
        step: 0,
        timeline: { anchorTimelineMs: 0, anchorServerMs: serverNowMs, rate: 1, playing: true },
        params: defaultParams('attract'),
        revision: 0
    };
}
