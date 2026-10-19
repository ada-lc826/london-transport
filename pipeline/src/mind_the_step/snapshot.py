"""Snapshot the TfL network reference data: stations, lines and route sequences.

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

from .lifts import EXIT_CONFIG_ERROR, TIMEOUT_SECONDS, FetchResult, fetch

API = "https://api.tfl.gov.uk"

# Rail modes in scope: the network with step-free data that the story is about. Buses are
# step-free by design and are handled separately.
MODES = ("tube", "dlr", "overground", "elizabeth-line")


def _url(path: str) -> str:
    return f"{API}/{path.lstrip('/')}"


def snapshot(client: httpx.Client, app_key: str, out_dir: Path, now: datetime) -> dict:
    """Fetch everything, write it under ``out_dir`` and return the manifest."""
    day_dir = out_dir / "snapshots" / now.astimezone(UTC).date().isoformat()
    day_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict = {"fetched_at": now.astimezone(UTC).isoformat(timespec="seconds"), "files": {}}

    def get(name: str, path: str):
        result = fetch(client, app_key, url=_url(path))
        manifest["files"][name] = _entry(path, result)
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

    for mode in MODES:
        get(f"stoppoints-{mode}", f"StopPoint/Mode/{mode}")

    lines = get("lines", f"Line/Mode/{','.join(MODES)}") or []
    for line in lines:
        line_id = line.get("id") if isinstance(line, dict) else None
        if isinstance(line_id, str) and line_id.replace("-", "").isalnum():
            get(f"route-{line_id}", f"Line/{line_id}/Route/Sequence/all")

    (day_dir / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    return manifest


def _entry(path: str, result: FetchResult) -> dict:
    return {
        "path": path,
        "ok": result.body is not None,
        "status": result.status,
        "attempts": result.attempts,
        "elapsed_ms": result.elapsed_ms,
        "error": result.error,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, required=True, help="data directory to write into")
    args = parser.parse_args(argv)

    app_key = os.environ.get("TFL_APP_KEY", "").strip()
    if not app_key:
        print("TFL_APP_KEY is not set", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    with httpx.Client(timeout=TIMEOUT_SECONDS, headers={"User-Agent": "mind-the-step"}) as client:
        manifest = snapshot(client, app_key, args.out, datetime.now(UTC))

    files = manifest["files"]
    failed = sorted(name for name, entry in files.items() if not entry["ok"])
    print(f"{len(files) - len(failed)}/{len(files)} files fetched")
    if any(entry["status"] in (401, 403) for entry in files.values()):
        print("TfL rejected the key; check the TFL_APP_KEY secret", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    if failed:
        # Unlike the lift logger, a partial snapshot is not useful: fail so it gets rerun.
        print(f"failed: {', '.join(failed)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
