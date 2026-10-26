import { expect, test } from 'vite-plus/test';

import json from '../../public/data/upgrades.json';
import { outcomeAt, overlapWithTfl, parseUpgradePlans, STRATEGIES } from './upgrades';

const asset: unknown = json;

test('the built asset parses, with one map value per area', () => {
    const plans = parseUpgradePlans(asset);
    expect(plans).not.toBeNull();
    for (const s of STRATEGIES) {
        expect(plans!.strategies[s]).toHaveLength(plans!.params.kMax);
        for (const k of plans!.params.shownK) {
            expect(plans!.areaSaved[s][String(k)]).toHaveLength(plans!.areas.length);
        }
    }
});

test('each strategy saves more with every station it adds', () => {
    const plans = parseUpgradePlans(asset)!;
    for (const s of STRATEGIES) {
        const saved = plans.strategies[s].map((p) => p.savedEveryone);
        for (let i = 1; i < saved.length; i++)
            expect(saved[i]).toBeGreaterThanOrEqual(saved[i - 1]);
    }
});

test('outcomeAt clamps k and overlap names shared stations', () => {
    const plans = parseUpgradePlans(asset)!;
    expect(outcomeAt(plans, 'people', 0)).toBe(plans.strategies.people[0]);
    expect(outcomeAt(plans, 'people', 99)).toBe(plans.strategies.people.at(-1));
    const tflNames = new Set(plans.tfl.map((p) => p.name));
    for (const name of overlapWithTfl(plans, 'people', 12)) expect(tflNames.has(name)).toBe(true);
});

test('malformed plans are refused', () => {
    expect(parseUpgradePlans(null)).toBeNull();
    const plans = asset as Record<string, unknown>;
    expect(parseUpgradePlans({ ...plans, tfl: [] })).toBeNull();
    const areaSaved = { ...(plans.areaSaved as object), people: { '5': [1, 2] } };
    expect(parseUpgradePlans({ ...plans, areaSaved })).toBeNull();
});
