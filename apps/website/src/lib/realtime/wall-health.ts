import { resolveLayout, type LayoutName } from '../../wall/layout';

// Wall health for the presenter tablet (plan §4.5): which screens are connected, whether each
// is showing the current scene revision, and how well its clock is synced. Screens report
// themselves with `screen/report`; the bus keeps the latest report per peer and sends the
// summary to control tablets. Kept free of websocket code so it can be unit-tested.

export type ScreenReport = {
    layout: LayoutName;
    c: number;
    r: number;
    // Scene revision the screen is drawing, or null before its first scene state.
    revision: number | null;
    // Round trip of the best clock sample; the screen's server-time error is at most half this.
    rttMs: number | null;
};

export function parseScreenReport(message: unknown): ScreenReport | null {
    if (typeof message !== 'object' || message === null) return null;
    const m = message as Record<string, unknown>;
    const layoutName = m.layout === 'mini' ? 'mini' : m.layout === 'do' ? 'do' : null;
    if (!layoutName) return null;
    const layout = resolveLayout(layoutName);
    if (!isIndex(m.c, layout.columns) || !isIndex(m.r, layout.rows)) return null;
    return {
        layout: layoutName,
        c: m.c,
        r: m.r,
        revision: isCount(m.revision) ? m.revision : null,
        rttMs: typeof m.rttMs === 'number' && m.rttMs >= 0 ? m.rttMs : null
    };
}

function isIndex(value: unknown, size: number): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < size;
}

function isCount(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

// A screen whose clock error bound (half its round trip) exceeds this is flagged: at 60 fps a
// frame is ~17 ms, so beyond that animations visibly drift across a bezel.
export const SYNC_WARN_MS = 17;
// Reports older than this mean the screen has stopped reporting though its socket is open.
export const REPORT_STALE_MS = 15_000;

export type ScreenStatus = 'ok' | 'behind' | 'unsynced' | 'silent';

export type ScreenHealth = {
    c: number;
    r: number;
    status: ScreenStatus;
    // Count of peers claiming this tile; more than one means two browsers share a URL.
    peers: number;
    syncErrorMs: number | null;
};

export type WallHealth = {
    layout: LayoutName;
    columns: number;
    rows: number;
    // One entry per reporting tile, in row-major order.
    screens: ScreenHealth[];
    expected: number;
    connected: number;
    ok: number;
    // Worst clock error bound among connected screens.
    worstSyncMs: number | null;
};

export type ReportEntry = { report: ScreenReport; receivedAt: number };

// The layout most screens report; a mixed wall is a configuration error the grid will show.
function dominantLayout(entries: ReportEntry[]): LayoutName {
    let mini = 0;
    for (const { report } of entries) if (report.layout === 'mini') mini++;
    return mini * 2 > entries.length ? 'mini' : 'do';
}

export function summariseHealth(
    entries: ReportEntry[],
    revision: number,
    nowMs: number
): WallHealth {
    const layoutName = dominantLayout(entries);
    const layout = resolveLayout(layoutName);
    const byTile = new Map<string, ScreenHealth>();
    for (const { report, receivedAt } of entries) {
        if (report.layout !== layoutName) continue;
        const key = `${report.c},${report.r}`;
        const syncErrorMs = report.rttMs === null ? null : report.rttMs / 2;
        const status: ScreenStatus =
            nowMs - receivedAt > REPORT_STALE_MS
                ? 'silent'
                : report.revision !== revision
                  ? 'behind'
                  : syncErrorMs === null || syncErrorMs > SYNC_WARN_MS
                    ? 'unsynced'
                    : 'ok';
        const previous = byTile.get(key);
        // Two peers on one tile: keep the healthier one, but count both.
        if (previous) {
            previous.peers++;
            if (previous.status !== 'ok' && status === 'ok') {
                Object.assign(previous, { status, syncErrorMs });
            }
            continue;
        }
        byTile.set(key, { c: report.c, r: report.r, status, peers: 1, syncErrorMs });
    }
    const screens = [...byTile.values()].sort((a, b) => a.r - b.r || a.c - b.c);
    const errors = screens.flatMap((s) => (s.syncErrorMs === null ? [] : [s.syncErrorMs]));
    return {
        layout: layoutName,
        columns: layout.columns,
        rows: layout.rows,
        screens,
        expected: layout.columns * layout.rows,
        connected: screens.length,
        ok: screens.filter((s) => s.status === 'ok').length,
        worstSyncMs: errors.length ? Math.max(...errors) : null
    };
}
