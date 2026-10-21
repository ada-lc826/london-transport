"""Fetch TfL's NUMBAT network demand files for S1 (The Pulse).

NUMBAT models passenger demand on a typical autumn weekday: entries and exits per station and
the load on every link between consecutive stations, in 15-minute intervals. TfL publishes it
on its crowding data site, an S3-style bucket (https://crowding.data.tfl.gov.uk/).

- `list`: page through the bucket listing and save every key under NUMBAT to
  ``numbat/listing.json``, to choose which files to fetch.
- `fetch`: download the given keys verbatim to ``numbat/raw/<key>``.

No API key: the site is public and is not the Unified API.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import httpx

BUCKET = "https://crowding.data.tfl.gov.uk/"
S3 = "{http://s3.amazonaws.com/doc/2006-03-01/}"
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


def parse_listing(xml: bytes) -> tuple[list[dict], str | None]:
    """Objects in one ListBucketResult page, and the marker for the next page (None if last)."""
    root = ET.fromstring(xml)
    # Some buckets answer without the S3 namespace.
    ns = S3 if root.tag.startswith(S3) else ""
    items = [
        {
            "key": c.findtext(f"{ns}Key"),
            "size": int(c.findtext(f"{ns}Size") or 0),
            "modified": c.findtext(f"{ns}LastModified"),
        }
        for c in root.iter(f"{ns}Contents")
    ]
    truncated = (root.findtext(f"{ns}IsTruncated") or "").lower() == "true"
    if not truncated:
        return items, None
    return items, root.findtext(f"{ns}NextMarker") or (items[-1]["key"] if items else None)


def list_keys(client: httpx.Client, prefix: str) -> list[dict]:
    keys: list[dict] = []
    marker: str | None = ""
    while marker is not None:
        params = {"prefix": prefix, **({"marker": marker} if marker else {})}
        page, marker = parse_listing(_get(client, BUCKET, params).content)
        keys.extend(page)
    return keys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("mode", choices=["list", "fetch"])
    parser.add_argument("--out", type=Path, required=True, help="data directory to write into")
    parser.add_argument("--prefix", default="NUMBAT", help="listing prefix (list mode)")
    parser.add_argument("--keys", nargs="*", default=[], help="keys to download (fetch mode)")
    args = parser.parse_args(argv)

    out = args.out / "numbat"
    with httpx.Client(timeout=120, headers={"User-Agent": "mind-the-step"}) as client:
        if args.mode == "list":
            out.mkdir(parents=True, exist_ok=True)
            first = _get(client, BUCKET, {"prefix": args.prefix})
            if b"ListBucketResult" not in first.content[:500]:
                # Not a bucket listing: the site may be a page that loads one with
                # JavaScript. Keep it, to find where the listing really comes from.
                (out / "index.html").write_bytes(first.content)
                print(first.text[:3000])
                print(f"not a bucket listing; saved numbat/index.html ({len(first.content)} bytes)")
                return 0
            keys = list_keys(client, args.prefix)
            (out / "listing.json").write_text(json.dumps(keys, indent=1) + "\n")
            for item in keys:
                print(f"{item['size']:>12}  {item['key']}")
            return 0
        if not args.keys:
            parser.error("fetch needs --keys")
        for key in args.keys:
            target = out / "raw" / key
            target.parent.mkdir(parents=True, exist_ok=True)
            response = _get(client, BUCKET + key)
            target.write_bytes(response.content)
            print(f"{len(response.content):>12}  {key}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
