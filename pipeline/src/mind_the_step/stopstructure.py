"""Probe TfL's Stop Structure (station topology) API.

``/jp_public/api10/XML_STOPSTRUCTURE_REQUEST`` returns a station's areas (entrances,
concourses, ticket halls, platforms) and the footpaths between them, including whether a
path uses lifts, escalators or stairs. That is enough to work out step-free routes from the
street to each platform ourselves, which the Unified API's stop point attributes (present
for only 82 of 272 tube stations) cannot give us.

Its response format is not documented publicly, so this first stage only fetches a few
stations whose step-free status is well known, in several parameter variants, and stores the
raw responses for inspection. Parameter names follow the EFA interface it is built on.
"""

from __future__ import annotations

from pathlib import Path

import httpx

from .accessibility import manifest_entry
from .lifts import API_HOST, fetch

ENDPOINT = f"https://{API_HOST}/jp_public/api10/XML_STOPSTRUCTURE_REQUEST"

# (naptanId, icsCode, label): two step-free stations, three that are not.
PROBE_STATIONS = [
    ("940GZZLUWSM", "1000266", "westminster"),  # step-free
    ("940GZZLUGPK", "1000093", "green-park"),  # step-free
    ("940GZZLUSKS", "1000212", "south-kensington"),  # not step-free until ~2031
    ("940GZZLUBST", "1000011", "baker-street"),  # not step-free
    ("940GZZLUWYP", "1000257", "wembley-park"),  # step-free
]

BASE_PARAMS = {
    "sSInclSP": "1",  # include platforms
    "sSInclSL": "1",  # include the lines serving each platform
    "sSFEA": "1",  # drop empty areas
    "coordOutputFormat": "WGS84[dd.ddddd]",
}


def probe_variants(naptan: str, ics: str) -> dict[str, tuple[dict, str]]:
    """Variant name -> (query parameters, file extension)."""
    return {
        "naptan-json": ({**BASE_PARAMS, "sSStopNr": naptan, "outputFormat": "rapidJSON"}, "json"),
        "naptan-xml": ({**BASE_PARAMS, "sSStopNr": naptan}, "xml"),
        "ics-json": ({**BASE_PARAMS, "sSStopNr": ics, "outputFormat": "rapidJSON"}, "json"),
    }


def probe(client: httpx.Client, app_key: str, day_dir: Path, files: dict) -> None:
    out = day_dir / "stopstructure"
    out.mkdir(parents=True, exist_ok=True)
    for naptan, ics, label in PROBE_STATIONS:
        for variant, (params, ext) in probe_variants(naptan, ics).items():
            url = str(httpx.URL(ENDPOINT, params=params))
            result = fetch(client, app_key, url=url)
            name = f"{label}-{variant}.{ext}"
            files[f"stopstructure/{name}"] = manifest_entry(url, result)
            if result.body is not None:
                (out / name).write_bytes(result.body)
