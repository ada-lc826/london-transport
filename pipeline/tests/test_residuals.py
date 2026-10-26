import math

import numpy as np

from mind_the_step.calibrate import Observation
from mind_the_step.residuals import (
    CAP,
    END_FEATURES,
    FEATURES,
    blocks,
    build_rows,
    cross_validate,
    stops_within,
)


def test_stops_within_counts_by_great_circle_distance():
    # 0.003 degrees of latitude is about 334 m.
    stops = np.radians(np.array([[51.5, -0.1], [51.503, -0.1], [51.51, -0.1]]))
    assert stops_within(stops, 51.5, -0.1, 400) == 2
    assert stops_within(stops, 51.5, -0.1, 100) == 1


def test_blocks_group_nearby_points_together():
    labels = blocks([(51.50, -0.10), (51.501, -0.101), (51.60, -0.30)], km=5)
    assert labels[0] == labels[1] != labels[2]


def test_build_rows_caps_unreachable_and_skips_no_route():
    ends = {s: {f: 0.0 for f in END_FEATURES} for s in "AB"}
    where = {"A": (51.5, -0.1), "B": (51.52, -0.1)}
    standard = np.array([[0.0, 10.0], [10.0, 0.0]])
    step_free = np.array([[0.0, np.inf], [30.0, 0.0]])
    observations = [
        Observation("A", "B", 40.0, frozenset({"bus"})),
        Observation("B", "A", 25.0, frozenset({"tube"})),
        Observation("A", "B", float("nan"), frozenset()),
    ]
    x, y, kept = build_rows(observations, standard, step_free, {"A": 0, "B": 1}, where, ends)
    assert len(kept) == 2 and x.shape == (2, len(FEATURES))
    # A to B has no step-free tube route: capped, flagged, and the bus saves CAP - 40.
    assert y.tolist() == [CAP - 40.0, 5.0]
    assert x[0, FEATURES.index("no_step_free_tube")] == 1.0
    assert math.isclose(x[0, FEATURES.index("trip_km")], 2.224, rel_tol=0.01)


def test_cross_validate_beats_baselines_on_a_learnable_residual():
    rng = np.random.default_rng(0)
    x = rng.uniform(0, 10, size=(600, len(FEATURES)))
    y = 3 * x[:, 0] + rng.normal(size=600)
    groups = [str(i % 6) for i in range(600)]
    result = cross_validate(x, y, groups)
    assert result["folds"] == 6 and len(result["oof"]) == 600
    mae = result["mae"]
    assert mae["lightgbm"] < mae["constant"] < mae["tubeOnly"]
