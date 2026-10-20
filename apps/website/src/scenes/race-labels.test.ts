import { expect, test } from 'vite-plus/test';

import { segments, type RaceLeg } from '../data/races';
import { DO_LAYOUT } from '../wall/layout';
import { placeLabels } from './race-labels';

function leg(mode: string, start: number, end: number, line: string | null = null): RaceLeg {
    return { mode, line, start, end, from: 'A', to: 'Somewhere', lifts: 0, path: [] };
}

// 5 minutes a column, as on the wall.
const minuteX = (minute: number) => (minute / 5) * DO_LAYOUT.screenWidth;

test('labels stay inside one screen and never overlap', () => {
    const parts = segments({
        depart: '08:30',
        minutes: 60,
        legs: [
            leg('walking', 0, 1),
            leg('bus', 1, 7, '30'),
            leg('walking', 7, 10),
            leg('bus', 10, 13, '18'),
            leg('bus', 17, 31, '27'),
            leg('bus', 37, 57, '7'),
            leg('walking', 57, 60)
        ]
    });
    const labels = placeLabels(parts, DO_LAYOUT, minuteX);
    const sw = DO_LAYOUT.screenWidth;
    for (const label of labels) {
        expect(label.x).toBeGreaterThanOrEqual(label.col * sw);
        expect(label.x + label.width).toBeLessThanOrEqual((label.col + 1) * sw);
    }
    for (let i = 1; i < labels.length; i++) {
        expect(labels[i].x).toBeGreaterThan(labels[i - 1].x);
    }
    // The 1-minute walk gets no label; the 6-minute bus does.
    expect(labels.map((l) => l.title)).not.toContain(undefined);
    expect(labels[0]).toMatchObject({ title: 'Bus 30', minutes: 6, detail: 'to Somewhere' });
});

test('a segment starting at a screen edge is labelled on the next screen', () => {
    // Starts 4.8 minutes in: 96% of the way across screen 0.
    const parts = segments({ depart: '', minutes: 20, legs: [leg('tube', 4.8, 20, 'Victoria')] });
    const label = placeLabels(parts, DO_LAYOUT, minuteX).find((l) => l.title === 'Victoria line');
    expect(label?.col).toBe(1);
});
