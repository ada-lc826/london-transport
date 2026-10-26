import {
    loadEquity,
    metricClass,
    metricLabels,
    roughCount,
    type EquityRecord,
    type Metric
} from '../data/equity';
import { loadNetwork, type Network } from '../data/network';
import { fitCamera, projectToWall, type MapCamera } from '../wall/camera';
import { rectsIntersect, regionRect, zones, type WallRect } from '../wall/layout';
import { useWallStage } from '../wall/stage';
import { ScreenText } from '../wall/typography';
import type { SceneProps } from './registry';
import { useAsset } from './use-asset';

// S4 · Who Pays (plan §4.2, §4.4, §5.5; RQ2). Every London neighbourhood (MSOA) within reach
// of the tube, by how much longer its residents' tube journeys take step-free
// (pipeline/equity.py), and whether that penalty falls on the neighbourhoods where more
// disabled people live. It does not: the answer is where you live, not who you are, and the
// scene says so (plan §4.1: the big words follow the data).
//
//   step 0  where: the map coloured by the penalty (tablet B: minutes or share of city lost),
//           the London-wide figure, boroughs ranked
//   step 1  who: penalty x disability share, the scatter and the two averages side by side
//   step 2  where it clusters: LISA hot spots, and how many disabled Londoners lose half
//
// Centre zone, all rows: the map, one dot per neighbourhood sized by residents. Out of the tube's reach
// (no station within reachKm): small grey dots, not a claim either way.

// Ordinal ramp, dark to bright: brighter = bigger penalty.
const RAMP = ['#3d2c5a', '#7a3b6e', '#c0506a', '#ef7f4f', '#ffc561'];
// Bivariate 3 x 3: [penalty tertile][disability-share tertile].
const BIVARIATE = [
    ['#e8e8e8', '#ace4e4', '#5ac8c8'],
    ['#dfb0d6', '#a5add3', '#5698b9'],
    ['#be64ac', '#8c62aa', '#3b4994']
];
const HOT = '#ffc561';
const NEUTRAL = '#6b7380';
const FADE = 'opacity 1.2s ease-in-out';

export function WhoPaysScene({ scene }: SceneProps) {
    const record = useAsset(loadEquity);
    const network = useAsset(loadNetwork);
    if (!record) return null;
    const metric: Metric = scene.params.metric === 'gap' ? 'gap' : 'extra';
    const step = Math.min(scene.step, 2);
    return (
        <>
            <AreaMap record={record} network={network} metric={metric} step={step} />
            <Titles step={step} />
            <Where record={record} metric={metric} visible={step === 0} />
            <Who record={record} visible={step === 1} />
            <Clusters record={record} visible={step === 2} />
            <Source record={record} />
        </>
    );
}

function areaColour(record: EquityRecord, i: number, metric: Metric, step: number): string {
    const area = record.areas[i];
    if (step === 1) return BIVARIATE[area.biv[0]][area.biv[1]];
    if (step === 2) return area.lisa === 'HH' ? HOT : NEUTRAL;
    return RAMP[metricClass(metric, area[metric])];
}

function areaCamera(record: EquityRecord, frame: WallRect): MapCamera {
    const points = [...record.areas, ...record.outOfReach];
    const lons = points.map((p) => p.lon);
    const lats = points.map((p) => p.lat);
    return fitCamera(
        [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
        frame,
        120
    );
}

function AreaMap({
    record,
    network,
    metric,
    step
}: {
    record: EquityRecord;
    network: Network | null;
    metric: Metric;
    step: number;
}) {
    const { layout, view } = useWallStage();
    const centre = zones(layout).centre;
    // All rows: London is taller than three rows' share of the zone's width.
    const frame = regionRect(layout, centre);
    if (!rectsIntersect(frame, view)) return null;
    const camera = areaCamera(record, frame);
    const project = (lon: number, lat: number) => projectToWall(camera, frame, [lon, lat]);
    // Radius by residents (area-true), about 8,000 people on 46 px.
    const radius = (residents: number) => 46 * Math.sqrt(residents / 8000);
    return (
        <svg
            className="absolute"
            style={{ left: frame.x, top: frame.y }}
            width={frame.width}
            height={frame.height}
            viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        >
            {network?.lines.map((line) => (
                <g key={line.id} opacity={0.25}>
                    {line.paths.map((path, k) => (
                        <polyline
                            key={k}
                            points={path.map((p) => project(p[0], p[1]).join(',')).join(' ')}
                            fill="none"
                            stroke="#c9ced6"
                            strokeWidth={6}
                        />
                    ))}
                </g>
            ))}
            {record.outOfReach.map((a) => {
                const [x, y] = project(a.lon, a.lat);
                return <circle key={a.code} cx={x} cy={y} r={14} fill={NEUTRAL} opacity={0.5} />;
            })}
            {record.areas.map((a, i) => {
                const [x, y] = project(a.lon, a.lat);
                return (
                    <circle
                        key={a.code}
                        cx={x}
                        cy={y}
                        r={radius(a.residents)}
                        fill={areaColour(record, i, metric, step)}
                        stroke="#0a0e14"
                        strokeWidth={4}
                        style={{ transition: 'fill 1.2s ease-in-out' }}
                    />
                );
            })}
        </svg>
    );
}

const SUBTITLES = [
    'the step-free penalty, neighbourhood by neighbourhood',
    'penalty against the share of residents who are disabled',
    'where the penalty clusters'
];

function Titles({ step }: { step: number }) {
    const { layout } = useWallStage();
    const left = zones(layout).left;
    return (
        <>
            <ScreenText col={left.col + 1} row={0} level="h1" align="right">
                Who pays?
            </ScreenText>
            <ScreenText col={left.col + 2} row={0} level="h2" align="left">
                <span className="text-white/70">{SUBTITLES[step]}</span>
            </ScreenText>
        </>
    );
}

/** Step 0: the London-wide figure on the left, boroughs ranked on the right, the legend. */
function Where({
    record,
    metric,
    visible
}: {
    record: EquityRecord;
    metric: Metric;
    visible: boolean;
}) {
    const { layout } = useWallStage();
    const { left, right } = zones(layout);
    const fade = { opacity: visible ? 1 : 0, transition: FADE };
    const h = record.headline;
    const everyoneGap = (h.disabledGap + h.notDisabledGap) / 2;
    const big =
        metric === 'extra' ? `+${Math.round(h.everyone)}` : `${Math.round(everyoneGap * 100)}%`;
    // Boroughs with only a few neighbourhoods near the tube are too thin to rank.
    const top = record.boroughs.filter((b) => b.areas >= 5).slice(0, 8);
    return (
        <>
            <ScreenText col={left.col + 1} row={1} level="display" align="right">
                <span className="tabular-nums" style={{ ...fade, color: HOT }}>
                    {big}
                </span>
            </ScreenText>
            <ScreenText col={left.col + 2} row={1} level="h2" align="left">
                <span style={fade}>
                    {metric === 'extra' ? (
                        <>
                            minutes on an average
                            <br />
                            tube journey, step-free
                        </>
                    ) : (
                        <>
                            of the tube within {record.params.tauMinutes} min
                            <br />
                            is lost step-free
                        </>
                    )}
                </span>
            </ScreenText>
            <ScreenText col={left.col + 3} row={1} level="h2" align="left">
                <span className="text-white/70" style={fade}>
                    across {roughCount(record.coverage.residentsInReach)}
                    <br />
                    Londoners near the tube
                </span>
            </ScreenText>
            {metricLabels(metric).map((label, i) => (
                <ScreenText key={label} col={left.col + i} row={3} level="h2" align="left">
                    <span className="flex items-center gap-8" style={fade}>
                        <svg width={110} height={110} viewBox="0 0 110 110" className="shrink-0">
                            <circle cx={55} cy={55} r={44} fill={RAMP[i]} />
                        </svg>
                        {label}
                    </span>
                </ScreenText>
            ))}
            <ScreenText col={right.col + 1} row={0} level="h2" align="left">
                <span className="text-white/70" style={fade}>
                    Boroughs, by the penalty
                    <br />
                    their residents face
                </span>
            </ScreenText>
            {top.map((b, k) => (
                <ScreenText
                    key={b.name}
                    col={right.col + 1 + (k % 4)}
                    row={1 + Math.floor(k / 4)}
                    level="h2"
                    align="left"
                >
                    <span style={fade}>
                        <strong>{b.name}</strong>
                        <br />
                        <span className="tabular-nums" style={{ color: HOT }}>
                            +{Math.round(b.extra)} min
                        </span>
                    </span>
                </ScreenText>
            ))}
        </>
    );
}

/** Step 1: the scatter, the two averages, the bivariate legend. */
function Who({ record, visible }: { record: EquityRecord; visible: boolean }) {
    const { layout } = useWallStage();
    const { left, right } = zones(layout);
    const fade = { opacity: visible ? 1 : 0, transition: FADE };
    const h = record.headline;
    const rho = record.spearman.disabledShare;
    return (
        <>
            <Scatter record={record} visible={visible} />
            <ScreenText col={left.col} row={3} level="h2" align="left">
                <span className="text-white/70" style={fade}>
                    ↑ extra minutes
                    <br />→ share disabled
                </span>
            </ScreenText>
            <ScreenText col={left.col + 1} row={3} level="h2" align="left">
                <span className="tabular-nums" style={fade}>
                    ρ = {rho.toFixed(2)}
                    <br />
                    <span className="text-white/70">no relationship</span>
                </span>
            </ScreenText>
            <ScreenText col={right.col + 1} row={1} level="h1" align="right">
                <span className="tabular-nums" style={{ ...fade, color: '#5ac8c8' }}>
                    +{h.disabled.toFixed(1)}
                </span>
            </ScreenText>
            <ScreenText col={right.col + 2} row={1} level="h2" align="left">
                <span style={fade}>
                    minutes for the average
                    <br />
                    disabled Londoner
                </span>
            </ScreenText>
            <ScreenText col={right.col + 1} row={2} level="h1" align="right">
                <span className="tabular-nums" style={fade}>
                    +{h.notDisabled.toFixed(1)}
                </span>
            </ScreenText>
            <ScreenText col={right.col + 2} row={2} level="h2" align="left">
                <span style={fade}>
                    for everyone else:
                    <br />
                    the steps don&apos;t choose
                </span>
            </ScreenText>
            <ScreenText col={right.col + 3} row={1} level="h2" align="left">
                <span style={fade}>
                    <BivariateLegend />
                </span>
            </ScreenText>
            <ScreenText col={right.col + 3} row={2} level="h2" align="left">
                <span style={fade}>
                    <span className="tabular-nums">{record.doubleDisadvantage.areas}</span>{' '}
                    neighbourhoods
                    <br />
                    in the top third of both
                </span>
            </ScreenText>
        </>
    );
}

function BivariateLegend() {
    const cell = 150;
    return (
        <svg width={760} height={760} viewBox="0 0 570 570">
            {BIVARIATE.map((row, p) =>
                row.map((colour, d) => (
                    <rect
                        key={`${p}-${d}`}
                        x={110 + d * cell}
                        y={(2 - p) * cell}
                        width={cell - 8}
                        height={cell - 8}
                        fill={colour}
                    />
                ))
            )}
            <text x={0} y={240} fill="#ffffff" fontSize={60} transform="rotate(-90 40 240)">
                penalty →
            </text>
            <text x={160} y={540} fill="#ffffff" fontSize={60}>
                disabled →
            </text>
        </svg>
    );
}

function Scatter({ record, visible }: { record: EquityRecord; visible: boolean }) {
    const { layout, view } = useWallStage();
    const left = zones(layout).left;
    const frame = regionRect(layout, { col: left.col, row: 1, colSpan: left.colSpan, rowSpan: 2 });
    if (!rectsIntersect(frame, view)) return null;
    const pad = layout.screenHeight * 0.15;
    const xs = record.areas.map((a) => a.disabledShare);
    const ys = record.areas.map((a) => a.extra);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const [y0, y1] = [0, Math.max(...ys)];
    const x = (v: number) => frame.x + pad + ((v - x0) / (x1 - x0)) * (frame.width - 2 * pad);
    const y = (v: number) =>
        frame.y + frame.height - pad - ((v - y0) / (y1 - y0)) * (frame.height - 2 * pad);
    const mean = record.headline.everyone;
    return (
        <svg
            className="absolute"
            style={{ left: frame.x, top: frame.y, opacity: visible ? 1 : 0, transition: FADE }}
            width={frame.width}
            height={frame.height}
            viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        >
            <line
                x1={x(x0)}
                x2={x(x1)}
                y1={y(mean)}
                y2={y(mean)}
                stroke="#ffffff"
                strokeWidth={6}
                strokeDasharray="24 18"
                opacity={0.6}
            />
            {record.areas.map((a) => (
                <circle
                    key={a.code}
                    cx={x(a.disabledShare)}
                    cy={y(a.extra)}
                    r={18}
                    fill={BIVARIATE[a.biv[0]][a.biv[1]]}
                    opacity={0.85}
                />
            ))}
        </svg>
    );
}

/** Step 2: the hot spots, and how many disabled Londoners lose half the tube. */
function Clusters({ record, visible }: { record: EquityRecord; visible: boolean }) {
    const { layout } = useWallStage();
    const { left, right } = zones(layout);
    const fade = { opacity: visible ? 1 : 0, transition: FADE };
    const h = record.headline;
    const share = h.disabledInReach ? h.disabledLosingHalf / h.disabledInReach : 0;
    // Seven cells, clear of the source note in the last one.
    const boroughs = record.hotspots.boroughs.slice(0, 7);
    return (
        <>
            <ScreenText col={left.col + 1} row={1} level="display" align="right">
                <span className="tabular-nums" style={{ ...fade, color: HOT }}>
                    {Math.round(share * 10)}/10
                </span>
            </ScreenText>
            <ScreenText col={left.col + 2} row={1} level="h2" align="left">
                <span style={fade}>
                    disabled Londoners near
                    <br />
                    the tube lose more than
                    <br />
                    half of it, step-free
                </span>
            </ScreenText>
            <ScreenText col={left.col + 3} row={1} level="h2" align="left">
                <span className="text-white/70 tabular-nums" style={fade}>
                    {roughCount(h.disabledLosingHalf)} of
                    <br />
                    {roughCount(h.disabledInReach)}
                </span>
            </ScreenText>
            <ScreenText col={left.col + 1} row={2} level="h2" align="right">
                <span className="text-white/70 tabular-nums" style={fade}>
                    {roughCount(record.coverage.disabledOutOfReach)}
                </span>
            </ScreenText>
            <ScreenText col={left.col + 2} row={2} level="h2" align="left">
                <span className="text-white/70" style={fade}>
                    more live beyond its
                    <br />
                    reach (grey): bus and
                    <br />
                    rail, not modelled
                </span>
            </ScreenText>
            <ScreenText col={right.col + 1} row={1} level="h1" align="right">
                <span className="tabular-nums" style={{ ...fade, color: HOT }}>
                    {roughCount(record.hotspots.residents)}
                </span>
            </ScreenText>
            <ScreenText col={right.col + 2} row={1} level="h2" align="left">
                <span style={fade}>
                    people in hot spots:
                    <br />
                    high penalty, ringed
                    <br />
                    by high penalty
                </span>
            </ScreenText>
            {boroughs.map((name, k) => (
                <ScreenText
                    key={name}
                    col={right.col + 1 + (k % 4)}
                    row={2 + Math.floor(k / 4)}
                    level="h2"
                    align="left"
                >
                    <span style={fade}>{name}</span>
                </ScreenText>
            ))}
            <ScreenText col={right.col + 3} row={1} level="h2" align="left">
                <span className="text-white/70 tabular-nums" style={fade}>
                    Moran&apos;s I {record.moran.i.toFixed(2)}
                    <br />
                    local clusters at 5% FDR
                </span>
            </ScreenText>
        </>
    );
}

function Source({ record }: { record: EquityRecord }) {
    const { layout } = useWallStage();
    const right = zones(layout).right;
    if (layout.rows < 4) return null;
    return (
        <ScreenText
            col={right.col + right.colSpan - 1}
            row={layout.rows - 1}
            level="detail"
            align="left"
            className="justify-end"
        >
            <span className="text-white/60">
                Tube journeys from each MSOA, network model v1, weighted by weekday use of each
                station; censored at {record.params.capMinutes} min. Census 2021, IoD 2025.{' '}
                {record.source.attribution}.
            </span>
        </ScreenText>
    );
}
