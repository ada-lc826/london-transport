import { useEffect, useState } from 'react';

import { timelineAt } from '../lib/realtime/clock';
import { screenEngine } from '../lib/realtime/engines/screen-engine';
import type { SceneState } from './scene-state';

/**
 * The scene's timeline position in ms, updated every animation frame. Derived from the shared
 * server clock, so every screen shows the same moment; null until the clock is synchronised.
 * Only scenes with continuous motion should call this, since it re-renders on every frame.
 */
export function useTimelineMs(scene: SceneState): number | null {
    const [ms, setMs] = useState<number | null>(null);

    useEffect(() => {
        let frame = 0;
        const tick = () => {
            const serverNow = screenEngine.serverNow();
            setMs(serverNow === null ? null : timelineAt(scene.timeline, serverNow));
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [scene.timeline]);

    return ms;
}
