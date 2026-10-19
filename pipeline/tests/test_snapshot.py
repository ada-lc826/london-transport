import gzip
import json
from datetime import UTC, datetime

import httpx

from mind_the_step import lifts, snapshot

NOW = datetime(2026, 10, 19, 9, 0, tzinfo=UTC)


def fake_tfl(failing: set[str] = frozenset()):
    seen = []

    def handler(request: httpx.Request):
        path = request.url.path
        seen.append(path)
        if path in failing:
            return httpx.Response(404)
        if path.startswith("/StopPoint/Mode/"):
            return httpx.Response(200, json={"stopPoints": [{"naptanId": path[-4:]}]})
        if path.startswith("/Line/Mode/"):
            return httpx.Response(
                200, json=[{"id": "victoria"}, {"id": "elizabeth"}, {"id": "../x"}]
            )
        if path.endswith("/Route/Sequence/all"):
            return httpx.Response(200, json={"lineId": path.split("/")[2]})
        return httpx.Response(500)

    return httpx.Client(transport=httpx.MockTransport(handler)), seen


def no_sleep(monkeypatch):
    original = lifts.fetch
    monkeypatch.setattr(
        snapshot,
        "fetch",
        lambda client, key, **kw: original(client, key, sleep=lambda s: None, **kw),
    )


def test_snapshot_writes_every_file_and_a_manifest(tmp_path, monkeypatch):
    no_sleep(monkeypatch)
    client, seen = fake_tfl()
    manifest = snapshot.snapshot(client, "k", tmp_path, NOW)

    day = tmp_path / "snapshots" / "2026-10-19"
    names = sorted(p.name for p in day.iterdir())
    assert names == sorted(
        [f"stoppoints-{m}.json.gz" for m in snapshot.MODES]
        + ["lines.json.gz", "route-victoria.json.gz", "route-elizabeth.json.gz", "manifest.json"]
    )
    with gzip.open(day / "route-victoria.json.gz", "rt") as f:
        assert json.load(f) == {"lineId": "victoria"}
    assert all(entry["ok"] for entry in manifest["files"].values())
    assert json.loads((day / "manifest.json").read_text()) == manifest
    # Line ids from the response are only used in URLs when they look like ids.
    assert not any(".." in path for path in seen)


def test_snapshot_records_failures(tmp_path, monkeypatch):
    no_sleep(monkeypatch)
    client, _ = fake_tfl(failing={"/StopPoint/Mode/dlr"})
    manifest = snapshot.snapshot(client, "k", tmp_path, NOW)
    entry = manifest["files"]["stoppoints-dlr"]
    assert entry["ok"] is False and entry["status"] == 404
    assert not (tmp_path / "snapshots" / "2026-10-19" / "stoppoints-dlr.json.gz").exists()


def test_main_fails_on_partial_snapshot(tmp_path, monkeypatch):
    monkeypatch.setenv("TFL_APP_KEY", "k")
    monkeypatch.setattr(
        snapshot,
        "snapshot",
        lambda client, key, out, now: {
            "files": {"a": {"ok": True, "status": 200}, "b": {"ok": False, "status": 503}}
        },
    )
    assert snapshot.main(["--out", str(tmp_path)]) == 1


def test_main_requires_key(tmp_path, monkeypatch):
    monkeypatch.delenv("TFL_APP_KEY", raising=False)
    assert snapshot.main(["--out", str(tmp_path)]) == lifts.EXIT_CONFIG_ERROR
