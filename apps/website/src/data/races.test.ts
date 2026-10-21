import { expect, test } from 'vite-plus/test';

import asset from '../../public/data/races.json';
import { SCENE_META } from '../scenes/scene-state';
import { changes, legLabel, parseRaces, segmentAt, segments, type RaceLeg } from './races';

function leg(mode: string, start: number, end: number, line: string | null = null): RaceLeg {
    return { mode, line, start, end, from: 'A', to: 'B', lifts: 0, path: [] };
}

const JOURNEY = {
    depart: '08:30',
    minutes: 30,
    legs: [leg('walking', 0, 4), leg('tube', 6, 15, 'Victoria'), leg('bus', 20, 28, '24')]
};

test('segments make the waits between legs explicit', () => {
    expect(segments(JOURNEY).map((s) => [s.kind, s.start, s.end])).toEqual([
        ['leg', 0, 4],
        ['wait', 4, 6],
        ['leg', 6, 15],
        ['wait', 15, 20],
        ['leg', 20, 28],
        ['wait', 28, 30]
    ]);
});

test('segmentAt finds what the traveller is doing, clamped to the journey', () => {
    const parts = segments(JOURNEY);
    expect(segmentAt(parts, 0)).toBe(0);
    expect(segmentAt(parts, 5)).toBe(1);
    expect(segmentAt(parts, 6)).toBe(2);
    expect(segmentAt(parts, 99)).toBe(parts.length - 1);
});

test('changes count boardings after the first', () => {
    expect(changes(JOURNEY)).toBe(1);
    expect(changes({ ...JOURNEY, legs: [leg('walking', 0, 30)] })).toBe(0);
});

test('legLabel names lines the way people say them', () => {
    expect(legLabel(leg('tube', 0, 1, 'Northern'))).toBe('Northern line');
    expect(legLabel(leg('overground', 0, 1, 'Weaver'))).toBe('Weaver line');
    expect(legLabel(leg('bus', 0, 1, '24'))).toBe('Bus 24');
    expect(legLabel(leg('elizabeth-line', 0, 1, 'Elizabeth line'))).toBe('Elizabeth line');
    expect(legLabel(leg('dlr', 0, 1, 'DLR'))).toBe('DLR');
    expect(legLabel(leg('walking', 0, 1))).toBe('Walk');
});

test('parseRaces keeps valid journeys and drops broken ones', () => {
    const parsed = parseRaces({
        source: { date: '2026-10-27' },
        races: [
            { id: 'ok', origin: 'O', destination: 'D', standard: JOURNEY, stepFree: null },
            { id: 'bad-leg', standard: { minutes: 10, legs: [{ start: 'x' }] } },
            { noId: true }
        ]
    });
    expect(parsed?.races.map((r) => r.id)).toEqual(['ok', 'bad-leg']);
    expect(parsed?.races[0].standard?.legs).toHaveLength(3);
    expect(parsed?.races[1].standard).toBeNull();
    expect(parseRaces({})).toBeNull();
});

test('races.json has both journeys for every race the tablets offer', () => {
    const parsed = parseRaces(asset);
    const offered = SCENE_META['the-race'].params?.race.options.map((o) => o.value);
    expect(parsed?.races.map((r) => r.id)).toEqual(offered);
    for (const race of parsed?.races ?? []) {
        expect(race.standard?.legs.length).toBeGreaterThan(0);
        expect(race.stepFree?.legs.length).toBeGreaterThan(0);
        // The whole race must fit on the wall's 80-minute time axis.
        expect(race.stepFree!.minutes).toBeLessThanOrEqual(80);
    }
});
