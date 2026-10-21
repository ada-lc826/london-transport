import {
    loadNetwork,
    summariseStepFree,
    type Network,
    type Station,
    type StepFree
} from '../data/network';
import { projectToWall } from '../wall/camera';
import { rectsIntersect, regionRect, zones } from '../wall/layout';
import { useWallStage } from '../wall/stage';
import { ScreenText } from '../wall/typography';
import type { SceneProps } from './registry';
import { networkCamera, useAsset } from './use-asset';

// S2 · The Step (plan §4.2, §4.4). Every tube station, by whether you can get from the street
// to its platforms without a step. Derived from TfL's station topology (pipeline/stepfree.py).
//
//   step 0  the network: 272 stations, all alike
//   step 1  reveal: filled = every platform step-free, half = some, ring = none
//   step 2  focus on South Kensington, the Data Observatory's own station
//
// Status is encoded by shape (filled / half / ring / dashed), so it never relies on colour.
// Left zone: one row per line, one cell per station in route order; 128 px cells put exactly
// 15 on each screen and rows are split between the two screen rows, so no cell or row is cut
// by a bezel. Centre: the network map. Right: the numbers.

const ACCENT = '#e69f00';
const NEUTRAL = '#9aa3ae';
const HERE_ID = '940GZZLUSKS';
const CELL = 128;
const FADE = 'opacity 1.2s ease-in-out';

export function TheStepScene({ scene }: SceneProps) {
    const network = useAsset(loadNetwork);
    const step = scene.step;
    if (!network) return null;
    return (
        <>
            <NetworkMap network={network} reveal={step >= 1} focus={step >= 2} />
            <LineBarcodes network={network} reveal={step >= 1} />
            <Numbers network={network} reveal={step >= 1} focus={step >= 2} />
        </>
    );
}

function NetworkMap({
    network,
    reveal,
    focus
}: {
    network: Network;
    reveal: boolean;
    focus: boolean;
}) {
    const { layout, view } = useWallStage();
    const frame = regionRect(layout, zones(layout).centre);
    const camera = networkCamera(network, frame);
    if (!camera || !rectsIntersect(frame, view)) return null;
    const project = (lngLat: [number, number]) => projectToWall(camera, frame, lngLat);
    const here = network.stations.find((s) => s.id === HERE_ID);

    return (
        <svg
            className="absolute"
            style={{ left: frame.x, top: frame.y }}
            width={frame.width}
            height={frame.height}
            viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        >
            {network.lines.map((line) => (
                <g key={line.id} opacity={reveal ? 0.25 : 0.6} style={{ transition: FADE }}>
                    {line.paths.map((path, i) => (
                        <polyline
                            key={i}
                            points={path.map((p) => project(p).join(',')).join(' ')}
                            fill="none"
                            stroke={line.colour === '#000000' ? '#8a8a8a' : line.colour}
                            strokeWidth={10}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                    ))}
                </g>
            ))}
            {network.stations.map((station) => {
                const [x, y] = project([station.lon, station.lat]);
                return (
                    <StatusMark
                        key={station.id}
                        x={x}
                        y={y}
                        r={26}
                        status={reveal ? station.stepFree : 'full'}
                        neutral={!reveal}
                    />
                );
            })}
            {here ? <HereMarker station={here} project={project} visible={focus} /> : null}
        </svg>
    );
}

function HereMarker({
    station,
    project,
    visible
}: {
    station: Station;
    project: (lngLat: [number, number]) => [number, number];
    visible: boolean;
}) {
    const [x, y] = project([station.lon, station.lat]);
    return (
        <g opacity={visible ? 1 : 0} style={{ transition: FADE }}>
            <circle cx={x} cy={y} r={90} fill="none" stroke="#ffffff" strokeWidth={10} />
            <circle
                cx={x}
                cy={y}
                r={150}
                fill="none"
                stroke="#ffffff"
                strokeWidth={4}
                opacity={0.5}
            />
        </g>
    );
}

/**
 * One station mark. Shape carries the status: filled disc = every platform step-free,
 * half disc = some platforms, ring = none, dashed ring = unknown.
 */
export function StatusMark({
    x,
    y,
    r,
    status,
    neutral = false
}: {
    x: number;
    y: number;
    r: number;
    status: StepFree | null;
    neutral?: boolean;
}) {
    const colour = neutral ? NEUTRAL : ACCENT;
    const stroke = Math.max(4, r * 0.28);
    if (status === 'full') {
        return <circle cx={x} cy={y} r={r} fill={colour} stroke="#0a0e14" strokeWidth={4} />;
    }
    if (status === 'partial') {
        return (
            <g>
                <circle
                    cx={x}
                    cy={y}
                    r={r - stroke / 2}
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth={stroke}
                />
                <path d={`M ${x} ${y - r} A ${r} ${r} 0 0 0 ${x} ${y + r} Z`} fill={ACCENT} />
            </g>
        );
    }
    if (status === 'none') {
        return (
            <circle
                cx={x}
                cy={y}
                r={r - stroke / 2}
                fill="#0a0e14"
                stroke={NEUTRAL}
                strokeWidth={stroke}
            />
        );
    }
    return (
        <circle
            cx={x}
            cy={y}
            r={r - stroke / 2}
            fill="none"
            stroke={NEUTRAL}
            strokeWidth={stroke}
            strokeDasharray={`${stroke} ${stroke}`}
        />
    );
}

function LineBarcodes({ network, reveal }: { network: Network; reveal: boolean }) {
    const { layout, view } = useWallStage();
    const left = zones(layout).left;
    // Rows sit in the eye-height band; labels on the first screen, cells on the rest.
    const band = regionRect(layout, { col: left.col, row: 1, colSpan: left.colSpan, rowSpan: 2 });
    if (!rectsIntersect(band, view) || layout.rows < 4) return null;
    const byId = new Map(network.stations.map((s) => [s.id, s]));
    // Rows are split between the two screen rows so none straddles the horizontal bezel.
    const perScreen = Math.ceil(network.lines.length / 2);
    const rowHeight = Math.floor(layout.screenHeight / perScreen);
    const rowTop = (row: number) =>
        band.y +
        (row < perScreen ? row * rowHeight : layout.screenHeight + (row - perScreen) * rowHeight);
    const cellsX = band.x + layout.screenWidth;
    const labelSize = Math.round(rowHeight * 0.5);

    return (
        <svg
            className="absolute"
            style={{ left: band.x, top: band.y }}
            width={band.width}
            height={band.height}
            viewBox={`${band.x} ${band.y} ${band.width} ${band.height}`}
        >
            {network.lines.map((line, row) => {
                const cy = rowTop(row) + rowHeight / 2;
                return (
                    <g key={line.id}>
                        <rect
                            x={band.x + 80}
                            y={cy - rowHeight * 0.3}
                            width={28}
                            height={rowHeight * 0.6}
                            rx={6}
                            fill={line.colour === '#000000' ? '#8a8a8a' : line.colour}
                        />
                        <text
                            data-wall-text=""
                            x={band.x + 140}
                            y={cy}
                            dominantBaseline="central"
                            fill="#e8eaed"
                            fontSize={labelSize}
                        >
                            {line.name}
                        </text>
                        {line.stations.map((id, i) => {
                            const station = byId.get(id);
                            if (!station) return null;
                            return (
                                <StatusMark
                                    key={id}
                                    x={cellsX + i * CELL + CELL / 2}
                                    y={cy}
                                    r={Math.min(CELL, rowHeight) * 0.34}
                                    status={reveal ? station.stepFree : 'full'}
                                    neutral={!reveal}
                                />
                            );
                        })}
                    </g>
                );
            })}
        </svg>
    );
}

function Numbers({
    network,
    reveal,
    focus
}: {
    network: Network;
    reveal: boolean;
    focus: boolean;
}) {
    const { layout } = useWallStage();
    const right = zones(layout).right;
    const summary = summariseStepFree(network.stations);
    const here = network.stations.find((s) => s.id === HERE_ID);
    const c = right.col;
    const fade = (on: boolean) => ({ opacity: on ? 1 : 0, transition: FADE });

    return (
        <>
            <ScreenText col={c + 1} row={1} level="display" align="right" className="tabular-nums">
                <span style={{ color: reveal ? ACCENT : '#e8eaed', transition: 'color 1.2s' }}>
                    {reveal ? summary.full : summary.total}
                </span>
            </ScreenText>
            <ScreenText col={c + 2} row={1} level="h1" align="left">
                {reveal ? `of ${summary.total}` : 'stations'}
            </ScreenText>
            <ScreenText col={c + 1} row={2} level="h2" align="right">
                {reveal ? 'tube stations are' : 'on the Underground'}
            </ScreenText>
            <ScreenText col={c + 2} row={2} level="h2" align="left">
                <span style={fade(reveal)}>step-free, street to every platform</span>
            </ScreenText>
            <ScreenText col={c + 3} row={1} level="h2" align="left" className="tabular-nums">
                <span style={fade(reveal)}>
                    +{summary.partial} partly
                    <br />
                    {summary.none} not at all
                    {summary.unknown ? (
                        <>
                            <br />
                            <span className="text-white/60">{summary.unknown} no data</span>
                        </>
                    ) : null}
                </span>
            </ScreenText>
            {here ? (
                <ScreenText col={c + 4} row={1} level="h2" align="left">
                    <span style={fade(focus)}>
                        You are at
                        <br />
                        <strong>{here.name}</strong>
                    </span>
                </ScreenText>
            ) : null}
            {here?.stepFreePlatforms ? (
                <ScreenText col={c + 4} row={2} level="h2" align="left" className="tabular-nums">
                    <span style={fade(focus)}>
                        {here.stepFreePlatforms[0]} of {here.stepFreePlatforms[1]} platforms
                        <br />
                        step-free
                    </span>
                </ScreenText>
            ) : null}
            <Legend />
            <ScreenText col={c + 4} row={3} level="detail" align="left" className="text-white/60">
                {network.source.attribution}
                <br />
                Station topology snapshot {network.source.snapshot}
            </ScreenText>
        </>
    );
}

function Legend() {
    const { layout } = useWallStage();
    const items: Array<{ status: StepFree | null; label: string }> = [
        { status: 'full', label: 'Every platform' },
        { status: 'partial', label: 'Some platforms' },
        { status: 'none', label: 'No platform' },
        { status: null, label: 'No data' }
    ];
    const left = zones(layout).left;
    return (
        <>
            {items.map((item, i) => (
                <ScreenText key={item.label} col={left.col + 1 + i} row={3} level="h2" align="left">
                    <span className="flex items-center gap-8">
                        <svg width={120} height={120} viewBox="0 0 120 120" className="shrink-0">
                            <StatusMark x={60} y={60} r={44} status={item.status} />
                        </svg>
                        {item.label}
                    </span>
                </ScreenText>
            ))}
        </>
    );
}
