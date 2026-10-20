from mind_the_step.journeys_export import build

SKS, STD = "940GZZLUSKS", "940GZZLUSTD"


def rec(origin, destination, scenario, status=200, minutes=None):
    return {
        "origin": origin,
        "destination": destination,
        "scenario": scenario,
        "date": "2026-10-27",
        "time": "0830",
        "status": status,
        "minutes": minutes,
    }


def test_build_pairs_scenarios_and_keeps_latest():
    asset = build(
        [
            rec(SKS, "A", "standard", minutes=10),
            rec(SKS, "A", "step-free", status=500),
            rec(SKS, "A", "step-free", minutes=35),  # retried later: wins
            rec(SKS, "B", "standard", minutes=20),
            rec(SKS, "B", "step-free"),  # 200 but no journey
            rec(STD, "A", "standard", status=429),
        ]
    )
    assert asset["origins"] == [SKS, STD]
    assert asset["times"][SKS] == {"A": [10, 35], "B": [20, None]}
    assert asset["times"][STD] == {"A": [None, None]}
    assert asset["source"]["requests"] == {"ok": 3, "no_route": 1, "failed": 1}
    assert asset["source"]["date"] == "2026-10-27"


def test_build_empty():
    asset = build([])
    assert asset["origins"] == [] and asset["source"]["date"] is None
