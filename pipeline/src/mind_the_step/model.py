"""A graph model of tube travel time, standard and step-free (plan §5.2).

Nodes are each station's street (its entrance) and one platform node per station and line.
Edges, all with times linear in a handful of parameters:

- ride: platform to the next platform along the line, `pace[line] x km + dwell`;
- enter and exit: street to platform and back, `access` each. Every tube journey enters once
  and exits once, so separate entry and exit times could not be told apart; the first wait
  is folded in;
- change: platform to another line's platform at the same station, `transfer` (walk + wait);
- walk: street to street for stations up to WALK_RADIUS_KM apart, `walk_pace x km x DETOUR`.

The step-free graph keeps only enter and exit edges for lines whose platforms are all
step-free from the street, and only changes TfL's topology shows to be step-free
(`topology.py`). Those take their own times, `access_step_free` and `transfer_step_free`: the
step-free way through a station (lifts, longer corridors) is usually slower. Rides and walks
are shared. Streets are assumed walkable by anyone; the model has no buses.

Because every edge time is (features . parameters), one sparse feature matrix serves every
parameter vector: calibration only recomputes the weights and reruns Dijkstra.
"""

from __future__ import annotations

import gzip
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

from .topology import TUBE_LINES

LINES = tuple(sorted(TUBE_LINES))
PARAMS = (
    *(f"pace:{line}" for line in LINES),
    "dwell",
    "access",
    "transfer",
    "walk_pace",
    "access_step_free",
    "transfer_step_free",
)
WALK_RADIUS_KM = 1.5
# Street distance over straight-line distance; folded into walking pace during calibration.
DETOUR = 1.3

# Starting values (minutes, or minutes per km). The pace is per straight-line km between
# station centres and excludes the per-stop dwell; 1.0 is also the prior that lines with few
# observations are held to during calibration (calibrate.py).
DEFAULTS = {
    **{f"pace:{line}": 1.0 for line in LINES},
    "dwell": 0.8,
    "access": 5.0,
    "access_step_free": 5.0,
    "transfer": 5.0,
    "walk_pace": 12.0,
    "transfer_step_free": 5.0,
}


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance between two (lat, lon) points."""
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def read_adjacency(snapshot_dir: Path, stations: set[str]) -> dict[str, set[tuple[str, str]]]:
    """Line -> consecutive station pairs on any of its routes, from the Line/Route snapshot.

    Express routes (e.g. Metropolitan fast trains) contribute pairs that skip stations.
    """
    pairs: dict[str, set[tuple[str, str]]] = {}
    for line in LINES:
        path = snapshot_dir / f"route-{line}.json.gz"
        route = json.loads(gzip.decompress(path.read_bytes()))
        line_pairs = set()
        for ordered in route.get("orderedLineRoutes") or []:
            ids = [n for n in ordered.get("naptanIds") or [] if n in stations]
            line_pairs.update((a, b) for a, b in zip(ids, ids[1:], strict=False) if a != b)
        pairs[line] = line_pairs
    return pairs


@dataclass
class Graph:
    stations: list[str]
    # Node index of each station's street node; stations[i] -> street[i].
    street: np.ndarray
    src: np.ndarray
    dst: np.ndarray
    # (edges x len(PARAMS)): edge time = features @ theta.
    features: np.ndarray
    n_nodes: int
    # Per edge: ("access", station, line) for an entry or exit, ("transfer", station, line,
    # other) for a change, () for rides and walks. Lets a caller switch a station's step-free
    # edges on and off without rebuilding the graph (upgrades.py).
    labels: list[tuple[str, ...]] = field(default_factory=list)

    def _matrix(self, theta: np.ndarray) -> csr_matrix:
        weights = self.features @ theta
        # csgraph drops explicit zeros, which would delete edges; all parameters are positive.
        return csr_matrix(
            (np.maximum(weights, 1e-6), (self.src, self.dst)), shape=(self.n_nodes, self.n_nodes)
        )

    def times(self, theta: np.ndarray, origins: list[int]) -> np.ndarray:
        """Minutes from each origin station (index) to every station; inf if unreachable."""
        dist = dijkstra(self._matrix(theta), directed=True, indices=self.street[origins])
        return dist[:, self.street]

    def path_features(
        self, theta: np.ndarray, pairs: list[tuple[int, int]]
    ) -> tuple[np.ndarray, np.ndarray]:
        """Summed edge features of each (origin, destination) pair's shortest path under
        `theta`, and its time. With the paths held fixed, time = features @ theta, which is
        what calibration exploits. Unreachable pairs get a zero row and an infinite time."""
        row_of = {(a, b): i for i, (a, b) in enumerate(zip(self.src, self.dst, strict=True))}
        origins = sorted({o for o, _ in pairs})
        index = {o: k for k, o in enumerate(origins)}
        dist, pred = dijkstra(
            self._matrix(theta),
            directed=True,
            indices=self.street[origins],
            return_predecessors=True,
        )
        phi = np.zeros((len(pairs), self.features.shape[1]))
        minutes = np.empty(len(pairs))
        for k, (o, d) in enumerate(pairs):
            node, start = self.street[d], self.street[o]
            minutes[k] = dist[index[o], node]
            if not np.isfinite(minutes[k]):
                continue
            while node != start:
                previous = pred[index[o], node]
                phi[k] += self.features[row_of[(previous, node)]]
                node = previous
        return phi, minutes


def build_graph(
    network: dict,
    adjacency: dict[str, set[tuple[str, str]]],
    access: dict[tuple[str, str], bool | None] | None = None,
    transfers: set[tuple[str, str, str]] | None = None,
) -> Graph:
    """The standard graph, or with `access` and `transfers` given, the step-free one."""
    stations = [s for s in network["stations"]]
    ids = [s["id"] for s in stations]
    where = {
        s["id"]: tuple(s["entrance"]) if s.get("entrance") else (s["lat"], s["lon"])
        for s in stations
    }
    centre = {s["id"]: (s["lat"], s["lon"]) for s in stations}
    column = {name: i for i, name in enumerate(PARAMS)}

    nodes: dict[tuple[str, str], int] = {}

    def node(station: str, line: str = "") -> int:
        return nodes.setdefault((station, line), len(nodes))

    street = np.array([node(i) for i in ids])
    edges: dict[tuple[int, int], dict[str, float]] = {}
    labels: dict[tuple[int, int], tuple[str, ...]] = {}

    def add(a: int, b: int, coefficients: dict[str, float], label: tuple[str, ...] = ()) -> None:
        # Two routes of a line can give the same pair twice; the times are identical.
        edges.setdefault((a, b), coefficients)
        labels.setdefault((a, b), label)

    def step_free(station: str, line: str) -> bool:
        return access is None or access.get((station, line)) is True

    access_param = "access" if access is None else "access_step_free"
    transfer_param = "transfer" if access is None else "transfer_step_free"

    lines_at: dict[str, set[str]] = {i: set() for i in ids}
    for line, pairs in adjacency.items():
        for a, b in pairs:
            lines_at[a].add(line)
            lines_at[b].add(line)
            km = haversine_km(centre[a], centre[b])
            add(node(a, line), node(b, line), {f"pace:{line}": km, "dwell": 1.0})

    for station, lines in lines_at.items():
        for line in lines:
            if step_free(station, line):
                label = ("access", station, line)
                add(node(station), node(station, line), {access_param: 1.0}, label)
                add(node(station, line), node(station), {access_param: 1.0}, label)
            for other in lines:
                if other != line and (transfers is None or (station, line, other) in transfers):
                    add(
                        node(station, line),
                        node(station, other),
                        {transfer_param: 1.0},
                        ("transfer", station, line, other),
                    )

    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            km = haversine_km(where[a], where[b])
            if km <= WALK_RADIUS_KM:
                add(node(a), node(b), {"walk_pace": km * DETOUR})
                add(node(b), node(a), {"walk_pace": km * DETOUR})

    features = np.zeros((len(edges), len(PARAMS)))
    for row, coefficients in enumerate(edges.values()):
        for name, value in coefficients.items():
            features[row, column[name]] = value
    src, dst = (np.array(side) for side in zip(*edges.keys(), strict=True))
    return Graph(ids, street, src, dst, features, len(nodes), list(labels.values()))


def default_theta() -> np.ndarray:
    return np.array([DEFAULTS[name] for name in PARAMS])
