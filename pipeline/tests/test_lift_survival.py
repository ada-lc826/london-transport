import math

from mind_the_step.lift_survival import build, outages

T = [f"2026-10-20T{h:02d}:00:00Z" for h in range(10)]


def test_midpoint_duration_and_censoring():
    present = [False, True, True, False, False, False, False, False, True, True]
    first, second = outages(T, present)
    # Out at 01:00 and 02:00, not at 00:00 or 03:00: between 1 h and 3 h, so 2 h.
    assert first["observed"] and math.isclose(first["hours"], 2.0)
    assert not first["leftTruncated"]
    # Still out at the last sample: censored at the 1 h seen so far.
    assert not second["observed"] and math.isclose(second["hours"], 1.0)


def test_a_single_missing_sample_does_not_split_an_outage():
    present = [False, True, False, True, False, False, False, False, False, False]
    assert len(outages(T, present)) == 1
    assert len(outages(T, present, max_gap=0)) == 2


def test_outage_under_way_at_the_first_sample_is_flagged():
    present = [True, True, False] + [False] * 7
    (only,) = outages(T, present)
    assert only["leftTruncated"]


def test_build_groups_and_models():
    # Two stations: a tube one with two lifts fixed fast, a rail one with one lift fixed slowly.
    times = [f"2026-10-{20 + d // 24:02d}T{d % 24:02d}:00:00Z" for d in range(24 * 6)]
    records = []
    for k in range(len(times)):
        out = []
        if k % 12 in (1, 2):
            out.append({"disruptedLiftUniqueIds": ["940GZZLUAAA-Lift-1"]})
        if k % 12 in (5,):
            out.append({"disruptedLiftUniqueIds": ["940GZZLUAAA-Lift-2"]})
        if k % 40 in range(3, 23):
            out.append({"disruptedLiftUniqueIds": ["910GBBB-Lift-1"]})
        if k % 30 in range(4, 12):
            out.append({"disruptedLiftUniqueIds": ["910GCCC-Lift-1"]})
        if k % 10 in (7,):
            out.append({"disruptedLiftUniqueIds": ["940GZZLUDDD-Lift-1"]})
        if k % 50 in range(10, 15):
            out.append({"disruptedLiftUniqueIds": ["910GEEE-Lift-1"]})
            out.append({"disruptedLiftUniqueIds": ["910GEEE-Lift-2"]})
        records.append(out)
    station_of = {
        "940GZZLUAAA-Lift-1": "940GZZLUAAA",
        "940GZZLUAAA-Lift-2": "940GZZLUAAA",
        "910GBBB-Lift-1": "910GBBB",
        "910GCCC-Lift-1": "910GCCC",
        "940GZZLUDDD-Lift-1": "940GZZLUDDD",
        "910GEEE-Lift-1": "910GEEE",
        "910GEEE-Lift-2": "910GEEE",
    }
    report = build(times, records, station_of, critical={"940GZZLUAAA-Lift-1"})
    km = report["km"]
    assert km["underground"]["medianHours"] < km["otherModes"]["medianHours"]
    assert km["all"]["n"] == km["underground"]["n"] + km["otherModes"]["n"]
    assert km["all"]["curve"][0] == 1.0
    assert report["cox"]["underground"]["hazardRatio"] > 1
    assert report["outages"]["ongoing"] >= 0
    assert report["coxPenalizer"] == 0.0


def test_collinear_covariates_fall_back_to_a_penalised_fit():
    times = [f"2026-10-{20 + d // 24:02d}T{d % 24:02d}:00:00Z" for d in range(24 * 4)]
    records = [
        ([{"disruptedLiftUniqueIds": ["940GZZLUAAA-Lift-1"]}] if k % 12 in (1, 2) else [])
        + ([{"disruptedLiftUniqueIds": ["910GBBB-Lift-1"]}] if k % 30 in range(3, 13) else [])
        for k in range(len(times))
    ]
    # The tube station has two lifts, the rail one one: single-lift and Underground split
    # the outages identically.
    station_of = {
        "940GZZLUAAA-Lift-1": "940GZZLUAAA",
        "940GZZLUAAA-Lift-2": "940GZZLUAAA",
        "910GBBB-Lift-1": "910GBBB",
    }
    report = build(times, records, station_of, critical=set())
    # Nothing cuts access: that covariate cannot be estimated, and the other two are the
    # same split of the outages, so the fit needs the penalty.
    assert report["cox"]["cutsAccess"]["hazardRatio"] is None
    assert report["coxPenalizer"] > 0
    assert report["km"]["cutsAccess"]["n"] == 0
