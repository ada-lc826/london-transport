import { expect, test } from 'vite-plus/test';

import {
    parseScreenReport,
    REPORT_STALE_MS,
    summariseHealth,
    type ReportEntry
} from './wall-health';

const NOW = 1_000_000;

function entry(c: number, r: number, extra: Partial<ReportEntry['report']> = {}, age = 0) {
    return {
        report: { layout: 'do' as const, c, r, revision: 3, rttMs: 4, ...extra },
        receivedAt: NOW - age
    };
}

test('parseScreenReport accepts a valid report and rejects tiles off the wall', () => {
    expect(parseScreenReport({ layout: 'do', c: 15, r: 3, revision: 2, rttMs: 6 })).toEqual({
        layout: 'do',
        c: 15,
        r: 3,
        revision: 2,
        rttMs: 6
    });
    expect(parseScreenReport({ layout: 'mini', c: 3, r: 0 })).toBeNull();
    expect(parseScreenReport({ layout: 'do', c: 1.5, r: 0 })).toBeNull();
    expect(parseScreenReport({ layout: 'wall', c: 0, r: 0 })).toBeNull();
    expect(parseScreenReport(null)).toBeNull();
    // Missing clock or scene data is allowed: a screen reports before its first pong.
    expect(parseScreenReport({ layout: 'do', c: 0, r: 0, rttMs: -1 })).toMatchObject({
        revision: null,
        rttMs: null
    });
});

test('summariseHealth classifies each screen', () => {
    const health = summariseHealth(
        [
            entry(0, 0),
            entry(1, 0, { revision: 2 }),
            entry(2, 0, { rttMs: 80 }),
            entry(3, 0, { rttMs: null }),
            entry(4, 0, {}, REPORT_STALE_MS + 1)
        ],
        3,
        NOW
    );
    expect(health.screens.map((s) => s.status)).toEqual([
        'ok',
        'behind',
        'unsynced',
        'unsynced',
        'silent'
    ]);
    expect(health).toMatchObject({ expected: 64, connected: 5, ok: 1, worstSyncMs: 40 });
});

test('summariseHealth counts duplicate tiles once and keeps the healthier report', () => {
    const health = summariseHealth([entry(5, 1, { revision: 1 }), entry(5, 1)], 3, NOW);
    expect(health.connected).toBe(1);
    expect(health.screens[0]).toMatchObject({ status: 'ok', peers: 2 });
});

test('summariseHealth follows the layout most screens report', () => {
    const mini = (c: number) => ({
        ...entry(c, 0),
        report: { ...entry(c, 0).report, layout: 'mini' as const }
    });
    const health = summariseHealth([mini(0), mini(1), entry(9, 2)], 3, NOW);
    expect(health).toMatchObject({ layout: 'mini', expected: 6, connected: 2 });
});

test('an empty wall reports nothing connected', () => {
    expect(summariseHealth([], 0, NOW)).toMatchObject({
        layout: 'do',
        connected: 0,
        ok: 0,
        worstSyncMs: null
    });
});
