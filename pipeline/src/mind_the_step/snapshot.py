"""Snapshot the TfL network reference data: stations, lines, route sequences, step-free files.

Writes ``snapshots/<YYYY-MM-DD>/<name>.json.gz`` plus a ``manifest.json`` recording what was
fetched, when, and whether it succeeded. Like the lift logger, it keeps responses verbatim so
parsing can change without refetching. Run on demand (the network changes slowly), not on a
schedule.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

import httpx

from . import accessibility, stopstructure
from .lifts import EXIT_CONFIG_ERROR, TIMEOUT_SECONDS, fetch

API = "https://api.tfl.gov.uk"

# Rail modes in scope: the network with step-free data that the story is about. Buses are
# step-free by design and are handled separately.
MODES = ("tube", "dlr", "overground", "elizabeth-line")
BEST_EFFORT_PREFIXES = ("accessibility/", "crosscheck/", "stopstructure/")


def _url(path: str) -> str:
    return f"{API}/{path.lstrip('/')}"


def snapshot(client: httpx.Client, app_key: str, out_dir: Path, now: datetime) -> dict:
    """Fetch everything, write it under ``out_dir`` and return the manifest."""
    day_dir = out_dir / "snapshots" / now.astimezone(UTC).date().isoformat()
    day_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict = {"fetched_at": now.astimezone(UTC).isoformat(timespec="seconds"), "files": {}}

    def get(name: str, path: str):
        result = fetch(client, app_key, url=_url(path))
        manifest["files"][name] = accessibility.manifest_entry(path, result)
        if result.body is None:
            return None
        try:
            payload = json.loads(result.body)
        except ValueError:
            manifest["files"][name]["error"] = "response is not valid JSON"
            return None
        with gzip.open(day_dir / f"{name}.json.gz", "wt", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        return payload

    stop_points = {mode: get(f"stoppoints-{mode}", f"StopPoint/Mode/{mode}") for mode in MODES}

    lines = get("lines", f"Line/Mode/{','.join(MODES)}") or []
    for line in lines:
        line_id = line.get("id") if isinstance(line, dict) else None
        if isinstance(line_id, str) and line_id.replace("-", "").isalnum():
            get(f"route-{line_id}", f"Line/{line_id}/Route/Sequence/all")

    accessibility.download(client, app_key, day_dir, manifest["files"])
    accessibility.download_zenodo(client, app_key, day_dir, manifest["files"])
    stopstructure.fetch_all(
        client,
        app_key,
        day_dir,
        manifest["files"],
        stopstructure.station_ids(stop_points["tube"]),
    )

    (day_dir / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, required=True, help="data directory to write into")
    args = parser.parse_args(argv)

    app_key = os.environ.get("TFL_APP_KEY", "").strip()
    if not app_key:
        print("TFL_APP_KEY is not set", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    with httpx.Client(
        timeout=TIMEOUT_SECONDS,
        headers={"User-Agent": "mind-the-step"},
        # Published files on tfl.gov.uk may redirect to content.tfl.gov.uk.
        follow_redirects=True,
    ) as client:
        manifest = snapshot(client, app_key, args.out, datetime.now(UTC))

    files = manifest["files"]
    failed = sorted(name for name, entry in files.items() if not entry["ok"])
    print(f"{len(files) - len(failed)}/{len(files)} files fetched")
    # Downloads found by scraping web pages are best effort: report them, but do not let a
    # change to tfl.gov.uk or Zenodo throw away the API snapshot.
    best_effort = [name for name in failed if name.startswith(BEST_EFFORT_PREFIXES)]
    if best_effort:
        print(f"warning: best-effort downloads failed: {', '.join(best_effort)}", file=sys.stderr)
    failed = [name for name in failed if name not in best_effort]
    api_entries = [
        entry for name, entry in files.items() if not name.startswith(BEST_EFFORT_PREFIXES)
    ]
    if any(entry["status"] in (401, 403) for entry in api_entries):
        print("TfL rejected the key; check the TFL_APP_KEY secret", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    if failed:
        # Unlike the lift logger, a partial snapshot is not useful: fail so it gets rerun.
        print(f"failed: {', '.join(failed)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
