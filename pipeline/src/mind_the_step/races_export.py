"""Build S6's race asset from the planner's raw answers for the race pairs.

Reads the responses that `journeys.py experiment` saved for `experiments/s6-races.json`
(``journeys/experiments/s6-races/<name>.json`` on the data branch) and writes, per race, the
fastest standard and the fastest step-free journey leg by leg:

    {"source": {...}, "races": [{"id", "origin", "destination", "standard": journey,
                                 "stepFree": journey}]}
    journey = {"depart": "08:35", "minutes": 32, "legs": [leg, ...]}
    leg = {"mode", "line", "start", "end", "from", "to", "lifts", "path"}

`start` and `end` are minutes from the journey's departure; a gap between one leg's end and
the next one's start is time spent waiting. `path` is the leg's route as [lon, lat] pairs.

    uv run python -m mind_the_step.races_export --spec experiments/s6-races.json \\
        --responses <data-branch>/journeys/experiments/s6-races --out <races.json>
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

SCENARIOS = {"standard": "standard", "step-free": "stepFree"}
# Points kept per leg path: enough for a small map, small enough for the asset.
MAX_PATH_POINTS = 40


def _place(point: dict | None) -> str:
    """A stop or street name, readable on the wall."""
    name = " ".join(str((point or {}).get("commonName") or "").split())
    for suffix in (" Underground Station", " Rail Station", " DLR Station", ", LONDON"):
        name = name.removesuffix(suffix)
    # Street addresses come in capitals ("CAMDEN HIGH STREET").
    return name.title() if name.isupper() else name


def _path(leg: dict) -> list[list[float]]:
    raw = (leg.get("path") or {}).get("lineString")
    if not raw:
        return []
    try:
        points = json.loads(raw)  # [[lat, lon], ...]
    except ValueError:
        return []
    step = max(1, -(-len(points) // MAX_PATH_POINTS))
    kept = points[::step]
    if points and kept[-1] != points[-1]:
        kept.append(points[-1])
    return [[round(lon, 5), round(lat, 5)] for lat, lon in kept]


def journey(payload: dict) -> dict | None:
    """The fastest journey in a JourneyResults response, leg by leg; None if there is none."""
    journeys = payload.get("journeys") if isinstance(payload, dict) else None
    if not journeys:
        return None
    best = min(journeys, key=lambda j: j.get("duration") or float("inf"))
    start = datetime.fromisoformat(best["startDateTime"])

    def offset(stamp: str) -> int:
        return round((datetime.fromisoformat(stamp) - start).total_seconds() / 60)

    legs = []
    for leg in best.get("legs") or []:
        options = leg.get("routeOptions") or [{}]
        legs.append(
            {
                "mode": ((leg.get("mode") or {}).get("id")) or "unknown",
                "line": (options[0] or {}).get("name") or None,
                "start": offset(leg["departureTime"]),
                "end": offset(leg["arrivalTime"]),
                "from": _place(leg.get("departurePoint")),
                "to": _place(leg.get("arrivalPoint")),
                "lifts": sum(1 for o in leg.get("obstacles") or [] if o.get("type") == "LIFT"),
                "path": _path(leg),
            }
        )
    return {"depart": start.strftime("%H:%M"), "minutes": best.get("duration"), "legs": legs}


def build(spec: list[dict], responses: Path) -> dict:
    races: dict[str, dict] = {}
    for item in spec:
        race = races.setdefault(
            item["race"],
            {"id": item["race"], "origin": item["origin"], "destination": item["destination"]},
        )
        scenario = "step-free" if item["name"].endswith("-step-free") else "standard"
        path = responses / f"{item['name']}.json"
        payload = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        race[SCENARIOS[scenario]] = journey(payload)
    dates = {
        r[k]["depart"] for r in races.values() for k in SCENARIOS.values() if r.get(k) is not None
    }
    return {
        "source": {
            "description": "TfL Journey Planner, fastest journey, standard and step-free to "
            "platform, street to street",
            "date": None,
            "departures": sorted(dates),
            "attribution": "Powered by TfL Open Data",
        },
        "races": list(races.values()),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--spec", type=Path, required=True, help="experiments/s6-races.json")
    parser.add_argument("--responses", type=Path, required=True, help="saved responses dir")
    parser.add_argument("--date", help="travel date the responses were requested for")
    parser.add_argument("--out", type=Path, required=True, help="output JSON")
    args = parser.parse_args(argv)
    result = build(json.loads(args.spec.read_text(encoding="utf-8")), args.responses)
    result["source"]["date"] = args.date
    missing = [
        f"{r['id']} {k}" for r in result["races"] for k in SCENARIOS.values() if not r.get(k)
    ]
    args.out.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")
    for race in result["races"]:
        times = [race.get(k) and race[k]["minutes"] for k in SCENARIOS.values()]
        print(f"{race['id']}: standard {times[0]}, step-free {times[1]}", file=sys.stderr)
    if missing:
        print(f"no journey for: {', '.join(missing)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
