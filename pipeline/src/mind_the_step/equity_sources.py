"""Fetch the open data S4 (Who pays) joins to the network model, to the `data` branch.

- Census 2021 TS038 (disability, Equality Act definition) and TS007A (age in five-year bands),
  Nomis bulk files: ``census2021-<table>.zip``, one CSV per geography inside.
- English Indices of Deprivation 2025, MHCLG on GOV.UK: the attachment links are read from
  GOV.UK's content API for the statistics page, so we need not know the asset URLs ahead.
  We keep File 7 (every score, rank and decile, with population denominators) when it is
  there, else File 1 (the IMD).
- MSOA (December 2021) population weighted centroids, ONS Open Geography Portal: the ArcGIS
  service is found by name in ONS's service directory, then paged out as GeoJSON.

Every source is attempted; what was found (attachment titles, service names) is written to
``equity/raw/manifest.json`` either way, so a failed run says where to look.

    uv run python -m mind_the_step.equity_sources --out <data-branch>
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

import httpx

NOMIS = "https://www.nomisweb.co.uk/output/census/2021/census2021-{table}.zip"
CENSUS_TABLES = ("ts038", "ts007a")
IOD_PAGE = (
    "https://www.gov.uk/api/content/government/statistics/english-indices-of-deprivation-2025"
)
ONS_SERVICES = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services"
MSOA_PWC = re.compile(r"^(MSOA|MLSOA).*(Dec|December)_?2021.*PWC", re.IGNORECASE)
PAGE = 2000
ATTEMPTS = 4


def _get(client: httpx.Client, url: str, params: dict | None = None) -> httpx.Response:
    """GET with retries on network errors, 429 and 5xx; raises on the final failure."""
    for attempt in range(1, ATTEMPTS + 1):
        try:
            response = client.get(url, params=params)
        except httpx.TransportError:
            if attempt == ATTEMPTS:
                raise
        else:
            retryable = response.status_code == 429 or response.status_code >= 500
            if not retryable or attempt == ATTEMPTS:
                return response.raise_for_status()
        time.sleep(2**attempt)
    raise AssertionError("unreachable")


def iod_attachments(content: dict) -> list[dict]:
    """Title and URL of every attachment on a GOV.UK content item."""
    found = []
    for attachment in (content.get("details") or {}).get("attachments") or []:
        url = attachment.get("url")
        if url:
            found.append({"title": attachment.get("title") or "", "url": url})
    for document in (content.get("details") or {}).get("documents") or []:
        # Older items carry the attachments as rendered HTML instead.
        for url, title in re.findall(r'href="([^"]+)"[^>]*>([^<]+)<', document):
            found.append({"title": title.strip(), "url": url})
    return found


def pick_iod(attachments: list[dict]) -> dict | None:
    """File 7 (the CSV of everything) if listed, else File 1."""
    for pattern in (r"\bFile 7\b", r"\bFile 1\b"):
        for attachment in attachments:
            if re.search(pattern, attachment["title"], re.IGNORECASE):
                return attachment
    return None


def pick_service(services: list[dict]) -> str | None:
    """The latest-looking MSOA 2021 PWC feature service: highest version suffix wins."""
    names = [s["name"] for s in services if MSOA_PWC.search(s.get("name") or "")]
    if not names:
        return None

    def version(name: str) -> int:
        match = re.search(r"_V(\d+)$", name)
        return int(match.group(1)) if match else 1

    return max(names, key=lambda n: (version(n), n))


def fetch_census(client: httpx.Client, raw: Path) -> dict:
    result = {}
    for table in CENSUS_TABLES:
        url = NOMIS.format(table=table)
        (raw / f"census2021-{table}.zip").write_bytes(_get(client, url).content)
        result[table] = url
    return result


def fetch_iod(client: httpx.Client, raw: Path) -> dict:
    attachments = iod_attachments(_get(client, IOD_PAGE).json())
    chosen = pick_iod(attachments)
    if chosen is None:
        return {"attachments": attachments, "error": "no File 7 or File 1 attachment"}
    name = chosen["url"].rsplit("/", 1)[-1]
    (raw / f"iod2025-{name}").write_bytes(_get(client, chosen["url"]).content)
    return {"attachments": attachments, "chosen": chosen}


def fetch_centroids(client: httpx.Client, raw: Path) -> dict:
    services = _get(client, ONS_SERVICES, {"f": "json"}).json().get("services") or []
    name = pick_service(services)
    if name is None:
        return {"candidates": [], "error": "no MSOA 2021 PWC service"}
    layer = f"{ONS_SERVICES}/{name}/FeatureServer/0/query"
    features: list[dict] = []
    while True:
        params = {
            "where": "1=1",
            "outFields": "*",
            "outSR": "4326",
            "f": "geojson",
            "resultOffset": str(len(features)),
            "resultRecordCount": str(PAGE),
        }
        page = _get(client, layer, params).json().get("features") or []
        features.extend(page)
        if len(page) < PAGE:
            break
    collection = {"type": "FeatureCollection", "features": features}
    (raw / "msoa2021-pwc.geojson").write_text(json.dumps(collection), encoding="utf-8")
    return {"service": name, "features": len(features)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, required=True, help="data branch worktree")
    args = parser.parse_args(argv)
    raw = args.out / "equity" / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict] = {}
    failed = False
    headers = {"User-Agent": "mind-the-step (open data research demo)"}
    with httpx.Client(timeout=120, follow_redirects=True, headers=headers) as client:
        for source, fetch in (
            ("census", fetch_census),
            ("iod", fetch_iod),
            ("centroids", fetch_centroids),
        ):
            try:
                manifest[source] = fetch(client, raw)
            except (httpx.HTTPError, ValueError) as error:
                manifest[source] = {"error": f"{type(error).__name__}: {error}"}
            failed = failed or "error" in manifest[source]
            print(source, json.dumps(manifest[source])[:400], file=sys.stderr)
    (raw / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
