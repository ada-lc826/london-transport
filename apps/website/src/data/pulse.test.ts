import { expect, test } from 'vite-plus/test';

import asset from '../../public/data/pulse.json';
import {
    busiestLinks,
    clockLabel,
    parsePulse,
    QUARTERS,
    quarterAt,
    shareWithoutStepFree,
    valueAt
} from './pulse';

const flat = (v: number) => Array.from({ length: QUARTERS }, () => v);

test('quarterAt wraps the day and reports progress within the quarter', () => {
    expect(quarterAt(0)).toEqual({ quarter: 0, within: 0 });
    expect(quarterAt(0.5 + 1 / 192)).toMatchObject({ quarter: 48 });
    expect(quarterAt(1.25).quarter).toBe(24);
    expect(quarterAt(-0.25).quarter).toBe(72);
});

test('valueAt interpolates and holds at the last quarter', () => {
    const values = flat(0).map((_, i) => i * 10);
    expect(valueAt(values, 3, 0.5)).toBe(35);
    expect(valueAt(values, QUARTERS - 1, 0.9)).toBe((QUARTERS - 1) * 10);
});

test('clockLabel and busiestLinks', () => {
    expect(clockLabel('0830-0845')).toBe('08:30');
    const links = [
        { line: 'a', a: '1', b: '2', load: flat(5) },
        { line: 'b', a: '1', b: '2', load: flat(9) },
        { line: 'c', a: '1', b: '2', load: flat(7) }
    ];
    expect(busiestLinks(links, 0, 2).map((l) => l.line)).toEqual(['b', 'c']);
});

test('shareWithoutStepFree is the share of entries at stations with none', () => {
    expect(shareWithoutStepFree({ full: flat(1), none: flat(3) })).toBe(0.75);
    expect(shareWithoutStepFree({})).toBeNull();
});

test('pulse.json parses whole', () => {
    const pulse = parsePulse(asset);
    expect(pulse?.lines).toHaveLength(10);
    expect(pulse?.links.length).toBeGreaterThan(300);
    expect(Object.keys(pulse?.stations ?? {}).length).toBeGreaterThan(260);
    // Everyone who enters during the day has left by its end.
    expect(pulse?.network.onNetwork.at(-1)).toBe(0);
    expect(parsePulse({ times: [] })).toBeNull();
});
