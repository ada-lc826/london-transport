"""Download TfL's published step-free accessibility files.

The Unified API's stop points carry step-free attributes for only about 80 of 272 tube
stations, so they cannot support network-wide counts. TfL publishes the authoritative data
as "station topology" files (GTFS and a detailed CSV) on its open data page, replacing the
unmaintained lrad-v2.xml. Their URLs are not documented anywhere stable, so this reads the
open data page, keeps the links that look like accessibility data, and downloads each one
verbatim into ``snapshots/<date>/accessibility/``.
"""

from __future__ import annotations

import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx

from .lifts import FetchResult, fetch

OPEN_DATA_PAGE = "https://tfl.gov.uk/info-for/open-data-users/our-open-data"

# Independent cross-check: a January 2026 research dataset of London station step-free status
# as of December 2025 (plan §2.5). Not official, so used only to validate TfL's files.
ZENODO_RECORD = "https://zenodo.org/api/records/18313509"
ZENODO_MAX_BYTES = 50_000_000

# Matched against each link's URL and text, case-insensitively.
LINK_PATTERN = re.compile(r"topology|step[- ]?free|lrad|accessib", re.IGNORECASE)
# Only TfL hosts, and only files (not further web pages).
ALLOWED_HOSTS = {"tfl.gov.uk", "content.tfl.gov.uk", "www.tfl.gov.uk"}
FILE_SUFFIXES = (".zip", ".csv", ".xml", ".xsd", ".pdf", ".json", ".txt")


class _LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            self.links.append((self._href, " ".join("".join(self._text).split())))
            self._href = None


def find_accessibility_links(html: str, base_url: str = OPEN_DATA_PAGE) -> list[dict]:
    """Links on the open data page that look like downloadable accessibility files."""
    parser = _LinkParser()
    parser.feed(html)
    found: dict[str, dict] = {}
    for href, text in parser.links:
        url = urljoin(base_url, href)
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
            continue
        if not parsed.path.lower().endswith(FILE_SUFFIXES):
            continue
        if LINK_PATTERN.search(url) or LINK_PATTERN.search(text):
            found.setdefault(url, {"url": url, "text": text})
    return list(found.values())


def download(client: httpx.Client, app_key: str, day_dir: Path, files: dict) -> None:
    """Fetch the open data page and every accessibility file it links to.

    Adds one manifest entry per request to ``files`` (keyed ``accessibility/<name>``).
    """
    page = fetch(client, app_key, url=OPEN_DATA_PAGE)
    files["accessibility/open-data-page.html"] = manifest_entry(OPEN_DATA_PAGE, page)
    if page.body is None:
        return
    out = day_dir / "accessibility"
    out.mkdir(parents=True, exist_ok=True)
    (out / "open-data-page.html").write_bytes(page.body)

    links = find_accessibility_links(page.body.decode("utf-8", errors="replace"))
    if not links:
        # The page layout changed: record it as a failure so the run is noticed.
        files["accessibility/links"] = {
            "path": OPEN_DATA_PAGE,
            "ok": False,
            "status": page.status,
            "error": "no accessibility links found on the open data page",
        }
        return
    for link in links:
        name = Path(urlparse(link["url"]).path).name
        result = fetch(client, app_key, url=link["url"])
        entry = manifest_entry(link["url"], result)
        entry["link_text"] = link["text"]
        files[f"accessibility/{name}"] = entry
        if result.body is not None:
            (out / name).write_bytes(result.body)


def manifest_entry(url: str, result: FetchResult) -> dict:
    """One manifest record for one request."""
    return {
        "path": url,
        "ok": result.body is not None,
        "status": result.status,
        "attempts": result.attempts,
        "elapsed_ms": result.elapsed_ms,
        "error": result.error,
    }


def download_zenodo(client: httpx.Client, app_key: str, day_dir: Path, files: dict) -> None:
    """Fetch the cross-check dataset's record and its files into ``crosscheck/``."""
    record = fetch(client, app_key, url=ZENODO_RECORD)
    files["crosscheck/zenodo-record.json"] = manifest_entry(ZENODO_RECORD, record)
    if record.body is None:
        return
    out = day_dir / "crosscheck"
    out.mkdir(parents=True, exist_ok=True)
    (out / "zenodo-record.json").write_bytes(record.body)
    try:
        entries = json.loads(record.body).get("files", [])
    except (ValueError, AttributeError):
        entries = []
    for item in entries:
        name = Path(str(item.get("key", ""))).name
        url = (item.get("links") or {}).get("self")
        if not name or not isinstance(url, str) or urlparse(url).hostname != "zenodo.org":
            continue
        if not isinstance(item.get("size"), int) or item["size"] > ZENODO_MAX_BYTES:
            continue
        result = fetch(client, app_key, url=url)
        files[f"crosscheck/{name}"] = manifest_entry(url, result)
        if result.body is not None:
            (out / name).write_bytes(result.body)
