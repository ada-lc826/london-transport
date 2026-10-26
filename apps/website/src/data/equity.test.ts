import { expect, test } from 'vite-plus/test';

import json from '../../public/data/equity.json';
import { metricClass, metricLabels, parseEquity, roughCount } from './equity';

const asset: unknown = json;

test('the built asset parses whole', () => {
    const record = parseEquity(asset);
    expect(record).not.toBeNull();
    const raw = asset as { areas: unknown[] };
    expect(record?.areas).toHaveLength(raw.areas.length);
    expect(record?.areas.length).toBe(record?.coverage.inReach);
});

test('the headline agrees with the areas it summarises', () => {
    const record = parseEquity(asset)!;
    let people = 0;
    let disabled = 0;
    let weighted = 0;
    let weightedDisabled = 0;
    for (const a of record.areas) {
        people += a.residents;
        disabled += a.residents * a.disabledShare;
        weighted += a.residents * a.extra;
        weightedDisabled += a.residents * a.disabledShare * a.extra;
    }
    expect(weighted / people).toBeCloseTo(record.headline.everyone, 0);
    expect(weightedDisabled / disabled).toBeCloseTo(record.headline.disabled, 0);
});

test('malformed records are refused and malformed areas dropped', () => {
    expect(parseEquity(null)).toBeNull();
    expect(parseEquity({ areas: [] })).toBeNull();
    const record = parseEquity(asset)!;
    const withJunk = { ...(asset as object), areas: [...record.areas, { code: 'x' }] };
    expect(parseEquity(withJunk)?.areas).toHaveLength(record.areas.length);
});

test('metric classes and labels line up', () => {
    expect(metricClass('extra', 10)).toBe(0);
    expect(metricClass('extra', 12)).toBe(0);
    expect(metricClass('extra', 25)).toBe(3);
    expect(metricClass('extra', 70)).toBe(4);
    expect(metricClass('gap', 0.9)).toBe(4);
    expect(metricLabels('extra')).toHaveLength(5);
    expect(metricLabels('gap')[4]).toBe('> 85%');
    expect(roughCount(554083)).toBe('554,000');
});
