"""Build the web app's tube network asset from a snapshot.

Reads ``snapshots/<date>/`` (from the ``data`` branch) and writes one JSON file with the tube
lines (geometry from route sequences) and the 272 tube stations. Each station's
``stepFree`` is ``"full"``, ``"partial"`` or ``"none"`` (street to platform, derived from its
topology by ``stepfree.py``), or ``null`` when the topology is missing or unusable: the
scenes show unknown as unknown rather than guessing. ``stepFreePlatforms`` is
``[step-free platforms, platforms]``.

    uv run python -m mind_the_step.network --snapshot <dir> --out <network.json>
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
from pathlib import Path

from . import stepfree

# TfL line colours (TfL colour standard). Used only where viewers need to recognise a line.
LINE_COLOURS = {
    "bakerloo": "#B36305",
    "central": "#E32017",
    "circle": "#FFD300",
    "district": "#00782A",
    "hammersmith-city": "#F3A9BB",
    "jubilee": "#A0A5A9",
    "metropolitan": "#9B0056",
    "northern": "#000000",
    "piccadilly": "#003688",
    "victoria": "#0098D4",
    "waterloo-city": "#95CDBA",
}

# ~1 m precision: plenty for a wall map, and keeps the asset small.
COORD_DECIMALS = 5
STATION_SUFFIX = " Underground Station"


def _load(path: Path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def _round(value: float) -> float:
    return round(value, COORD_DECIMALS)


def _step_free(snapshot_dir: Path, naptan_id: str, all_stations: frozenset[str]) -> dict:
    """Street-to-platform status from the station's topology, or nulls when it is missing."""
    topology = snapshot_dir / "stopstructure" / f"{naptan_id}.json.gz"
    if not topology.exists():
        return {"stepFree": None, "stepFreePlatforms": None}
    with gzip.open(topology, "rb") as f:
        access = stepfree.analyse_bytes(naptan_id, f.read(), all_stations - {naptan_id})
    reachable = sum(access.platforms.values())
    return {"stepFree": access.status, "stepFreePlatforms": [reachable, len(access.platforms)]}


def _station_order(route: dict, station_ids: set[str]) -> list[str]:
    """The line's stations, each once, following its longest route first and then branches."""
    routes = sorted(
        (r.get("naptanIds") or [] for r in route.get("orderedLineRoutes", [])),
        key=len,
        reverse=True,
    )
    ordered = dict.fromkeys(n for r in routes for n in r if n in station_ids)
    return list(ordered)


def build_network(snapshot_dir: Path) -> dict:
    stop_points = _load(snapshot_dir / "stoppoints-tube.json.gz")["stopPoints"]
    all_stations = frozenset(
        sp["naptanId"] for sp in stop_points if sp.get("stopType") == "NaptanMetroStation"
    )
    stations = []
    for sp in stop_points:
        if sp.get("stopType") != "NaptanMetroStation":
            continue
        tube_lines = sorted(
            line["id"] for line in sp.get("lines", []) if line.get("id") in LINE_COLOURS
        )
        if not tube_lines:
            continue
        name = sp["commonName"]
        stations.append(
            {
                "id": sp["naptanId"],
                "name": name.removesuffix(STATION_SUFFIX),
                "lon": _round(sp["lon"]),
                "lat": _round(sp["lat"]),
                "lines": tube_lines,
                **_step_free(snapshot_dir, sp["naptanId"], all_stations),
            }
        )
    stations.sort(key=lambda s: s["id"])

    station_ids = {station["id"] for station in stations}
    lines = []
    for line_id, colour in LINE_COLOURS.items():
        route = _load(snapshot_dir / f"route-{line_id}.json.gz")
        paths = []
        for encoded in route.get("lineStrings", []):
            # Each lineString is a JSON string holding a list of [lon, lat] paths.
            for path in json.loads(encoded):
                paths.append([[_round(lon), _round(lat)] for lon, lat in path])
        lines.append(
            {
                "id": line_id,
                "name": route["lineName"],
                "colour": colour,
                "paths": paths,
                "stations": _station_order(route, station_ids),
            }
        )

    return {
        "source": {
            "snapshot": snapshot_dir.name,
            "attribution": "Powered by TfL Open Data",
            "stepFree": "street to platform, derived from TfL Stop Structure topology",
        },
        "lines": lines,
        "stations": stations,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--snapshot", type=Path, required=True, help="snapshots/<date> directory")
    parser.add_argument("--out", type=Path, required=True, help="network.json to write")
    args = parser.parse_args(argv)

    network = build_network(args.snapshot)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(network, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(network['stations'])} stations, {len(network['lines'])} lines -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
