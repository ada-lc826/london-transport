"""Where buses and other rail make up for the tube's steps: a residual model (plan §5.6a).

The network model (model.py) has the tube and walking only. TfL's Journey Planner, asked for
step-free journeys, also uses buses (all wheelchair accessible), the Overground, the
Elizabeth line and National Rail, and often finds a faster way. The residual

    r = min(model step-free minutes, CAP) - Journey Planner step-free minutes

is how many minutes the rest of the network saves over the tube alone: large where the tube
leaves step-free travellers stranded and something else steps in. A gradient boosted model
(LightGBM) learns r from features of the journey and its two ends, none taken from the
planner's own answer:

- the trip: straight-line km, the model's standard and step-free minutes, whether the tube
  has any step-free route at all;
- each end: its step-free status, km to the nearest fully step-free station, bus stops within
  400 m and 800 m (NaPTAN), weekday entries (NUMBAT), tube lines, km to Charing Cross.

Validation is spatial, so the score is what the model does in a place it has not seen:

- leave one origin out: the 12 origins of the Journey Planner sample, one at a time;
- leave one destination block out: destinations grouped into 5 km squares.

Each is compared with two baselines: no correction (the tube-only model) and a constant
correction (the mean residual of the training folds). Feature effects are TreeSHAP values
from LightGBM's own `pred_contrib`.

The bus fallback index of a station is the mean out-of-fold predicted residual of the
journeys that end there: how much the wider network typically rescues a step-free traveller
heading for it.

    uv run python -m mind_the_step.residuals \\
        --records <data-branch>/journeys/s3-street-2026-10-27-0830/records.jsonl.gz \\
        --stops <data-branch>/equity/raw/naptan-london-bus.csv \\
        --snapshot <data-branch>/snapshots/2026-10-19 \\
        --topology ../data/tfl-station-topology/2026-10-20 \\
        --model ../data/model/network-model-v1.json \\
        --network ../apps/website/public/data/network.json \\
        --pulse ../apps/website/public/data/pulse.json \\
        --out ../data/model/bus-fallback-v1.json
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from collections import Counter
from pathlib import Path

import lightgbm as lgb
import numpy as np

from .calibrate import read_observations
from .model import PARAMS, build_graph, haversine_km, read_adjacency
from .topology import line_access, read_topology

CAP = 120.0
CHARING_CROSS = (51.5073, -0.1276)
BLOCK_KM = 5.0
SEED = 20261026
LGB_PARAMS = {
    "objective": "regression_l1",
    "learning_rate": 0.05,
    "num_leaves": 15,
    "min_data_in_leaf": 30,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "lambda_l2": 1.0,
    "seed": SEED,
    "deterministic": True,
    "num_threads": 1,
    "verbose": -1,
}
ROUNDS = 400
STATUS = {"full": 2.0, "partial": 1.0, "none": 0.0}

END_FEATURES = (
    "status",
    "km_to_step_free",
    "bus_400m",
    "bus_800m",
    "log_entries",
    "lines",
    "centre_km",
)
FEATURES = (
    "trip_km",
    "model_standard",
    "model_step_free",
    "no_step_free_tube",
    *(f"origin_{f}" for f in END_FEATURES),
    *(f"destination_{f}" for f in END_FEATURES),
)


def read_stops(path: Path) -> np.ndarray:
    """(lat, lon) of every bus stop, as radians, for counting within a radius."""
    with path.open(encoding="utf-8") as f:
        rows = [(float(r["lat"]), float(r["lon"])) for r in csv.DictReader(f)]
    return np.radians(np.array(rows))


def stops_within(stops: np.ndarray, lat: float, lon: float, metres: float) -> int:
    lat1, lon1 = math.radians(lat), math.radians(lon)
    h = (
        np.sin((stops[:, 0] - lat1) / 2) ** 2
        + math.cos(lat1) * np.cos(stops[:, 0]) * np.sin((stops[:, 1] - lon1) / 2) ** 2
    )
    km = 2 * 6371.0 * np.arcsin(np.sqrt(h))
    return int((km * 1000 <= metres).sum())


def station_features(network: dict, stops: np.ndarray, pulse: dict) -> dict[str, dict]:
    """The END_FEATURES of every station."""
    stations = network["stations"]
    full = [(s["lat"], s["lon"]) for s in stations if s["stepFree"] == "full"]
    entries = pulse.get("stations") or {}
    result = {}
    for s in stations:
        here = (s["lat"], s["lon"])
        result[s["id"]] = {
            "status": STATUS.get(s["stepFree"] or "", float("nan")),
            "km_to_step_free": min(haversine_km(here, f) for f in full),
            "bus_400m": float(stops_within(stops, *here, 400)),
            "bus_800m": float(stops_within(stops, *here, 800)),
            "log_entries": math.log1p(sum(entries.get(s["id"], []))),
            "lines": float(len(s.get("lines") or [])),
            "centre_km": haversine_km(here, CHARING_CROSS),
        }
    return result


def build_rows(
    observations: list,
    standard: np.ndarray,
    step_free: np.ndarray,
    index: dict[str, int],
    where: dict[str, tuple[float, float]],
    ends: dict[str, dict],
) -> tuple[np.ndarray, np.ndarray, list]:
    """Feature matrix, residual target, and the observations kept (planner found a route)."""
    x, y, kept = [], [], []
    for o in observations:
        if not math.isfinite(o.minutes):
            continue
        i, j = index[o.origin], index[o.destination]
        sf = step_free[i, j]
        row = {
            "trip_km": haversine_km(where[o.origin], where[o.destination]),
            "model_standard": min(standard[i, j], CAP),
            "model_step_free": min(sf, CAP),
            "no_step_free_tube": float(not math.isfinite(sf)),
        }
        for end, station in (("origin", o.origin), ("destination", o.destination)):
            for f in END_FEATURES:
                row[f"{end}_{f}"] = ends[station][f]
        x.append([row[f] for f in FEATURES])
        y.append(min(sf, CAP) - o.minutes)
        kept.append(o)
    return np.array(x), np.array(y), kept


def blocks(points: list[tuple[float, float]], km: float = BLOCK_KM) -> list[str]:
    """A label per point: the km x km square it falls in (equirectangular, around London)."""
    lat0 = math.radians(51.5)
    labels = []
    for lat, lon in points:
        gx = math.floor(math.radians(lon) * math.cos(lat0) * 6371.0 / km)
        gy = math.floor(math.radians(lat) * 6371.0 / km)
        labels.append(f"{gx}:{gy}")
    return labels


def cross_validate(x: np.ndarray, y: np.ndarray, groups: list[str]) -> dict:
    """Out-of-fold predictions, leaving one group out at a time, and the scores of the model
    against the two baselines. Scores are MAE of the residual, which equals the MAE of the
    corrected step-free time against the planner."""
    oof = np.empty(len(y))
    constant = np.empty(len(y))
    for g in sorted(set(groups)):
        test = np.array([gr == g for gr in groups])
        booster = lgb.train(LGB_PARAMS, lgb.Dataset(x[~test], y[~test]), ROUNDS)
        oof[test] = booster.predict(x[test])
        constant[test] = np.median(y[~test])
    return {
        "folds": len(set(groups)),
        "mae": {
            "tubeOnly": round(float(np.abs(y).mean()), 2),
            "constant": round(float(np.abs(y - constant).mean()), 2),
            "lightgbm": round(float(np.abs(y - oof).mean()), 2),
        },
        "oof": oof,
    }


def shap_summary(booster: lgb.Booster, x: np.ndarray) -> list[dict]:
    """Mean |SHAP| per feature, and the sign of its effect (correlation of value and SHAP)."""
    contrib = booster.predict(x, pred_contrib=True)[:, :-1]
    rows = []
    for k, name in enumerate(FEATURES):
        values, effect = x[:, k], contrib[:, k]
        ok = np.isfinite(values)
        spread = values[ok].std() > 0 and effect[ok].std() > 0
        direction = float(np.corrcoef(values[ok], effect[ok])[0, 1]) if spread else 0.0
        rows.append(
            {
                "feature": name,
                "meanAbsShap": round(float(np.abs(effect).mean()), 3),
                "direction": round(direction, 2),
            }
        )
    return sorted(rows, key=lambda r: -r["meanAbsShap"])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--records", type=Path, required=True, help="planner records.jsonl.gz")
    parser.add_argument("--stops", type=Path, required=True, help="naptan-london-bus.csv")
    parser.add_argument("--snapshot", type=Path, required=True, help="snapshots/<date> dir")
    parser.add_argument("--topology", type=Path, required=True, help="tfl-station-topology/<date>")
    parser.add_argument("--model", type=Path, required=True, help="network-model-v1.json")
    parser.add_argument("--network", type=Path, required=True, help="network.json")
    parser.add_argument("--pulse", type=Path, required=True, help="pulse.json (NUMBAT entries)")
    parser.add_argument("--out", type=Path, required=True, help="output JSON")
    args = parser.parse_args(argv)

    network = json.loads(args.network.read_text(encoding="utf-8"))
    params = json.loads(args.model.read_text(encoding="utf-8"))["params"]
    pulse = json.loads(args.pulse.read_text(encoding="utf-8"))
    theta = np.array([params[name] for name in PARAMS])
    adjacency = read_adjacency(args.snapshot, {s["id"] for s in network["stations"]})
    topology = read_topology(args.topology)
    standard_graph = build_graph(network, adjacency)
    step_free_graph = build_graph(
        network, adjacency, line_access(topology.platforms), topology.transfers
    )
    every = list(range(len(standard_graph.stations)))
    standard = standard_graph.times(theta, every)
    step_free = step_free_graph.times(theta, every)
    index = {s: i for i, s in enumerate(standard_graph.stations)}
    where = {s["id"]: (s["lat"], s["lon"]) for s in network["stations"]}
    names = {s["id"]: s["name"] for s in network["stations"]}

    ends = station_features(network, read_stops(args.stops), pulse)
    observations = [
        o for o in read_observations(args.records, "step-free") if o.destination in index
    ]
    x, y, kept = build_rows(observations, standard, step_free, index, where, ends)
    bus_share = sum("bus" in o.modes for o in kept) / len(kept)

    by_origin = cross_validate(x, y, [o.origin for o in kept])
    by_block = cross_validate(x, y, blocks([where[o.destination] for o in kept]))
    booster = lgb.train(LGB_PARAMS, lgb.Dataset(x, y), ROUNDS)
    # Ablation: does bus stop density add anything to the geometry of the trip?
    no_bus = [k for k, f in enumerate(FEATURES) if "bus_" not in f]
    ablation = {
        "withoutBusStops": {
            "leaveOneOriginOut": cross_validate(x[:, no_bus], y, [o.origin for o in kept])["mae"][
                "lightgbm"
            ],
            "leaveOneDestinationBlockOut": cross_validate(
                x[:, no_bus], y, blocks([where[o.destination] for o in kept])
            )["mae"]["lightgbm"],
        }
    }

    # Bus fallback index: mean out-of-fold (leave one origin out) predicted residual of the
    # journeys ending at each station, next to the observed mean.
    sums: dict[str, list[float]] = {}
    for o, predicted, actual in zip(kept, by_origin["oof"], y, strict=True):
        acc = sums.setdefault(o.destination, [0.0, 0.0, 0.0])
        acc[0] += predicted
        acc[1] += actual
        acc[2] += 1
    index_rows = sorted(
        (
            {
                "station": s,
                "name": names[s],
                "lon": where[s][1],
                "lat": where[s][0],
                "predicted": round(p / n, 1),
                "observed": round(a / n, 1),
                "journeys": int(n),
            }
            for s, (p, a, n) in sums.items()
        ),
        key=lambda r: -r["predicted"],
    )

    report = {
        "model": "bus fallback v1: LightGBM on the network model's step-free residual",
        "inputs": {
            "journeys": args.records.parent.name,
            "stops": "NaPTAN, London bus stops",
            "networkModel": args.model.name,
        },
        "target": "min(model step-free minutes, 120) - Journey Planner step-free minutes",
        "rows": len(y),
        "residual": {
            "mean": round(float(y.mean()), 2),
            "median": round(float(np.median(y)), 2),
            "shareAboveFive": round(float((y > 5).mean()), 3),
        },
        "plannerStepFreeJourneysUsingBus": round(bus_share, 3),
        "params": {**{k: v for k, v in LGB_PARAMS.items() if k != "verbose"}, "rounds": ROUNDS},
        "validation": {
            "leaveOneOriginOut": {k: v for k, v in by_origin.items() if k != "oof"},
            "leaveOneDestinationBlockOut": {
                **{k: v for k, v in by_block.items() if k != "oof"},
                "blockKm": BLOCK_KM,
            },
        },
        "ablation": ablation,
        "shap": shap_summary(booster, x),
        "busFallbackIndex": index_rows,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")
    print(
        json.dumps({k: report[k] for k in ("rows", "residual", "plannerStepFreeJourneysUsingBus")}),
        file=sys.stderr,
    )
    print(json.dumps(report["validation"]), json.dumps(ablation), file=sys.stderr)
    for r in report["shap"][:8]:
        print(r, file=sys.stderr)
    print(
        "top", [(r["name"], r["predicted"], r["observed"]) for r in index_rows[:8]], file=sys.stderr
    )
    print("bottom", [(r["name"], r["predicted"]) for r in index_rows[-5:]], file=sys.stderr)
    print(Counter(round(r["predicted"]) // 5 * 5 for r in index_rows), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
