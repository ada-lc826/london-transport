import { withBase } from '../lib/base-path';

// S5's lift record (`public/data/lifts.json`, built by `pipeline/.../lift_outages.py` from the
// lift log): every 15-minute sample of TfL's lift disruption feed, and each tube station whose
// step-free access it cut, recomputed on TfL's station topology with those lifts removed.

export type Status = 'full' | 'partial' | 'none';

export type LiftStation = {
    id: string;
    name: string;
    paper: Status;
    // Status at each sample; equal to `paper` when not downgraded.
    status: Status[];
    message: string;
};

export type LiftOutage = {
    lift: string;
    first: number;
    last: number;
    // The spell runs past the start or end of the log: its length is a lower bound.
    fromStart: boolean;
    ongoing: boolean;
};

export type LiftRecord = {
    source: { from: string; to: string; samples: number; attribution: string };
    times: string[];
    paper: { full: number; partial: number };
    stations: LiftStation[];
    outages: LiftOutage[];
    downgraded: number[];
    fullDowngraded: number[];
    liftsOut: number[];
};

const URL_PATH = withBase('/data/lifts.json');
let request: Promise<LiftRecord | null> | null = null;

export function loadLiftRecord(): Promise<LiftRecord | null> {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (!request) {
        request = fetch(URL_PATH, { headers: { accept: 'application/json' } })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload: unknown) => parseLiftRecord(payload))
            .catch(() => null)
            .then((parsed) => {
                if (!parsed) request = null;
                return parsed;
            });
    }
    return request;
}

const STATUSES = new Set<string>(['full', 'partial', 'none']);

function counts(value: unknown, length: number): number[] | null {
    return Array.isArray(value) &&
        value.length === length &&
        value.every((v) => typeof v === 'number' && Number.isFinite(v))
        ? (value as number[])
        : null;
}

export function parseLiftRecord(payload: unknown): LiftRecord | null {
    if (!isRecord(payload) || !Array.isArray(payload.times) || !payload.times.length) return null;
    const times = payload.times.map(String);
    const n = times.length;
    const downgraded = counts(payload.downgraded, n);
    const fullDowngraded = counts(payload.fullDowngraded, n);
    const liftsOut = counts(payload.liftsOut, n);
    const paper = isRecord(payload.paper) ? payload.paper : {};
    if (!downgraded || !fullDowngraded || !liftsOut || typeof paper.full !== 'number') {
        return null;
    }
    const stations: LiftStation[] = [];
    for (const s of Array.isArray(payload.stations) ? payload.stations : []) {
        if (!isRecord(s) || !STATUSES.has(String(s.paper)) || !Array.isArray(s.status)) continue;
        if (s.status.length !== n || !s.status.every((v) => STATUSES.has(String(v)))) continue;
        stations.push({
            id: String(s.id),
            name: String(s.name),
            paper: s.paper as Status,
            status: s.status as Status[],
            message: typeof s.message === 'string' ? s.message : ''
        });
    }
    const outages: LiftOutage[] = [];
    for (const o of Array.isArray(payload.outages) ? payload.outages : []) {
        if (!isRecord(o) || typeof o.first !== 'number' || typeof o.last !== 'number') continue;
        outages.push({
            lift: String(o.lift),
            first: o.first,
            last: o.last,
            fromStart: o.fromStart === true,
            ongoing: o.ongoing === true
        });
    }
    const source = isRecord(payload.source) ? payload.source : {};
    return {
        source: {
            from: typeof source.from === 'string' ? source.from : times[0],
            to: typeof source.to === 'string' ? source.to : times[n - 1],
            samples: n,
            attribution: typeof source.attribution === 'string' ? source.attribution : ''
        },
        times,
        paper: { full: paper.full, partial: typeof paper.partial === 'number' ? paper.partial : 0 },
        stations,
        outages,
        downgraded,
        fullDowngraded,
        liftsOut
    };
}

const RANK: Record<Status, number> = { full: 2, partial: 1, none: 0 };

/** Stations downgraded at sample `i`, worst first. */
export function downgradedAt(record: LiftRecord, i: number): LiftStation[] {
    return record.stations
        .filter((s) => RANK[s.status[i]] < RANK[s.paper])
        .sort((a, b) => RANK[a.status[i]] - RANK[b.status[i]] || a.name.localeCompare(b.name));
}

/** Hours between two ISO timestamps. */
export function hoursBetween(from: string, to: string): number {
    return (Date.parse(to) - Date.parse(from)) / 3_600_000;
}

/** Median length in hours of lift outages seen to start and end within the log. */
export function medianOutageHours(record: LiftRecord): number | null {
    const hours = record.outages
        .filter((o) => !o.fromStart && !o.ongoing)
        .map((o) => hoursBetween(record.times[o.first], record.times[o.last]) + 0.25)
        .sort((a, b) => a - b);
    if (!hours.length) return null;
    const mid = Math.floor(hours.length / 2);
    return hours.length % 2 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2;
}

/** "Tue 21 Oct 18:00" in London time. */
export function londonTime(iso: string): string {
    return new Date(iso).toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
