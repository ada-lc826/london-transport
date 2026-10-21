import json
from pathlib import Path

from mind_the_step.lift_outages import build, read_samples, short_message, spells

TOPOLOGY = Path(__file__).parent / "fixtures" / "topology"
NETWORK = {"stations": [{"id": "940GZZA", "name": "Alpha"}, {"id": "940GZZB", "name": "Beta"}]}
LIFT_OUT = [
    {
        "stationUniqueId": "940GZZA",
        "disruptedLiftUniqueIds": ["940GZZA-Lift-1"],
        "message": "ALPHA STATION: No Step Free Access - Step free access is not available "
        "due to a faulty lift. Call us on 0343 222 1234 if you need help planning your journey.",
    }
]


def test_spells_finds_runs():
    assert spells([True, True, False, True]) == [(0, 1), (3, 3)]
    assert spells([False, False]) == []


def test_short_message_keeps_what_matters():
    assert short_message(LIFT_OUT[0]["message"]) == (
        "Step free access is not available due to a faulty lift."
    )
    long = "STATION: " + "word " * 60
    assert short_message(long).endswith("…") and len(short_message(long)) <= 141


def test_build_downgrades_a_station_while_its_lift_is_out():
    # Alpha is partial on paper (fixture: Plat2 has no step-free path); with its only lift
    # out it has none.
    result = build(["t0", "t1", "t2"], [[], LIFT_OUT, []], TOPOLOGY, NETWORK)
    (station,) = result["stations"]
    assert (station["id"], station["paper"]) == ("940GZZA", "partial")
    assert station["status"] == ["partial", "none", "partial"]
    assert station["message"].startswith("Step free access is not available")
    assert result["downgraded"] == [0, 1, 0]
    assert result["outages"] == [
        {"lift": "940GZZA-Lift-1", "first": 1, "last": 1, "fromStart": False, "ongoing": False}
    ]


def test_read_samples_skips_failures_and_reuses_payloads(tmp_path):
    (tmp_path / "lifts" / "payloads").mkdir(parents=True)
    (tmp_path / "lifts" / "log").mkdir()
    (tmp_path / "lifts" / "payloads" / "abc.json").write_text(json.dumps(LIFT_OUT))
    lines = [
        {"ts": "t0", "ok": True, "sha256": "abc"},
        {"ts": "t1", "ok": False, "sha256": None},
        {"ts": "t2", "ok": True, "sha256": "abc"},
    ]
    (tmp_path / "lifts" / "log" / "2026-10-21.jsonl").write_text(
        "\n".join(json.dumps(line) for line in lines)
    )
    times, records, failed = read_samples(tmp_path)
    assert (times, failed) == (["t0", "t2"], 1)
    assert records[0] == LIFT_OUT
