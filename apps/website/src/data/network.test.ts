import { expect, test } from 'vite-plus/test';

import { parseNetwork, stationBounds, summariseStepFree } from './network';

const VALID = {
    source: { snapshot: '2026-10-19', attribution: 'Powered by TfL Open Data', stepFree: 'x' },
    lines: [
        {
            id: 'victoria',
            name: 'Victoria',
            colour: '#0098D4',
            paths: [
                [
                    [-0.14, 51.49],
                    [-0.1, 51.5]
                ]
            ],
            stations: ['A', 'B']
        },
        { id: 'broken' }
    ],
    stations: [
        {
            id: 'A',
            name: 'A',
            lon: -0.14,
            lat: 51.49,
            lines: ['victoria'],
            stepFree: 'full',
            stepFreePlatforms: [2, 2]
        },
        {
            id: 'B',
            name: 'B',
            lon: -0.1,
            lat: 51.5,
            lines: ['victoria'],
            stepFree: 'none',
            stepFreePlatforms: [0, 2]
        },
        {
            id: 'C',
            name: 'C',
            lon: -0.2,
            lat: 51.6,
            lines: [],
            stepFree: null,
            stepFreePlatforms: null
        },
        {
            id: 'D',
            name: 'D',
            lon: 0,
            lat: 51.4,
            lines: [],
            stepFree: 'maybe',
            stepFreePlatforms: [1]
        },
        { id: 'E', name: 'E', lon: 'west', lat: 51.4 }
    ]
};

test('parses the asset and drops malformed entries', () => {
    const network = parseNetwork(VALID);
    expect(network?.lines.map((l) => l.id)).toEqual(['victoria']);
    expect(network?.stations.map((s) => s.id)).toEqual(['A', 'B', 'C', 'D']);
    // An unrecognised status is unknown, not a guess.
    expect(network?.stations[3]).toMatchObject({ stepFree: null, stepFreePlatforms: null });
    expect(parseNetwork({ lines: 'nope' })).toBeNull();
    expect(parseNetwork(null)).toBeNull();
});

test('summarises step-free status including unknowns', () => {
    const network = parseNetwork(VALID);
    expect(summariseStepFree(network?.stations ?? [])).toEqual({
        full: 1,
        partial: 0,
        none: 1,
        unknown: 2,
        total: 4
    });
});

test('bounds cover every station', () => {
    const network = parseNetwork(VALID);
    expect(stationBounds(network?.stations ?? [])).toEqual({
        west: -0.2,
        south: 51.4,
        east: 0,
        north: 51.6
    });
    expect(stationBounds([])).toBeNull();
});
