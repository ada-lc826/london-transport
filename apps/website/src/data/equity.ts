import { withBase } from '../lib/base-path';

// S4's neighbourhood penalties (`public/data/equity.json`, built by `pipeline/.../equity.py`):
// for every London MSOA within reach of the tube, how much longer its residents' tube journeys
// take step-free (network model v1), joined to Census 2021 disability and age and IoD 2025.

export type Metric = 'extra' | 'gap';

export type EquityArea = {
    code: string;
    name: string;
    borough: string;
    lon: number;
    lat: number;
    residents: number;
    disabledShare: number;
    over65Share: number;
    imd: number;
    // Weighted mean extra minutes, step-free over standard, censored at params.capMinutes.
    extra: number;
    // Share of what the tube reaches within params.tauMinutes that step-free access loses.
    gap: number;
    // [penalty tertile, disability-share tertile], each 0-2.
    biv: [number, number];
    // LISA cluster of `extra` after FDR: 'HH', 'LL', 'HL', 'LH' or ''.
    lisa: string;
};

export type EquityRecord = {
    source: { attribution: string };
    params: { reachKm: number; capMinutes: number; tauMinutes: number };
    coverage: {
        areas: number;
        inReach: number;
        residentsInReach: number;
        residentsOutOfReach: number;
        disabledOutOfReach: number;
    };
    headline: {
        disabled: number;
        notDisabled: number;
        everyone: number;
        disabledGap: number;
        notDisabledGap: number;
        disabledInReach: number;
        disabledLosingHalf: number;
    };
    byImdQuintile: { quintile: number; extra: number; disabledShare: number }[];
    spearman: { disabledShare: number; over65Share: number; imd: number; centreKm: number };
    moran: { i: number; p: number };
    hotspots: { residents: number; disabled: number; boroughs: string[] };
    doubleDisadvantage: { areas: number; residents: number; disabled: number };
    boroughs: { name: string; areas: number; extra: number; disabledShare: number }[];
    areas: EquityArea[];
    outOfReach: { code: string; lon: number; lat: number }[];
};

const URL_PATH = withBase('/data/equity.json');
let request: Promise<EquityRecord | null> | null = null;

export function loadEquity(): Promise<EquityRecord | null> {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (!request) {
        request = fetch(URL_PATH, { headers: { accept: 'application/json' } })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload: unknown) => parseEquity(payload))
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

function isNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function text(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function parseArea(a: unknown): EquityArea | null {
    if (!isRecord(a)) return null;
    const numbers = ['lon', 'lat', 'residents', 'disabledShare', 'over65Share', 'imd', 'extra'];
    if (!numbers.every((k) => isNumber(a[k]))) return null;
    const biv = Array.isArray(a.biv) && a.biv.length === 2 && a.biv.every(isNumber) ? a.biv : null;
    if (!biv) return null;
    return {
        code: text(a.code),
        name: text(a.name),
        borough: text(a.borough),
        lon: a.lon as number,
        lat: a.lat as number,
        residents: a.residents as number,
        disabledShare: a.disabledShare as number,
        over65Share: a.over65Share as number,
        imd: a.imd as number,
        extra: a.extra as number,
        // A neighbourhood with nothing within TAU either way has no gap: count it as none lost.
        gap: isNumber(a.gap) ? a.gap : 0,
        biv: [biv[0] as number, biv[1] as number],
        lisa: text(a.lisa)
    };
}

/** The record, or null if it is not the shape the scene needs. Malformed areas are dropped. */
export function parseEquity(payload: unknown): EquityRecord | null {
    if (!isRecord(payload) || !Array.isArray(payload.areas)) return null;
    const { headline, coverage, spearman, hotspots, doubleDisadvantage, params, moran } = payload;
    if (
        !isRecord(headline) ||
        !isRecord(coverage) ||
        !isRecord(spearman) ||
        !isRecord(hotspots) ||
        !isRecord(doubleDisadvantage) ||
        !isRecord(params) ||
        !isRecord(moran) ||
        !isNumber(headline.disabled) ||
        !isNumber(headline.notDisabled)
    ) {
        return null;
    }
    const areas = payload.areas.map(parseArea).filter((a): a is EquityArea => a !== null);
    if (!areas.length) return null;
    const outOfReach = (Array.isArray(payload.outOfReach) ? payload.outOfReach : []).filter(
        (a): a is { code: string; lon: number; lat: number } =>
            isRecord(a) && isNumber(a.lon) && isNumber(a.lat)
    );
    const boroughs = (Array.isArray(payload.boroughs) ? payload.boroughs : []).filter(
        (b): b is EquityRecord['boroughs'][number] =>
            isRecord(b) && typeof b.name === 'string' && isNumber(b.extra)
    );
    const byImdQuintile = (
        Array.isArray(payload.byImdQuintile) ? payload.byImdQuintile : []
    ).filter(
        (q): q is EquityRecord['byImdQuintile'][number] =>
            isRecord(q) && isNumber(q.quintile) && isNumber(q.extra)
    );
    const source = isRecord(payload.source) ? payload.source : {};
    return {
        source: { attribution: text(source.attribution) },
        params: params as EquityRecord['params'],
        coverage: coverage as EquityRecord['coverage'],
        headline: headline as EquityRecord['headline'],
        byImdQuintile,
        spearman: spearman as EquityRecord['spearman'],
        moran: moran as EquityRecord['moran'],
        hotspots: {
            residents: isNumber(hotspots.residents) ? hotspots.residents : 0,
            disabled: isNumber(hotspots.disabled) ? hotspots.disabled : 0,
            boroughs: Array.isArray(hotspots.boroughs) ? hotspots.boroughs.map(text) : []
        },
        doubleDisadvantage: doubleDisadvantage as EquityRecord['doubleDisadvantage'],
        boroughs,
        areas,
        outOfReach
    };
}

// Class breaks for the map, upper bounds of the first four of five classes.
export const METRIC_BREAKS: Record<Metric, number[]> = {
    extra: [12, 15, 20, 30],
    gap: [0.4, 0.55, 0.7, 0.85]
};

export function metricClass(metric: Metric, value: number): number {
    const breaks = METRIC_BREAKS[metric];
    const i = breaks.findIndex((limit) => value <= limit);
    return i === -1 ? breaks.length : i;
}

export function metricLabels(metric: Metric): string[] {
    const breaks = METRIC_BREAKS[metric];
    const show = (v: number) => (metric === 'extra' ? `${v} min` : `${Math.round(v * 100)}%`);
    return [
        `≤ ${show(breaks[0])}`,
        ...breaks.slice(1).map((v) => `≤ ${show(v)}`),
        `> ${show(breaks[breaks.length - 1])}`
    ];
}

/** Round to thousands for the wall: 554,083 -> "554,000". */
export function roughCount(n: number): string {
    return (Math.round(n / 1000) * 1000).toLocaleString('en-GB');
}
