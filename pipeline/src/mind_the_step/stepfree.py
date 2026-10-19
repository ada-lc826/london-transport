"""Derive street-to-platform step-free access from TfL station topology.

Each Stop Structure response describes a station as areas joined by footpaths. A footpath is
a list of segments typed LEVEL, RAMP, ELEVATOR, ESCALATOR or STAIRS, with a step count. We
treat the station as a directed graph and call a platform step-free when it can be reached
from the street using only footpaths whose every segment is LEVEL, RAMP or ELEVATOR with
zero steps. Where a hop has alternatives (stairs and a lift), any step-free one will do.
This is TfL's street-to-platform definition; the gap between platform and train is not
covered by the topology.

Checked against stations of well-known status: Westminster, Green Park, Wembley Park and the
2021 Battersea Power Station and Nine Elms come out fully step-free; South Kensington, Baker
Street and all twelve stations on TfL's 2024 list of the next to be made step-free have no
step-free platform.
"""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field

# Where a journey starts: the street. Entrance areas are usually type 32 or 36, but some
# stations (e.g. Battersea Power Station) use type 33, which elsewhere marks bus-stop areas.
# So an area counts as street if it has an entrance type, or if it is at level 0 (ground) and
# is not a platform. Both are needed: High Barnet's entrance is at level 1, above platforms
# in a cutting, while Battersea's entrances are only recognisable by level.
AREA_ENTRANCES = frozenset({32, 36})
PLATFORM_AREA_TYPES = frozenset({1, 65, 81})
# Product class of London Underground services. Platform areas are recognised by the services
# the topology lists there, not by area type: most tube platforms are type 81, but some (e.g.
# Pimlico) are type 65, and type 81 is also used for National Rail platforms at shared
# stations. Areas with no services listed (a few terminus bays) are not counted.
TUBE_PRODUCT_CLASS = 2
STEP_FREE_SEGMENTS = frozenset({"LEVEL", "RAMP", "ELEVATOR"})

# An area is identified by its stop and its area id: area ids repeat across the stops in one
# response (a station, its hub, nearby bus stops and piers).
Node = tuple[str, str]


@dataclass
class StationAccess:
    naptan_id: str
    # Platform area code (e.g. "JubEB") -> reachable step-free from the street.
    platforms: dict[str, bool] = field(default_factory=dict)
    # Number of street-level areas journeys can start from.
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


def _node(endpoint: dict) -> Node | None:
    parent = (endpoint.get("parent") or {}).get("id")
    area_id = (endpoint.get("properties") or {}).get("areaId")
    return (parent, area_id) if parent and area_id is not None else None


def _is_street(area: dict) -> bool:
    props = area.get("properties") or {}
    if props.get("areaType") in AREA_ENTRANCES:
        return True
    return props.get("level") == 0 and props.get("areaType") not in PLATFORM_AREA_TYPES


def _is_tube_platform(area: dict) -> bool:
    return any(
        (t.get("product") or {}).get("class") == TUBE_PRODUCT_CLASS
        for t in area.get("transportations") or []
    )


def analyse(naptan_id: str, response: dict) -> StationAccess:
    """Step-free access to ``naptan_id``'s tube platforms.

    The response may be for the station itself or for the interchange hub it belongs to.
    Entrances and footpaths of every stop in it count, since a shared entrance or a rail
    concourse is a real route to the tube; only this station's tube platforms are assessed.
    """
    stop = response.get("stop") or {}
    areas = {node: area for area in stop.get("areas", []) if (node := _node(area))}

    step_free_edges: dict[Node, set[Node]] = defaultdict(set)
    for path in stop.get("footpaths", []):
        source, target = _node(path.get("from") or {}), _node(path.get("to") or {})
        segments = path.get("pathDescription") or []
        if source and target and segments and all(_segment_is_step_free(s) for s in segments):
            step_free_edges[source].add(target)

    entrances = [node for node, a in areas.items() if _is_street(a)]
    reached = set(entrances)
    stack = list(entrances)
    while stack:
        for nxt in step_free_edges[stack.pop()]:
            if nxt not in reached:
                reached.add(nxt)
                stack.append(nxt)

    platforms = {
        a.get("disassembledName") or node[1]: node in reached
        for node, a in areas.items()
        if node[0] == naptan_id and _is_tube_platform(a)
    }
    return StationAccess(naptan_id, platforms, len(entrances))


def analyse_bytes(naptan_id: str, raw: bytes) -> StationAccess:
    return analyse(naptan_id, json.loads(raw))
