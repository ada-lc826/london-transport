"""Turn the lift log into S5's asset: step-free on paper against step-free in practice.

The lift logger (lifts.py) records TfL's lift disruption feed every 15 minutes. Each record
names the lifts out of service (``940GZZLUWYP-Lift-5``), the ids TfL's station topology files
use too. For every distinct set of lifts out, the topology is recomputed without them
(topology.read_topology(lifts_out=...)): a tube station whose platforms can no longer all be
reached step-free from the street is *downgraded* (full to partial or none, partial to none)
for as long as that set lasts.

Writes, over the logged period:

- `times`: the successful samples;
- `stations`: every station downgraded at least once, with its status on paper and its
  status at each sample, and TfL's latest message about it;
- `outages`: each lift's spells out of service, in sample indices, flagged when they run
  past either end of the log (so their length is a lower bound);
- `downgraded` and `liftsOut`: per sample, how many stations were downgraded and how many
  lifts (anywhere on TfL's network) were out.

    uv run python -m mind_the_step.lift_outages --log <data-branch> \\
        --topology ../data/tfl-station-topology/2026-10-20 \\
        --network ../apps/website/public/data/network.json --out lifts.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from .topology import read_topology, station_status

RANK = {"full": 2, "partial": 1, "none": 0}


def read_samples(data_dir: Path) -> tuple[list[str], list[list[dict]], int]:
    """Successful samples' timestamps and disruption records, oldest first; and failures."""
    times, records, failed = [], [], 0
    payloads: dict[str, list[dict]] = {}
    for log in sorted((data_dir / "lifts" / "log").glob("*.jsonl")):
        for line in log.read_text(encoding="utf-8").splitlines():
            entry = json.loads(line)
            if not entry.get("ok") or not entry.get("sha256"):
                failed += 1
                continue
            sha = entry["sha256"]
            if sha not in payloads:
                path = data_dir / "lifts" / "payloads" / f"{sha}.json"
                payloads[sha] = json.loads(path.read_text(encoding="utf-8"))
            times.append(entry["ts"])
            records.append(payloads[sha])
    return times, records, failed


def lifts_out(records: list[dict]) -> frozenset[str]:
    return frozenset(lift for r in records for lift in r.get("disruptedLiftUniqueIds") or [])


def spells(present: list[bool]) -> list[tuple[int, int]]:
    """Runs of consecutive True as (first index, last index)."""
    result, start = [], None
    for i, on in enumerate(present + [False]):
        if on and start is None:
            start = i
        elif not on and start is not None:
            result.append((start, i - 1))
            start = None
    return result


def short_message(message: str, limit: int = 140) -> str:
    """TfL's message for the wall: without the 'STATION NAME:' and 'No Step Free Access -'
    prefixes or the helpline sentence, cut at a word boundary."""
    text = message.split(":", 1)[1] if ":" in message[:60] else message
    text = re.sub(r"^\s*No Step Free Access\s*-\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*Call (us on )?0343[^.]*\.?", "", text).strip()
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0].rstrip(",.;") + "…"


def build(times: list[str], records: list[list[dict]], topology_dir: Path, network: dict) -> dict:
    tube = {s["id"]: s["name"] for s in network["stations"]}
    paper = {
        k: v for k, v in station_status(read_topology(topology_dir).platforms).items() if k in tube
    }

    # One topology run per distinct set of lifts out, not per sample.
    status_by_set: dict[frozenset[str], dict[str, str | None]] = {}
    per_sample: list[dict[str, str]] = []
    for sample in records:
        out = lifts_out(sample)
        if out not in status_by_set:
            now = station_status(read_topology(topology_dir, lifts_out=out).platforms)
            status_by_set[out] = {k: now.get(k) for k in paper}
        per_sample.append(
            {
                k: v
                for k, v in status_by_set[out].items()
                if paper[k] in RANK and v in RANK and RANK[v] < RANK[paper[k]]
            }
        )

    # TfL's latest message about each station. The feed files them under the topology's
    # station id (a hub such as HUBCAW, or the station's own id), which can cover several
    # tube stations.
    hub_stations: dict[str, set[str]] = {}
    for platform in read_topology(topology_dir).platforms:
        hub_stations.setdefault(platform.id.split("-Plat")[0], set()).add(platform.station)
    messages: dict[str, str] = {}
    for sample in records:
        for record in sample:
            hub = str(record.get("stationUniqueId") or "")
            for station in hub_stations.get(hub, {hub}):
                if station in tube and record.get("message"):
                    messages[station] = short_message(str(record["message"]))

    ever = sorted({k for sample in per_sample for k in sample})
    stations = [
        {
            "id": k,
            "name": tube[k],
            "paper": paper[k],
            # Status at each sample: the paper status when not downgraded.
            "status": [sample.get(k, paper[k]) for sample in per_sample],
            "message": messages.get(k, ""),
        }
        for k in ever
    ]

    every_lift = sorted({lift for sample in records for lift in lifts_out(sample)})
    outages = []
    for lift in every_lift:
        present = [lift in lifts_out(sample) for sample in records]
        for first, last in spells(present):
            outages.append(
                {
                    "lift": lift,
                    "first": first,
                    "last": last,
                    "fromStart": first == 0,
                    "ongoing": last == len(records) - 1,
                }
            )

    paper_full = sum(1 for v in paper.values() if v == "full")
    return {
        "times": times,
        "paper": {"full": paper_full, "partial": sum(1 for v in paper.values() if v == "partial")},
        "stations": stations,
        "outages": outages,
        "downgraded": [len(sample) for sample in per_sample],
        "fullDowngraded": [sum(1 for k in sample if paper[k] == "full") for sample in per_sample],
        "liftsOut": [len(lifts_out(sample)) for sample in records],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--log", type=Path, required=True, help="data dir holding lifts/")
    parser.add_argument("--topology", type=Path, required=True, help="tfl-station-topology/<date>")
    parser.add_argument("--network", type=Path, required=True, help="network.json")
    parser.add_argument("--out", type=Path, required=True, help="output JSON")
    args = parser.parse_args(argv)
    times, records, failed = read_samples(args.log)
    if not times:
        print("no successful samples", file=sys.stderr)
        return 1
    network = json.loads(args.network.read_text(encoding="utf-8"))
    result = {
        "source": {
            "description": "TfL lift disruptions, logged every 15 minutes",
            "from": times[0],
            "to": times[-1],
            "samples": len(times),
            "failedSamples": failed,
            "topology": args.topology.name,
            "attribution": "Powered by TfL Open Data",
        },
        **build(times, records, args.topology, network),
    }
    args.out.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")
    now = [s["name"] for s in result["stations"] if s["status"][-1] != s["paper"]]
    print(
        f"{len(times)} samples ({failed} failed), {len(result['stations'])} stations ever "
        f"downgraded, {len(result['outages'])} lift outages; downgraded now: {now}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
