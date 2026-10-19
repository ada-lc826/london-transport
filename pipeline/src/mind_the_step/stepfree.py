"""Derive street-to-platform step-free access from TfL station topology.

Each Stop Structure response describes a station as areas joined by footpaths. A footpath is
a list of segments typed LEVEL, RAMP, ELEVATOR, ESCALATOR or STAIRS, with a step count. We
treat the station as a directed graph and call a platform step-free when it can be reached
from some street entrance using only footpaths whose every segment is LEVEL, RAMP or
ELEVATOR with zero steps. This is TfL's street-to-platform definition; the gap between
platform and train is not covered by the topology.

Checked against stations of well-known status: Westminster, Green Park and Wembley Park come
out fully step-free; South Kensington and Baker Street have no step-free platform.
"""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field

# Area types observed in Stop Structure responses for tube stations.
AREA_PLATFORM = 81
AREA_ENTRANCES = frozenset({32, 36})  # street-level entrances (both seen in the data)
STEP_FREE_SEGMENTS = frozenset({"LEVEL", "RAMP", "ELEVATOR"})


@dataclass
class StationAccess:
    naptan_id: str
    # Platform area code (e.g. "JubEB") -> reachable step-free from the street.
    platforms: dict[str, bool] = field(default_factory=dict)
    entrances: int = 0

    @property
    def status(self) -> str | None:
        """'full', 'partial' or 'none'; None when the topology has no platforms or entrances."""
        if not self.platforms or self.entrances == 0:
            return None
        reachable = sum(self.platforms.values())
        if reachable == len(self.platforms):
            return "full"
        return "partial" if reachable else "none"


def _segment_is_step_free(segment: dict) -> bool:
    attributes = segment.get("attributes") or {}
    return segment.get("type") in STEP_FREE_SEGMENTS and not attributes.get("numberSteps")


def analyse(naptan_id: str, response: dict) -> StationAccess:
    stop = response.get("stop") or {}
    # Responses also include nearby bus stops and piers; keep only this station's areas.
    areas = {
        area["properties"]["areaId"]: area
        for area in stop.get("areas", [])
        if (area.get("parent") or {}).get("id") == naptan_id
    }

    step_free_edges: dict[str, set[str]] = defaultdict(set)
    for path in stop.get("footpaths", []):
        source, target = path.get("from") or {}, path.get("to") or {}
        if (source.get("parent") or {}).get("id") != naptan_id:
            continue
        if (target.get("parent") or {}).get("id") != naptan_id:
            continue
        segments = path.get("pathDescription") or []
        if segments and all(_segment_is_step_free(s) for s in segments):
            step_free_edges[source["properties"]["areaId"]].add(target["properties"]["areaId"])

    entrances = [i for i, a in areas.items() if a["properties"].get("areaType") in AREA_ENTRANCES]
    reached = set(entrances)
    stack = list(entrances)
    while stack:
        for nxt in step_free_edges[stack.pop()]:
            if nxt not in reached:
                reached.add(nxt)
                stack.append(nxt)

    platforms = {
        areas[i].get("disassembledName") or i: i in reached
        for i, a in areas.items()
        if a["properties"].get("areaType") == AREA_PLATFORM
    }
    return StationAccess(naptan_id, platforms, len(entrances))


def analyse_bytes(naptan_id: str, raw: bytes) -> StationAccess:
    return analyse(naptan_id, json.loads(raw))
