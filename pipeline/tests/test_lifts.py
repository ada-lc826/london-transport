import json
from datetime import UTC, datetime

import httpx
import pytest

from mind_the_step import lifts

KEY = "secret-key-123"
NOW = datetime(2026, 10, 19, 8, 7, 30, tzinfo=UTC)
PAYLOAD = [{"stationUniqueId": "HUBKGX", "message": "Lift out of service"}]


def client_for(*responses):
    """A client whose transport replays `responses` in order (an Exception is raised)."""
    queue = list(responses)
    seen = []

    def handler(request):
        seen.append(request)
        item = queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    return httpx.Client(transport=httpx.MockTransport(handler)), seen


def no_sleep(_seconds):
    pass


def test_fetch_sends_key_and_returns_body():
    client, seen = client_for(httpx.Response(200, json=PAYLOAD))
    result = lifts.fetch(client, KEY, sleep=no_sleep)
    assert result.status == 200
    assert json.loads(result.body) == PAYLOAD
    assert result.attempts == 1
    assert seen[0].url.params["app_key"] == KEY


def test_fetch_retries_transient_failures_with_backoff():
    delays = []
    client, _ = client_for(
        httpx.ConnectError("boom"),
        httpx.Response(503),
        httpx.Response(429),
        httpx.Response(200, json=PAYLOAD),
    )
    result = lifts.fetch(client, KEY, sleep=delays.append)
    assert result.status == 200
    assert result.attempts == 4
    assert delays == [2.0, 4.0, 8.0]


def test_fetch_does_not_retry_client_errors():
    client, seen = client_for(httpx.Response(401))
    result = lifts.fetch(client, KEY, sleep=no_sleep)
    assert result.body is None
    assert result.status == 401
    assert len(seen) == 1


def test_fetch_scrubs_key_from_errors():
    client, _ = client_for(*[httpx.ConnectError(f"failed GET ?app_key={KEY}")] * 4)
    result = lifts.fetch(client, KEY, sleep=no_sleep)
    assert result.body is None
    assert KEY not in result.error
    assert "***" in result.error


def test_record_stores_payload_once_and_logs_every_run(tmp_path):
    body = json.dumps(PAYLOAD).encode()
    first = lifts.record(lifts.FetchResult(200, body, 1, 120), tmp_path, NOW)
    second = lifts.record(lifts.FetchResult(200, body, 1, 95), tmp_path, NOW)

    assert first["ok"] and first["n_records"] == 1
    assert first["sha256"] == second["sha256"]
    payloads = list((tmp_path / "lifts" / "payloads").iterdir())
    assert len(payloads) == 1
    assert json.loads(payloads[0].read_text()) == PAYLOAD

    log = (tmp_path / "lifts" / "log" / "2026-10-19.jsonl").read_text().splitlines()
    assert [json.loads(line)["elapsed_ms"] for line in log] == [120, 95]
    assert json.loads(log[0])["ts"] == "2026-10-19T08:07:30+00:00"


def test_record_hash_ignores_key_order(tmp_path):
    a = lifts.record(lifts.FetchResult(200, b'{"a": 1, "b": 2}', 1, 1), tmp_path, NOW)
    b = lifts.record(lifts.FetchResult(200, b'{"b": 2, "a": 1}', 1, 1), tmp_path, NOW)
    assert a["sha256"] == b["sha256"]


def test_record_logs_failures(tmp_path):
    line = lifts.record(lifts.FetchResult(503, None, 4, 30000, "HTTP 503"), tmp_path, NOW)
    assert line["ok"] is False and line["error"] == "HTTP 503"
    assert not (tmp_path / "lifts" / "payloads").exists()
    assert (tmp_path / "lifts" / "log" / "2026-10-19.jsonl").exists()


def test_record_rejects_non_json(tmp_path):
    line = lifts.record(lifts.FetchResult(200, b"<html>", 1, 10), tmp_path, NOW)
    assert line["ok"] is False
    assert line["error"] == "response is not valid JSON"


def test_main_requires_key(tmp_path, monkeypatch):
    monkeypatch.delenv("TFL_APP_KEY", raising=False)
    assert lifts.main(["--out", str(tmp_path)]) == lifts.EXIT_CONFIG_ERROR


@pytest.mark.parametrize(("status", "code"), [(200, 0), (503, 0), (403, lifts.EXIT_CONFIG_ERROR)])
def test_main_exit_codes(tmp_path, monkeypatch, status, code):
    monkeypatch.setenv("TFL_APP_KEY", KEY)
    body = json.dumps(PAYLOAD).encode() if status == 200 else None
    result = lifts.FetchResult(status, body, 1, 1, None if body else f"HTTP {status}")
    monkeypatch.setattr(lifts, "fetch", lambda client, key: result)
    assert lifts.main(["--out", str(tmp_path)]) == code


def test_fetch_keeps_existing_query_parameters():
    client, seen = client_for(httpx.Response(200, json=PAYLOAD))
    lifts.fetch(client, KEY, url="https://api.tfl.gov.uk/x?a=1&b=two", sleep=no_sleep)
    assert dict(seen[0].url.params) == {"a": "1", "b": "two", "app_key": KEY}
