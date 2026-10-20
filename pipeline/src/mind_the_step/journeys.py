"""Sample TfL Journey Planner times: standard versus step-free (plan §5.3).

For each (origin, destination) pair the planner is asked twice, once with no accessibility
requirement and once requiring step-free access, both departing at the same time. The
difference is the step-free "time tax" that S3 shows.

Two modes:

- ``probe``: one origin-destination pair in several parameter variants, raw responses kept,
  to confirm the undocumented parameter values and the response shape;
- ``batch``: every origin in ``ORIGINS`` to every tube station, one compact record per
  request in ``journeys/<batch>/records.jsonl.gz``. Batches resume: requests already recorded
  are skipped, so a failed or timed-out run can simply be run again.

Origins and destinations are given as coordinates (station positions), not stop ids, so the
planner works out the access legs itself: a step-free journey from a station without step-free
access starts by walking or taking a bus to one that has it.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
import threading
import time
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx

from .lifts import API_HOST, EXIT_CONFIG_ERROR, TIMEOUT_SECONDS, fetch

JOURNEY_URL = f"https://{API_HOST}/Journey/JourneyResults/{{origin}}/to/{{destination}}"

SCENARIOS: dict[str, dict[str, str]] = {
    "standard": {},
    "step-free": {"accessibilityPreference": "StepFreeToPlatform"},
}

# Origins for the S3 comparison: a spread across London, half at stations with step-free
# access and half at stations without (as of the 2026-10-19 topology), so the comparison
# covers both the destination-side and the origin-side cost. Includes the Data Observatory's
# own station.
ORIGINS = {
    # Not step-free
    "940GZZLUSKS": "South Kensington",
    "940GZZLUWWL": "Walthamstow Central",
    "940GZZLUTBY": "Tooting Broadway",
    "940GZZLUCTN": "Camden Town",
    "940GZZLUHAI": "Highbury & Islington",
    "940GZZLUASG": "Arnos Grove",
    # Step-free
    "940GZZLUKSX": "King's Cross St. Pancras",
    "940GZZLUSTD": "Stratford",
    "940GZZLUWYP": "Wembley Park",
    "940GZZLUCYF": "Canary Wharf",
    "940GZZLUEBY": "Ealing Broadway",
    "940GZZLUBXN": "Brixton",
}

# TfL's limit is 500 requests a minute per key; stay under it with room for retries.
REQUESTS_PER_MINUTE = 420
WORKERS = 6


def next_weekday(today: date, weekday: int = 1, min_days: int = 3) -> date:
    """The first given weekday (Mon=0) at least ``min_days`` ahead: a typical future Tuesday."""
    candidate = today + timedelta(days=min_days)
    return candidate + timedelta(days=(weekday - candidate.weekday()) % 7)


def journey_url(origin: tuple[float, float], destination: tuple[float, float]) -> str:
    def point(p: tuple[float, float]) -> str:
        lat, lon = p
        return f"{lat:.6f},{lon:.6f}"

    return JOURNEY_URL.format(origin=point(origin), destination=point(destination))


def journey_params(scenario: str, day: date, time_hhmm: str) -> dict[str, str]:
    return {
        "date": day.strftime("%Y%m%d"),
        "time": time_hhmm,
        "timeIs": "Departing",
        "journeyPreference": "LeastTime",
        **SCENARIOS[scenario],
    }


def summarise(body: bytes | None) -> dict:
    """Compact record of the fastest journey in a JourneyResults response."""
    if body is None:
        return {"journeys": 0}
    try:
        payload = json.loads(body)
    except ValueError:
        return {"journeys": 0, "error": "response is not valid JSON"}
    journeys = payload.get("journeys") if isinstance(payload, dict) else None
    if not journeys:
        return {"journeys": 0}
    best = min(journeys, key=lambda j: j.get("duration") or float("inf"))
    legs = []
    for leg in best.get("legs") or []:
        mode = ((leg.get("mode") or {}).get("id")) or "unknown"
        options = leg.get("routeOptions") or [{}]
        legs.append(
            {
                "mode": mode,
                "line": (options[0] or {}).get("name") or None,
                "minutes": leg.get("duration"),
            }
        )
    return {
        "journeys": len(journeys),
        "minutes": best.get("duration"),
        "walk_minutes": sum(leg["minutes"] or 0 for leg in legs if leg["mode"] == "walking"),
        "legs": legs,
    }


class RateLimiter:
    """Spaces calls evenly across threads."""

    def __init__(
        self,
        per_minute: int,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.interval = 60.0 / per_minute
        self.clock = clock
        self.sleep = sleep
        self.lock = threading.Lock()
        self.next_at = 0.0

    def wait(self) -> None:
        with self.lock:
            now = self.clock()
            at = max(now, self.next_at)
            self.next_at = at + self.interval
        if at > now:
            self.sleep(at - now)


def load_stations(network_json: Path) -> dict[str, tuple[float, float]]:
    """Station id -> (lat, lon) from the web app's network asset."""
    network = json.loads(network_json.read_text(encoding="utf-8"))
    return {s["id"]: (s["lat"], s["lon"]) for s in network["stations"]}


def plan_requests(
    stations: dict[str, tuple[float, float]], origins: Iterable[str]
) -> list[tuple[str, str, str]]:
    """Every (origin, destination, scenario) to fetch, origins first, in a stable order."""
    return [
        (origin, destination, scenario)
        for origin in origins
        if origin in stations
        for destination in sorted(stations)
        if destination != origin
        for scenario in SCENARIOS
    ]


def read_done(records_path: Path) -> set[tuple[str, str, str]]:
    if not records_path.exists():
        return set()
    done = set()
    with gzip.open(records_path, "rt", encoding="utf-8") as f:
        for line in f:
            record = json.loads(line)
            if record.get("status") == 200:
                done.add((record["origin"], record["destination"], record["scenario"]))
    return done


def run_batch(
    client: httpx.Client,
    app_key: str,
    out_dir: Path,
    stations: dict[str, tuple[float, float]],
    origins: Iterable[str],
    day: date,
    time_hhmm: str,
    *,
    limiter: RateLimiter | None = None,
    workers: int = WORKERS,
    max_requests: int | None = None,
) -> dict:
    """Fetch what is not yet recorded; append one JSON line per request. Returns counts."""
    out_dir.mkdir(parents=True, exist_ok=True)
    records_path = out_dir / "records.jsonl.gz"
    done = read_done(records_path)
    todo = [r for r in plan_requests(stations, origins) if r not in done]
    if max_requests is not None:
        todo = todo[:max_requests]
    limiter = limiter or RateLimiter(REQUESTS_PER_MINUTE)
    write_lock = threading.Lock()
    counts = {"planned": len(todo), "ok": 0, "failed": 0, "already_done": len(done)}

    def one(request: tuple[str, str, str]) -> None:
        origin, destination, scenario = request
        url = journey_url(stations[origin], stations[destination])
        params = journey_params(scenario, day, time_hhmm)
        limiter.wait()
        result = fetch(client, app_key, url=str(httpx.URL(url, params=params)))
        record = {
            "origin": origin,
            "destination": destination,
            "scenario": scenario,
            "date": day.isoformat(),
            "time": time_hhmm,
            "status": result.status,
            "error": result.error,
            "message": failure_message(result.failure_body),
            **summarise(result.body),
        }
        with write_lock:
            # Appending gzip members keeps earlier lines intact if the run is cut short.
            with gzip.open(records_path, "at", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
            counts["ok" if result.status == 200 else "failed"] += 1

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(one, todo))
    return counts


def failure_message(body: bytes | None) -> str | None:
    """The planner's explanation in an error response (its JSON ``message``), if any."""
    if not body:
        return None
    try:
        payload = json.loads(body)
    except ValueError:
        return body[:200].decode("utf-8", errors="replace")
    message = payload.get("message") if isinstance(payload, dict) else None
    return str(message)[:300] if message is not None else None


def experiment(
    client: httpx.Client, app_key: str, spec_path: Path, out_dir: Path, day: date
) -> dict:
    """Run a list of hand-written requests and keep every response body, failures included.

    The spec is a JSON list of ``{"name", "from", "to", "params"}``, where ``from`` and ``to``
    are anything the planner accepts in the path ("lat,lon", a stop id, ...). Used to work out
    why some requests fail before changing how the batch asks.
    """
    out = out_dir / spec_path.stem
    out.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for item in json.loads(spec_path.read_text(encoding="utf-8")):
        url = JOURNEY_URL.format(origin=item["from"], destination=item["to"])
        params = {**journey_params("standard", day, "0830"), **item.get("params", {})}
        full_url = str(httpx.URL(url, params=params))
        result = fetch(client, app_key, url=full_url)
        manifest[item["name"]] = {
            "url": full_url,
            "status": result.status,
            "message": failure_message(result.failure_body),
            **summarise(result.body),
        }
        body = result.body if result.body is not None else result.failure_body
        if body is not None:
            (out / f"{item['name']}.json").write_bytes(body)
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    return manifest


def probe(client: httpx.Client, app_key: str, out_dir: Path, day: date) -> None:
    """Fetch one pair in several variants and keep the raw responses for inspection."""
    out_dir.mkdir(parents=True, exist_ok=True)
    # South Kensington (not step-free) to Westminster (step-free), and Westminster to Green
    # Park (both step-free).
    pairs = {
        "sks-wsm": ((51.49409, -0.17414), (51.50132, -0.12486)),
        "wsm-gpk": ((51.50132, -0.12486), (51.50695, -0.14279)),
    }
    variants = {
        "standard": {},
        "stepfree-platform": {"accessibilityPreference": "StepFreeToPlatform"},
        "stepfree-vehicle": {"accessibilityPreference": "StepFreeToVehicle"},
        "no-solid-stairs": {"accessibilityPreference": "NoSolidStairs"},
    }
    manifest = {}
    for pair, (origin, destination) in pairs.items():
        for name, extra in variants.items():
            params = {**journey_params("standard", day, "0830"), **extra}
            url = str(httpx.URL(journey_url(origin, destination), params=params))
            result = fetch(client, app_key, url=url)
            manifest[f"{pair}-{name}"] = {
                "url": url,
                "status": result.status,
                "error": result.error,
                **summarise(result.body),
            }
            if result.body is not None:
                (out_dir / f"{pair}-{name}.json").write_bytes(result.body)
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("mode", choices=["probe", "batch", "experiment"])
    parser.add_argument("--spec", type=Path, help="request list (experiment mode)")
    parser.add_argument("--out", type=Path, required=True, help="data directory to write into")
    parser.add_argument("--network", type=Path, help="network.json (batch mode)")
    parser.add_argument("--batch", default="s3-origins", help="batch name (batch mode)")
    parser.add_argument("--date", help="travel date YYYY-MM-DD (default: a Tuesday ahead)")
    parser.add_argument("--time", default="0830", help="departure time HHMM")
    parser.add_argument("--max-requests", type=int, help="stop after this many (testing)")
    args = parser.parse_args(argv)

    app_key = os.environ.get("TFL_APP_KEY", "").strip()
    if not app_key:
        print("TFL_APP_KEY is not set", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    day = date.fromisoformat(args.date) if args.date else next_weekday(datetime.now(UTC).date())

    with httpx.Client(timeout=TIMEOUT_SECONDS, headers={"User-Agent": "mind-the-step"}) as client:
        if args.mode == "probe":
            probe(client, app_key, args.out / "journeys" / "probe", day)
            print(f"probe written for {day}")
            return 0
        if args.mode == "experiment":
            if not args.spec:
                parser.error("--spec is required in experiment mode")
            manifest = experiment(
                client, app_key, args.spec, args.out / "journeys" / "experiments", day
            )
            print(json.dumps({k: (v["status"], v.get("minutes")) for k, v in manifest.items()}))
            return 0
        if not args.network:
            parser.error("--network is required in batch mode")
        stations = load_stations(args.network)
        # Keyed by travel date as well, so batches for different days never mix.
        out = args.out / "journeys" / f"{args.batch}-{day.isoformat()}-{args.time}"
        counts = run_batch(
            client,
            app_key,
            out,
            stations,
            ORIGINS,
            day,
            args.time,
            max_requests=args.max_requests,
        )
    print(json.dumps(counts))
    return 0 if counts["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
