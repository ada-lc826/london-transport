"""Calibrate the network model against Journey Planner times (plan §5.2, §5.3).

Targets are the street-to-street batch (journeys.py): the fastest Journey Planner journey
between station entrances, standard and step-free. The model only knows the tube and walking,
so it is fitted on the journeys that use nothing else: standard ones on the standard graph,
step-free ones on the step-free graph, sharing every parameter but the step-free entry, exit
and change times. It is scored by leave-one-origin-out cross-validation: each origin's
journeys are predicted by parameters fitted on the other origins'. A straight-line-distance
regression is the baseline to beat.

Where Journey Planner finds a step-free journey the model cannot, or a much faster one, it is
using buses or rail the model leaves out: the "bus fallback" that the plan's residual model
(§5.6a) studies.
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.optimize import linprog
from scipy.sparse import csr_matrix, eye, hstack, vstack

from .model import (
    PARAMS,
    Graph,
    build_graph,
    default_theta,
    haversine_km,
    read_adjacency,
)
from .topology import line_access, read_topology

RAIL_MODES = frozenset({"tube", "walking"})
BOUNDS = [(0.05, 60.0)] * len(PARAMS)
# Cost, in minutes of MAE per min/km, of moving a line's pace away from its prior. Small
# enough to leave well-observed lines alone; it only settles lines the calibration journeys
# hardly use (the Circle, which shares its track with faster-fitted lines, and the Waterloo
# & City), which would otherwise take arbitrary values.
PACE_PRIOR_WEIGHT = 0.01
# An unreachable destination counts as this many minutes, so the fit steers away from it.
UNREACHABLE_MINUTES = 120.0


@dataclass(frozen=True)
class Observation:
    origin: str
    destination: str
    minutes: float
    # Leg modes of the planner's fastest journey; empty when it found none.
    modes: frozenset[str]


@dataclass
class Sample:
    """Journeys and the graph that should explain them."""

    name: str
    graph: Graph
    observations: list[Observation]

    def where(self, keep) -> Sample:
        return Sample(self.name, self.graph, [o for o in self.observations if keep(o)])

    @property
    def actual(self) -> np.ndarray:
        return np.array([o.minutes for o in self.observations])


def read_observations(records: Path, scenario: str) -> list[Observation]:
    """Planner results for one scenario, one per origin-destination pair."""
    raw = records.read_bytes()
    if records.suffix == ".gz":
        raw = gzip.decompress(raw)
    result = []
    for line in raw.decode("utf-8").splitlines():
        record = json.loads(line)
        if record.get("scenario") != scenario or record.get("status") not in (200, 404):
            continue
        legs = record.get("legs") or []
        result.append(
            Observation(
                record["origin"],
                record["destination"],
                float(record["minutes"]) if record.get("minutes") is not None else float("nan"),
                frozenset(leg["mode"] for leg in legs),
            )
        )
    return result


def is_rail_only(o: Observation) -> bool:
    return bool(o.modes) and o.modes <= RAIL_MODES


def _pairs(graph: Graph, observations: list[Observation]) -> list[tuple[int, int]]:
    index = {s: i for i, s in enumerate(graph.stations)}
    return [(index[o.origin], index[o.destination]) for o in observations]


def predict(graph: Graph, theta: np.ndarray, observations: list[Observation]) -> np.ndarray:
    index = {s: i for i, s in enumerate(graph.stations)}
    origins = sorted({o.origin for o in observations})
    row = {o: k for k, o in enumerate(origins)}
    times = graph.times(theta, [index[o] for o in origins])
    return np.array([times[row[o.origin], index[o.destination]] for o in observations])


def mae(predicted: np.ndarray, actual: np.ndarray) -> float:
    capped = np.where(np.isfinite(predicted), predicted, UNREACHABLE_MINUTES)
    return float(np.mean(np.abs(capped - actual)))


def _l1_fit(phi: np.ndarray, actual: np.ndarray) -> np.ndarray:
    """Parameters minimising mean absolute error when each time is phi @ theta, plus the pace
    prior. A linear programme over theta, u (one per journey) and v (one per parameter):
    minimise mean(u) + w * sum(v) subject to |phi @ theta - actual| <= u and
    |theta - prior| <= v (w is zero for parameters other than paces)."""
    n, p = phi.shape
    prior = default_theta()
    weights = np.array([PACE_PRIOR_WEIGHT if name.startswith("pace:") else 0.0 for name in PARAMS])
    a, ident_n, ident_p = csr_matrix(phi), eye(n, format="csr"), eye(p, format="csr")
    zeros_np, zeros_pn = csr_matrix((n, p)), csr_matrix((p, n))
    result = linprog(
        c=np.concatenate([np.zeros(p), np.ones(n) / n, weights]),
        A_ub=vstack(
            [
                hstack([a, -ident_n, zeros_np]),
                hstack([-a, -ident_n, zeros_np]),
                hstack([ident_p, zeros_pn, -ident_p]),
                hstack([-ident_p, zeros_pn, -ident_p]),
            ]
        ).tocsr(),
        b_ub=np.concatenate([actual, -actual, prior, -prior]),
        bounds=BOUNDS + [(0, None)] * (n + p),
        method="highs",
    )
    if not result.success:
        raise RuntimeError(f"calibration LP failed: {result.message}")
    return result.x[:p]


def fit(samples: list[Sample], rounds: int = 30) -> np.ndarray:
    """Fit by alternating: route every journey by the current parameters, then choose the
    parameters that minimise MAE along those routes. Stops when MAE no longer improves.

    Searching the parameters directly (e.g. Powell) stalls: as parameters change, shortest
    paths switch, so the error surface is piecewise linear with many kinks.
    """
    actual = np.concatenate([s.actual for s in samples])
    theta = default_theta()
    best_score, best_theta = float("inf"), theta
    for _ in range(rounds):
        routed = [s.graph.path_features(theta, _pairs(s.graph, s.observations)) for s in samples]
        phi = np.vstack([r[0] for r in routed])
        predicted = np.concatenate([r[1] for r in routed])
        score = mae(predicted, actual)
        if score >= best_score - 1e-4:
            break
        best_score, best_theta = score, theta
        reachable = np.isfinite(predicted)
        theta = _l1_fit(phi[reachable], actual[reachable])
    return best_theta


def scores(predicted: np.ndarray, actual: np.ndarray) -> dict:
    reachable = np.isfinite(predicted)
    error = predicted[reachable] - actual[reachable]
    if not len(error):
        # Nothing to score (e.g. an origin with no step-free tube journeys): no NaNs in JSON.
        return {"n": int(len(actual)), "unreachable": int((~reachable).sum())}
    return {
        "n": int(len(actual)),
        "unreachable": int((~reachable).sum()),
        "mae": round(float(np.mean(np.abs(error))), 2),
        "mape": round(float(np.mean(np.abs(error) / actual[reachable])) * 100, 1),
        "bias": round(float(np.mean(error)), 2),
        "within_5_min": round(float(np.mean(np.abs(error) <= 5)) * 100, 1),
    }


def baseline_predictions(
    network: dict, train: list[Observation], test: list[Observation]
) -> np.ndarray:
    """Minutes as a straight line in crow-fly distance, fitted by least squares on `train`."""
    where = {s["id"]: (s["lat"], s["lon"]) for s in network["stations"]}

    def km(o: Observation) -> float:
        return haversine_km(where[o.origin], where[o.destination])

    x = np.array([[1.0, km(o)] for o in train])
    coef, *_ = np.linalg.lstsq(x, np.array([o.minutes for o in train]), rcond=None)
    return np.array([coef[0] + coef[1] * km(o) for o in test])


def cross_validate(samples: list[Sample], network: dict) -> dict:
    """Leave one origin out: fit on the rest, predict the held-out origin's journeys."""
    origins = sorted({o.origin for s in samples for o in s.observations})
    model: dict[str, list] = {s.name: [] for s in samples}
    baseline: dict[str, list] = {s.name: [] for s in samples}
    folds: dict[str, dict] = {}
    for held_out in origins:
        train = [s.where(lambda o, h=held_out: o.origin != h) for s in samples]
        test = [s.where(lambda o, h=held_out: o.origin == h) for s in samples]
        theta = fit(train)
        folds[held_out] = {}
        for tr, te in zip(train, test, strict=True):
            predicted = predict(te.graph, theta, te.observations)
            model[te.name].append((predicted, te.actual))
            baseline[te.name].append(
                (baseline_predictions(network, tr.observations, te.observations), te.actual)
            )
            folds[held_out][te.name] = scores(predicted, te.actual)
        print(f"  held out {held_out}: {folds[held_out]}", file=sys.stderr)

    def pooled(parts: list) -> dict:
        return scores(np.concatenate([p for p, _ in parts]), np.concatenate([a for _, a in parts]))

    return {
        "model": {name: pooled(parts) for name, parts in model.items()},
        "baseline_crow_fly": {name: pooled(parts) for name, parts in baseline.items()},
        "folds": folds,
    }


def fallback_report(sample: Sample, theta: np.ndarray) -> dict:
    """Every planner journey, against the tube-and-walk model: how often the planner does
    better with modes the model leaves out (nearly always buses, in the step-free case)."""
    planned = sample.where(lambda o: bool(o.modes))
    predicted = predict(sample.graph, theta, planned.observations)
    actual = planned.actual
    reachable = np.isfinite(predicted)
    other = Counter(m for o in planned.observations for m in o.modes - RAIL_MODES)
    return {
        "planner_journeys": len(actual),
        "planner_using_other_modes": sum(not is_rail_only(o) for o in planned.observations),
        "other_modes": dict(other.most_common()),
        "model_unreachable": int((~reachable).sum()),
        "planner_10_min_faster": int((reachable & (actual <= predicted - 10)).sum()),
        "scores_where_reachable": scores(predicted, actual),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--network", type=Path, required=True, help="network.json")
    parser.add_argument("--snapshot", type=Path, required=True, help="snapshots/<date> dir")
    parser.add_argument("--topology", type=Path, required=True, help="tfl-station-topology/<date>")
    parser.add_argument("--records", type=Path, required=True, help="batch records.jsonl[.gz]")
    parser.add_argument("--out", type=Path, required=True, help="output JSON")
    args = parser.parse_args(argv)

    network = json.loads(args.network.read_text(encoding="utf-8"))
    adjacency = read_adjacency(args.snapshot, {s["id"] for s in network["stations"]})
    topology = read_topology(args.topology)
    graphs = {
        "standard": build_graph(network, adjacency),
        "step-free": build_graph(
            network, adjacency, line_access(topology.platforms), topology.transfers
        ),
    }
    everything = [
        Sample(name, graph, read_observations(args.records, name)) for name, graph in graphs.items()
    ]
    samples = [s.where(is_rail_only) for s in everything]
    for s in samples:
        print(f"{len(s.observations)} rail-only {s.name} journeys", file=sys.stderr)

    cv = cross_validate(samples, network)
    theta = fit(samples)
    standard = samples[0]
    phi, _ = standard.graph.path_features(theta, _pairs(standard.graph, standard.observations))

    report = {
        "model": "network model v1 (tube + walking)",
        "inputs": {
            "journeys": args.records.parent.name,
            "snapshot": args.snapshot.name,
            "topology": args.topology.name,
        },
        "params": {name: round(float(v), 3) for name, v in zip(PARAMS, theta, strict=True)},
        # Standard calibration journeys whose fitted route rides each line: a line's pace is
        # only as well determined as this count is large.
        "journeys_per_line": {
            name.removeprefix("pace:"): int((phi[:, k] > 0).sum())
            for k, name in enumerate(PARAMS)
            if name.startswith("pace:")
        },
        "graph_edges": {name: int(len(g.src)) for name, g in graphs.items()},
        "calibration": {
            "observations": {s.name: len(s.observations) for s in samples},
            "in_sample": {
                s.name: scores(predict(s.graph, theta, s.observations), s.actual) for s in samples
            },
            "leave_one_origin_out": cv,
        },
        "all_planner_journeys": {s.name: fallback_report(s, theta) for s in everything},
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(cv["model"]), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
