import math

import numpy as np

from mind_the_step.equity import (
    CAP_MINUTES,
    _age,
    benjamini_hochberg,
    door_to_station,
    knn_weights,
    lisa,
    morans_i,
    ols_hc1,
    penalties,
    tertile,
)


def test_door_to_station_is_a_min_plus_product():
    walk = np.array([[1.0, np.inf], [5.0, 2.0]])
    between = np.array([[0.0, 10.0], [7.0, 0.0]])
    assert door_to_station(walk, between, chunk=1).tolist() == [[1.0, 11.0], [5.0, 2.0]]


def test_penalties_censor_and_weight():
    standard = np.array([[10.0, 20.0]])
    step_free = np.array([[10.0, np.inf]])
    extra, gap, unreachable = penalties(standard, step_free, np.array([3.0, 1.0]))
    # Only the second destination costs extra: CAP - 20, a quarter of the weight.
    assert math.isclose(extra[0], (CAP_MINUTES - 20) / 4)
    # Both are within TAU standard; only the first step-free.
    assert math.isclose(gap[0], 0.25)
    assert math.isclose(unreachable[0], 0.25)


def test_benjamini_hochberg_step_up():
    p = np.array([0.01, 0.04, 0.03, 0.2])
    # Sorted: 0.01 <= .0125, 0.03 <= .025? no, 0.04 <= .0375? no -> only the first.
    assert benjamini_hochberg(p, 0.05).tolist() == [True, False, False, False]
    assert benjamini_hochberg(np.array([0.01, 0.02]), 0.05).tolist() == [True, True]


def test_tertile_and_age_band():
    assert tertile(np.arange(9.0)).tolist() == [0, 0, 0, 1, 1, 1, 2, 2, 2]
    assert _age("Age: Aged 65 to 69 years") == 65
    assert _age("Age: Aged 85 years and over") == 85


def test_ols_recovers_a_standardised_slope():
    rng = np.random.default_rng(1)
    x = rng.normal(size=500)
    noise = rng.normal(size=500)
    y = 2 * x + noise * 0.01
    fit = ols_hc1(y, {"x": x, "noise": noise})
    assert fit["coefficients"]["x"]["beta"] > 0.99
    assert abs(fit["coefficients"]["noise"]["beta"]) < 0.02
    assert fit["r2"] > 0.99


def test_spatial_clusters_found_on_a_clustered_grid():
    # Two 10 x 10 halves: high values on the left, low on the right.
    lat, lon = (a.ravel() for a in np.mgrid[51.4:51.5:20j, -0.2:0.0:20j])
    values = np.where(lon < -0.1, 10.0, 0.0) + np.random.default_rng(2).normal(size=400) * 0.1
    neighbours = knn_weights(lat, lon)
    assert neighbours.shape == (400, 8)
    assert morans_i(values, neighbours) > 0.8
    quadrant, _, moran, p = lisa(values, neighbours, np.random.default_rng(3))
    assert moran > 0.8 and p < 0.01
    assert (quadrant[lon < -0.15] == "HH").mean() > 0.9
    assert (quadrant[lon > -0.05] == "LL").mean() > 0.9
