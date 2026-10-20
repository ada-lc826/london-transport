import type { ComponentType } from 'react';

import { AttractScene } from './attract';
import { CalibrationScene } from './calibration';
import { MapCheckScene } from './map-check';
import type { SceneId, SceneState } from './scene-state';
import { TheStepScene } from './the-step';
import { TwoLondonsScene } from './two-londons';

export type SceneProps = { scene: SceneState };

// Scene id -> component. Metadata the server also needs (titles, step counts) lives in
// `scene-state.ts`, which has no React dependency.
export const SCENE_COMPONENTS: Record<SceneId, ComponentType<SceneProps>> = {
    attract: AttractScene,
    'the-step': TheStepScene,
    'two-londons': TwoLondonsScene,
    calibration: CalibrationScene,
    'map-check': MapCheckScene
};

export function SceneHost({ scene }: { scene: SceneState | null }) {
    if (!scene) return null;
    const Scene = SCENE_COMPONENTS[scene.id];
    // Keying on id remounts on scene change, so no state leaks from one scene to the next.
    return <Scene key={scene.id} scene={scene} />;
}
