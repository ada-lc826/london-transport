"""Log TfL's live lift disruptions, one snapshot per run.

Each run appends one line to a daily JSONL log under ``lifts/log/``. The response
body is stored once per distinct content under ``lifts/payloads/<sha256>.json``:
lift outages change far less often than the 15-minute schedule, and the log lives
in git, so storing every snapshot in full would bloat the repository.

Failed fetches are logged too. The API is known to fail intermittently, and how
often it fails is itself part of the reliability record.

The response is kept verbatim (only re-serialised with sorted keys). Parsing it
into per-lift outage intervals is a later pipeline step, so a schema surprise
never costs us data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import httpx

API_HOST = "api.tfl.gov.uk"
LIFTS_URL = f"https://{API_HOST}/Disruptions/Lifts/v2/"
ATTEMPTS = 4
BACKOFF_SECONDS = 2.0
TIMEOUT_SECONDS = 20.0

# Exit code when the run cannot succeed until someone fixes configuration
# (missing or rejected key). Transient API failures still exit 0, so the
# scheduled workflow does not email a failure every 15 minutes during an outage.
EXIT_CONFIG_ERROR = 2


@dataclass
class FetchResult:
    status: int | None
    body: bytes | None
    attempts: int
    elapsed_ms: int
    error: str | None = None


def _retryable(status: int) -> bool:
    return status == 429 or status >= 500


def fetch(
    client: httpx.Client,
    app_key: str,
    *,
    url: str = LIFTS_URL,
    attempts: int = ATTEMPTS,
    backoff: float = BACKOFF_SECONDS,
    sleep: Callable[[float], None] = time.sleep,
) -> FetchResult:
    """GET `url` (by default the lift disruptions), retrying network errors, 429 and 5xx."""
    started = time.monotonic()
    status: int | None = None
    error: str | None = None
    for attempt in range(1, attempts + 1):
        try:
            # Merge rather than replace any query string already in `url`.
            response = client.get(httpx.URL(url).copy_merge_params(_key_params(url, app_key) or {}))
        except httpx.HTTPError as exc:
            status, error = None, f"{type(exc).__name__}: {exc}"
        else:
            status = response.status_code
            if response.is_success:
                return FetchResult(status, response.content, attempt, _ms_since(started))
            error = f"HTTP {status}"
            if not _retryable(status):
                break
        if attempt < attempts:
            sleep(backoff * 2 ** (attempt - 1))
    # httpx error messages can include the request URL, which carries the key.
    error = (error or "unknown error").replace(app_key, "***")
    return FetchResult(status, None, attempt, _ms_since(started), error)


def _key_params(url: str, app_key: str) -> dict[str, str] | None:
    # The key is for the Unified API only; never send it to other hosts.
    return {"app_key": app_key} if httpx.URL(url).host == API_HOST else None


def _ms_since(started: float) -> int:
    return round((time.monotonic() - started) * 1000)


def record(result: FetchResult, out_dir: Path, now: datetime) -> dict:
    """Store the payload (if new) and append a log line; return that line."""
    line: dict = {
        "ts": now.astimezone(UTC).isoformat(timespec="seconds"),
        "ok": False,
        "status": result.status,
        "attempts": result.attempts,
        "elapsed_ms": result.elapsed_ms,
        "sha256": None,
        "n_records": None,
        "error": result.error,
    }
    if result.body is not None:
        try:
            payload = json.loads(result.body)
        except ValueError:
            line["error"] = "response is not valid JSON"
        else:
            canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, indent=1)
            digest = hashlib.sha256(canonical.encode()).hexdigest()
            payload_path = out_dir / "lifts" / "payloads" / f"{digest}.json"
            if not payload_path.exists():
                payload_path.parent.mkdir(parents=True, exist_ok=True)
                payload_path.write_text(canonical + "\n", encoding="utf-8")
            line.update(
                ok=True,
                sha256=digest,
                n_records=len(payload) if isinstance(payload, list) else None,
            )

    log_path = out_dir / "lifts" / "log" / f"{line['ts'][:10]}.jsonl"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(line) + "\n")
    return line


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, required=True, help="data directory to write into")
    args = parser.parse_args(argv)

    app_key = os.environ.get("TFL_APP_KEY", "").strip()
    if not app_key:
        print("TFL_APP_KEY is not set", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    with httpx.Client(timeout=TIMEOUT_SECONDS, headers={"User-Agent": "mind-the-step"}) as client:
        result = fetch(client, app_key)
    line = record(result, args.out, datetime.now(UTC))
    print(json.dumps(line))

    if result.status in (401, 403):
        print("TfL rejected the key; check the TFL_APP_KEY secret", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    return 0


if __name__ == "__main__":
    sys.exit(main())
