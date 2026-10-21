import { expect, test } from 'vite-plus/test';

import asset from '../../public/data/lifts.json';
import { downgradedAt, hoursBetween, medianOutageHours, parseLiftRecord } from './lifts';

const RECORD = parseLiftRecord({
    times: ['2026-10-20T00:00:00Z', '2026-10-20T00:15:00Z', '2026-10-20T00:30:00Z'],
    paper: { full: 2, partial: 0 },
    stations: [
        { id: 'A', name: 'Alpha', paper: 'full', status: ['full', 'none', 'full'], message: 'm' },
        { id: 'B', name: 'Beta', paper: 'full', status: ['partial', 'partial', 'full'] }
    ],
    outages: [
        { lift: 'A-Lift-1', first: 1, last: 1, fromStart: false, ongoing: false },
        { lift: 'B-Lift-1', first: 0, last: 1, fromStart: true, ongoing: false }
    ],
    downgraded: [1, 2, 0],
    fullDowngraded: [1, 2, 0],
    liftsOut: [1, 2, 0]
});

test('downgradedAt lists the stations cut off at a sample, worst first', () => {
    expect(downgradedAt(RECORD!, 1).map((s) => s.name)).toEqual(['Alpha', 'Beta']);
    expect(downgradedAt(RECORD!, 2)).toEqual([]);
});

test('medianOutageHours counts only outages seen to start and end', () => {
    // A-Lift-1: one sample, a quarter of an hour; B-Lift-1 ran from before the log began.
    expect(medianOutageHours(RECORD!)).toBe(0.25);
    expect(hoursBetween('2026-10-20T00:00:00Z', '2026-10-21T12:00:00Z')).toBe(36);
});

test('parseLiftRecord rejects series that do not match the samples', () => {
    expect(parseLiftRecord({ times: ['t'], paper: { full: 1 }, downgraded: [] })).toBeNull();
});

test('lifts.json parses, and its counts agree with its stations', () => {
    const record = parseLiftRecord(asset);
    expect(record?.paper.full).toBe(95);
    record?.times.forEach((_, i) => {
        expect(downgradedAt(record, i)).toHaveLength(record.downgraded[i]);
    });
});
