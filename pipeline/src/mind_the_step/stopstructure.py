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


def station_ids(stop_points_payload) -> list[str]:
    """NaPTAN ids of the stations in a ``/StopPoint/Mode`` response."""
    stops = (stop_points_payload or {}).get("stopPoints", [])
    return sorted(
        sp["naptanId"]
        for sp in stops
        if sp.get("stopType") in ("NaptanMetroStation", "NaptanRailStation")
        and isinstance(sp.get("naptanId"), str)
        and sp["naptanId"].isalnum()
    )


def fetch_all(
    client: httpx.Client, app_key: str, day_dir: Path, files: dict, naptan_ids: list[str]
) -> None:
    """Fetch each station's topology into ``stopstructure/<naptanId>.json.gz``."""
    out = day_dir / "stopstructure"
    out.mkdir(parents=True, exist_ok=True)
    for naptan in naptan_ids:
        url = str(httpx.URL(ENDPOINT, params={**BASE_PARAMS, "sSStopNr": naptan}))
        result = fetch(client, app_key, url=url)
        name = f"{naptan}.json.gz"
        files[f"stopstructure/{name}"] = manifest_entry(url, result)
        if result.body is not None:
            with gzip.open(out / name, "wb") as f:
                f.write(result.body)
