import { formatHours, loadLiftSurvival, type LiftSurvival } from '../data/lift-survival';
import {
    downgradedAt,
    hoursBetween,
    loadLiftRecord,
    londonTime,
    medianOutageHours,
    type LiftRecord
} from '../data/lifts';
import { loadNetwork, type Network } from '../data/network';
import { projectToWall } from '../wall/camera';
import { rectsIntersect, regionRect, wallSize, zones } from '../wall/layout';
import { useWallStage } from '../wall/stage';
import { clipText, ScreenText, typeSize } from '../wall/typography';
import type { SceneProps } from './registry';
import { StatusMark } from './the-step';
import { networkCamera, useAsset } from './use-asset';
import { useTimelineMs } from './use-timeline';

// S5 · On Paper (plan §4.2, RQ3). Step-free on paper against step-free in practice, from our
// own lift log: TfL's lift disruption feed every 15 minutes since the project began, each
// sample's lifts removed from TfL's station topology to see which stations lose step-free
// access (pipeline/lift_outages.py).
//
//   step 0  the latest sample: how many of the stations step-free on paper are now
//   step 1  the whole log replayed, REPLAY_SECONDS long, looping, with what it adds up to
//   step 2  how long outages last: Kaplan-Meier curves on the left, what they mean on the
//           right (pipeline/lift_survival.py)
//
// Status keeps S2's shapes: filled = every platform step-free, half = some, ring = none. A
// station downgraded at the moment shown is drawn at its current status with a red ring.

export const REPLAY_SECONDS = 30;
const FADE = 'opacity 1.2s ease-in-out';
const LOST = '#ff6b6b';

export function TheLiftsScene({ scene }: SceneProps) {
    const record = useAsset(loadLiftRecord);
    const network = useAsset(loadNetwork);
    const survival = useAsset(loadLiftSurvival);
    const ms = useTimelineMs(scene);
    if (!record || !network) return null;
    const n = record.times.length;
    const replay = scene.step === 1;
    const durations = scene.step >= 2;
    const i = replay
        ? Math.min(n - 1, Math.floor((((ms ?? 0) / 1000 / REPLAY_SECONDS) % 1) * n))
        : n - 1;
    return (
        <>
            <Timeline record={record} i={i} />
            <LiftMap record={record} network={network} i={i} />
            {durations ? null : <PaperVsNow record={record} i={i} />}
            <Summary record={record} visible={replay} />
            {survival ? <Durations survival={survival} visible={durations} /> : null}
        </>
    );
}

/** Stations downgraded at each sample, across the top row; the moment shown marked. */
function Timeline({ record, i }: { record: LiftRecord; i: number }) {
    const { layout } = useWallStage();
    const { width } = wallSize(layout);
    const h = layout.screenHeight;
    const n = record.times.length;
    const base = h * 0.8;
    const top = Math.max(1, ...record.downgraded);
    const x = (k: number) => (k / n) * width;
    // The chart stays below the two-line title in the corner screen.
    const y = (v: number) => base - (v / top) * h * 0.33;
    const steps = record.downgraded.map((v, k) => `${x(k)},${y(v)} ${x(k + 1)},${y(v)}`).join(' ');
    const pad = Math.round(h * 0.06);
    return (
        <>
            <svg
                className="absolute"
                style={{ left: 0, top: 0 }}
                width={width}
                height={h}
                viewBox={`0 0 ${width} ${h}`}
            >
                <polygon
                    points={`0,${base} ${steps} ${width},${base}`}
                    fill={LOST}
                    opacity={0.35}
                />
                <polyline points={steps} fill="none" stroke={LOST} strokeWidth={8} />
                <line
                    x1={x(i + 0.5)}
                    x2={x(i + 0.5)}
                    y1={h * 0.45}
                    y2={base}
                    stroke="#ffffff"
                    strokeWidth={10}
                />
            </svg>
            {/* When each screen's slice of the log starts, inside the screen. */}
            {Array.from({ length: layout.columns }, (_, col) => {
                const k = Math.min(n - 1, Math.floor((col / layout.columns) * n));
                return (
                    <div
                        key={col}
                        data-wall-text=""
                        className="absolute text-white/50 tabular-nums"
                        style={{
                            left: col * layout.screenWidth + pad / 2,
                            top: base + pad / 4,
                            fontSize: typeSize('h2', h)
                        }}
                    >
                        {londonTime(record.times[k])}
                    </div>
                );
            })}
            <ScreenText col={0} row={0} level="h2" align="left" className="justify-start">
                <span>
                    <strong>Step-free, in practice</strong>
                    <br />
                    <span className="text-white/70">stations cut off</span>
                </span>
            </ScreenText>
        </>
    );
}

function LiftMap({ record, network, i }: { record: LiftRecord; network: Network; i: number }) {
    const { layout, view } = useWallStage();
    const centre = zones(layout).centre;
    const frame = regionRect(layout, { ...centre, row: 1, rowSpan: layout.rows - 1 });
    const camera = networkCamera(network, frame, 160);
    if (!camera || !rectsIntersect(frame, view)) return null;
    const project = (lon: number, lat: number) => projectToWall(camera, frame, [lon, lat]);
    const now = new Map(record.stations.map((s) => [s.id, s.status[i]]));
    const lost = new Set(downgradedAt(record, i).map((s) => s.id));
    return (
        <svg
            className="absolute"
            style={{ left: frame.x, top: frame.y }}
            width={frame.width}
            height={frame.height}
            viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        >
            {network.lines.map((line) => (
                <g key={line.id} opacity={0.2}>
                    {line.paths.map((path, k) => (
                        <polyline
                            key={k}
                            points={path.map((p) => project(p[0], p[1]).join(',')).join(' ')}
                            fill="none"
                            stroke="#c9ced6"
                            strokeWidth={8}
                        />
                    ))}
                </g>
            ))}
            {network.stations
                .filter((s) => s.stepFree === 'full' || s.stepFree === 'partial')
                .map((s) => {
                    const [x, y] = project(s.lon, s.lat);
                    const status = now.get(s.id) ?? s.stepFree;
                    return (
                        <g key={s.id}>
                            <StatusMark x={x} y={y} r={lost.has(s.id) ? 34 : 26} status={status} />
                            {lost.has(s.id) ? (
                                <circle
                                    cx={x}
                                    cy={y}
                                    r={70}
                                    fill="none"
                                    stroke={LOST}
                                    strokeWidth={12}
                                />
                            ) : null}
                        </g>
                    );
                })}
        </svg>
    );
}

/** Left zone: the count on paper and at the moment shown, and the stations behind it. */
function PaperVsNow({ record, i }: { record: LiftRecord; i: number }) {
    const { layout } = useWallStage();
    if (layout.rows < 4) return null;
    const left = zones(layout).left;
    const onPaper = record.paper.full;
    const now = onPaper - record.fullDowngraded[i];
    const lost = downgradedAt(record, i).slice(0, left.colSpan * 2);
    return (
        <>
            <ScreenText col={left.col} row={1} level="h1" align="right" className="tabular-nums">
                {onPaper}
            </ScreenText>
            <ScreenText col={left.col + 1} row={1} level="h2" align="left">
                fully step-free
                <br />
                stations on paper
            </ScreenText>
            <ScreenText
                col={left.col + 2}
                row={1}
                level="h1"
                align="right"
                className="tabular-nums"
            >
                <span style={{ color: LOST }}>{now}</span>
            </ScreenText>
            <ScreenText col={left.col + 3} row={1} level="h2" align="left">
                in practice at
                <br />
                <span className="tabular-nums">{londonTime(record.times[i])}</span>
            </ScreenText>
            {lost.map((s, k) => (
                <ScreenText
                    key={s.id}
                    col={left.col + (k % left.colSpan)}
                    row={2 + Math.floor(k / left.colSpan)}
                    level="h2"
                    align="left"
                    className="justify-start"
                >
                    <span>
                        <strong>{s.name}</strong>
                        <br />
                        <span className="text-white/70">
                            {s.paper} → <span style={{ color: LOST }}>{s.status[i]}</span>
                        </span>
                        <span className="block text-white/70">{clipText(s.message, 48)}</span>
                    </span>
                </ScreenText>
            ))}
        </>
    );
}

/** Right zone, in the replay: what the whole log adds up to. */
function Summary({ record, visible }: { record: LiftRecord; visible: boolean }) {
    const { layout } = useWallStage();
    if (layout.rows < 4) return null;
    const right = zones(layout).right;
    const fade = { opacity: visible ? 1 : 0, transition: FADE };
    const days = hoursBetween(record.source.from, record.source.to) / 24;
    const everFull = record.stations.filter((s) => s.paper === 'full').length;
    const typicalOut = [...record.liftsOut].sort((a, b) => a - b)[record.liftsOut.length >> 1];
    const median = medianOutageHours(record);
    const staff = record.stations.filter((s) => /staff/i.test(s.message)).length;
    return (
        <>
            <ScreenText col={right.col} row={1} level="h1" align="right" className="tabular-nums">
                <span style={fade}>{everFull}</span>
            </ScreenText>
            <ScreenText col={right.col + 1} row={1} level="h2" align="left">
                <span style={fade}>
                    of {record.paper.full} lost step-free
                    <br />
                    access in {days.toFixed(1)} days
                </span>
            </ScreenText>
            <ScreenText col={right.col} row={2} level="h1" align="right" className="tabular-nums">
                <span style={fade}>{typicalOut}</span>
            </ScreenText>
            <ScreenText col={right.col + 1} row={2} level="h2" align="left">
                <span style={fade}>
                    lifts out of service
                    <br />
                    at a typical moment
                </span>
            </ScreenText>
            <ScreenText col={right.col + 2} row={2} level="h2" align="left">
                <span style={fade}>
                    {record.outages.length} outages logged;
                    <br />
                    median {median === null ? '–' : `${median.toFixed(1)} h`} for those
                    <br />
                    that began and ended
                </span>
            </ScreenText>
            {staff ? (
                <ScreenText col={right.col + 2} row={1} level="h2" align="left">
                    <span style={fade}>
                        {staff} {staff === 1 ? 'station' : 'stations'}: not the lift but
                        <br />
                        &ldquo;unavailability of
                        <br />
                        station staff&rdquo;
                    </span>
                </ScreenText>
            ) : null}
            <ScreenText
                col={right.col}
                row={layout.rows - 1}
                level="h2"
                align="left"
                className="justify-end"
            >
                <span className="text-white/60">
                    Our log of TfL&apos;s lift disruption feed, {record.source.samples} samples from{' '}
                    {londonTime(record.source.from)} to {londonTime(record.source.to)}.{' '}
                    {record.source.attribution}.
                </span>
            </ScreenText>
        </>
    );
}

// Shown on the curves: the first three days, where nearly all outages end.
const CURVE_HOURS_SHOWN = 72;
const CURVES = [
    { group: 'all', colour: '#ffffff', width: 14, label: 'all outages' },
    { group: 'underground', colour: '#7fd3ff', width: 10, label: 'Underground' },
    { group: 'otherModes', colour: '#ffb35c', width: 10, label: 'rail, Overground, DLR' }
] as const;

/** Step 2: Kaplan-Meier curves (share of outages still under way, by hours since the lift
 *  went out) and what they mean. */
function Durations({ survival, visible }: { survival: LiftSurvival; visible: boolean }) {
    const { layout, view } = useWallStage();
    const { left, right } = zones(layout);
    const fade = { opacity: visible ? 1 : 0, transition: FADE };
    const frame = regionRect(layout, { col: left.col, row: 1, colSpan: left.colSpan, rowSpan: 2 });
    const pad = layout.screenHeight * 0.15;
    const x = (hour: number) =>
        frame.x + pad + (hour / CURVE_HOURS_SHOWN) * (frame.width - 2 * pad);
    const y = (share: number) => frame.y + pad + (1 - share) * (frame.height - 2 * pad);
    const all = survival.km.all;
    const tube = survival.km.underground;
    const other = survival.km.otherModes;
    const step = (curve: number[]) =>
        curve
            .slice(0, CURVE_HOURS_SHOWN + 1)
            .map((s, h) => `${x(h)},${y(s)}${h < CURVE_HOURS_SHOWN ? ` ${x(h + 1)},${y(s)}` : ''}`)
            .join(' ');
    return (
        <>
            {rectsIntersect(frame, view) ? (
                <svg
                    className="absolute"
                    style={{ left: frame.x, top: frame.y, ...fade }}
                    width={frame.width}
                    height={frame.height}
                    viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
                >
                    {/* One day, two days: faint guides. */}
                    {[24, 48].map((h) => (
                        <line
                            key={h}
                            x1={x(h)}
                            x2={x(h)}
                            y1={y(1)}
                            y2={y(0)}
                            stroke="#ffffff"
                            strokeOpacity={0.2}
                            strokeWidth={4}
                            strokeDasharray="16 16"
                        />
                    ))}
                    <line
                        x1={x(0)}
                        x2={x(CURVE_HOURS_SHOWN)}
                        y1={y(0)}
                        y2={y(0)}
                        stroke="#ffffff"
                        strokeOpacity={0.4}
                        strokeWidth={4}
                    />
                    {CURVES.map((c) => (
                        <polyline
                            key={c.group}
                            points={step(survival.km[c.group].curve)}
                            fill="none"
                            stroke={c.colour}
                            strokeWidth={c.width}
                        />
                    ))}
                </svg>
            ) : null}
            <ScreenText col={left.col} row={3} level="h2" align="left">
                <span className="text-white/70" style={fade}>
                    ↑ share still out
                    <br />→ hours, 0 to 3 days
                </span>
            </ScreenText>
            {CURVES.map((c, k) => (
                <ScreenText key={c.group} col={left.col + 1 + k} row={3} level="h2" align="left">
                    <span className="flex items-center gap-8" style={fade}>
                        <svg width={110} height={40} viewBox="0 0 110 40" className="shrink-0">
                            <line
                                x1={0}
                                x2={110}
                                y1={20}
                                y2={20}
                                stroke={c.colour}
                                strokeWidth={c.width}
                            />
                        </svg>
                        {c.label}
                    </span>
                </ScreenText>
            ))}
            <ScreenText col={right.col} row={1} level="h1" align="right" className="tabular-nums">
                <span style={fade}>{formatHours(all.medianHours)}</span>
            </ScreenText>
            <ScreenText col={right.col + 1} row={1} level="h2" align="left">
                <span style={fade}>
                    median outage: half
                    <br />
                    last longer than this
                </span>
            </ScreenText>
            <ScreenText
                col={right.col + 2}
                row={1}
                level="h1"
                align="right"
                className="tabular-nums"
            >
                <span style={{ ...fade, color: LOST }}>
                    {Math.round(all.stillOut['24h'] * 100)}%
                </span>
            </ScreenText>
            <ScreenText col={right.col + 3} row={1} level="h2" align="left">
                <span style={fade}>
                    still out a day later;
                    <br />
                    {Math.round(all.stillOut['168h'] * 100)}% after a week
                </span>
            </ScreenText>
            <ScreenText col={right.col} row={2} level="h1" align="right" className="tabular-nums">
                <span style={{ ...fade, color: '#7fd3ff' }}>
                    {survival.cox.underground.hazardRatio.toFixed(1)}×
                </span>
            </ScreenText>
            <ScreenText col={right.col + 1} row={2} level="h2" align="left">
                <span style={fade}>
                    faster repairs on the
                    <br />
                    Underground: {formatHours(tube.medianHours)} against
                    <br />
                    {formatHours(other.medianHours)} elsewhere
                </span>
            </ScreenText>
            <ScreenText col={right.col + 2} row={2} level="h2" align="left">
                <span className="text-white/70 tabular-nums" style={fade}>
                    {survival.outages.used} outages of
                    <br />
                    {survival.outages.lifts} lifts; Tube Alerter
                    <br />
                    found {formatHours(survival.tubeAlerter.medianHours)} too
                </span>
            </ScreenText>
        </>
    );
}
