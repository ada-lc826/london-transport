import { expect, test } from 'vite-plus/test';

import json from '../../public/data/lift-survival.json';
import { formatHours, parseLiftSurvival } from './lift-survival';

const asset: unknown = json;

test('the built asset parses, and every curve starts at 1 and never rises', () => {
    const survival = parseLiftSurvival(asset);
    expect(survival).not.toBeNull();
    for (const group of Object.values(survival!.km)) {
        expect(group.curve[0]).toBe(1);
        for (let h = 1; h < group.curve.length; h++) {
            expect(group.curve[h]).toBeLessThanOrEqual(group.curve[h - 1]);
        }
    }
});

test('groups split the outages between them', () => {
    const { km, outages } = parseLiftSurvival(asset)!;
    expect(km.all.n).toBe(outages.used);
    expect(km.underground.n + km.otherModes.n).toBe(km.all.n);
    expect(km.singleLift.n + km.multiLift.n).toBe(km.all.n);
});

test('malformed assets are refused; durations read well on the wall', () => {
    expect(parseLiftSurvival(null)).toBeNull();
    expect(parseLiftSurvival({ ...(asset as object), km: {} })).toBeNull();
    expect(formatHours(6)).toBe('6 h');
    expect(formatHours(1.75)).toBe('1.8 h');
    expect(formatHours(72)).toBe('3 days');
    expect(formatHours(null)).toBe('–');
});
