import { expect, test } from 'vite-plus/test';

import { median, parseJourneyTimes, summariseOrigin, timeBand } from './journeys';

test('parses the asset, keeping nulls for missing routes', () => {
    const parsed = parseJourneyTimes({
        source: { date: '2026-10-27', time: '0830', attribution: 'TfL' },
        origins: ['A', 'Z'],
        times: {
            A: { B: [10, 25], C: [20, null], D: ['x', 5], E: [1] }
        }
    });
    expect(parsed?.origins).toEqual(['A']);
    expect(parsed?.times.A).toEqual({ B: [10, 25], C: [20, null], D: [null, 5] });
    expect(parseJourneyTimes({ times: 'no' })).toBeNull();
});

test('summarises one origin', () => {
    const summary = summariseOrigin({
        B: [10, 25], // +15, more than double
        C: [20, 30], // +10
        D: [30, 30], // +0
        E: [40, null], // no step-free route
        F: [null, 50] // no standard route: ignored
    });
    expect(summary.compared).toBe(3);
    expect(summary.medianExtraMinutes).toBe(10);
    expect(summary.shareAtLeastDouble).toBeCloseTo(1 / 3);
    expect(summary.noStepFreeRoute).toBe(1);
    expect(summary.biggestGaps.map((g) => g.destination)).toEqual(['B', 'C', 'D']);
});

test('empty origin', () => {
    expect(summariseOrigin(undefined)).toMatchObject({
        compared: 0,
        medianExtraMinutes: null,
        shareAtLeastDouble: null
    });
});

test('bands and median', () => {
    expect([0, 15, 16, 45, 60, 61].map(timeBand)).toEqual([0, 0, 1, 2, 3, 4]);
    expect(timeBand(null)).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
});
