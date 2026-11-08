"""How long TfL's lift outages last: survival analysis of our lift log (plan §5.6b).

The lift logger (lifts.py) records TfL's lift disruption feed every 15 minutes. Each lift's
time out of service is a run of consecutive samples that list it (an *outage*):

- **Gaps.** A lift missing from a single sample between two that list it is taken as one outage,
  not two: the feed occasionally drops a lift for one sample.
- **Duration.** An outage began between the last sample without it and the first with it, and
  ended between the last with it and the next without it. Its duration is the midpoint of the
  shortest and longest durations those bounds allow.
- **Censoring.** An outage still listed at the latest sample has not ended: it is *right
  censored* at its duration so far, which is what Kaplan-Meier and Cox models are for. One
  already listed at the first sample began before the log did, so its start is unknown; such
  outages are left out (keeping them would favour long outages, which are more likely to be
  under way at any moment).

For each outage:

- **single-lift station:** its station has one lift in TfL's `Lifts.csv`;
- **cuts access:** losing that lift alone makes a tube station's step-free status worse on
  TfL's topology (topology.read_topology(lifts_out=...));
- **mode:** the station is on the Underground or elsewhere (rail, Overground, DLR, Elizabeth).

Reported: Kaplan-Meier survival overall and by group, with the median and the chance an
outage is still under way after 1, 3 and 7 days; log-rank tests between groups; a Cox
proportional-hazards model of the three covariates (hazard ratios with 95% intervals, and the
proportional-hazards check); and the same figures from Tube Alerter's 2026 study for
comparison.

    uv run python -m mind_the_step.lift_survival --log <data-branch> \\
        --topology ../data/tfl-station-topology/2026-10-20 \\
        --network ../apps/website/public/data/network.json \\
        --out ../apps/website/public/data/lift-survival.json
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
from lifelines import CoxPHFitter, KaplanMeierFitter
from lifelines.statistics import logrank_test, proportional_hazard_test

from .lift_outages import RANK, lifts_out, read_samples
from .topology import read_topology, station_status

# One missing sample inside an outage is a feed glitch, not a repair.
MAX_GAP_SAMPLES = 1
HORIZONS_HOURS = (24, 72, 168)
CURVE_HOURS = 24 * 10
# Tube Alerter (2026): 567 lifts, 201 stations, 80 days.
TUBE_ALERTER = {"medianHours": 5.7, "meanHours": 30.8, "lifts": 567, "days": 80}


def hours(a: str, b: str) -> float:
    return (_parse(b) - _parse(a)).total_seconds() / 3600


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def outages(times: list[str], present: list[bool], max_gap: int = MAX_GAP_SAMPLES) -> list[dict]:
    """A lift's outages from whether each sample lists it: midpoint duration, whether it
    ended within the log (`observed`), and whether it was under way at the first sample."""
    runs: list[list[int]] = []
    for i, on in enumerate(present):
        if not on:
            continue
        if runs and i - runs[-1][1] - 1 <= max_gap:
            runs[-1][1] = i
        else:
            runs.append([i, i])
    n = len(times)
    result = []
    for first, last in runs:
        observed = last < n - 1
        shortest = hours(times[first], times[last])
        if observed:
            before = times[first - 1] if first > 0 else times[first]
            longest = hours(before, times[last + 1])
            duration = (shortest + longest) / 2
        else:
            # Still out: censored at the time it has been seen out so far.
            duration = shortest
        result.append(
            {
                "first": first,
                "last": last,
                "hours": max(duration, 0.25),
                "observed": observed,
                "leftTruncated": first == 0,
            }
        )
    return result


def lifts_by_station(lifts_csv: Path) -> dict[str, str]:
    """Lift id -> station id, from TfL's Lifts.csv."""
    with lifts_csv.open(encoding="utf-8-sig") as f:
        return {r["LiftUniqueId"]: r["StationUniqueId"] for r in csv.DictReader(f)}


def critical_lifts(topology_dir: Path, lifts: set[str]) -> set[str]:
    """Lifts whose loss alone makes some tube station's step-free status worse."""
    paper = station_status(read_topology(topology_dir).platforms)
    critical = set()
    for lift in sorted(lifts):
        now = station_status(read_topology(topology_dir, lifts_out=frozenset({lift})).platforms)
        if any(
            paper[k] in RANK and now.get(k) in RANK and RANK[now[k]] < RANK[paper[k]] for k in paper
        ):
            critical.add(lift)
    return critical


def km_summary(durations: pd.Series, observed: pd.Series) -> dict:
    if len(durations) == 0:
        # A group with no outages yet (possible early in a log): nothing to estimate.
        return {"n": 0, "events": 0, "medianHours": None, "stillOut": {}, "curve": []}
    km = KaplanMeierFitter().fit(durations, observed)
    median = km.median_survival_time_
    grid = np.arange(0, CURVE_HOURS + 1, 1.0)
    survival = km.survival_function_at_times(grid).to_numpy()
    return {
        "n": int(len(durations)),
        "events": int(observed.sum()),
        "medianHours": None if not np.isfinite(median) else round(float(median), 2),
        "stillOut": {
            f"{h}h": round(float(km.survival_function_at_times(h).iloc[0]), 3)
            for h in HORIZONS_HOURS
        },
        # Survival at each whole hour up to CURVE_HOURS, for the wall.
        "curve": [round(float(s), 4) for s in survival],
    }


def build(
    times: list[str], records: list[list[dict]], station_of: dict[str, str], critical
) -> dict:
    out_sets = [lifts_out(r) for r in records]
    every = sorted(set().union(*out_sets))
    lifts_per_station = Counter(station_of.values())
    rows = []
    for lift in every:
        station = station_of.get(lift, lift.rsplit("-Lift", 1)[0])
        for o in outages(times, [lift in s for s in out_sets]):
            rows.append(
                {
                    "lift": lift,
                    "station": station,
                    **o,
                    "singleLift": lifts_per_station.get(station, 1) == 1,
                    "cutsAccess": lift in critical,
                    "underground": station.startswith("940GZZLU"),
                }
            )
    df = pd.DataFrame(rows)
    usable = df[~df["leftTruncated"]].copy()

    def km(mask) -> dict:
        part = usable[mask]
        return km_summary(part["hours"], part["observed"])

    groups = {
        "all": km(usable["hours"] > 0),
        "singleLift": km(usable["singleLift"]),
        "multiLift": km(~usable["singleLift"]),
        "cutsAccess": km(usable["cutsAccess"]),
        "otherLifts": km(~usable["cutsAccess"]),
        "underground": km(usable["underground"]),
        "otherModes": km(~usable["underground"]),
    }

    def logrank(column: str) -> dict:
        a, b = usable[usable[column]], usable[~usable[column]]
        if a.empty or b.empty:
            return {"statistic": None, "p": None}
        test = logrank_test(a["hours"], b["hours"], a["observed"], b["observed"])
        return {
            "statistic": round(float(test.test_statistic), 3),
            "p": round(float(test.p_value), 4),
        }

    covariates = ["singleLift", "cutsAccess", "underground"]
    cox_result, concordance, penalizer = fit_cox(usable, covariates)
    complete = usable[usable["observed"]]["hours"]
    return {
        "samples": len(times),
        "from": times[0],
        "to": times[-1],
        "outages": {
            "all": int(len(df)),
            "leftTruncated": int(df["leftTruncated"].sum()),
            "used": int(len(usable)),
            "ended": int(usable["observed"].sum()),
            "ongoing": int((~usable["observed"]).sum()),
            "lifts": int(df["lift"].nunique()),
            "stations": int(df["station"].nunique()),
        },
        "endedOutages": {
            # Simple statistics of the outages seen to end, for comparison with Tube Alerter.
            "medianHours": round(float(complete.median()), 2),
            "meanHours": round(float(complete.mean()), 2),
            "longestHours": round(float(complete.max()), 1),
        },
        "km": groups,
        "logrank": {c: logrank(c) for c in covariates},
        "cox": cox_result,
        "concordance": concordance,
        "coxPenalizer": penalizer,
        "tubeAlerter": TUBE_ALERTER,
        # Which stations have the most outage-hours among their sole lifts, for the wall.
        "singleLiftStations": _single_lift_ranking(usable),
    }


def fit_cox(usable: pd.DataFrame, covariates: list[str]) -> tuple[dict, float | None, float]:
    """Cox proportional hazards on the covariates that vary in the log so far (one that does
    not cannot be estimated, and is reported as such). If the plain fit fails, for instance
    on collinear covariates early in a log, a small ridge penalty keeps the daily rebuild
    going, and the penalty is reported."""
    varying = [c for c in covariates if usable[c].nunique() > 1]
    empty = {"hazardRatio": None, "ci95": None, "p": None, "phTestP": None}
    if not varying:
        return {c: empty for c in covariates}, None, 0.0
    data = usable[["hours", "observed", *varying]].astype(float)
    penalizer = 0.0
    try:
        cox = CoxPHFitter().fit(data, duration_col="hours", event_col="observed")
    except Exception:
        penalizer = 0.1
        cox = CoxPHFitter(penalizer=penalizer).fit(data, duration_col="hours", event_col="observed")
    summary = cox.summary
    ph = proportional_hazard_test(cox, data, time_transform="rank").summary
    result = {}
    for c in covariates:
        if c not in varying:
            result[c] = empty
            continue
        result[c] = {
            "hazardRatio": round(float(summary.loc[c, "exp(coef)"]), 3),
            "ci95": [
                round(float(summary.loc[c, "exp(coef) lower 95%"]), 3),
                round(float(summary.loc[c, "exp(coef) upper 95%"]), 3),
            ],
            "p": round(float(summary.loc[c, "p"]), 4),
            "phTestP": round(float(ph.loc[c, "p"]), 4),
        }
    return result, round(float(cox.concordance_index_), 3), penalizer


def _single_lift_ranking(usable: pd.DataFrame) -> list[dict]:
    part = usable[usable["singleLift"]]
    totals = part.groupby("station").agg(outages=("hours", "size"), hours=("hours", "sum"))
    totals = totals.sort_values("hours", ascending=False).head(10)
    return [
        {"station": s, "outages": int(r.outages), "hours": round(float(r.hours), 1)}
        for s, r in totals.iterrows()
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--log", type=Path, required=True, help="data dir holding lifts/")
    parser.add_argument("--topology", type=Path, required=True, help="tfl-station-topology/<date>")
    parser.add_argument("--network", type=Path, required=True, help="network.json (names)")
    parser.add_argument("--out", type=Path, required=True, help="output JSON")
    args = parser.parse_args(argv)
    times, records, failed = read_samples(args.log)
    if len(times) < 2:
        print("not enough samples", file=sys.stderr)
        return 1
    station_of = lifts_by_station(args.topology / "detailed" / "Lifts.csv")
    seen = set().union(*(lifts_out(r) for r in records))
    critical = critical_lifts(args.topology, seen)
    report = build(times, records, station_of, critical)

    names = {}
    with (args.topology / "detailed" / "Stations.csv").open(encoding="utf-8-sig") as f:
        names.update({r["UniqueId"]: r["Name"] for r in csv.DictReader(f)})
    network = json.loads(args.network.read_text(encoding="utf-8"))
    names.update({s["id"]: s["name"] for s in network["stations"]})
    for row in report["singleLiftStations"]:
        row["name"] = names.get(row["station"], row["station"])

    result = {
        "source": {
            "description": "TfL lift disruptions, logged every 15 minutes",
            "failedSamples": failed,
            "attribution": "Powered by TfL Open Data",
        },
        "criticalLifts": len(critical),
        **report,
    }
    args.out.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")
    brief = {k: v for k, v in result.items() if k not in ("km", "singleLiftStations")}
    print(json.dumps(brief, indent=1), file=sys.stderr)
    for k, v in result["km"].items():
        print(k, {x: v[x] for x in ("n", "events", "medianHours", "stillOut")}, file=sys.stderr)
    print(result["singleLiftStations"][:5], file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
