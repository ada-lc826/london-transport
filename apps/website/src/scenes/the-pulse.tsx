import { Fragment } from 'react';

import { loadNetwork, type Network } from '../data/network';
import {
    busiestLinks,
    clockLabel,
    loadPulse,
    QUARTERS,
    quarterAt,
    shareWithoutStepFree,
    valueAt,
    type Pulse
} from '../data/pulse';
import { projectToWall, type MapCamera } from '../wall/camera';
import { rectsIntersect, regionRect, wallSize, zones, type WallRect } from '../wall/layout';
import { useWallStage } from '../wall/stage';
import { ScreenText, typeSize } from '../wall/typography';
import type { SceneProps } from './registry';
import { networkCamera, useAsset } from './use-asset';
import { useTimelineMs } from './use-timeline';

// S1 · The Pulse (plan §4.2, §4.4). One typical autumn weekday on TfL's railways, from TfL's
// NUMBAT model (pipeline/pulse_export.py), played on the shared timeline: DAY_SECONDS for the
// whole day, looping.
//
//   step 0  the day: every link's load, every line's boarders, people on the network
//   step 1  who it is built for: stations with no step-free access, sized by entries, and
//           the share of journeys that start at one
//
// Top row: the day across the whole wall (each column 1.5 hours), a cursor at "now". Left
// zone: one tube line per screen. Centre: the map, line width by passengers. Right: the
// numbers.

export const DAY_SECONDS = 48;
const FADE = 'opacity 1.2s ease-in-out';
const NEUTRAL = '#9aa3ae';

export function ThePulseScene({ scene }: SceneProps) {
    const pulse = useAsset(loadPulse);
    const network = useAsset(loadNetwork);
    const ms = useTimelineMs(scene);
    const { layout } = useWallStage();
    if (!pulse || !network) return null;
    const { quarter, within } = quarterAt((ms ?? 0) / 1000 / DAY_SECONDS);
    const centre = zones(layout).centre;
    const mapFrame = regionRect(layout, { ...centre, row: 1, rowSpan: layout.rows - 1 });
    const camera = networkCamera(network, mapFrame, 120);
    const reveal = scene.step >= 1;
    const now = { quarter, within };

    return (
        <>
            <Skyline pulse={pulse} now={now} />
            {camera ? (
                <LoadMap
                    pulse={pulse}
                    network={network}
                    frame={mapFrame}
                    camera={camera}
                    now={now}
                    reveal={reveal}
                />
            ) : null}
            <LineCurves pulse={pulse} now={now} />
            <Numbers pulse={pulse} network={network} now={now} reveal={reveal} />
        </>
    );
}

type Now = { quarter: number; within: number };

function dayX(width: number, quarter: number) {
    return (quarter / QUARTERS) * width;
}

/** People on the network through the day, across the top row, with "now". */
function Skyline({ pulse, now }: { pulse: Pulse; now: Now }) {
    const { layout } = useWallStage();
    const { width } = wallSize(layout);
    const h = layout.screenHeight;
    const values = pulse.network.onNetwork;
    const peak = Math.max(...values);
    // Leaves room under the baseline for the hour marks, above the bezel.
    // High enough that the hour labels below it, at the wall's smallest type, stay on the screen.
    const base = h * 0.76;
    const y = (v: number) => base - (v / peak) * h * 0.55;
    const points = values.map((v, i) => `${dayX(width, i + 0.5)},${y(v)}`).join(' ');
    const cursor = dayX(width, now.quarter + now.within);
    const pad = Math.round(h * 0.06);
    const hoursPerColumn = 24 / layout.columns;
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
                    points={`0,${base} ${points} ${width},${base}`}
                    fill="#256abf"
                    opacity={0.55}
                />
                <polyline points={points} fill="none" stroke="#86b6ef" strokeWidth={8} />
                <line
                    x1={cursor}
                    x2={cursor}
                    y1={h * 0.3}
                    y2={base}
                    stroke="#ffffff"
                    strokeWidth={10}
                />
            </svg>
            {/* Hour marks, inside each screen. */}
            {Array.from({ length: layout.columns }, (_, col) => {
                const minutes = 5 * 60 + col * hoursPerColumn * 60;
                const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
                const mm = String(Math.round(minutes % 60)).padStart(2, '0');
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
                        {hh}:{mm}
                    </div>
                );
            })}
            <ScreenText col={0} row={0} level="h2" align="left" className="justify-start">
                <span>
                    <strong>London, one weekday</strong>
                    <br />
                    <span className="text-white/70">people on TfL's railways</span>
                </span>
            </ScreenText>
        </>
    );
}

/** Every tube link, as wide as the passengers on it now. */
function LoadMap({
    pulse,
    network,
    frame,
    camera,
    now,
    reveal
}: {
    pulse: Pulse;
    network: Network;
    frame: WallRect;
    camera: MapCamera;
    now: Now;
    reveal: boolean;
}) {
    const { view } = useWallStage();
    if (!rectsIntersect(frame, view)) return null;
    const where = new Map(network.stations.map((s) => [s.id, s]));
    const colours = new Map(pulse.lines.map((l) => [l.id, l.colour]));
    const project = (lon: number, lat: number) => projectToWall(camera, frame, [lon, lat]);
    // Width scale fixed over the whole day, so the map visibly swells at the peaks.
    const busiest = Math.max(...pulse.links.map((l) => Math.max(...l.load)));
    const busiestStation = Math.max(1, ...Object.values(pulse.stations).flat());
    return (
        <svg
            className="absolute"
            style={{ left: frame.x, top: frame.y }}
            width={frame.width}
            height={frame.height}
            viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        >
            {pulse.links.map((link) => {
                const a = where.get(link.a);
                const b = where.get(link.b);
                if (!a || !b) return null;
                const [x1, y1] = project(a.lon, a.lat);
                const [x2, y2] = project(b.lon, b.lat);
                const load = valueAt(link.load, now.quarter, now.within);
                const colour = colours.get(link.line) ?? NEUTRAL;
                return (
                    <line
                        key={`${link.line}${link.a}${link.b}`}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={colour === '#000000' ? '#c9ced6' : colour}
                        strokeWidth={4 + 70 * (load / busiest)}
                        strokeLinecap="round"
                        opacity={0.85}
                    />
                );
            })}
            <g style={{ opacity: reveal ? 1 : 0, transition: FADE }}>
                {network.stations
                    .filter((s) => s.stepFree === 'none')
                    .map((s) => {
                        const [x, y] = project(s.lon, s.lat);
                        const series = pulse.stations[s.id];
                        const value = series ? valueAt(series, now.quarter, now.within) : 0;
                        // Area, not radius, proportional to entries.
                        const r = 10 + 90 * Math.sqrt(value / busiestStation);
                        return (
                            <circle
                                key={s.id}
                                cx={x}
                                cy={y}
                                r={r}
                                fill="none"
                                stroke="#ffffff"
                                strokeWidth={6}
                            />
                        );
                    })}
            </g>
        </svg>
    );
}

/** One tube line per screen in the left zone: its boarders through the day. */
function LineCurves({ pulse, now }: { pulse: Pulse; now: Now }) {
    const { layout, view } = useWallStage();
    const left = zones(layout).left;
    const rows = Math.max(1, Math.min(2, layout.rows - 1));
    const cells = Array.from({ length: left.colSpan * rows }, (_, i) => ({
        col: left.col + (i % left.colSpan),
        row: 1 + Math.floor(i / left.colSpan)
    }));
    const peak = Math.max(...pulse.lines.flatMap((l) => l.boarders));
    return (
        <>
            {pulse.lines.slice(0, cells.length).map((line, i) => {
                const { col, row } = cells[i];
                const rect = regionRect(layout, { col, row, colSpan: 1, rowSpan: 1 });
                if (!rectsIntersect(rect, view)) return null;
                const pad = rect.height * 0.08;
                const top = rect.y + rect.height * 0.45;
                const bottom = rect.y + rect.height - pad;
                const x = (q: number) => rect.x + pad + (q / QUARTERS) * (rect.width - 2 * pad);
                const y = (v: number) => bottom - (v / peak) * (bottom - top);
                const points = line.boarders.map((v, q) => `${x(q + 0.5)},${y(v)}`).join(' ');
                const cursor = x(now.quarter + now.within);
                const colour = line.colour === '#000000' ? '#c9ced6' : line.colour;
                const value = valueAt(line.boarders, now.quarter, now.within);
                return (
                    <Fragment key={line.id}>
                        <svg
                            className="absolute"
                            style={{ left: rect.x, top: rect.y }}
                            width={rect.width}
                            height={rect.height}
                            viewBox={`${rect.x} ${rect.y} ${rect.width} ${rect.height}`}
                        >
                            <polygon
                                points={`${x(0)},${bottom} ${points} ${x(QUARTERS)},${bottom}`}
                                fill={colour}
                                opacity={0.6}
                            />
                            <line
                                x1={cursor}
                                x2={cursor}
                                y1={top - pad}
                                y2={bottom}
                                stroke="#ffffff"
                                strokeWidth={6}
                            />
                        </svg>
                        <ScreenText
                            col={col}
                            row={row}
                            level="h2"
                            align="left"
                            className="justify-start"
                        >
                            <span>
                                <strong>{line.name}</strong>
                                <br />
                                <span className="text-white/70 tabular-nums">
                                    {formatCount(value)} boarding
                                </span>
                            </span>
                        </ScreenText>
                    </Fragment>
                );
            })}
        </>
    );
}

function Numbers({
    pulse,
    network,
    now,
    reveal
}: {
    pulse: Pulse;
    network: Network;
    now: Now;
    reveal: boolean;
}) {
    const { layout } = useWallStage();
    if (layout.rows < 4) return null;
    const right = zones(layout).right;
    const names = new Map(network.stations.map((s) => [s.id, s.name]));
    const lineNames = new Map(pulse.lines.map((l) => [l.id, l.name]));
    const onNetwork = valueAt(pulse.network.onNetwork, now.quarter, now.within);
    const busiest = busiestLinks(pulse.links, now.quarter, Math.min(right.colSpan, 5));
    const share = shareWithoutStepFree(pulse.stepFree);
    const fade = { opacity: reveal ? 1 : 0, transition: FADE };
    return (
        <>
            <ScreenText col={right.col} row={1} level="h1" align="right" className="tabular-nums">
                {clockLabel(pulse.times[now.quarter])}
            </ScreenText>
            <ScreenText
                col={right.col + 1}
                row={1}
                level="h1"
                align="right"
                className="tabular-nums"
            >
                <span style={{ color: '#86b6ef' }}>{formatCount(onNetwork)}</span>
            </ScreenText>
            <ScreenText col={right.col + 2} row={1} level="h2" align="left">
                people on the tube,
                <br />
                Overground, DLR and
                <br />
                Elizabeth line now
            </ScreenText>
            {busiest.map((link, i) => (
                <ScreenText
                    key={`${link.line}${link.a}${link.b}`}
                    col={right.col + i}
                    row={2}
                    level="h2"
                    align="left"
                >
                    <span>
                        <span className="text-white/60">#{i + 1} </span>
                        <strong>{lineNames.get(link.line)}</strong>
                        <br />
                        {names.get(link.a)} – {names.get(link.b)}
                        <br />
                        <span className="text-white/70 tabular-nums">
                            {formatCount(link.load[now.quarter])} in 15 min
                        </span>
                    </span>
                </ScreenText>
            ))}
            <ScreenText col={right.col} row={3} level="h1" align="right" className="tabular-nums">
                <span style={fade}>{share === null ? '–' : `${Math.round(share * 100)}%`}</span>
            </ScreenText>
            <ScreenText col={right.col + 1} row={3} level="h2" align="left">
                <span style={fade}>
                    of tube journeys start at a
                    <br />
                    station with no step-free
                    <br />
                    way to the platform
                </span>
            </ScreenText>
            <ScreenText
                col={0}
                row={layout.rows - 1}
                level="h2"
                align="left"
                className="justify-end"
            >
                <span className="text-white/60">
                    {pulse.source.description}. {pulse.source.attribution}.
                </span>
            </ScreenText>
        </>
    );
}

function formatCount(value: number) {
    return Math.round(value).toLocaleString('en-GB');
}
