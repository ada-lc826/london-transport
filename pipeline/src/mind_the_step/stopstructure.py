"""Probe TfL's Stop Structure (station topology) API.

``/jp_public/api10/XML_STOPSTRUCTURE_REQUEST`` returns a station's areas (entrances,
concourses, ticket halls, platforms) and the footpaths between them, including whether a
path uses lifts, escalators or stairs. That is enough to work out step-free routes from the
street to each platform ourselves, which the Unified API's stop point attributes (present
for only 82 of 272 tube stations) cannot give us.

Responses are stored verbatim (gzipped), one file per station; ``stepfree.py`` derives
step-free status from them. Parameter names follow the EFA interface the API is built on;
the NaPTAN id and the ICS code return identical responses.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import httpx

from .accessibility import manifest_entry
from .lifts import API_HOST, fetch

ENDPOINT = f"https://{API_HOST}/jp_public/api10/XML_STOPSTRUCTURE_REQUEST"

BASE_PARAMS = {
    "sSInclSP": "1",  # include platforms
    "sSInclSL": "1",  # include the lines serving each platform
    "sSFEA": "1",  # drop empty areas
    "coordOutputFormat": "WGS84[dd.ddddd]",
    "outputFormat": "rapidJSON",
}


def station_queries(stop_points_payload) -> dict[str, list[str]]:
    """NaPTAN id -> ids to try, in order, for the stations in a ``/StopPoint/Mode`` response.

    Stations that share an interchange with other modes (Bank, Euston, Stratford...) return
    an empty structure for their own id; theirs is filed under the hub (``HUB...``). The ICS
    code is a last resort.
    """
    stops = (stop_points_payload or {}).get("stopPoints", [])
    queries = {}
    for sp in stops:
        naptan = sp.get("naptanId")
        if sp.get("stopType") not in ("NaptanMetroStation", "NaptanRailStation"):
            continue
        if not isinstance(naptan, str) or not naptan.isalnum():
            continue
        candidates = [naptan, sp.get("hubNaptanCode"), sp.get("icsCode")]
        queries[naptan] = [
            c for c in dict.fromkeys(candidates) if isinstance(c, str) and c.isalnum()
        ]
    return dict(sorted(queries.items()))


def _has_areas(body: bytes) -> bool:
    try:
        return bool((json.loads(body).get("stop") or {}).get("areas"))
    except (ValueError, AttributeError):
        return False


def fetch_all(
    client: httpx.Client, app_key: str, day_dir: Path, files: dict, queries: dict[str, list[str]]
) -> None:
    """Fetch each station's topology into ``stopstructure/<naptanId>.json.gz``.

    Tries each candidate id until one returns areas; the manifest records which one did, or
    that none did (the last response is still saved).
    """
    out = day_dir / "stopstructure"
    out.mkdir(parents=True, exist_ok=True)
    for naptan, candidates in queries.items():
        entry, body = None, None
        for stop_id in candidates:
            url = str(httpx.URL(ENDPOINT, params={**BASE_PARAMS, "sSStopNr": stop_id}))
            result = fetch(client, app_key, url=url)
            entry = manifest_entry(url, result)
            entry["queried_as"] = stop_id
            if result.body is None:
                continue
            body = result.body
            if _has_areas(body):
                break
        else:
            if entry is not None and body is not None:
                entry["empty"] = True
        name = f"{naptan}.json.gz"
        if entry is not None:
            entry["ok"] = body is not None
            files[f"stopstructure/{name}"] = entry
        if body is not None:
            with gzip.open(out / name, "wb") as f:
                f.write(body)
