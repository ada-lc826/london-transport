"""Build S3's travel-time asset from a Journey Planner batch.

Reads ``journeys/<batch>/records.jsonl.gz`` and writes a compact JSON for the web app:

    {"source": {...}, "origins": [...], "times": {origin: {destination: [standard, step_free]}}}

with minutes for the fastest journey in each scenario, or null when the planner found no
route. Requests that failed (non-200) are also null, and counted in ``source`` so a reader can
tell "no route" from "not fetched".

    uv run python -m mind_the_step.journeys_export --records <records.jsonl.gz> --out <json>
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
from collections import Counter
from pathlib import Path

from .journeys import ORIGINS, SCENARIOS

SCENARIO_ORDER = list(SCENARIOS)  # ["standard", "step-free"]


def build(records: list[dict]) -> dict:
    # Later records win: a resumed batch re-requests only what failed before.
    latest: dict[tuple[str, str, str], dict] = {}
    for record in records:
        latest[(record["origin"], record["destination"], record["scenario"])] = record

    times: dict[str, dict[str, list]] = {}
    outcome = Counter()
    days = Counter()
    for (origin, destination, scenario), record in latest.items():
        pair = times.setdefault(origin, {}).setdefault(destination, [None, None])
        if record.get("status") != 200:
            outcome["failed"] += 1
            continue
        days[(record.get("date"), record.get("time"))] += 1
        minutes = record.get("minutes")
        if minutes is None:
            outcome["no_route"] += 1
        else:
            outcome["ok"] += 1
            pair[SCENARIO_ORDER.index(scenario)] = minutes

    (date, time), _ = days.most_common(1)[0] if days else ((None, None), 0)
    return {
        "source": {
            "date": date,
            "time": time,
            "attribution": "Powered by TfL Open Data · TfL Journey Planner",
            "requests": dict(outcome),
        },
        "origins": [o for o in ORIGINS if o in times],
        "times": {o: dict(sorted(times[o].items())) for o in ORIGINS if o in times},
    }


def read_records(path: Path) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--records", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    asset = build(read_records(args.records))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(asset, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(asset['origins'])} origins, requests {asset['source']['requests']} -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
