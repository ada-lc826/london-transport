import {
    loadJourneyTimes,
    summariseOrigin,
    TIME_BANDS,
    timeBand,
    type TimePair
} from '../data/journeys';
import { loadNetwork, type Network } from '../data/network';
import { projectToWall, type MapCamera } from '../wall/camera';
import { rectsIntersect, regionRect, zones, type WallRect } from '../wall/layout';
import { useWallStage } from '../wall/stage';
import { ScreenText } from '../wall/typography';
import type { SceneProps } from './registry';
import { networkCamera, useAsset } from './use-asset';

// S3 · Two Londons (plan §4.2, §4.4). The same city from the same starting point, twice: how
// long the fastest route to every tube station takes by TfL's Journey Planner, and how long
// when every step of the way must be step-free. Data: pipeline/journeys.py, one weekday
// departure, both scenarios asked together.
//
//   step 0  the standard map, and the step-free map still blank
//   step 1  the step-free map and the numbers
//
// Centre zone, side by side: standard (c5-c7) and step-free (c8-c10), same camera so a
// station sits at the same place in both. Colour is travel-time band (one blue ramp, brighter
// = sooner); "no step-free route" is a dashed ring, so it never depends on colour alone.

// Blue ramp, validated as an ordinal ramp on the wall surface (dataviz validate_palette.js).
const BAND_COLOURS = ['#cde2fb', '#86b6ef', '#3987e5', '#256abf', '#184f95'];
const NEUTRAL = '#9aa3ae';
const FADE = 'opacity 1.2s ease-in-out';

export function TwoLondonsScene({ scene }: SceneProps) {
    const network = useAsset(loadNetwork);
    const journeys = useAsset(loadJourneyTimes);
    const { layout } = useWallStage();
    if (!network) return null;
    const origin = scene.params.origin ?? '';
    const row = journeys?.times[origin];
    const reveal = scene.step >= 1;
    const centre = zones(layout).centre;
    const half = Math.floor(centre.colSpan / 2);
    const standardFrame = regionRect(layout, { ...centre, colSpan: half });
    const stepFreeFrame = regionRect(layout, {
        ...centre,
        col: centre.col + half,
        colSpan: centre.colSpan - half
    });
    // One camera for both maps, fitted to the smaller frame, so they line up.
    const camera = networkCamera(network, standardFrame, 200);
    const originName = network.stations.find((s) => s.id === origin)?.name ?? '';

    return (
        <>
            {camera ? (
                <>
                    <TimeMap
                        network={network}
                        frame={standardFrame}
                        camera={camera}
                        origin={origin}
                        times={row}
                        pick={(pair) => pair[0]}
                        visible
                    />
                    <TimeMap
                        network={network}
                        frame={stepFreeFrame}
                        camera={camera}
                        origin={origin}
                        times={row}
                        pick={(pair) => pair[1]}
                        visible={reveal}
                    />
                </>
            ) : null}
            <ScreenText col={centre.col + 1} row={0} level="h1">
                Standard
            </ScreenText>
            <ScreenText col={centre.col + half + 1} row={0} level="h1" className="text-[#86b6ef]">
                Step-free
            </ScreenText>
            <Headline row={row} originName={originName} reveal={reveal} hasData={!!journeys} />
            <Gaps network={network} row={row} reveal={reveal} />
            <Legend />
        </>
    );
}

function TimeMap({
    network,
    frame,
    camera,
    origin,
    times,
    pick,
    visible
}: {
    network: Network;
    frame: WallRect;
    camera: MapCamera;
    origin: string;
    times: Record<string, TimePair> | undefined;
    pick: (pair: TimePair) => number | null;
    visible: boolean;
}) {
    const { view } = useWallStage();
    if (!rectsIntersect(frame, view)) return null;
    // Both maps share a camera fitted to `frame`'s size, centred on `frame`.
    const project = (lngLat: [number, number]) => projectToWall(camera, frame, lngLat);
    return (
        <svg
            className="absolute"
            style={{ left: frame.x, top: frame.y }}
            width={frame.width}
            height={frame.height}
            viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        >
            {network.lines.map((line) => (
                <g key={line.id} opacity={0.18}>
                    {line.paths.map((path, i) => (
                        <polyline
                            key={i}
                            points={path.map((p) => project(p).join(',')).join(' ')}
                            fill="none"
                            stroke="#c9ced6"
                            strokeWidth={8}
                            strokeLinejoin="round"
                        />
                    ))}
                </g>
            ))}
            <g style={{ opacity: visible ? 1 : 0, transition: FADE }}>
                {network.stations.map((station) => {
                    const [x, y] = project([station.lon, station.lat]);
                    if (station.id === origin) return null;
                    const pair = times?.[station.id];
                    const band = pair ? timeBand(pick(pair)) : null;
                    if (!pair || (band === null && pair[0] === null)) {
                        // Not sampled, or no route either way: a faint dot, not a claim.
                        return (
                            <circle
                                key={station.id}
                                cx={x}
                                cy={y}
                                r={8}
                                fill={NEUTRAL}
                                opacity={0.4}
                            />
                        );
                    }
                    if (band === null) {
                        return (
                            <circle
                                key={station.id}
                                cx={x}
                                cy={y}
                                r={20}
                                fill="none"
                                stroke={NEUTRAL}
                                strokeWidth={6}
                                strokeDasharray="6 6"
                            />
                        );
                    }
                    return (
                        <circle
                            key={station.id}
                            cx={x}
                            cy={y}
                            r={24}
                            fill={BAND_COLOURS[band]}
                            stroke="#0a0e14"
                            strokeWidth={4}
                        />
                    );
                })}
            </g>
            <OriginMarker network={network} origin={origin} project={project} />
        </svg>
    );
}

function OriginMarker({
    network,
    origin,
    project
}: {
    network: Network;
    origin: string;
    project: (lngLat: [number, number]) => [number, number];
}) {
    const station = network.stations.find((s) => s.id === origin);
    if (!station) return null;
    const [x, y] = project([station.lon, station.lat]);
    return (
        <g>
            <circle cx={x} cy={y} r={44} fill="#ffffff" />
            <circle cx={x} cy={y} r={80} fill="none" stroke="#ffffff" strokeWidth={8} />
        </g>
    );
}

function Headline({
    row,
    originName,
    reveal,
    hasData
}: {
    row: Record<string, TimePair> | undefined;
    originName: string;
    reveal: boolean;
    hasData: boolean;
}) {
    const { layout } = useWallStage();
    const left = zones(layout).left;
    const summary = summariseOrigin(row);
    const fade = { opacity: reveal ? 1 : 0, transition: FADE };
    const extra = summary.medianExtraMinutes;
    return (
        <>
            <ScreenText
                col={left.col + 1}
                row={0}
                level="h2"
                align="right"
                className="text-white/70"
            >
                From
            </ScreenText>
            <ScreenText col={left.col + 2} row={0} level="h2" align="left">
                <strong>{originName}</strong>
            </ScreenText>
            {!hasData ? (
                <ScreenText
                    col={left.col + 2}
                    row={1}
                    level="h2"
                    align="left"
                    className="text-white/60"
                >
                    Journey data not loaded
                </ScreenText>
            ) : null}
            <ScreenText
                col={left.col + 1}
                row={1}
                level="display"
                align="right"
                className="tabular-nums"
            >
                <span style={{ ...fade, color: '#86b6ef' }}>
                    {extra === null ? '–' : `+${Math.round(extra)}`}
                </span>
            </ScreenText>
            <ScreenText col={left.col + 2} row={1} level="h2" align="left">
                <span style={fade}>
                    minutes, the median extra
                    <br />
                    time for a step-free trip
                </span>
            </ScreenText>
            <ScreenText
                col={left.col + 1}
                row={2}
                level="h1"
                align="right"
                className="tabular-nums"
            >
                <span style={fade}>
                    {summary.shareAtLeastDouble === null
                        ? '–'
                        : `${Math.round(summary.shareAtLeastDouble * 100)}%`}
                </span>
            </ScreenText>
            <ScreenText col={left.col + 2} row={2} level="h2" align="left">
                <span style={fade}>
                    of trips take at least
                    <br />
                    twice as long
                </span>
            </ScreenText>
            <ScreenText col={left.col + 3} row={2} level="h2" align="left" className="tabular-nums">
                <span style={fade}>
                    {summary.noStepFreeRoute} stations
                    <br />
                    with no step-free route
                </span>
            </ScreenText>
        </>
    );
}

function Gaps({
    network,
    row,
    reveal
}: {
    network: Network;
    row: Record<string, TimePair> | undefined;
    reveal: boolean;
}) {
    const { layout } = useWallStage();
    const right = zones(layout).right;
    const names = new Map(network.stations.map((s) => [s.id, s.name]));
    const gaps = summariseOrigin(row).biggestGaps;
    const fade = { opacity: reveal ? 1 : 0, transition: FADE };
    // Four biggest gaps, one per screen in the eye-height band.
    const cells = [
        { col: right.col + 1, row: 1 },
        { col: right.col + 2, row: 1 },
        { col: right.col + 1, row: 2 },
        { col: right.col + 2, row: 2 }
    ];
    return (
        <>
            <ScreenText
                col={right.col + 1}
                row={0}
                level="h2"
                align="left"
                className="text-white/70"
            >
                <span style={fade}>Biggest gaps from here</span>
            </ScreenText>
            {gaps.map((gap, i) => (
                <ScreenText key={gap.destination} {...cells[i]} level="h2" align="left">
                    <span style={fade}>
                        {names.get(gap.destination) ?? gap.destination}
                        <br />
                        <span className="tabular-nums">
                            {gap.standard} →{' '}
                            <span className="text-[#86b6ef]">{gap.stepFree} min</span>
                        </span>
                    </span>
                </ScreenText>
            ))}
        </>
    );
}

function Legend() {
    const { layout } = useWallStage();
    const left = zones(layout).left;
    const labels = TIME_BANDS.map((limit, i) => (i === 0 ? `≤ ${limit} min` : `≤ ${limit}`));
    labels.push(`> ${TIME_BANDS[TIME_BANDS.length - 1]}`);
    return (
        <>
            {labels.map((label, i) => (
                <ScreenText key={label} col={left.col + i} row={3} level="h2" align="left">
                    <span className="flex items-center gap-8">
                        <svg width={110} height={110} viewBox="0 0 110 110" className="shrink-0">
                            <circle cx={55} cy={55} r={44} fill={BAND_COLOURS[i]} />
                        </svg>
                        {label}
                    </span>
                </ScreenText>
            ))}
            <ScreenText col={left.col + 4} row={2} level="h2" align="left">
                <span className="flex items-center gap-8">
                    <svg width={110} height={110} viewBox="0 0 110 110" className="shrink-0">
                        <circle
                            cx={55}
                            cy={55}
                            r={38}
                            fill="none"
                            stroke={NEUTRAL}
                            strokeWidth={10}
                            strokeDasharray="10 10"
                        />
                    </svg>
                    No step-free route
                </span>
            </ScreenText>
        </>
    );
}
