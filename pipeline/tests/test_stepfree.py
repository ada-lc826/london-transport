import json
from pathlib import Path

from mind_the_step.stepfree import analyse

FIXTURES = Path(__file__).parent / "fixtures"
STATION = "940GZZTEST"


def real(name):
    return json.loads((FIXTURES / f"stopstructure-{name}.json").read_text())


def test_real_station_with_lifts_is_fully_step_free():
    access = analyse("940GZZLUWYP", real("wembley-park"))
    assert access.status == "full"
    assert set(access.platforms) == {"JubNB", "JubSB", "MET6", "Met5", "Met2"}


def test_real_station_with_only_stairs_and_escalators_is_not():
    access = analyse("940GZZLUSKS", real("south-kensington"))
    assert access.status == "none"
    assert len(access.platforms) == 4


def area(area_id, area_type, name=None, parent=STATION):
    return {
        "parent": {"id": parent},
        "disassembledName": name or area_id,
        "properties": {"areaId": area_id, "areaType": area_type},
    }


def path(source, target, *segments, parent=STATION):
    return {
        "from": {"parent": {"id": parent}, "properties": {"areaId": source}},
        "to": {"parent": {"id": parent}, "properties": {"areaId": target}},
        "pathDescription": [
            {"type": kind, "attributes": {"numberSteps": steps}} for kind, steps in segments
        ],
    }


def station(areas, paths):
    return {"stop": {"areas": areas, "footpaths": paths}}


AREAS = [area("e", 32), area("hall", 4096), area("p1", 81, "NB"), area("p2", 81, "SB")]


def test_partial_when_only_some_platforms_are_reachable():
    response = station(
        AREAS,
        [
            path("e", "hall", ("LEVEL", 0)),
            path("hall", "p1", ("LEVEL", 0), ("ELEVATOR", 0)),
            path("hall", "p2", ("ESCALATOR", 0)),
        ],
    )
    access = analyse(STATION, response)
    assert access.platforms == {"NB": True, "SB": False}
    assert access.status == "partial"


def test_any_stepped_segment_breaks_a_path():
    response = station(
        AREAS,
        [
            path("e", "hall", ("LEVEL", 0)),
            path("hall", "p1", ("LEVEL", 0), ("STAIRS", 12)),
            path("hall", "p2", ("RAMP", 2)),  # a ramp with steps recorded is not step-free
        ],
    )
    assert analyse(STATION, response).status == "none"


def test_paths_are_directed():
    # A step-free way out is not a step-free way in.
    response = station(AREAS, [path("p1", "e", ("ELEVATOR", 0)), path("p2", "e", ("LEVEL", 0))])
    assert analyse(STATION, response).status == "none"


def test_other_stops_in_the_response_are_ignored():
    response = station(
        [*AREAS, area("bus", 32, parent="490G000001")],
        [path("bus", "p1", ("LEVEL", 0), parent="490G000001")],
    )
    assert analyse(STATION, response).status == "none"


def test_unknown_without_entrances_or_platforms():
    assert analyse(STATION, station([area("p1", 81)], [])).status is None
    assert analyse(STATION, station([area("e", 32)], [])).status is None
    assert analyse(STATION, {}).status is None
