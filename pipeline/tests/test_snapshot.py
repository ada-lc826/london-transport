import gzip
import json
from datetime import UTC, datetime

import httpx

from mind_the_step import lifts, snapshot

NOW = datetime(2026, 10, 19, 9, 0, tzinfo=UTC)
OPEN_DATA_HTML = '<a href="https://content.tfl.gov.uk/topology.zip">Station topology files</a>'


def fake_tfl(failing: set[str] = frozenset()):
    seen = []
    requests = []

    def handler(request: httpx.Request):
        path = request.url.path
        seen.append(path)
        requests.append(request)
        if path in failing:
            return httpx.Response(404)
        if path.startswith("/StopPoint/Mode/"):
            stop = {"naptanId": path[-4:], "stopType": "NaptanMetroStation"}
            return httpx.Response(200, json={"stopPoints": [stop]})
        if path.startswith("/Line/Mode/"):
            return httpx.Response(
                200, json=[{"id": "victoria"}, {"id": "elizabeth"}, {"id": "../x"}]
            )
        if path.endswith("/Route/Sequence/all"):
            return httpx.Response(200, json={"lineId": path.split("/")[2]})
        if path == "/info-for/open-data-users/our-open-data":
            return httpx.Response(200, text=OPEN_DATA_HTML)
        if path == "/topology.zip":
            return httpx.Response(200, content=b"PK zip")
        if path == "/api/records/18313509":
            files = [
                {
                    "key": "stations.csv",
                    "size": 10,
                    "links": {"self": "https://zenodo.org/f/s.csv"},
                },
                {"key": "huge.zip", "size": 10**9, "links": {"self": "https://zenodo.org/f/h.zip"}},
            ]
            return httpx.Response(200, json={"files": files})
        if path == "/jp_public/api10/XML_STOPSTRUCTURE_REQUEST":
            return httpx.Response(200, text=f"<ss stop='{request.url.params['sSStopNr']}'/>")
        if path == "/f/s.csv":
            return httpx.Response(200, text="station,step_free\n")
        return httpx.Response(500)

    return httpx.Client(transport=httpx.MockTransport(handler)), seen, requests


def no_sleep(monkeypatch):
    original = lifts.fetch
    monkeypatch.setattr(
        snapshot,
        "fetch",
        lambda client, key, **kw: original(client, key, sleep=lambda s: None, **kw),
    )


def test_snapshot_writes_every_file_and_a_manifest(tmp_path, monkeypatch):
    no_sleep(monkeypatch)
    client, seen, requests = fake_tfl()
    manifest = snapshot.snapshot(client, "k", tmp_path, NOW)

    day = tmp_path / "snapshots" / "2026-10-19"
    names = sorted(p.name for p in day.iterdir())
    assert names == sorted(
        [f"stoppoints-{m}.json.gz" for m in snapshot.MODES]
        + ["lines.json.gz", "route-victoria.json.gz", "route-elizabeth.json.gz", "manifest.json"]
        + ["accessibility", "crosscheck", "stopstructure"]
    )
    # One topology file per tube station, fetched by NaPTAN id.
    with gzip.open(day / "stopstructure" / "tube.json.gz", "rt") as f:
        assert f.read() == "<ss stop='tube'/>"
    assert len(list((day / "stopstructure").iterdir())) == 1
    crosscheck = sorted(p.name for p in (day / "crosscheck").iterdir())
    assert crosscheck == ["stations.csv", "zenodo-record.json"]
    assert (day / "accessibility" / "topology.zip").read_bytes() == b"PK zip"
    assert manifest["files"]["accessibility/topology.zip"]["link_text"] == "Station topology files"
    with gzip.open(day / "route-victoria.json.gz", "rt") as f:
        assert json.load(f) == {"lineId": "victoria"}
    assert all(entry["ok"] for entry in manifest["files"].values())
    assert json.loads((day / "manifest.json").read_text()) == manifest
    # Line ids from the response are only used in URLs when they look like ids.
    assert not any(".." in path for path in seen)
    # The API key only goes to the Unified API.
    for request in requests:
        has_key = "app_key" in request.url.params
        assert has_key == (request.url.host == "api.tfl.gov.uk"), request.url


def test_snapshot_records_failures(tmp_path, monkeypatch):
    no_sleep(monkeypatch)
    client, _, _ = fake_tfl(failing={"/StopPoint/Mode/dlr"})
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


def test_main_tolerates_best_effort_failures(tmp_path, monkeypatch):
    monkeypatch.setenv("TFL_APP_KEY", "k")
    files = {
        "lines": {"ok": True, "status": 200},
        "accessibility/open-data-page.html": {"ok": False, "status": 403},
        "crosscheck/zenodo-record.json": {"ok": False, "status": None},
    }
    monkeypatch.setattr(snapshot, "snapshot", lambda client, key, out, now: {"files": files})
    assert snapshot.main(["--out", str(tmp_path)]) == 0
