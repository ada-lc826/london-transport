// Journey Planner travel times for S3 (`public/data/journeys-s3.json`, built by
// `pipeline/.../journeys_export.py`): for each origin, minutes to each tube station by the
// fastest standard route and the fastest step-free route, departing together.

export type TimePair = [standard: number | null, stepFree: number | null];

export type JourneyTimes = {
    source: { date: string; time: string; attribution: string };
    origins: string[];
    // origin id -> destination id -> [standard, step-free]; null when the planner found no route.
    times: Record<string, Record<string, TimePair>>;
};

const URL_PATH = '/data/journeys-s3.json';
let request: Promise<JourneyTimes | null> | null = null;

export function loadJourneyTimes(): Promise<JourneyTimes | null> {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (!request) {
        request = fetch(URL_PATH, { headers: { accept: 'application/json' } })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload: unknown) => parseJourneyTimes(payload))
            .catch(() => null)
            .then((parsed) => {
                if (!parsed) request = null;
                return parsed;
            });
    }
    return request;
}

export function parseJourneyTimes(payload: unknown): JourneyTimes | null {
    if (!isRecord(payload) || !isRecord(payload.times) || !Array.isArray(payload.origins)) {
        return null;
    }
    const source = isRecord(payload.source) ? payload.source : {};
    const times: JourneyTimes['times'] = {};
    for (const [origin, destinations] of Object.entries(payload.times)) {
        if (!isRecord(destinations)) continue;
        const row: Record<string, TimePair> = {};
        for (const [destination, pair] of Object.entries(destinations)) {
            if (!Array.isArray(pair) || pair.length !== 2) continue;
            row[destination] = [minutes(pair[0]), minutes(pair[1])];
        }
        times[origin] = row;
    }
    return {
        source: {
            date: typeof source.date === 'string' ? source.date : '',
            time: typeof source.time === 'string' ? source.time : '',
            attribution: typeof source.attribution === 'string' ? source.attribution : ''
        },
        origins: payload.origins.filter((o): o is string => typeof o === 'string' && o in times),
        times
    };
}

export type OriginSummary = {
    // Destinations with both a standard and a step-free route.
    compared: number;
    medianExtraMinutes: number | null;
    // Share of compared destinations where the step-free route takes at least twice as long.
    shareAtLeastDouble: number | null;
    // Destinations reachable normally but with no step-free route at all.
    noStepFreeRoute: number;
    // Largest gaps, biggest first.
    biggestGaps: Array<{ destination: string; standard: number; stepFree: number }>;
};

export function summariseOrigin(row: Record<string, TimePair> | undefined, top = 4): OriginSummary {
    const extras: number[] = [];
    const gaps: OriginSummary['biggestGaps'] = [];
    let double = 0;
    let noStepFreeRoute = 0;
    for (const [destination, [standard, stepFree]] of Object.entries(row ?? {})) {
        if (standard === null) continue;
        if (stepFree === null) {
            noStepFreeRoute += 1;
            continue;
        }
        extras.push(stepFree - standard);
        if (stepFree >= 2 * standard) double += 1;
        gaps.push({ destination, standard, stepFree });
    }
    gaps.sort(
        (a, b) =>
            b.stepFree - b.standard - (a.stepFree - a.standard) ||
            a.destination.localeCompare(b.destination)
    );
    return {
        compared: extras.length,
        medianExtraMinutes: median(extras),
        shareAtLeastDouble: extras.length ? double / extras.length : null,
        noStepFreeRoute,
        biggestGaps: gaps.slice(0, top)
    };
}

// Travel-time bands for the maps: upper bounds in minutes, then "more than the last".
export const TIME_BANDS = [15, 30, 45, 60] as const;

/** Band index 0..TIME_BANDS.length, or null for no route. */
export function timeBand(value: number | null): number | null {
    if (value === null) return null;
    const index = TIME_BANDS.findIndex((limit) => value <= limit);
    return index === -1 ? TIME_BANDS.length : index;
}

export function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function minutes(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
