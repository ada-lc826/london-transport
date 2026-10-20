import gzip
import json
from datetime import date

import httpx

from mind_the_step import journeys

STATIONS = {"A": (51.5, -0.1), "B": (51.6, -0.2), "C": (51.4, 0.0)}
DAY = date(2026, 10, 27)


def journey(minutes, *legs):
    return {
        "duration": minutes,
        "legs": [
            {"duration": m, "mode": {"id": mode}, "routeOptions": [{"name": line}]}
            for mode, line, m in legs
        ],
    }


def test_next_weekday_is_a_tuesday_at_least_three_days_ahead():
    assert journeys.next_weekday(date(2026, 10, 20)) == date(2026, 10, 27)  # Tue -> next Tue
    assert journeys.next_weekday(date(2026, 10, 18)) == date(2026, 10, 27)  # Sun +3 = Wed
    assert journeys.next_weekday(date(2026, 10, 17)) == date(2026, 10, 20)  # Sat +3 = Tue


def test_summarise_keeps_the_fastest_journey():
    body = json.dumps(
        {
            "journeys": [
                journey(40, ("bus", "14", 40)),
                journey(25, ("walking", None, 5), ("tube", "Victoria", 15), ("walking", "", 5)),
            ]
        }
    ).encode()
    summary = journeys.summarise(body)
    assert summary["journeys"] == 2
    assert summary["minutes"] == 25
    assert summary["walk_minutes"] == 10
    assert [leg["mode"] for leg in summary["legs"]] == ["walking", "tube", "walking"]
    assert summary["legs"][1]["line"] == "Victoria"


def test_summarise_no_journey():
    assert journeys.summarise(json.dumps({"journeys": []}).encode()) == {"journeys": 0}
    assert journeys.summarise(None) == {"journeys": 0}
    assert journeys.summarise(b"<html>")["journeys"] == 0


def test_plan_requests_covers_both_scenarios_and_skips_self():
    requests = journeys.plan_requests(STATIONS, ["A", "missing"])
    assert requests == [
        ("A", "B", "standard"),
        ("A", "B", "step-free"),
        ("A", "C", "standard"),
        ("A", "C", "step-free"),
    ]


def test_rate_limiter_spaces_calls():
    now = [0.0]
    slept = []

    def sleep(seconds):
        slept.append(seconds)

    limiter = journeys.RateLimiter(60, clock=lambda: now[0], sleep=sleep)
    for _ in range(3):
        limiter.wait()
    assert slept == [1.0, 2.0]


class NoWait:
    def wait(self):
        pass


def test_run_batch_records_and_resumes(tmp_path):
    seen = []

    def handler(request: httpx.Request):
        seen.append(request)
        step_free = request.url.params.get("accessibilityPreference") == "StepFreeToPlatform"
        if request.url.path.endswith("/to/C") and step_free:
            return httpx.Response(500)
        minutes = 50 if step_free else 20
        return httpx.Response(200, json={"journeys": [journey(minutes, ("tube", "X", minutes))]})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    original_fetch = journeys.fetch

    def fast_fetch(client, key, **kwargs):
        return original_fetch(client, key, sleep=lambda s: None, **kwargs)

    journeys.fetch = fast_fetch
    try:
        counts = journeys.run_batch(
            client, "k", tmp_path, STATIONS, ["A"], DAY, "0830", limiter=NoWait(), workers=2
        )
        assert counts == {"planned": 4, "ok": 3, "failed": 1, "already_done": 0}
        first = seen[0]
        # Endpoints are stop ids, not coordinates.
        assert {r.url.path for r in seen} == {
            "/Journey/JourneyResults/A/to/B",
            "/Journey/JourneyResults/A/to/C",
        }
        assert first.url.params["date"] == "20261027"
        assert first.url.params["timeIs"] == "Departing"
        assert first.url.params["app_key"] == "k"

        with gzip.open(tmp_path / "records.jsonl.gz", "rt") as f:
            records = [json.loads(line) for line in f]
        by_key = {(r["destination"], r["scenario"]): r for r in records}
        assert by_key[("B", "standard")]["minutes"] == 20
        assert by_key[("B", "step-free")]["minutes"] == 50
        assert by_key[("C", "step-free")]["status"] == 500

        # A second run only retries the failure.
        seen.clear()
        counts = journeys.run_batch(
            client, "k", tmp_path, STATIONS, ["A"], DAY, "0830", limiter=NoWait()
        )
        assert counts["planned"] == 1 and counts["already_done"] == 3
    finally:
        journeys.fetch = original_fetch


def test_failure_message():
    assert journeys.failure_message(b'{"message": "No journey found"}') == "No journey found"
    assert journeys.failure_message(b"<html>oops") == "<html>oops"
    assert journeys.failure_message(None) is None
    assert journeys.failure_message(b'{"other": 1}') is None


def test_experiment_keeps_failure_bodies(tmp_path):
    def handler(request: httpx.Request):
        if "940GZZLUWLO" in request.url.path:
            return httpx.Response(404, json={"message": "Cannot find a route"})
        return httpx.Response(200, json={"journeys": [journey(18, ("tube", "District", 18))]})

    spec = tmp_path / "spec.json"
    spec.write_text(
        json.dumps(
            [
                {"name": "ok", "from": "51.5,-0.1", "to": "51.6,-0.2", "params": {}},
                {
                    "name": "fails",
                    "from": "51.5,-0.1",
                    "to": "940GZZLUWLO",
                    "params": {"accessibilityPreference": "StepFreeToPlatform"},
                },
            ]
        )
    )
    client = httpx.Client(transport=httpx.MockTransport(handler))
    manifest = journeys.experiment(client, "k", spec, tmp_path / "out", DAY)
    assert manifest["ok"]["minutes"] == 18
    assert manifest["fails"]["status"] == 404
    assert manifest["fails"]["message"] == "Cannot find a route"
    assert "StepFreeToPlatform" in manifest["fails"]["url"]
    saved = json.loads((tmp_path / "out" / "spec" / "fails.json").read_text())
    assert saved == {"message": "Cannot find a route"}
