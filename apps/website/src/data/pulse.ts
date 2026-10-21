import { withBase } from '../lib/base-path';

// S1's day of demand (`public/data/pulse.json`, built by `pipeline/.../pulse_export.py` from
// TfL's NUMBAT): a typical autumn weekday in 96 quarter-hours from 05:00.

export type PulseLine = { name: string; id: string; colour: string; boarders: number[] };
export type PulseLink = { line: string; a: string; b: string; load: number[] };

export type Pulse = {
    source: { description: string; attribution: string };
    // "0500-0515", ... "0445-0500"
    times: string[];
    lines: PulseLine[];
    links: PulseLink[];
    network: { entries: number[]; exits: number[]; onNetwork: number[] };
    // Tube station entries per quarter-hour, by the station's step-free status.
    stepFree: Record<string, number[]>;
    // Entries per quarter-hour at each tube station (network.json id).
    stations: Record<string, number[]>;
};

export const QUARTERS = 96;

const URL_PATH = withBase('/data/pulse.json');
let request: Promise<Pulse | null> | null = null;

export function loadPulse(): Promise<Pulse | null> {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (!request) {
        request = fetch(URL_PATH, { headers: { accept: 'application/json' } })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload: unknown) => parsePulse(payload))
            .catch(() => null)
            .then((parsed) => {
                if (!parsed) request = null;
                return parsed;
            });
    }
    return request;
}

function series(value: unknown): number[] | null {
    return Array.isArray(value) &&
        value.length === QUARTERS &&
        value.every((v) => typeof v === 'number' && Number.isFinite(v))
        ? (value as number[])
        : null;
}

export function parsePulse(payload: unknown): Pulse | null {
    if (!isRecord(payload) || !Array.isArray(payload.times) || !isRecord(payload.network)) {
        return null;
    }
    const network = payload.network;
    const entries = series(network.entries);
    const exits = series(network.exits);
    const onNetwork = series(network.onNetwork);
    if (!entries || !exits || !onNetwork || payload.times.length !== QUARTERS) return null;
    const lines: PulseLine[] = [];
    for (const line of Array.isArray(payload.lines) ? payload.lines : []) {
        const boarders = isRecord(line) ? series(line.boarders) : null;
        if (!isRecord(line) || !boarders) continue;
        lines.push({
            name: String(line.name),
            id: String(line.id),
            colour: String(line.colour),
            boarders
        });
    }
    const links: PulseLink[] = [];
    for (const link of Array.isArray(payload.links) ? payload.links : []) {
        const load = isRecord(link) ? series(link.load) : null;
        if (!isRecord(link) || !load) continue;
        links.push({ line: String(link.line), a: String(link.a), b: String(link.b), load });
    }
    const stepFree: Record<string, number[]> = {};
    for (const [status, values] of Object.entries(
        isRecord(payload.stepFree) ? payload.stepFree : {}
    )) {
        const parsed = series(values);
        if (parsed) stepFree[status] = parsed;
    }
    const stations: Record<string, number[]> = {};
    for (const [id, values] of Object.entries(isRecord(payload.stations) ? payload.stations : {})) {
        const parsed = series(values);
        if (parsed) stations[id] = parsed;
    }
    const source = isRecord(payload.source) ? payload.source : {};
    return {
        source: {
            description: typeof source.description === 'string' ? source.description : '',
            attribution: typeof source.attribution === 'string' ? source.attribution : ''
        },
        times: payload.times.map(String),
        lines,
        links,
        network: { entries, exits, onNetwork },
        stepFree,
        stations
    };
}

/** "0830-0845" -> "08:30". */
export function clockLabel(time: string): string {
    return `${time.slice(0, 2)}:${time.slice(2, 4)}`;
}

/** The quarter-hour a position in the day falls in, and how far into it (0..1). */
export function quarterAt(dayFraction: number): { quarter: number; within: number } {
    const position = (((dayFraction % 1) + 1) % 1) * QUARTERS;
    const quarter = Math.min(QUARTERS - 1, Math.floor(position));
    return { quarter, within: position - quarter };
}

/** A series' value between quarter-hours, for smooth motion. */
export function valueAt(values: number[], quarter: number, within: number): number {
    const next = values[Math.min(QUARTERS - 1, quarter + 1)];
    return values[quarter] + (next - values[quarter]) * within;
}

/** The `n` busiest links in a quarter-hour, busiest first. */
export function busiestLinks(links: PulseLink[], quarter: number, n = 5): PulseLink[] {
    return [...links].sort((x, y) => y.load[quarter] - x.load[quarter]).slice(0, n);
}

/** Share of the day's tube station entries made at stations with no step-free platform. */
export function shareWithoutStepFree(stepFree: Record<string, number[]>): number | null {
    const sum = (values: number[] | undefined) => (values ?? []).reduce((a, b) => a + b, 0);
    const total = Object.values(stepFree).reduce((a, values) => a + sum(values), 0);
    return total ? sum(stepFree.none) / total : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
