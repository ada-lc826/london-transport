import { withBase } from '../lib/base-path';

// How long lift outages last (`public/data/lift-survival.json`, built by
// `pipeline/.../lift_survival.py` from our lift log): Kaplan-Meier survival overall and by
// group, a Cox model, and Tube Alerter's figures for comparison. Rebuilt with the log.

export type SurvivalGroup = {
    n: number;
    events: number;
    medianHours: number | null;
    stillOut: { '24h': number; '72h': number; '168h': number };
    // Share of outages still under way after 0, 1, 2, ... hours.
    curve: number[];
};

export type GroupName =
    | 'all'
    | 'singleLift'
    | 'multiLift'
    | 'cutsAccess'
    | 'otherLifts'
    | 'underground'
    | 'otherModes';

export type LiftSurvival = {
    from: string;
    to: string;
    outages: { used: number; ended: number; ongoing: number; lifts: number; stations: number };
    km: Record<GroupName, SurvivalGroup>;
    cox: Record<
        'singleLift' | 'cutsAccess' | 'underground',
        { hazardRatio: number; ci95: [number, number]; p: number }
    >;
    tubeAlerter: { medianHours: number; meanHours: number };
};

const GROUPS: GroupName[] = [
    'all',
    'singleLift',
    'multiLift',
    'cutsAccess',
    'otherLifts',
    'underground',
    'otherModes'
];

const URL_PATH = withBase('/data/lift-survival.json');
let request: Promise<LiftSurvival | null> | null = null;

export function loadLiftSurvival(): Promise<LiftSurvival | null> {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (!request) {
        request = fetch(URL_PATH, { headers: { accept: 'application/json' } })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload: unknown) => parseLiftSurvival(payload))
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

function isGroup(value: unknown): value is SurvivalGroup {
    if (!isRecord(value) || typeof value.n !== 'number' || !isRecord(value.stillOut)) return false;
    const curve = value.curve;
    return (
        Array.isArray(curve) &&
        curve.length > 1 &&
        curve.every((v) => typeof v === 'number' && v >= 0 && v <= 1) &&
        (value.medianHours === null || typeof value.medianHours === 'number')
    );
}

/** The analysis, or null if any group the scene draws is missing or malformed. */
export function parseLiftSurvival(payload: unknown): LiftSurvival | null {
    if (!isRecord(payload) || !isRecord(payload.km) || !isRecord(payload.cox)) return null;
    const km = payload.km;
    if (!GROUPS.every((g) => isGroup(km[g]))) return null;
    if (!isRecord(payload.outages) || !isRecord(payload.tubeAlerter)) return null;
    return payload as unknown as LiftSurvival;
}

/** "6 h", "1.8 h", "3 days": a duration in hours for the wall. */
export function formatHours(hours: number | null): string {
    if (hours === null) return '–';
    if (hours >= 48) return `${Math.round(hours / 24)} days`;
    return `${hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours)} h`;
}
