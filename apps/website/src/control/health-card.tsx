import type { ScreenHealth, ScreenStatus, WallHealth } from '../lib/realtime/wall-health';

// Presenter tablet: which screens are up, drawing the current scene, and in sync. One cell per
// screen in wall order. Status is shape and letter as well as colour, so it reads in sunlight
// and for colour-blind presenters: filled = ok, B = behind (old scene), S = clock not synced,
// dashed = connected but silent, empty outline = not connected.

const STATUS_STYLE: Record<ScreenStatus, { className: string; mark: string; label: string }> = {
    ok: { className: 'border-emerald-400 bg-emerald-400/80', mark: '', label: 'ok' },
    behind: { className: 'border-amber-400 bg-amber-400/30', mark: 'B', label: 'behind' },
    unsynced: { className: 'border-amber-400 bg-amber-400/30', mark: 'S', label: 'clock' },
    silent: { className: 'border-dashed border-red-400', mark: '?', label: 'silent' }
};

export function HealthCard({ health }: { health: WallHealth | null }) {
    if (!health) {
        return (
            <Card>
                <p className="text-xs text-[var(--muted-foreground)]">Waiting for the bus…</p>
            </Card>
        );
    }
    const byTile = new Map(health.screens.map((s) => [`${s.c},${s.r}`, s]));
    const duplicates = health.screens.filter((s) => s.peers > 1);
    const allOk = health.ok === health.expected;
    return (
        <Card>
            <div className="flex items-baseline justify-between text-xs">
                <span className={allOk ? 'font-semibold text-emerald-400' : 'font-semibold'}>
                    {health.connected}/{health.expected} screens · {health.ok} ok
                </span>
                <span className="text-[var(--muted-foreground)] tabular-nums">
                    {health.worstSyncMs === null
                        ? 'no clock data'
                        : `worst sync ±${Math.ceil(health.worstSyncMs)} ms`}
                </span>
            </div>
            <div
                className="grid gap-0.5"
                style={{ gridTemplateColumns: `repeat(${health.columns}, minmax(0, 1fr))` }}
                role="img"
                aria-label={`${health.connected} of ${health.expected} screens connected, ${health.ok} ok`}
            >
                {Array.from({ length: health.rows * health.columns }, (_, i) => {
                    const c = i % health.columns;
                    const r = Math.floor(i / health.columns);
                    return <Cell key={i} c={c} r={r} screen={byTile.get(`${c},${r}`)} />;
                })}
            </div>
            {duplicates.length ? (
                <p className="text-xs text-amber-400">
                    Opened twice: {duplicates.map((s) => `c${s.c} r${s.r}`).join(', ')}
                </p>
            ) : null}
            <p className="text-[10px] text-[var(--muted-foreground)]">
                filled ok · B behind · S clock · dashed silent · empty not connected
            </p>
        </Card>
    );
}

function Cell({ c, r, screen }: { c: number; r: number; screen: ScreenHealth | undefined }) {
    const style = screen ? STATUS_STYLE[screen.status] : null;
    const title = `c${c} r${r}: ${style?.label ?? 'not connected'}${
        screen?.syncErrorMs != null ? ` (±${Math.ceil(screen.syncErrorMs)} ms)` : ''
    }`;
    return (
        <div
            title={title}
            className={`flex aspect-video items-center justify-center rounded-[2px] border text-[9px] leading-none font-bold ${
                style?.className ?? 'border-zinc-400/70'
            }`}
        >
            {style?.mark}
        </div>
    );
}

function Card({ children }: { children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
            <h2 className="text-[10px] tracking-[0.2em] text-[var(--muted-foreground)] uppercase">
                Wall health
            </h2>
            {children}
        </section>
    );
}
