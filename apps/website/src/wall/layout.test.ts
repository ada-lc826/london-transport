import { describe, expect, test } from 'vite-plus/test';

import {
    DO_LAYOUT,
    MINI_LAYOUT,
    eyeBand,
    parseTile,
    rectsIntersect,
    regionRect,
    resolveLayout,
    tileRect,
    wallSize,
    zones
} from './layout';

describe('parseTile', () => {
    test('accepts every screen of the 16x4 wall', () => {
        expect(parseTile(DO_LAYOUT, '15', '3')).toEqual({ c: 15, r: 3 });
        expect(parseTile(DO_LAYOUT, 0, 0)).toEqual({ c: 0, r: 0 });
    });

    test('rejects out-of-range coordinates instead of clamping them', () => {
        // The starter clamped c=15 to c=2, so most of the real wall showed the same picture.
        expect(parseTile(MINI_LAYOUT, '15', '0')).toBeNull();
        expect(parseTile(DO_LAYOUT, '16', '0')).toBeNull();
        expect(parseTile(DO_LAYOUT, '0', '-1')).toBeNull();
    });

    test('rejects missing and non-integer values', () => {
        expect(parseTile(DO_LAYOUT, undefined, '0')).toBeNull();
        expect(parseTile(DO_LAYOUT, '', '0')).toBeNull();
        expect(parseTile(DO_LAYOUT, '1.5', '0')).toBeNull();
        expect(parseTile(DO_LAYOUT, 'abc', '0')).toBeNull();
    });
});

test('the DO wall is 30720 x 4320 px', () => {
    expect(wallSize(DO_LAYOUT)).toEqual({ width: 30720, height: 4320 });
    expect(resolveLayout(undefined)).toBe(DO_LAYOUT);
    expect(resolveLayout('mini')).toBe(MINI_LAYOUT);
});

test('zones split 16 columns 5 | 6 | 5 and cover the wall exactly', () => {
    const z = zones(DO_LAYOUT);
    expect([z.left.colSpan, z.centre.colSpan, z.right.colSpan]).toEqual([5, 6, 5]);
    expect(z.centre.col).toBe(5);
    expect(z.right.col + z.right.colSpan).toBe(16);

    const mini = zones(MINI_LAYOUT);
    expect(mini.left.colSpan + mini.centre.colSpan + mini.right.colSpan).toBe(3);
});

test('eye band is rows 1-2 on the DO', () => {
    expect(eyeBand(DO_LAYOUT)).toEqual({ firstRow: 1, lastRow: 2 });
});

test('regions and tiles are in wall pixels', () => {
    expect(tileRect(DO_LAYOUT, { c: 2, r: 1 })).toEqual({
        x: 3840,
        y: 1080,
        width: 1920,
        height: 1080
    });
    const centre = regionRect(DO_LAYOUT, zones(DO_LAYOUT).centre);
    expect(centre).toEqual({ x: 9600, y: 0, width: 11520, height: 4320 });
    // Touching edges do not count as overlap, so a region is culled from its neighbours.
    expect(rectsIntersect(centre, tileRect(DO_LAYOUT, { c: 4, r: 0 }))).toBe(false);
    expect(rectsIntersect(centre, tileRect(DO_LAYOUT, { c: 5, r: 0 }))).toBe(true);
});
