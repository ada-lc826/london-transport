"""Build S1's asset (The Pulse) from a NUMBAT outputs workbook.

NUMBAT (numbat.py) models a typical autumn day in 96 quarter-hours from 05:00. From the
`*_Outputs.xlsx` workbook this keeps, for the tube:

- `lines`: boarders per quarter-hour on each line (Line_Boarders);
- `links`: passengers per quarter-hour between consecutive stations, both directions added
  together, by line (Link_Loads), with stations as network.json ids;
- `network`: entries and exits per quarter-hour over the whole NUMBAT network (tube,
  Overground, DLR, Elizabeth line), and people on it: entries so far minus exits so far;
- `stepFree`: tube station entries per quarter-hour by the station's step-free status;
- `stations`: entries per quarter-hour at each tube station (network.json id).

NUMBAT names stations its own way; `_station_id` maps them to network.json, with the few
differences listed in ALIASES. Bank and Monument are one complex in NUMBAT; its entries count
under Bank.

    uv run python -m mind_the_step.pulse_export --outputs NBT25TWT_Outputs.xlsx \\
        --network ../apps/website/public/data/network.json --out pulse.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import openpyxl

QUARTERS = 96
# NUMBAT line name -> network.json line id. NUMBAT combines the H&C and the Circle.
TUBE_LINES = {
    "Bakerloo": "bakerloo",
    "Central": "central",
    "District": "district",
    "H&C and Circle": "hammersmith-city",
    "Jubilee": "jubilee",
    "Metropolitan": "metropolitan",
    "Northern": "northern",
    "Piccadilly": "piccadilly",
    "Victoria": "victoria",
    "Waterloo & City": "waterloo-city",
}
# Normalised NUMBAT name -> normalised network.json name, where they differ beyond spelling.
ALIASES = {
    "bank and monument": "bank",
    "heathrow terminals 123": "heathrow terminals 2 and 3",
    "paddington tfl": "paddington",
}


def normalise(name: str) -> str:
    """Lower case, '&' as 'and', no punctuation, no bracketed or ' LU' qualifiers."""
    n = name.lower().replace("&", "and").replace("'", "").replace(".", "")
    n = re.sub(r"\(.*?\)", " ", n)
    n = re.sub(r"\blu\b", " ", n)
    n = re.sub(r"[^a-z0-9 ]", " ", n)
    n = " ".join(n.split())
    return ALIASES.get(n, n)


def _rows(workbook, sheet: str) -> tuple[list[str], list[tuple]]:
    """A sheet's header row (the third) and its data rows."""
    rows = list(workbook[sheet].iter_rows(values_only=True))
    header = [str(c) if c is not None else "" for c in rows[2]]
    return header, [r for r in rows[3:] if r and r[0] is not None]


def _quarters(header: list[str], row: tuple) -> list[float]:
    start = header.index("0500-0515")
    return [float(v or 0) for v in row[start : start + QUARTERS]]


def build(workbook, network: dict) -> dict:
    by_name: dict[str, str] = {}
    for station in network["stations"]:
        by_name.setdefault(normalise(station["name"]), station["id"])
    status = {s["id"]: s.get("stepFree") or "unknown" for s in network["stations"]}
    colours = {line["id"]: line["colour"] for line in network["lines"]}
    unmatched: set[str] = set()

    def station_id(name: str) -> str | None:
        found = by_name.get(normalise(name))
        if found is None:
            unmatched.add(name)
        return found

    header, rows = _rows(workbook, "Line_Boarders")
    times = header[header.index("0500-0515") :][:QUARTERS]
    lines = [
        {
            "name": row[2],
            "id": TUBE_LINES[row[2]],
            "colour": colours[TUBE_LINES[row[2]]],
            "boarders": [round(v) for v in _quarters(header, row)],
        }
        for row in rows
        if row[2] in TUBE_LINES
    ]

    header, rows = _rows(workbook, "Link_Loads")
    col = {name: i for i, name in enumerate(header)}
    links: dict[tuple[str, str, str], list[float]] = {}
    for row in rows:
        line = TUBE_LINES.get(row[col["Line"]])
        if line is None:
            continue
        a = station_id(row[col["From Station"]])
        b = station_id(row[col["To Station"]])
        if a is None or b is None or a == b:
            continue
        key = (line, *sorted((a, b)))
        loads = _quarters(header, row)
        # Both directions, and any duplicate rows (e.g. fast and stopping Metropolitan
        # services between the same stations), add up.
        links[key] = [x + y for x, y in zip(links.get(key, [0.0] * QUARTERS), loads, strict=True)]

    network_flow = {}
    tube_entries: dict[str, list[float]] = defaultdict(lambda: [0.0] * QUARTERS)
    for sheet in ("Station_Entries", "Station_Exits"):
        header, rows = _rows(workbook, sheet)
        totals = [0.0] * QUARTERS
        for row in rows:
            values = _quarters(header, row)
            totals = [t + v for t, v in zip(totals, values, strict=True)]
            if sheet == "Station_Entries":
                found = by_name.get(normalise(str(row[2])))
                if found is not None:
                    tube_entries[found] = [
                        t + v for t, v in zip(tube_entries[found], values, strict=True)
                    ]
        network_flow[sheet] = totals
    entries, exits = network_flow["Station_Entries"], network_flow["Station_Exits"]
    on_network, running = [], 0.0
    for came, went in zip(entries, exits, strict=True):
        running += came - went
        on_network.append(round(max(running, 0.0)))

    by_status: dict[str, list[float]] = defaultdict(lambda: [0.0] * QUARTERS)
    for station, values in tube_entries.items():
        by_status[status[station]] = [
            t + v for t, v in zip(by_status[status[station]], values, strict=True)
        ]

    if unmatched:
        print(f"unmatched NUMBAT stations on tube links: {sorted(unmatched)}", file=sys.stderr)
    return {
        "times": times,
        "lines": lines,
        "links": [
            {"line": line, "a": a, "b": b, "load": [round(v) for v in loads]}
            for (line, a, b), loads in sorted(links.items())
        ],
        "network": {
            "entries": [round(v) for v in entries],
            "exits": [round(v) for v in exits],
            "onNetwork": on_network,
        },
        "stepFree": {k: [round(v) for v in values] for k, values in sorted(by_status.items())},
        "stations": {
            station: [round(v) for v in values] for station, values in sorted(tube_entries.items())
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--outputs", type=Path, required=True, help="NBTyyDAY_Outputs.xlsx")
    parser.add_argument("--network", type=Path, required=True, help="network.json")
    parser.add_argument("--source", default="", help="description of the outputs file")
    parser.add_argument("--out", type=Path, required=True, help="output JSON")
    args = parser.parse_args(argv)
    workbook = openpyxl.load_workbook(args.outputs, read_only=True, data_only=True)
    network = json.loads(args.network.read_text(encoding="utf-8"))
    result = {
        "source": {
            "description": args.source,
            "attribution": "Powered by TfL Open Data (NUMBAT)",
        },
        **build(workbook, network),
    }
    args.out.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")
    flow = result["network"]
    print(
        f"{len(result['lines'])} lines, {len(result['links'])} links, "
        f"{sum(flow['entries']):,.0f} entries, {sum(flow['exits']):,.0f} exits, "
        f"peak on network {max(flow['onNetwork']):,}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
