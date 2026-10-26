import { roughCount } from '../data/equity';
import { loadNetwork, type Network } from '../data/network';
import {
    loadUpgradePlans,
    outcomeAt,
    overlapWithTfl,
    type Pick,
    type Strategy,
    type UpgradePlans
} from '../data/upgrades';
import { fitCamera, projectToWall } from '../wall/camera';
import { rectsIntersect, regionRect, zones } from '../wall/layout';
import { useWallStage } from '../wall/stage';
import { ScreenText } from '../wall/typography';
import type { SceneProps } from './registry';
import { useAsset } from './use-asset';

// S7 · What Would Fix It (plan §4.2, §4.4, §5.7; RQ4). A decision theatre: which stations to
// make step-free next. Every plan is precomputed (pipeline/upgrades.py); tablet B picks the
// weighting and how many stations, and the wall shows that plan. Nothing is optimised live.
//
//   step 0  TfL's list: its 12 stations on the map and what they would save
//   step 1  our plan: the chosen strategy's first k stations, the neighbourhoods they help,
//           and, at k = 12, the same budget set against TfL's list
//   step 2  the trade-off: weighting the most deprived neighbourhoods, and the overlap
//
// Centre zone, all rows: the map. Neighbourhood dots by minutes saved; candidate stations
// small grey dots; picks large and bright; TfL's list in white rings.

const SAVED_BREAKS = [1, 3, 6, 10];
const SAVED_RAMP = ['#20333a', '#1f6f5f', '#2fa37a', '#7fd38a', '#d8f5a2'];
const PICK = '#ffc561';
const TFL = '#ffffff';
const NEUTRAL = '#6b7380';
const FADE = 'opacity 1.2s ease-in-out';

export const STRATEGY_LABELS: Record<Strategy, string> = {
    people: 'the most people',
    deprivation: 'the most deprived first',
    disability: 'disabled residents first'
};

function savedClass(minutes: number): number {
    const i = SAVED_BREAKS.findIndex((limit) => minutes <= limit);
    return i === -1 ? SAVED_BREAKS.length : i;
}

function asStrategy(value: string | undefined): Strategy {
    return value === 'deprivation' || value === 'disability' ? value : 'people';
}

export function TheFixScene({ scene }: SceneProps) {
    const plans = useAsset(loadUpgradePlans);
    const network = useAsset(loadNetwork);
    if (!plans) return null;
    const strategy = asStrategy(scene.params.strategy);
    const k = Number(scene.params.k) || 12;
    const step = Math.min(scene.step, 2);
    const ours = plans.strategies[strategy].slice(0, k);
    return (
        <>
            <FixMap plans={plans} network={network} strategy={strategy} k={k} step={step} />
            <Titles step={step} />
            <TflPlan plans={plans} visible={step === 0} />
            <OurPlan plans={plans} strategy={strategy} k={k} visible={step === 1} />
            <TradeOff plans={plans} strategy={strategy} visible={step === 2} />
            <StationList
                heading={step === 0 ? "TfL's list" : `Our ${k}: ${STRATEGY_LABELS[strategy]}`}
                picks={step === 0 ? plans.tfl : ours}
                visible={step < 2}
            />
            <Overlap plans={plans} strategy={strategy} visible={step === 2} />
            <Legend step={step} />
            <Method />
        </>
    );
}

function FixMap({
    plans,
    network,
    strategy,
    k,
    step
}: {
    plans: UpgradePlans;
    network: Network | null;
    strategy: Strategy;
    k: number;
    step: number;
}) {
    const { layout, view } = useWallStage();
    const frame = regionRect(layout, zones(layout).centre);
    if (!rectsIntersect(frame, view)) return null;
    const lons = plans.areas.map((a) => a.lon);
    const lats = plans.areas.map((a) => a.lat);
    const camera = fitCamera(
        [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
        frame,
        160
    );
    const project = (lon: number, lat: number) => projectToWall(camera, frame, [lon, lat]);
    // The nearest map series at or below k (k is one of the precomputed ones in practice).
    const shown = plans.params.shownK.filter((v) => v <= k).pop() ?? plans.params.shownK[0];
    const saved = plans.areaSaved[strategy][String(shown)] ?? [];
    const picked = new Set(plans.strategies[strategy].slice(0, k).map((p) => p.station));
    const tfl = new Set(plans.tfl.map((p) => p.station));
    const showPicks = step >= 1;
    const showTfl = step !== 1;
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
                    {line.paths.map((path, i) => (
                        <polyline
                            key={i}
                            points={path.map((p) => project(p[0], p[1]).join(',')).join(' ')}
                            fill="none"
                            stroke="#c9ced6"
                            strokeWidth={6}
                        />
                    ))}
                </g>
            ))}
            {plans.areas.map((a, i) => {
                const [x, y] = project(a.lon, a.lat);
                const fill = showPicks ? SAVED_RAMP[savedClass(saved[i] ?? 0)] : SAVED_RAMP[0];
                return (
                    <circle
                        key={a.code}
                        cx={x}
                        cy={y}
                        r={40}
                        fill={fill}
                        style={{ transition: 'fill 1.2s ease-in-out' }}
                    />
                );
            })}
            {Object.entries(plans.stations).map(([id, s]) => {
                const [x, y] = project(s.lon, s.lat);
                if (showPicks && picked.has(id)) {
                    return (
                        <circle
                            key={id}
                            cx={x}
                            cy={y}
                            r={70}
                            fill={PICK}
                            stroke="#0a0e14"
                            strokeWidth={10}
                        />
                    );
                }
                return (
                    <circle
                        key={id}
                        cx={x}
                        cy={y}
                        r={s.stepFree === 'full' ? 14 : 18}
                        fill={s.stepFree === 'full' ? '#c9ced6' : NEUTRAL}
                        opacity={0.8}
                    />
                );
            })}
            {plans.tfl.map((p) => {
                const s = plans.stations[p.station];
                if (!s) return null;
                const [x, y] = project(s.lon, s.lat);
                return (
                    <circle
                        key={p.station}
                        cx={x}
                        cy={y}
                        r={90}
                        fill="none"
                        stroke={TFL}
                        strokeWidth={14}
                        style={{ opacity: showTfl && tfl.has(p.station) ? 1 : 0, transition: FADE }}
                    />
                );
            })}
        </svg>
    );
}

const SUBTITLES = [
    'the stations TfL has said it will make step-free next',
    'the same budget, another order',
    'who to put first'
];

function Titles({ step }: { step: number }) {
    const { layout } = useWallStage();
    const left = zones(layout).left;
    return (
        <>
            <ScreenText col={left.col + 1} row={0} level="h1" align="right">
                What would fix it?
            </ScreenText>
            <ScreenText col={left.col + 2} row={0} level="h2" align="left">
                <span className="text-white/70">{SUBTITLES[step]}</span>
            </ScreenText>
        </>
    );
}

/** A big minutes figure and a residents figure, in the left zone's eye band. */
function Figures({
    outcome,
    label,
    colour,
    visible
}: {
    outcome: { savedEveryone: number; helped: number };
    label: string;
    colour: string;
    visible: boolean;
}) {
    const { layout } = useWallStage();
    const left = zones(layout).left;
    const fade = { opacity: visible ? 1 : 0, transition: FADE };
    return (
        <>
            <ScreenText col={left.col + 1} row={1} level="display" align="right">
                <span className="tabular-nums" style={{ ...fade, color: colour }}>
                    −{outcome.savedEveryone.toFixed(1)}
                </span>
            </ScreenText>
            <ScreenText col={left.col + 2} row={1} level="h2" align="left">
                <span style={fade}>
                    minutes off the step-free
                    <br />
                    penalty, {label}
                </span>
            </ScreenText>
            <ScreenText col={left.col + 1} row={2} level="h1" align="right">
                <span className="tabular-nums" style={{ ...fade, color: colour }}>
                    {roughCount(outcome.helped)}
                </span>
            </ScreenText>
            <ScreenText col={left.col + 2} row={2} level="h2" align="left">
                <span style={fade}>
                    Londoners near the tube
                    <br />
                    gain 5 minutes or more
                </span>
            </ScreenText>
        </>
    );
}

function TflPlan({ plans, visible }: { plans: UpgradePlans; visible: boolean }) {
    const { layout } = useWallStage();
    const left = zones(layout).left;
    const last = plans.tfl[plans.tfl.length - 1];
    const fade = { opacity: visible ? 1 : 0, transition: FADE };
    return (
        <>
            <Figures outcome={last} label="from TfL's 12" colour={TFL} visible={visible} />
            <ScreenText col={left.col + 3} row={1} level="h2" align="left">
                <span className="text-white/70" style={fade}>
                    today: +{plans.now.everyone.toFixed(1)} min
                    <br />
                    per step-free journey,
                    <br />
                    buses and rail included
                </span>
            </ScreenText>
        </>
    );
}

function OurPlan({
    plans,
    strategy,
    k,
    visible
}: {
    plans: UpgradePlans;
    strategy: Strategy;
    k: number;
    visible: boolean;
}) {
    const { layout } = useWallStage();
    const left = zones(layout).left;
    const outcome = outcomeAt(plans, strategy, k);
    const tfl = plans.tfl[plans.tfl.length - 1];
    const fade = { opacity: visible ? 1 : 0, transition: FADE };
    const same = k === plans.tfl.length;
    const more = outcome.helped - tfl.helped;
    return (
        <>
            <Figures outcome={outcome} label={`from our ${k}`} colour={PICK} visible={visible} />
            <ScreenText col={left.col + 3} row={1} level="h2" align="left">
                <span className="text-white/70 tabular-nums" style={fade}>
                    TfL&apos;s 12: −{tfl.savedEveryone.toFixed(1)} min,
                    <br />
                    {roughCount(tfl.helped)} gain 5+
                </span>
            </ScreenText>
            {same && more > 0 ? (
                <ScreenText col={left.col + 3} row={2} level="h2" align="left">
                    <span style={fade}>
                        Same 12 stations:
                        <br />
                        <span className="tabular-nums" style={{ color: PICK }}>
                            {roughCount(more)}
                        </span>{' '}
                        more people
                        <br />
                        helped
                    </span>
                </ScreenText>
            ) : null}
        </>
    );
}

/** Step 2: the deprivation sweep at k = 10 as a frontier, with TfL's list for scale. */
function TradeOff({
    plans,
    strategy,
    visible
}: {
    plans: UpgradePlans;
    strategy: Strategy;
    visible: boolean;
}) {
    const { layout, view } = useWallStage();
    const left = zones(layout).left;
    const frame = regionRect(layout, { col: left.col, row: 1, colSpan: 3, rowSpan: 2 });
    const fade = { opacity: visible ? 1 : 0, transition: FADE };
    const rows = plans.sweeps.deprivation;
    const first = rows[0];
    const last = rows[rows.length - 1];
    // TfL's list sits far below and left of every point (step 1 compares it): left out, so
    // the curve fills the frame.
    const xs = rows.map((r) => r.savedEveryone);
    const ys = rows.map((r) => r.savedDeprived);
    const pad = layout.screenHeight * 0.2;
    const span = (lo: number, hi: number) => Math.max(hi - lo, 1e-6) * 0.1;
    const [x0, x1] = [
        Math.min(...xs) - span(Math.min(...xs), Math.max(...xs)),
        Math.max(...xs) + span(Math.min(...xs), Math.max(...xs))
    ];
    const [y0, y1] = [
        Math.min(...ys) - span(Math.min(...ys), Math.max(...ys)),
        Math.max(...ys) + span(Math.min(...ys), Math.max(...ys))
    ];
    const x = (v: number) => frame.x + pad + ((v - x0) / (x1 - x0)) * (frame.width - 2 * pad);
    const y = (v: number) =>
        frame.y + frame.height - pad - ((v - y0) / (y1 - y0)) * (frame.height - 2 * pad);
    const ours = outcomeAt(plans, strategy, 10);
    const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);
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
                    <polyline
                        points={rows
                            .map((r) => `${x(r.savedEveryone)},${y(r.savedDeprived)}`)
                            .join(' ')}
                        fill="none"
                        stroke={PICK}
                        strokeWidth={10}
                    />
                    {rows.map((r, i) => (
                        <circle
                            key={i}
                            cx={x(r.savedEveryone)}
                            cy={y(r.savedDeprived)}
                            r={34}
                            fill={PICK}
                        />
                    ))}
                    <circle
                        cx={x(ours.savedEveryone)}
                        cy={y(ours.savedDeprived)}
                        r={64}
                        fill="none"
                        stroke={PICK}
                        strokeWidth={10}
                    />
                </svg>
            ) : null}
            <ScreenText col={left.col} row={3} level="h2" align="left">
                <span className="text-white/70" style={fade}>
                    ↑ minutes for the most
                    <br />
                    deprived fifth
                    <br />→ minutes for everyone
                </span>
            </ScreenText>
            <ScreenText col={left.col + 1} row={3} level="h2" align="left">
                <span className="text-white/70" style={fade}>
                    <span style={{ color: PICK }}>●</span> our 10, weighting
                    <br />
                    deprivation more and
                    <br />
                    more as it climbs
                </span>
            </ScreenText>
            <ScreenText col={left.col + 3} row={1} level="h1" align="right">
                <span className="tabular-nums" style={{ ...fade, color: PICK }}>
                    +{pct(last.savedDeprived, first.savedDeprived)}%
                </span>
            </ScreenText>
            <ScreenText col={left.col + 4} row={1} level="h2" align="left">
                <span style={fade}>
                    for the most deprived
                    <br />
                    neighbourhoods, if they
                    <br />
                    come first
                </span>
            </ScreenText>
            <ScreenText col={left.col + 3} row={2} level="h1" align="right">
                <span className="tabular-nums" style={fade}>
                    {pct(last.savedEveryone, first.savedEveryone)}%
                </span>
            </ScreenText>
            <ScreenText col={left.col + 4} row={2} level="h2" align="left">
                <span style={fade}>
                    for everyone:
                    <br />a small price
                </span>
            </ScreenText>
        </>
    );
}

/** Station names, two to a screen, in the right zone. */
function StationList({
    heading,
    picks,
    visible
}: {
    heading: string;
    picks: Pick[];
    visible: boolean;
}) {
    const { layout } = useWallStage();
    const right = zones(layout).right;
    const fade = { opacity: visible ? 1 : 0, transition: FADE };
    // Cells: rows 1-3, columns right.col+1..+4, minus the method note's corner.
    const cells: { col: number; row: number }[] = [];
    for (let row = 1; row < layout.rows; row++) {
        for (let c = 1; c < right.colSpan; c++) {
            if (row === layout.rows - 1 && c === right.colSpan - 1) continue;
            cells.push({ col: right.col + c, row });
        }
    }
    return (
        <>
            <ScreenText col={right.col + 1} row={0} level="h2" align="left">
                <span className="text-white/70" style={fade}>
                    {heading}
                </span>
            </ScreenText>
            {cells.map((cell, i) => {
                const pair = picks.slice(i * 2, i * 2 + 2);
                if (!pair.length) return null;
                return (
                    <ScreenText key={i} {...cell} level="h2" align="left">
                        <span style={fade}>
                            {pair.map((p, j) => (
                                <span key={p.station} className="block">
                                    <span className="text-white/50 tabular-nums">
                                        {i * 2 + j + 1}{' '}
                                    </span>
                                    {p.name}
                                </span>
                            ))}
                        </span>
                    </ScreenText>
                );
            })}
        </>
    );
}

function Overlap({
    plans,
    strategy,
    visible
}: {
    plans: UpgradePlans;
    strategy: Strategy;
    visible: boolean;
}) {
    const { layout } = useWallStage();
    const right = zones(layout).right;
    const fade = { opacity: visible ? 1 : 0, transition: FADE };
    const shared = overlapWithTfl(plans, strategy, plans.tfl.length);
    return (
        <>
            <ScreenText col={right.col + 1} row={1} level="h1" align="right">
                <span className="tabular-nums" style={fade}>
                    {shared.length}
                </span>
            </ScreenText>
            <ScreenText col={right.col + 2} row={1} level="h2" align="left">
                <span style={fade}>
                    of TfL&apos;s 12 {shared.length === 1 ? 'is' : 'are'} in
                    <br />
                    our first 12
                    {shared.length ? (
                        <>
                            :
                            <br />
                            <span className="text-white/70">{shared.join(', ')}</span>
                        </>
                    ) : null}
                </span>
            </ScreenText>
            <ScreenText col={right.col + 1} row={2} level="h2" align="left">
                <span className="text-white/70" style={fade}>
                    Ours follow where
                    <br />
                    people travel. TfL&apos;s
                    <br />
                    reach out to zone 7
                </span>
            </ScreenText>
            <ScreenText col={right.col + 2} row={2} level="h2" align="left">
                <span className="text-white/70" style={fade}>
                    Each station counts as
                    <br />
                    one. TfL also weighs cost
                    <br />
                    and what can be built
                </span>
            </ScreenText>
        </>
    );
}

function Legend({ step }: { step: number }) {
    const { layout } = useWallStage();
    const left = zones(layout).left;
    if (step !== 1) return null;
    const labels = ['≤ 1 min', '≤ 3 min', '≤ 6 min', '≤ 10 min', '> 10 min'];
    return (
        <>
            {labels.map((label, i) => (
                <ScreenText key={label} col={left.col + i} row={3} level="h2" align="left">
                    <span className="flex items-center gap-8">
                        <svg width={110} height={110} viewBox="0 0 110 110" className="shrink-0">
                            <circle cx={55} cy={55} r={44} fill={SAVED_RAMP[i]} />
                        </svg>
                        {label}
                    </span>
                </ScreenText>
            ))}
        </>
    );
}

function Method() {
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
                Greedy choice on network model v1, each pick re-evaluated exactly; matches
                exhaustive search on a reduced instance. Counts buses and other rail through the bus
                fallback model: an upgrade only helps where it beats them. Weights as S4. Powered by
                TfL Open Data.
            </span>
        </ScreenText>
    );
}
