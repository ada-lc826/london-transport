import gzip
import json
import math

import numpy as np

from mind_the_step.calibrate import (
    Observation,
    Sample,
    fit,
    is_rail_only,
    predict,
    read_observations,
    scores,
)
from mind_the_step.model import (
    DEFAULTS,
    DETOUR,
    PARAMS,
    build_graph,
    default_theta,
    haversine_km,
    read_adjacency,
)


def station(sid, lat, lon):
    return {"id": sid, "name": sid, "lat": lat, "lon": lon, "entrance": [lat, lon]}


# S1 - S2 - S3 on the Victoria line, about 2 km apart; S4 on the Jubilee 2.2 km north of S2;
# S5 has no line, 0.5 km from S1, so it is reachable on foot only.
NETWORK = {
    "stations": [
        station("S1", 51.5, 0.0),
        station("S2", 51.5, 0.03),
        station("S3", 51.5, 0.06),
        station("S4", 51.52, 0.03),
        station("S5", 51.5045, 0.0),
    ]
}
ADJACENCY = {
    "victoria": {("S1", "S2"), ("S2", "S1"), ("S2", "S3"), ("S3", "S2")},
    "jubilee": {("S2", "S4"), ("S4", "S2")},
}
WHERE = {s["id"]: (s["lat"], s["lon"]) for s in NETWORK["stations"]}


def km(a, b):
    return haversine_km(WHERE[a], WHERE[b])


def times_from(graph, origin, theta=None):
    theta = default_theta() if theta is None else theta
    row = graph.times(theta, [graph.stations.index(origin)])[0]
    return dict(zip(graph.stations, row, strict=True))


def ride(line, a, b):
    return DEFAULTS[f"pace:{line}"] * km(a, b) + DEFAULTS["dwell"]


def test_standard_times_add_up_along_the_route():
    t = times_from(build_graph(NETWORK, ADJACENCY), "S1")
    entry = leave = DEFAULTS["access"]
    assert math.isclose(
        t["S3"], entry + ride("victoria", "S1", "S2") + ride("victoria", "S2", "S3") + leave
    )
    assert math.isclose(
        t["S4"],
        entry
        + ride("victoria", "S1", "S2")
        + DEFAULTS["transfer"]
        + ride("jubilee", "S2", "S4")
        + leave,
    )
    assert math.isclose(t["S5"], DEFAULTS["walk_pace"] * km("S1", "S5") * DETOUR)


def test_step_free_graph_drops_inaccessible_platforms_and_changes():
    access = {
        ("S1", "victoria"): True,
        ("S3", "victoria"): True,
        ("S2", "victoria"): True,
        ("S2", "jubilee"): True,
        ("S4", "jubilee"): False,
    }
    graph = build_graph(NETWORK, ADJACENCY, access, transfers=set())
    t = times_from(graph, "S1")
    assert math.isfinite(t["S3"])
    # No step-free platform at S4, and no step-free change at S2 (but S2's Jubilee platform is
    # step-free from the street, so S1 -> S2 -> street -> Jubilee is still possible).
    assert math.isinf(t["S4"])
    with_change = build_graph(NETWORK, ADJACENCY, {**access, ("S4", "jubilee"): True}, set())
    t = times_from(with_change, "S1")
    assert math.isclose(
        t["S4"],
        4 * DEFAULTS["access_step_free"]
        + ride("victoria", "S1", "S2")
        + ride("jubilee", "S2", "S4"),
    )


def test_read_adjacency_takes_consecutive_pairs_of_every_route(tmp_path):
    for line in PARAMS:
        if line.startswith("pace:"):
            routes = [{"naptanIds": ["S1", "X", "S2", "S3"]}, {"naptanIds": ["S3", "S1"]}]
            payload = {"orderedLineRoutes": routes if line == "pace:victoria" else []}
            path = tmp_path / f"route-{line.removeprefix('pace:')}.json.gz"
            path.write_bytes(gzip.compress(json.dumps(payload).encode()))
    pairs = read_adjacency(tmp_path, {"S1", "S2", "S3"})
    # Unknown stops (X) are skipped, so S1 and S2 become neighbours; S3 -> S1 is an express.
    assert pairs["victoria"] == {("S1", "S2"), ("S2", "S3"), ("S3", "S1")}
    assert pairs["jubilee"] == set()


def test_fit_recovers_times_generated_by_the_model():
    graph = build_graph(NETWORK, ADJACENCY)
    truth = default_theta() * 1.4
    pairs = [(a, b) for a in ("S1", "S2", "S3", "S4") for b in WHERE if a != b]
    observations = [Observation(a, b, 0.0, frozenset()) for a, b in pairs]
    minutes = predict(graph, truth, observations)
    observations = [
        Observation(a, b, float(m), frozenset()) for (a, b), m in zip(pairs, minutes, strict=True)
    ]
    theta = fit([Sample("standard", graph, observations)])
    error = np.abs(predict(graph, theta, observations) - minutes)
    assert error.mean() < 0.1


def test_read_observations_keeps_one_scenario_and_its_modes(tmp_path):
    records = tmp_path / "records.jsonl"
    rows = [
        {
            "origin": "S1",
            "destination": "S2",
            "scenario": "standard",
            "status": 200,
            "minutes": 12,
            "legs": [{"mode": "walking"}, {"mode": "tube"}],
        },
        {
            "origin": "S1",
            "destination": "S3",
            "scenario": "standard",
            "status": 200,
            "minutes": 20,
            "legs": [{"mode": "bus"}],
        },
        {
            "origin": "S1",
            "destination": "S2",
            "scenario": "step-free",
            "status": 404,
            "minutes": None,
            "legs": [],
        },
        {"origin": "S1", "destination": "S4", "scenario": "standard", "status": 500},
    ]
    records.write_text("\n".join(json.dumps(r) for r in rows))
    standard = read_observations(records, "standard")
    assert [(o.destination, o.minutes) for o in standard] == [("S2", 12.0), ("S3", 20.0)]
    assert [is_rail_only(o) for o in standard] == [True, False]
    (no_route,) = read_observations(records, "step-free")
    assert math.isnan(no_route.minutes) and not is_rail_only(no_route)


def test_scores_leave_unreachable_journeys_out_of_the_error():
    result = scores(np.array([10.0, 14.0, np.inf]), np.array([12.0, 12.0, 30.0]))
    assert result == {
        "n": 3,
        "unreachable": 1,
        "mae": 2.0,
        "mape": 16.7,
        "bias": 0.0,
        "within_5_min": 100.0,
    }


def test_scores_of_nothing_are_just_counts():
    assert scores(np.array([np.inf]), np.array([30.0])) == {"n": 1, "unreachable": 1}
    assert scores(np.array([]), np.array([])) == {"n": 0, "unreachable": 0}
