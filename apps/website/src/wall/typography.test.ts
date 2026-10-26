import { expect, test } from 'vite-plus/test';

import { DO_LAYOUT } from './layout';
import { MIN_TEXT_OF_CANVAS, TYPE, typeSize } from './typography';

test('no text level is below 3% of the wall height (DO Visualisation Toolkit)', () => {
    const canvas = DO_LAYOUT.rows * DO_LAYOUT.screenHeight;
    for (const level of Object.keys(TYPE) as (keyof typeof TYPE)[]) {
        expect(typeSize(level, DO_LAYOUT.screenHeight)).toBeGreaterThanOrEqual(
            Math.ceil(MIN_TEXT_OF_CANVAS * canvas)
        );
    }
});

test('clipText cuts at a word boundary and marks the cut', async () => {
    const { clipText } = await import('./typography');
    expect(clipText('short', 10)).toBe('short');
    expect(clipText('to Archway Station / Holloway Road', 20)).toBe('to Archway Station…');
    expect(clipText('Unbreakablewordthatgoeson', 10)).toBe('Unbreakab…');
});
