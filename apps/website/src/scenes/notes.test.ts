import { expect, test } from 'vite-plus/test';

import { nextNote, SCENE_NOTES, stepNote } from './notes';
import { SCENE_IDS, SCENE_META } from './scene-state';

test('every scene has exactly one note per step', () => {
    for (const id of SCENE_IDS) expect(SCENE_NOTES[id]).toHaveLength(SCENE_META[id].steps);
});

test('nextNote previews the following step and stops at the last', () => {
    expect(nextNote('the-step', 0)).toBe(stepNote('the-step', 1));
    expect(nextNote('the-step', 2)).toBeNull();
    expect(stepNote('attract', 5)).toBeNull();
});
