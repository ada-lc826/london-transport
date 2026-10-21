import { withBase } from '../lib/base-path';

// The tube network asset (`public/data/network.json`, built by `pipeline/.../network.py`):
// lines with geometry and station order, stations with street-to-platform step-free status.

export type StepFree = 'full' | 'partial' | 'none';

export type Station = {
    id: string;
    name: string;
    lon: number;
    lat: number;
    lines: string[];
    // null when the station's topology could not be read: shown as unknown, never guessed.
    stepFree: StepFree | null;
    stepFreePlatforms: [number, number] | null;
};

export type Line = {
    id: string;
    name: string;
    colour: string;
    paths: Array<Array<[number, number]>>;
    stations: string[];
};

export type Network = {
    source: { snapshot: string; attribution: string; stepFree: string };
    lines: Line[];
    stations: Station[];
};

const NETWORK_URL = withBase('/data/network.json');
const STEP_FREE_VALUES = new Set(['full', 'partial', 'none']);

let request: Promise<Network | null> | null = null;

/** Fetch once per page; screens share the result. Failed loads are retried on next call. */
export function loadNetwork(): Promise<Network | null> {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (!request) {
        request = fetch(NETWORK_URL, { headers: { accept: 'application/json' } })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload: unknown) => parseNetwork(payload))
            .catch(() => null)
            .then((network) => {
                if (!network) request = null;
                return network;
            });
    }
    return request;
}

/** Validate the asset's shape; anything malformed is dropped rather than drawn wrong. */
export function parseNetwork(payload: unknown): Network | null {
    if (!isRecord(payload) || !Array.isArray(payload.lines) || !Array.isArray(payload.stations)) {
        return null;
    }
    const source = isRecord(payload.source) ? payload.source : {};
    const stations: Station[] = [];
    for (const item of payload.stations) {
        if (!isRecord(item)) continue;
        const { id, name, lon, lat, lines, stepFree, stepFreePlatforms } = item;
        if (typeof id !== 'string' || typeof name !== 'string') continue;
        if (!isFiniteNumber(lon) || !isFiniteNumber(lat)) continue;
        stations.push({
            id,
            name,
            lon,
            lat,
            lines: Array.isArray(lines)
                ? lines.filter((l): l is string => typeof l === 'string')
                : [],
            stepFree:
                typeof stepFree === 'string' && STEP_FREE_VALUES.has(stepFree)
                    ? (stepFree as StepFree)
                    : null,
            stepFreePlatforms:
                Array.isArray(stepFreePlatforms) &&
                stepFreePlatforms.length === 2 &&
                stepFreePlatforms.every(isFiniteNumber)
                    ? [stepFreePlatforms[0], stepFreePlatforms[1]]
                    : null
        });
    }
    const lines: Line[] = [];
    for (const item of payload.lines) {
        if (!isRecord(item)) continue;
        const { id, name, colour, paths, stations: order } = item;
        if (typeof id !== 'string' || typeof name !== 'string' || typeof colour !== 'string') {
            continue;
        }
        lines.push({
            id,
            name,
            colour,
            paths: Array.isArray(paths) ? paths.filter(isPath) : [],
            stations: Array.isArray(order)
                ? order.filter((s): s is string => typeof s === 'string')
                : []
        });
    }
    return {
        source: {
            snapshot: typeof source.snapshot === 'string' ? source.snapshot : '',
            attribution: typeof source.attribution === 'string' ? source.attribution : '',
            stepFree: typeof source.stepFree === 'string' ? source.stepFree : ''
        },
        lines,
        stations
    };
}

export type StepFreeSummary = Record<StepFree | 'unknown', number> & { total: number };

export function summariseStepFree(stations: Station[]): StepFreeSummary {
    const summary: StepFreeSummary = { full: 0, partial: 0, none: 0, unknown: 0, total: 0 };
    for (const station of stations) {
        summary[station.stepFree ?? 'unknown'] += 1;
        summary.total += 1;
    }
    return summary;
}

export type Bounds = { west: number; south: number; east: number; north: number };

export function stationBounds(stations: Station[]): Bounds | null {
    if (stations.length === 0) return null;
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const { lon, lat } of stations) {
        west = Math.min(west, lon);
        east = Math.max(east, lon);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
    }
    return { west, south, east, north };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isPath(value: unknown): value is Array<[number, number]> {
    return (
        Array.isArray(value) &&
        value.every(
            (point) =>
                Array.isArray(point) &&
                point.length === 2 &&
                isFiniteNumber(point[0]) &&
                isFiniteNumber(point[1])
        )
    );
}
