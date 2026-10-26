"""S7 (What would fix it): which stations to make step-free next (plan §5.7, RQ4).

An upgrade makes a station fully step-free: every line's platforms reachable from the street,
and every change between its lines step-free. In the network model that switches on the
station's step-free entry, exit and change edges (model.Graph.labels), with the calibrated
step-free times; nothing else changes.

The penalty is S4's (equity.py): for every London MSOA in reach of the tube, the weighted mean
extra minutes of its tube journeys step-free, censored at CAP_MINUTES. The value of a set of
upgrades is how much it lowers that penalty, summed over neighbourhoods with a weight per
neighbourhood (plan §5.7: demand × (1 + α·disability + β·deprivation)):

- `people`: residents;
- `disability`: residents × (1 + 2 × the neighbourhood's percentile of disability share);
- `deprivation`: residents × (1 + 2 × its percentile of IMD score).

Each strategy is solved greedily for k = 1..K_MAX (lazy evaluation; the value of a set is
re-evaluated exactly with the model at every pick), and the greedy choice is checked against
exhaustive search on a reduced instance (`--check`). TfL's own list (12 stations announced in
2024, and South Kensington) is evaluated the same way, in the order that suits it best, for
comparison. Sweeps of α (disability) and β (deprivation) trace the trade-off between minutes
for everyone and minutes for disabled residents, or for the most deprived fifth.

    uv run python -m mind_the_step.upgrades --raw <data-branch>/equity/raw \\
        --snapshot <data-branch>/snapshots/2026-10-19 \\
        --topology ../data/tfl-station-topology/2026-10-20 \\
        --model ../data/model/network-model-v1.json \\
        --network ../apps/website/public/data/network.json \\
        --pulse ../apps/website/public/data/pulse.json --out upgrades.json
"""

from __future__ import annotations

import argparse
import heapq
import itertools
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

from .equity import (
    CAP_MINUTES,
    REACH_KM,
    access_minutes,
    destination_weights,
    door_to_station,
    read_areas,
)
from .model import PARAMS, Graph, build_graph, read_adjacency
from .topology import line_access, read_topology

K_MAX = 20
HELPED_MINUTES = 5.0
TFL_2024 = [
    "940GZZLUALP",  # Alperton
    "940GZZLUASG",  # Arnos Grove
    "940GZZLUCSD",  # Colliers Wood
    "940GZZLUCXY",  # Croxley
    "940GZZLUEAE",  # Eastcote
    "940GZZLUEFY",  # East Finchley
    "940GZZLUNDN",  # Neasden
    "940GZZLUNAN",  # North Acton
    "940GZZLUNOW",  # Northwood
    "940GZZLUTBY",  # Tooting Broadway
    "940GZZLUTNG",  # Turnham Green
    "940GZZLUWHP",  # West Hampstead
]
SOUTH_KENSINGTON = "940GZZLUSKS"
STRATEGIES = {"people": (0.0, 0.0), "disability": (2.0, 0.0), "deprivation": (0.0, 2.0)}
SWEEP = (0.0, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0)


@dataclass
class Upgrader:
    """The step-free penalty of every area for any set of upgraded stations."""

    graph: Graph  # every station's step-free edges present
    base: np.ndarray  # edges in today's step-free network
    owner: np.ndarray  # station an access or transfer edge belongs to, '' otherwise
    weights: np.ndarray  # edge minutes
    walk: np.ndarray  # area x station walking minutes (inf beyond reach)
    standard: np.ndarray  # area x station standard minutes
    destinations: np.ndarray  # station weights, summing to 1

    def extra(self, upgraded: frozenset[str]) -> np.ndarray:
        """Each area's weighted mean extra minutes, step-free over standard, censored.
        Cached: the strategies share most of the sets they try."""
        cache = self.__dict__.setdefault("_cache", {})
        if upgraded not in cache:
            cache[upgraded] = self._extra(upgraded)
        return cache[upgraded]

    def _extra(self, upgraded: frozenset[str]) -> np.ndarray:
        mask = self.base | np.isin(self.owner, list(upgraded))
        g = self.graph
        matrix = csr_matrix(
            (np.maximum(self.weights[mask], 1e-6), (g.src[mask], g.dst[mask])),
            shape=(g.n_nodes, g.n_nodes),
        )
        between = dijkstra(matrix, directed=True, indices=g.street)[:, g.street]
        step_free = self._door(between)
        std = np.minimum(self.standard, CAP_MINUTES)
        return (np.minimum(step_free, CAP_MINUTES) - std) @ self.destinations

    def _door(self, between: np.ndarray) -> np.ndarray:
        """door_to_station over each area's walkable stations only (a few dozen, not all):
        the same result, much faster, which the greedy search needs."""
        if not hasattr(self, "_nearby"):
            finite = np.isfinite(self.walk)
            width = max(int(finite.sum(axis=1).max()), 1)
            order = np.argsort(~finite, axis=1, kind="stable")[:, :width]
            self._nearby = order
            self._nearby_walk = np.take_along_axis(self.walk, order, axis=1)
        # areas x nearby x stations, then the best boarding station.
        return (self._nearby_walk[:, :, None] + between[self._nearby]).min(axis=1)


def percentile(values: np.ndarray) -> np.ndarray:
    """Each value's rank among `values`, scaled to 0..1."""
    return np.argsort(np.argsort(values)) / max(len(values) - 1, 1)


def area_weights(residents: np.ndarray, d: np.ndarray, m: np.ndarray, alpha: float, beta: float):
    return residents * (1 + alpha * d + beta * m)


def greedy(
    upgrader: Upgrader,
    candidates: list[str],
    weights: np.ndarray,
    k_max: int,
    now: np.ndarray,
) -> list[tuple[str, np.ndarray]]:
    """Lazy greedy: pick the station whose upgrade lowers the weighted penalty most, k_max
    times. Returns each pick with the areas' penalty after it."""
    chosen: frozenset[str] = frozenset()
    current = now
    value = 0.0
    # Max-heap of (-upper bound on gain, station, round it was computed in).
    heap = [(-np.inf, s, -1) for s in candidates]
    heapq.heapify(heap)
    picks = []
    for round_ in range(k_max):
        while True:
            bound, station, seen = heapq.heappop(heap)
            if seen == round_:
                break
            after = upgrader.extra(chosen | {station})
            gain = float(weights @ (now - after)) - value
            heapq.heappush(heap, (-gain, station, round_))
        chosen = chosen | {station}
        current = upgrader.extra(chosen)
        value = float(weights @ (now - current))
        picks.append((station, current))
    return picks


def best_order(upgrader: Upgrader, stations: list[str], weights: np.ndarray, now: np.ndarray):
    """Greedy order within a fixed list: how TfL's list would best be sequenced."""
    return greedy(upgrader, stations, weights, len(stations), now)


def exhaustive(
    upgrader: Upgrader, candidates: list[str], weights: np.ndarray, k: int, now: np.ndarray
) -> tuple[frozenset[str], float]:
    best, best_value = frozenset(), -np.inf
    for combo in itertools.combinations(candidates, k):
        value = float(weights @ (now - upgrader.extra(frozenset(combo))))
        if value > best_value:
            best, best_value = frozenset(combo), value
    return best, best_value


def summarise(
    now: np.ndarray,
    after: np.ndarray,
    residents: np.ndarray,
    disabled: np.ndarray,
    deprived: np.ndarray,
) -> dict:
    saved = now - after
    return {
        # Minutes off the average resident's step-free tube journey penalty.
        "savedEveryone": round(float(saved @ residents / residents.sum()), 3),
        "savedDisabled": round(float(saved @ disabled / disabled.sum()), 3),
        "savedDeprived": round(
            float(saved[deprived] @ residents[deprived] / residents[deprived].sum()), 3
        ),
        "helped": int(residents[saved >= HELPED_MINUTES].sum()),
        "helpedDisabled": int(disabled[saved >= HELPED_MINUTES].sum()),
    }


def build(
    areas: list[dict],
    network: dict,
    adjacency: dict,
    topology_dir: Path,
    params: dict[str, float],
    pulse: dict,
    check: bool = False,
) -> dict:
    theta = np.array([params[name] for name in PARAMS])
    topology = read_topology(topology_dir)
    access = line_access(topology.platforms)
    status = {s["id"]: s["stepFree"] for s in network["stations"]}
    names = {s["id"]: s["name"] for s in network["stations"]}

    standard_graph = build_graph(network, adjacency)
    # Every station-line step-free, every change allowed: the graph upgrades draw from.
    everything = build_graph(network, adjacency, {k: True for k in _station_lines(adjacency)})
    base = np.array(
        [
            not label
            or (label[0] == "access" and access.get((label[1], label[2])) is True)
            or (label[0] == "transfer" and tuple(label[1:]) in topology.transfers)
            for label in everything.labels
        ]
    )
    owner = np.array([label[1] if label else "" for label in everything.labels])

    walk, nearest_km = access_minutes(areas, network, params["walk_pace"])
    reached = nearest_km <= REACH_KM
    walk = walk[reached]
    inside = [a for a, r in zip(areas, reached, strict=True) if r]
    every = list(range(len(standard_graph.stations)))
    standard = door_to_station(walk, standard_graph.times(theta, every))
    destinations = destination_weights(pulse, standard_graph.stations)
    upgrader = Upgrader(
        everything,
        base,
        owner,
        everything.features @ theta,
        walk,
        standard,
        destinations / destinations.sum(),
    )
    now = upgrader.extra(frozenset())

    residents = np.array([a["residents"] for a in inside], dtype=float)
    disabled = np.array([a["disabled"] for a in inside], dtype=float)
    imd = np.array([a["imd"] for a in inside])
    d = percentile(disabled / residents)
    m = percentile(imd)
    deprived = imd >= np.quantile(imd, 0.8)
    candidates = sorted(s for s in names if status[s] != "full" and s in owner)

    def summary(after: np.ndarray) -> dict:
        return summarise(now, after, residents, disabled, deprived)

    strategies = {}
    for name, (alpha, beta) in STRATEGIES.items():
        weights = area_weights(residents, d, m, alpha, beta)
        picks = greedy(upgrader, candidates, weights, K_MAX, now)
        strategies[name] = [
            {"station": s, "name": names[s], **summary(after)} for s, after in picks
        ]
        print(name, [p["name"] for p in strategies[name][:10]], file=sys.stderr)

    people = area_weights(residents, d, m, 0, 0)
    tfl_list = [s for s in TFL_2024 if s in candidates]
    tfl = [
        {"station": s, "name": names[s], **summary(after)}
        for s, after in best_order(upgrader, tfl_list, people, now)
    ]
    with_skx = upgrader.extra(frozenset(tfl_list) | {SOUTH_KENSINGTON})

    # Trade-offs at k = 10: increasing weight on disability share (alpha), then on
    # deprivation (beta).
    def sweep(key: str) -> list[dict]:
        rows = []
        for weight in SWEEP:
            alpha, beta = (weight, 0.0) if key == "alpha" else (0.0, weight)
            picks = greedy(
                upgrader, candidates, area_weights(residents, d, m, alpha, beta), 10, now
            )
            rows.append({key: weight, "stations": [s for s, _ in picks], **summary(picks[-1][1])})
        return rows

    # Per-area minutes saved after k picks, for the map: k = 5, 10, 12 (as many as TfL's
    # list) and 20.
    shown_k = (5, 10, 12, 20)
    area_saved = {
        name: {
            str(k): [
                round(float(v), 1)
                for v in now - upgrader.extra(frozenset(p["station"] for p in picks[:k]))
            ]
            for k in shown_k
        }
        for name, picks in strategies.items()
    }

    result = {
        "params": {"kMax": K_MAX, "helpedMinutes": HELPED_MINUTES, "shownK": list(shown_k)},
        "now": {
            "everyone": round(float(now @ residents / residents.sum()), 2),
            "disabled": round(float(now @ disabled / disabled.sum()), 2),
        },
        "candidates": len(candidates),
        "strategies": strategies,
        "tfl": tfl,
        "tflWithSouthKensington": summary(with_skx),
        "sweeps": {"disability": sweep("alpha"), "deprivation": sweep("beta")},
        "areas": [
            {"code": a["code"], "lon": round(a["lon"], 4), "lat": round(a["lat"], 4)}
            for a in inside
        ],
        "areaSaved": area_saved,
        "stations": {
            s: {"name": names[s], "lon": st["lon"], "lat": st["lat"], "stepFree": status[s]}
            for st in network["stations"]
            for s in [st["id"]]
        },
    }

    if check:
        # Exhaustive search on a reduced instance: the 12 best single upgrades, k = 3.
        weights = people
        singles = sorted(
            candidates, key=lambda s: -float(weights @ (now - upgrader.extra(frozenset({s}))))
        )[:12]
        exact, exact_value = exhaustive(upgrader, singles, weights, 3, now)
        greedy3 = greedy(upgrader, singles, weights, 3, now)
        greedy_value = float(weights @ (now - greedy3[-1][1]))
        result["check"] = {
            "pool": len(singles),
            "k": 3,
            "greedyShareOfOptimum": round(greedy_value / exact_value, 4),
            "sameSet": exact == frozenset(s for s, _ in greedy3),
        }
    return result


def _station_lines(adjacency: dict[str, set[tuple[str, str]]]) -> set[tuple[str, str]]:
    return {(s, line) for line, pairs in adjacency.items() for pair in pairs for s in pair}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--raw", type=Path, required=True, help="equity/raw on the data branch")
    parser.add_argument("--snapshot", type=Path, required=True, help="snapshots/<date> dir")
    parser.add_argument("--topology", type=Path, required=True, help="tfl-station-topology/<date>")
    parser.add_argument("--model", type=Path, required=True, help="network-model-v1.json")
    parser.add_argument("--network", type=Path, required=True, help="network.json")
    parser.add_argument("--pulse", type=Path, required=True, help="pulse.json (NUMBAT entries)")
    parser.add_argument("--out", type=Path, required=True, help="output JSON")
    parser.add_argument("--check", action="store_true", help="greedy against exhaustive search")
    args = parser.parse_args(argv)

    network = json.loads(args.network.read_text(encoding="utf-8"))
    model = json.loads(args.model.read_text(encoding="utf-8"))
    pulse = json.loads(args.pulse.read_text(encoding="utf-8"))
    adjacency = read_adjacency(args.snapshot, {s["id"] for s in network["stations"]})
    areas = read_areas(args.raw)
    report = build(
        areas, network, adjacency, args.topology, model["params"], pulse, check=args.check
    )
    result = {
        "source": {
            "description": "Greedy station upgrades against the S4 step-free penalty",
            "attribution": "Contains National Statistics data © Crown copyright and database "
            "right 2025; Powered by TfL Open Data",
        },
        **report,
    }
    args.out.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")
    for name in ("people", "disability", "deprivation"):
        print(name, json.dumps(result["strategies"][name][11]), file=sys.stderr)
    print("tfl", json.dumps(result["tfl"][-1]), file=sys.stderr)
    print("tfl+sks", json.dumps(result["tflWithSouthKensington"]), file=sys.stderr)
    for key, rows in result["sweeps"].items():
        keep = ("savedEveryone", "savedDisabled", "savedDeprived", "helped")
        print(key, json.dumps([[r[k] for k in keep] for r in rows]), file=sys.stderr)
    print("check", json.dumps(result.get("check")), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
