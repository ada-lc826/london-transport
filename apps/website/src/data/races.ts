// S6's races (`public/data/races.json`, built by `pipeline/.../races_export.py`): for a few
// station pairs, the fastest standard and the fastest step-free Journey Planner journey, leg by
// leg, departing together.

export type RaceLeg = {
    // Journey Planner mode id: walking, tube, bus, overground, elizabeth-line, national-rail, …
    mode: string;
    // Line or route name ("Northern", "24", "Elizabeth line"); null for walking.
    line: string | null;
    // Minutes from the journey's departure.
    start: number;
    end: number;
    from: string;
    to: string;
    // Lifts the planner lists on the way, a hint of the step-free detour.
    lifts: number;
    path: Array<[lon: number, lat: number]>;
};

export type RaceJourney = { depart: string; minutes: number; legs: RaceLeg[] };

export type Race = {
    id: string;
    origin: string;
    destination: string;
    standard: RaceJourney | null;
    stepFree: RaceJourney | null;
};

export type Races = {
    source: { date: string; attribution: string };
    races: Race[];
};

const URL_PATH = '/data/races.json';
let request: Promise<Races | null> | null = null;

export function loadRaces(): Promise<Races | null> {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (!request) {
        request = fetch(URL_PATH, { headers: { accept: 'application/json' } })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload: unknown) => parseRaces(payload))
            .catch(() => null)
            .then((parsed) => {
                if (!parsed) request = null;
                return parsed;
            });
    }
    return request;
}

export function parseRaces(payload: unknown): Races | null {
    if (!isRecord(payload) || !Array.isArray(payload.races)) return null;
    const source = isRecord(payload.source) ? payload.source : {};
    const races: Race[] = [];
    for (const race of payload.races) {
        if (!isRecord(race) || typeof race.id !== 'string') continue;
        races.push({
            id: race.id,
            origin: typeof race.origin === 'string' ? race.origin : '',
            destination: typeof race.destination === 'string' ? race.destination : '',
            standard: parseJourney(race.standard),
            stepFree: parseJourney(race.stepFree)
        });
    }
    return {
        source: {
            date: typeof source.date === 'string' ? source.date : '',
            attribution: typeof source.attribution === 'string' ? source.attribution : ''
        },
        races
    };
}

function parseJourney(value: unknown): RaceJourney | null {
    if (!isRecord(value) || !Array.isArray(value.legs) || !isMinute(value.minutes)) return null;
    const legs: RaceLeg[] = [];
    for (const leg of value.legs) {
        if (!isRecord(leg) || !isMinute(leg.start) || !isMinute(leg.end)) return null;
        legs.push({
            mode: typeof leg.mode === 'string' ? leg.mode : 'unknown',
            line: typeof leg.line === 'string' && leg.line ? leg.line : null,
            start: leg.start,
            end: Math.max(leg.start, leg.end),
            from: typeof leg.from === 'string' ? leg.from : '',
            to: typeof leg.to === 'string' ? leg.to : '',
            lifts: isMinute(leg.lifts) ? leg.lifts : 0,
            path: Array.isArray(leg.path) ? leg.path.filter(isLonLat) : []
        });
    }
    return {
        depart: typeof value.depart === 'string' ? value.depart : '',
        minutes: value.minutes,
        legs
    };
}

// A journey as drawn: its legs, with the waits between them made explicit.
export type Segment =
    | { kind: 'leg'; start: number; end: number; leg: RaceLeg }
    | { kind: 'wait'; start: number; end: number };

export function segments(journey: RaceJourney): Segment[] {
    const result: Segment[] = [];
    let clock = 0;
    for (const leg of journey.legs) {
        if (leg.start > clock) result.push({ kind: 'wait', start: clock, end: leg.start });
        result.push({ kind: 'leg', start: leg.start, end: leg.end, leg });
        clock = Math.max(clock, leg.end);
    }
    if (journey.minutes > clock) result.push({ kind: 'wait', start: clock, end: journey.minutes });
    return result;
}

/** Changes of vehicle: every boarding after the first. */
export function changes(journey: RaceJourney): number {
    return Math.max(0, journey.legs.filter((leg) => leg.mode !== 'walking').length - 1);
}

/** What the traveller is doing at `minute` (clamped to the journey): the segment index. */
export function segmentAt(parts: Segment[], minute: number): number {
    const index = parts.findIndex((part) => minute < part.end);
    return index === -1 ? parts.length - 1 : index;
}

/** One-line label: "Northern line", "Bus 24", "Walk", "Elizabeth line", "Weaver line". */
export function legLabel(leg: RaceLeg): string {
    if (leg.mode === 'walking') return 'Walk';
    if (leg.mode === 'bus') return `Bus ${leg.line ?? ''}`.trim();
    // Tube and Overground lines are "the Northern line", "the Weaver line".
    if ((leg.mode === 'tube' || leg.mode === 'overground') && leg.line) return `${leg.line} line`;
    if (leg.mode === 'dlr') return 'DLR';
    return leg.line ?? leg.mode;
}

function isMinute(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isLonLat(value: unknown): value is [number, number] {
    return (
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === 'number' &&
        typeof value[1] === 'number'
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
