import { withBase } from '../lib/base-path';

// S7's precomputed upgrade plans (`public/data/upgrades.json`, built by
// `pipeline/.../upgrades.py`): for three ways of weighting London's neighbourhoods, the k
// stations whose upgrade to full step-free access most lowers S4's penalty, k = 1..20, and
// TfL's own list evaluated the same way. Nothing is computed on the wall: the tablet only
// picks which precomputed plan to show (plan §5.7).

export type Strategy = 'people' | 'deprivation' | 'disability';

export type Outcome = {
    // Minutes off the step-free penalty of the average resident, disabled resident, and
    // resident of London's most deprived fifth of neighbourhoods.
    savedEveryone: number;
    savedDisabled: number;
    savedDeprived: number;
    // Residents (and disabled residents) whose penalty falls by params.helpedMinutes or more.
    helped: number;
    helpedDisabled: number;
};

export type Pick = Outcome & { station: string; name: string };

export type SweepRow = Outcome & { stations: string[]; alpha?: number; beta?: number };

export type UpgradePlans = {
    source: { attribution: string };
    params: { kMax: number; helpedMinutes: number; shownK: number[] };
    now: { everyone: number; disabled: number };
    candidates: number;
    // Cumulative: strategies[s][k - 1] is the outcome of the first k picks.
    strategies: Record<Strategy, Pick[]>;
    tfl: Pick[];
    tflWithSouthKensington: Outcome;
    sweeps: { disability: SweepRow[]; deprivation: SweepRow[] };
    areas: { code: string; lon: number; lat: number }[];
    // areaSaved[strategy][k][i]: minutes saved for areas[i] after the first k picks.
    areaSaved: Record<Strategy, Record<string, number[]>>;
    stations: Record<string, { name: string; lon: number; lat: number; stepFree: string | null }>;
};

export const STRATEGIES: Strategy[] = ['people', 'deprivation', 'disability'];

const URL_PATH = withBase('/data/upgrades.json');
let request: Promise<UpgradePlans | null> | null = null;

export function loadUpgradePlans(): Promise<UpgradePlans | null> {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (!request) {
        request = fetch(URL_PATH, { headers: { accept: 'application/json' } })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload: unknown) => parseUpgradePlans(payload))
            .catch(() => null)
            .then((parsed) => {
                if (!parsed) request = null;
                return parsed;
            });
    }
    return request;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const OUTCOME_KEYS = [
    'savedEveryone',
    'savedDisabled',
    'savedDeprived',
    'helped',
    'helpedDisabled'
] as const;

function isOutcome(value: unknown): value is Outcome {
    return (
        isRecord(value) &&
        OUTCOME_KEYS.every((k) => typeof value[k] === 'number' && Number.isFinite(value[k]))
    );
}

function picks(value: unknown): Pick[] | null {
    if (!Array.isArray(value) || !value.length) return null;
    return value.every((p) => isOutcome(p) && typeof (p as Pick).station === 'string')
        ? (value as Pick[])
        : null;
}

/** The plans, or null if any part the scene relies on is missing or malformed. */
export function parseUpgradePlans(payload: unknown): UpgradePlans | null {
    if (!isRecord(payload) || !isRecord(payload.strategies) || !isRecord(payload.areaSaved)) {
        return null;
    }
    const strategies = {} as Record<Strategy, Pick[]>;
    for (const s of STRATEGIES) {
        const list = picks(payload.strategies[s]);
        if (!list) return null;
        strategies[s] = list;
    }
    const tfl = picks(payload.tfl);
    const areas = Array.isArray(payload.areas) ? payload.areas : null;
    const sweeps = isRecord(payload.sweeps) ? payload.sweeps : null;
    if (!tfl || !areas || !sweeps || !isOutcome(payload.tflWithSouthKensington)) return null;
    // Every map series must have one value per area, or the map would misplace them.
    for (const s of STRATEGIES) {
        const series = payload.areaSaved[s];
        if (!isRecord(series)) return null;
        for (const values of Object.values(series)) {
            if (!Array.isArray(values) || values.length !== areas.length) return null;
        }
    }
    const rows = (value: unknown) =>
        Array.isArray(value) ? value.filter((r): r is SweepRow => isOutcome(r)) : [];
    return {
        source: { attribution: isRecord(payload.source) ? String(payload.source.attribution) : '' },
        params: payload.params as UpgradePlans['params'],
        now: payload.now as UpgradePlans['now'],
        candidates: Number(payload.candidates),
        strategies,
        tfl,
        tflWithSouthKensington: payload.tflWithSouthKensington,
        sweeps: { disability: rows(sweeps.disability), deprivation: rows(sweeps.deprivation) },
        areas: areas as UpgradePlans['areas'],
        areaSaved: payload.areaSaved as UpgradePlans['areaSaved'],
        stations: isRecord(payload.stations) ? (payload.stations as UpgradePlans['stations']) : {}
    };
}

/** The outcome of a strategy's first k picks (k clamped to what was computed). */
export function outcomeAt(plans: UpgradePlans, strategy: Strategy, k: number): Pick {
    const list = plans.strategies[strategy];
    return list[Math.max(1, Math.min(k, list.length)) - 1];
}

/** How many of TfL's list the strategy's first k picks share. */
export function overlapWithTfl(plans: UpgradePlans, strategy: Strategy, k: number): string[] {
    const ours = new Set(plans.strategies[strategy].slice(0, k).map((p) => p.station));
    return plans.tfl.filter((p) => ours.has(p.station)).map((p) => p.name);
}
