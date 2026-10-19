import { useScreenStore } from '../lib/realtime/stores/screen-store';
import { eyeBand, rectsIntersect, regionRect, tileRect, wallSize, zones } from './layout';
import { useWallStage } from './stage';

// `?m=dev` overlay (same switch name as Vizzy's `/wall?m=dev`): bezels, the 5|6|5 zones, the
// eye-height band, and per-screen sync health. Everything is in wall pixels, so it looks the
// same on a single screen and in the full-wall preview.

const ZONE_COLOURS = { left: '#56b4e9', centre: '#e69f00', right: '#009e73' } as const;

export function DebugOverlay() {
    const { layout, view } = useWallStage();
    const wall = wallSize(layout);
    const band = eyeBand(layout);
    const bandRect = regionRect(layout, {
        col: 0,
        row: band.firstRow,
        colSpan: layout.columns,
        rowSpan: band.lastRow - band.firstRow + 1
    });
    const tiles = [];
    for (let r = 0; r < layout.rows; r++) {
        for (let c = 0; c < layout.columns; c++) {
            if (rectsIntersect(tileRect(layout, { c, r }), view)) tiles.push({ c, r });
        }
    }

    return (
        <div
            className="pointer-events-none absolute inset-0"
            style={{ width: wall.width, height: wall.height }}
        >
            <div
                className="absolute"
                style={{
                    left: 0,
                    top: bandRect.y,
                    width: bandRect.width,
                    height: bandRect.height,
                    background: 'rgba(255,255,255,0.04)',
                    borderTop: '8px dashed rgba(255,255,255,0.35)',
                    borderBottom: '8px dashed rgba(255,255,255,0.35)'
                }}
            />
            {Object.entries(zones(layout)).map(([name, region]) => {
                const rect = regionRect(layout, region);
                const colour = ZONE_COLOURS[name as keyof typeof ZONE_COLOURS];
                return (
                    <div
                        key={name}
                        className="absolute"
                        style={{
                            left: rect.x,
                            top: 0,
                            width: rect.width,
                            height: rect.height,
                            borderTop: `24px solid ${colour}`
                        }}
                    />
                );
            })}
            {tiles.map((tile) => (
                <TileBadge key={`${tile.c}-${tile.r}`} c={tile.c} r={tile.r} />
            ))}
        </div>
    );
}

function TileBadge({ c, r }: { c: number; r: number }) {
    const { layout } = useWallStage();
    const rect = tileRect(layout, { c, r });
    const connection = useScreenStore((state) => state.connection);
    const offset = useScreenStore((state) => state.clockOffsetMs);
    const rtt = useScreenStore((state) => state.clockRttMs);
    const revision = useScreenStore((state) => state.scene?.revision ?? null);
    return (
        <div
            className="absolute border-4 border-white/40"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        >
            <div className="absolute bottom-6 left-6 rounded-xl bg-black/70 px-5 py-3 font-mono text-[44px] leading-tight text-white">
                <div>
                    c{c} r{r} · {connection}
                </div>
                <div className="text-[34px] text-white/70">
                    clock {offset === null ? '—' : `${offset.toFixed(1)} ms`} · rtt{' '}
                    {rtt === null ? '—' : `${rtt.toFixed(1)} ms`} · rev {revision ?? '—'}
                </div>
            </div>
        </div>
    );
}
