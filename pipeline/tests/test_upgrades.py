import numpy as np

from mind_the_step.model import build_graph
from mind_the_step.upgrades import area_weights, exhaustive, greedy, percentile


class FakeUpgrader:
    """Penalty of three areas; upgrading a station removes its minutes from the areas it serves.
    Stations 'a' and 'b' serve the same area, so the second of them adds nothing: greedy has to
    re-evaluate rather than trust the first round's gains."""

    serves = {"a": (0, 6.0), "b": (0, 5.0), "c": (1, 4.0), "d": (2, 1.0)}

    def extra(self, upgraded):
        penalty = np.array([10.0, 10.0, 10.0])
        for station in upgraded:
            area, minutes = self.serves[station]
            penalty[area] = min(penalty[area], 10.0 - minutes)
        return penalty


def test_greedy_re_evaluates_overlapping_upgrades():
    upgrader = FakeUpgrader()
    now = upgrader.extra(frozenset())
    weights = np.ones(3)
    picks = greedy(upgrader, ["a", "b", "c", "d"], weights, 3, now)
    assert [s for s, _ in picks] == ["a", "c", "d"]
    best, value = exhaustive(upgrader, ["a", "b", "c", "d"], weights, 2, now)
    assert best == frozenset({"a", "c"}) and value == 10.0


def test_weights_and_percentiles():
    assert percentile(np.array([3.0, 1.0, 2.0])).tolist() == [1.0, 0.0, 0.5]
    w = area_weights(np.array([100.0, 100.0]), np.array([0.0, 1.0]), np.array([1.0, 0.0]), 2, 0)
    assert w.tolist() == [100.0, 300.0]


def test_graph_labels_name_each_stations_step_free_edges():
    network = {
        "stations": [
            {"id": "A", "lat": 51.5, "lon": -0.1},
            {"id": "B", "lat": 51.51, "lon": -0.1},
        ]
    }
    adjacency = {"central": {("A", "B")}, "victoria": {("A", "B")}}
    graph = build_graph(network, adjacency, {("A", "central"): True})
    labels = set(graph.labels)
    assert ("access", "A", "central") in labels and ("access", "A", "victoria") not in labels
    assert ("transfer", "A", "central", "victoria") in labels
    assert () in labels  # rides and walks
    assert len(graph.labels) == len(graph.src)
