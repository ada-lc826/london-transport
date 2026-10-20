"""Read TfL's published step-free station topology (data/tfl-station-topology/<date>/).

TfL publishes each station as points (entrances, halls, platforms) joined by step-free
pathways: same level, ramp or lift. Its specification calls a platform step-free when there is
a sequence of pathways from the station's outside point to it. The GTFS files list exactly
those pathways, so a platform is step-free here if it can be reached from `<station>-Outside`
in `pathways.txt`.

This is a second, independent source for what `stepfree.py` derives from the Stop Structure
API. It also says which lines call at which platform, which the network model needs: the
Stop Structure gives step-free status per platform area but not reliably per line.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

TUBE_LINES = frozenset(
    {
        "bakerloo",
        "central",
        "circle",
        "district",
        "hammersmith-city",
        "jubilee",
        "metropolitan",
        "northern",
        "piccadilly",
        "victoria",
        "waterloo-city",
    }
)


@dataclass(frozen=True)
class Platform:
    id: str
    # NaPTAN id of the stop area the line calls at, e.g. 940GZZLUWSM: the id network.json uses,
    # even where TfL files the platform under a hub (HUBWSM).
    station: str
    line: str
    # None when TfL has no step-free route information for the platform.
    step_free: bool | None


def _rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return [{k: (v or "").strip() for k, v in row.items()} for row in csv.DictReader(f)]


def _true(value: str) -> bool:
    return value.upper() == "TRUE"


@dataclass
class Topology:
    platforms: list[Platform]
    # (station, from line, to line) where every platform of the first line has a step-free
    # path to some platform of the second, inside the station or by way of the street.
    transfers: set[tuple[str, str, str]]


def read_topology(topology_dir: Path, lines: frozenset[str] = TUBE_LINES) -> Topology:
    """Customer-facing platforms of `lines` (one entry per platform and line), and transfers."""
    adjacency: dict[str, set[str]] = defaultdict(set)
    for p in _rows(topology_dir / "gtfs" / "pathways.txt"):
        adjacency[p["from_stop_id"]].add(p["to_stop_id"])
        if p["is_bidirectional"] == "1":
            adjacency[p["to_stop_id"]].add(p["from_stop_id"])

    reachable: dict[str, set[str]] = {}

    def reach(start: str) -> set[str]:
        if start not in reachable:
            seen = {start}
            stack = [start]
            while stack:
                for nxt in adjacency[stack.pop()]:
                    if nxt not in seen:
                        seen.add(nxt)
                        stack.append(nxt)
            reachable[start] = seen
        return reachable[start]

    platforms = {p["UniqueId"]: p for p in _rows(topology_dir / "detailed" / "Platforms.csv")}
    result: dict[tuple[str, str], Platform] = {}
    for service in _rows(topology_dir / "detailed" / "PlatformServices.csv"):
        platform = platforms.get(service["PlatformUniqueId"])
        if service["Line"] not in lines or platform is None:
            continue
        # Platforms out of use (Morden 1, Chalfont & Latimer 3, …) are listed but not facing
        # customers; they do not count against a station.
        if not _true(platform["IsCustomerFacing"]):
            continue
        reached = platform["UniqueId"] in reach(f"{platform['StationUniqueId']}-Outside")
        known = reached or _true(platform["HasStepFreeRouteInformation"])
        key = (platform["UniqueId"], service["Line"])
        # PlatformServices repeats a platform once per destination it serves.
        result[key] = Platform(
            id=platform["UniqueId"],
            station=service["StopAreaNaptanCode"],
            line=service["Line"],
            step_free=reached if known else None,
        )

    by_line: dict[tuple[str, str], list[str]] = defaultdict(list)
    for p in result.values():
        by_line[(p.station, p.line)].append(p.id)
    transfers = set()
    for (station, line), ids in by_line.items():
        for (other_station, other_line), other_ids in by_line.items():
            if other_station != station or other_line == line:
                continue
            if all(reach(i) & set(other_ids) for i in ids):
                transfers.add((station, line, other_line))
    return Topology(list(result.values()), transfers)


def line_access(platforms: list[Platform]) -> dict[tuple[str, str], bool | None]:
    """(station, line) -> whether every platform of that line is step-free from the street.

    The network model has one node per station and line, not per direction, so a line counts
    as step-free only if all its platforms are (both directions, every branch). None if TfL
    has no information for any of them.
    """
    grouped: dict[tuple[str, str], list[bool | None]] = defaultdict(list)
    for p in platforms:
        grouped[(p.station, p.line)].append(p.step_free)
    return {
        key: None if all(v is None for v in values) else all(v is True for v in values)
        for key, values in grouped.items()
    }


def station_status(platforms: list[Platform]) -> dict[str, str | None]:
    """Station -> 'full', 'partial' or 'none' (as stepfree.py); None if nothing is known."""
    by_station: dict[str, dict[str, bool | None]] = defaultdict(dict)
    for p in platforms:
        by_station[p.station][p.id] = p.step_free
    result: dict[str, str | None] = {}
    for station, values in by_station.items():
        known = [v for v in values.values() if v is not None]
        if not known:
            result[station] = None
        elif all(v is True for v in values.values()):
            result[station] = "full"
        else:
            result[station] = "partial" if any(known) else "none"
    return result


def compare(network: dict, platforms: list[Platform]) -> dict:
    """Agreement between network.json's step-free status and the published topology's."""
    official = station_status(platforms)
    pairs: Counter[tuple[str | None, str | None]] = Counter()
    differences = []
    for station in network["stations"]:
        ours, theirs = station.get("stepFree"), official.get(station["id"])
        pairs[(ours, theirs)] += 1
        if ours != theirs:
            differences.append({"station": station["name"], "ours": ours, "topology": theirs})
    return {
        "official": dict(Counter(official.get(s["id"]) for s in network["stations"])),
        "pairs": {f"{a} / {b}": n for (a, b), n in sorted(pairs.items(), key=str)},
        "differences": differences,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--topology", type=Path, required=True, help="topology <date> directory")
    parser.add_argument("--network", type=Path, required=True, help="network.json to compare")
    args = parser.parse_args(argv)
    network = json.loads(args.network.read_text(encoding="utf-8"))
    print(json.dumps(compare(network, read_topology(args.topology).platforms), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
