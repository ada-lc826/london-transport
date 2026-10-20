import { loadNetwork, type Network } from '../data/network';
import {
    changes,
    legLabel,
    loadRaces,
    segmentAt,
    segments,
    type RaceJourney,
    type Segment
} from '../data/races';
import { wallSize, type WallLayout } from '../wall/layout';
import { useWallStage } from '../wall/stage';
import { ScreenText, typeSize } from '../wall/typography';
import { placeLabels, type LabelPlacement } from './race-labels';
import type { SceneProps } from './registry';
import { useAsset } from './use-asset';
import { useTimelineMs } from './use-timeline';

// S6 · The Race (plan §4.2, §4.4). Two travellers leave the same door at the same moment for
// the same destination: A takes the fastest route, B the fastest step-free one. Time runs left
// to right along the whole wall, WALL_MINUTES across its width (5 minutes a column on the 16x4
// wall), so the gap is something the room has to turn to follow. Journeys are the Journey
// Planner's own, leg by leg (pipeline/races_export.py).
//
//   step 0  line-up: the trip, both travellers at the start
//   step 1  the race, RACE_SPEED minutes of journey per second of shared timeline
//   step 2  the result: both journeys complete, and the gap
//
// Rows on the 16x4 wall: r0 A's clock, r1 A's lane, r2 B's lane, r3 B's clock. Leg labels sit
// above each bar inside one screen, so none crosses a bezel; bars themselves may.

export const WALL_MINUTES = 80;
export const RACE_SPEED = 1; // journey minutes per second
const FADE = 'opacity 1.2s ease-in-out';

const MODE_COLOURS: Record<string, string> = {
    bus: '#E1251B',
    overground: '#EE7C0E',
    'elizabeth-line': '#6950A1',
    dlr: '#00A4A7',
    'national-rail': '#9aa3ae',
    tram: '#5FB526',
    'river-bus': '#039BE5'
};
const WALK = '#c9ced6';
const WAIT = '#5b6573';

export function TheRaceScene({ scene }: SceneProps) {
    const races = useAsset(loadRaces);
    const network = useAsset(loadNetwork);
    const { layout } = useWallStage();
    const ms = useTimelineMs(scene);
    const race = races?.races.find((r) => r.id === scene.params.race);
    if (!race || !network || !race.standard || !race.stepFree) return null;

    // Minutes of journey shown so far: none at the line-up, all at the result.
    const now = scene.step === 0 ? 0 : scene.step >= 2 ? Infinity : ((ms ?? 0) / 1000) * RACE_SPEED;
    const names = new Map(network.stations.map((s) => [s.id, s.name]));
    const rows = laneRows(layout);
    const travellers = [
        { key: 'A', label: 'standard', journey: race.standard, row: rows.a, clockRow: rows.aClock },
        { key: 'B', label: 'step-free', journey: race.stepFree, row: rows.b, clockRow: rows.bClock }
    ];
    const gap = race.stepFree.minutes - race.standard.minutes;

    return (
        <>
            {travellers.map((t) => (
                <Lane
                    key={t.key}
                    network={network}
                    journey={t.journey}
                    row={t.row}
                    now={now}
                    letter={t.key}
                />
            ))}
            {rows.aClock !== null ? <Ticks /> : null}
            {travellers.map((t) =>
                t.clockRow === null ? null : (
                    <Clock
                        key={t.key}
                        letter={t.key}
                        label={t.label}
                        journey={t.journey}
                        row={t.clockRow}
                        now={now}
                    />
                )
            )}
            {rows.aClock !== null ? (
                <>
                    <ScreenText col={0} row={rows.aClock} level="h2" align="left">
                        <span className="text-white/70">From</span>{' '}
                        <strong>{names.get(race.origin) ?? race.origin}</strong>
                        <br />
                        <span className="text-white/70">to</span>{' '}
                        <strong>{names.get(race.destination) ?? race.destination}</strong>
                    </ScreenText>
                    <Result
                        gap={gap}
                        stepFree={race.stepFree}
                        standardMinutes={race.standard.minutes}
                        visible={scene.step >= 2}
                    />
                </>
            ) : null}
        </>
    );
}

function laneRows(layout: WallLayout) {
    // The 3x2 simulator wall has no room for clocks: lanes only.
    if (layout.rows < 4)
        return { a: 0, b: Math.min(1, layout.rows - 1), aClock: null, bClock: null };
    return { a: 1, b: 2, aClock: 0, bClock: 3 };
}

function minuteX(layout: WallLayout, minute: number) {
    return (Math.max(0, minute) / WALL_MINUTES) * wallSize(layout).width;
}

function colour(network: Network, segment: Segment) {
    if (segment.kind === 'wait') return WAIT;
    const { leg } = segment;
    if (leg.mode === 'walking') return WALK;
    if (leg.mode === 'tube') {
        const line = network.lines.find((l) => l.name === leg.line);
        if (line) return line.colour;
    }
    return MODE_COLOURS[leg.mode] ?? '#9aa3ae';
}

function Lane({
    network,
    journey,
    row,
    now,
    letter
}: {
    network: Network;
    journey: RaceJourney;
    row: number;
    now: number;
    letter: string;
}) {
    const { layout } = useWallStage();
    const width = wallSize(layout).width;
    const h = layout.screenHeight;
    const top = row * h;
    // Bars sit low in the row, leaving the top for their labels.
    const y = top + h * 0.72;
    const parts = segments(journey);
    const done = Math.min(now, journey.minutes);
    const arrived = now >= journey.minutes;
    // The marker's radius plus its ring, so it is whole at the start line.
    const markerX = Math.max(124, minuteX(layout, done));

    return (
        <>
            <svg
                className="absolute"
                style={{ left: 0, top }}
                width={width}
                height={h}
                viewBox={`0 ${top} ${width} ${h}`}
            >
                {/* Where the trip ends, so the room can see how far each traveller has to go. */}
                <line
                    x1={minuteX(layout, journey.minutes)}
                    x2={minuteX(layout, journey.minutes)}
                    y1={y - 170}
                    y2={y + 170}
                    stroke="#ffffff"
                    strokeOpacity={0.35}
                    strokeWidth={8}
                    strokeDasharray="16 16"
                />
                {parts.map((part, i) => {
                    if (done <= part.start) return null;
                    const x1 = minuteX(layout, part.start);
                    const x2 = minuteX(layout, Math.min(done, part.end));
                    return (
                        <SegmentMark
                            key={i}
                            part={part}
                            x1={x1}
                            x2={x2}
                            y={y}
                            fill={colour(network, part)}
                        />
                    );
                })}
                <g transform={`translate(${markerX} ${y})`}>
                    <circle
                        r={110}
                        fill={arrived ? '#ffffff' : '#0a0e14'}
                        stroke="#ffffff"
                        strokeWidth={14}
                    />
                    <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={130}
                        fontWeight={700}
                        fill={arrived ? '#0a0e14' : '#ffffff'}
                    >
                        {letter}
                    </text>
                </g>
            </svg>
            {placeLabels(parts, layout, (minute) => minuteX(layout, minute)).map((label) =>
                done > parts[label.index].start ? (
                    <SegmentLabel key={label.index} label={label} row={row} />
                ) : null
            )}
        </>
    );
}

function SegmentMark({
    part,
    x1,
    x2,
    y,
    fill
}: {
    part: Segment;
    x1: number;
    x2: number;
    y: number;
    fill: string;
}) {
    if (part.kind === 'wait') {
        return (
            <line
                x1={x1}
                x2={x2}
                y1={y}
                y2={y}
                stroke={fill}
                strokeWidth={14}
                strokeDasharray="10 22"
            />
        );
    }
    if (part.leg.mode === 'walking') {
        // Dots: on foot (or wheeling), the slowest way to cover ground.
        return (
            <line
                x1={x1}
                x2={x2}
                y1={y}
                y2={y}
                stroke={fill}
                strokeWidth={44}
                strokeLinecap="round"
                strokeDasharray="0 64"
            />
        );
    }
    return (
        <rect
            x={x1}
            y={y - 60}
            width={Math.max(0, x2 - x1)}
            height={120}
            rx={24}
            fill={fill}
            // A light edge keeps dark line colours (the Northern's black) visible on the wall.
            stroke="#ffffff"
            strokeOpacity={0.55}
            strokeWidth={6}
        />
    );
}

function SegmentLabel({ label, row }: { label: LabelPlacement; row: number }) {
    const { layout } = useWallStage();
    const pad = Math.round(layout.screenHeight * 0.06);
    return (
        <div
            className="absolute overflow-hidden text-white"
            style={{
                left: label.x,
                top: row * layout.screenHeight + pad,
                width: label.width,
                lineHeight: 1.15
            }}
        >
            <div className="truncate" style={{ fontSize: typeSize('h2', layout.screenHeight) }}>
                <strong>{label.title}</strong>{' '}
                <span className="text-white/80 tabular-nums">{label.minutes}′</span>
            </div>
            {label.detail ? (
                <div
                    className="truncate text-white/70"
                    style={{ fontSize: typeSize('detail', layout.screenHeight) }}
                >
                    {label.detail}
                </div>
            ) : null}
        </div>
    );
}

function Clock({
    letter,
    label,
    journey,
    row,
    now
}: {
    letter: string;
    label: string;
    journey: RaceJourney;
    row: number;
    now: number;
}) {
    const { layout } = useWallStage();
    const done = Math.min(now, journey.minutes);
    const arrived = now >= journey.minutes;
    // The clock travels with its traveller, one screen at a time; column 0 holds the title.
    const col = Math.min(
        layout.columns - 1,
        Math.max(1, Math.floor(minuteX(layout, done) / layout.screenWidth))
    );
    const parts = segments(journey);
    const current = parts[segmentAt(parts, done)];
    const doing =
        arrived || now === 0
            ? label
            : current.kind === 'wait'
              ? 'waiting'
              : legLabel(current.leg).toLowerCase();
    return (
        <ScreenText col={col} row={row} level="h1" align="left" className="tabular-nums">
            <span>
                {letter} · {arrived ? `arrived ${journey.minutes}′` : `${Math.floor(done)}′`}
            </span>
            <span
                className="block text-white/70"
                style={{ fontSize: typeSize('h2', layout.screenHeight) }}
            >
                {doing}
            </span>
        </ScreenText>
    );
}

/** Minute marks every column, at the top of the bottom row (inside each screen). */
function Ticks() {
    const { layout } = useWallStage();
    const pad = Math.round(layout.screenHeight * 0.06);
    const perColumn = WALL_MINUTES / layout.columns;
    return (
        <>
            {Array.from({ length: layout.columns - 1 }, (_, i) => i + 1).map((col) => (
                <div
                    key={col}
                    className="absolute text-white/50 tabular-nums"
                    style={{
                        left: col * layout.screenWidth + pad / 2,
                        top: (layout.rows - 1) * layout.screenHeight + pad / 2,
                        fontSize: typeSize('detail', layout.screenHeight)
                    }}
                >
                    {Math.round(col * perColumn)}′
                </div>
            ))}
        </>
    );
}

function Result({
    gap,
    stepFree,
    standardMinutes,
    visible
}: {
    gap: number;
    stepFree: RaceJourney;
    standardMinutes: number;
    visible: boolean;
}) {
    const { layout } = useWallStage();
    // To the right of A's finish, in the top row, so it reads next to A's arrival.
    const col = Math.min(
        layout.columns - 2,
        Math.floor(minuteX(layout, standardMinutes) / layout.screenWidth) + 2
    );
    const fade = { opacity: visible ? 1 : 0, transition: FADE };
    const buses = stepFree.legs.filter((leg) => leg.mode === 'bus').length;
    const walked = stepFree.legs
        .filter((leg) => leg.mode === 'walking')
        .reduce((sum, leg) => sum + leg.end - leg.start, 0);
    return (
        <>
            <ScreenText col={col} row={0} level="h1" align="right" className="tabular-nums">
                <span style={{ ...fade, color: '#86b6ef' }}>+{gap} min</span>
            </ScreenText>
            <ScreenText col={col + 1} row={0} level="h2" align="left">
                <span style={fade}>
                    for B, step-free:
                    <br />
                    {changes(stepFree)} {changes(stepFree) === 1 ? 'change' : 'changes'}
                    {buses ? `, ${buses} ${buses === 1 ? 'bus' : 'buses'}` : ''}, {walked}′ on foot
                </span>
            </ScreenText>
        </>
    );
}
