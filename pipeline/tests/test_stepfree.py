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


def area(area_id, area_type, name=None, parent=STATION, product=None):
    result = {
        "parent": {"id": parent},
        "disassembledName": name or area_id,
        "properties": {"areaId": area_id, "areaType": area_type},
    }
    if product is not None:
        result["transportations"] = [{"product": {"class": product}}]
    return result


def platform(area_id, name, parent=STATION, area_type=81, product=2):
    return area(area_id, area_type, name, parent=parent, product=product)


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


AREAS = [area("e", 32), area("hall", 4096), platform("p1", "NB"), platform("p2", "SB")]


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


def test_platforms_are_tube_services_of_this_station_only():
    response = station(
        [
            *AREAS,
            platform("p3", "VicNB", area_type=65),  # type 65 tube platform (as at Pimlico)
            platform("r1", "Rail1", product=0),  # National Rail platform at a shared station
            area("bay", 1, "Bay"),  # terminus bay with no services listed
            platform("m1", "Other", parent="940GZZOTHER"),  # another tube station in the hub
        ],
        [path("e", "hall", ("LEVEL", 0)), path("hall", "p3", ("ELEVATOR", 0))],
    )
    access = analyse(STATION, response, other_stations=frozenset({"940GZZOTHER"}))
    assert access.platforms == {"NB": False, "SB": False, "VicNB": True}
    assert access.status == "partial"


def test_interchange_platforms_filed_under_the_complex():
    # As at Bank: tube platforms under the DLR stop id, Monument's under its own id.
    dlr, monument = "940GZZDLTEST", "940GZZLUMMT"
    response = station(
        [
            area("e", 36, parent=dlr),
            platform("c1", "CenEB", parent=dlr),
            platform("d1", "DLR1", parent=dlr, product=1),
            platform("m1", "DisEB", parent=monument),
        ],
        [path("e", "c1", ("ELEVATOR", 0), parent=dlr)],
    )
    access = analyse(STATION, response, other_stations=frozenset({monument}))
    assert access.platforms == {"CenEB": True}
    assert access.status == "full"


def test_own_platforms_win_over_the_complex():
    # As at Euston Square: its own platforms, not Euston's filed under the rail station id.
    rail = "910GTEST"
    response = station(
        [
            area("e", 32),
            platform("h1", "HamEB"),
            platform("v1", "VicNB", parent=rail),
        ],
        [path("e", "v1", ("ELEVATOR", 0))],
    )
    access = analyse(STATION, response)
    assert access.platforms == {"HamEB": False}


def test_routes_through_other_stops_count():
    # Hub responses: an entrance belonging to the rail station, through its concourse.
    rail = "910GTEST"
    response = station(
        [area("e", 36, parent=rail), area("c", 4096, parent=rail), platform("p1", "NB")],
        [
            path("e", "c", ("LEVEL", 0), parent=rail),
            {
                "from": {"parent": {"id": rail}, "properties": {"areaId": "c"}},
                "to": {"parent": {"id": STATION}, "properties": {"areaId": "p1"}},
                "pathDescription": [{"type": "ELEVATOR", "attributes": {"numberSteps": 0}}],
            },
        ],
    )
    assert analyse(STATION, response).status == "full"


def test_area_ids_are_scoped_to_their_stop():
    # A bus stop's area "e" must not be confused with the station's entrance "e".
    response = station(
        [area("e", 97, parent="490G000001"), area("x", 32), platform("p1", "NB")],
        [path("e", "p1", ("LEVEL", 0))],
    )
    assert analyse(STATION, response).status == "none"


def test_street_is_entrance_areas_or_ground_level():
    def with_level(a, level):
        a["properties"]["level"] = level
        return a

    # Entrance typed 33 at ground level (as at Battersea Power Station).
    ground = station(
        [with_level(area("x", 33), 0), platform("p1", "NB")], [path("x", "p1", ("LEVEL", 0))]
    )
    assert analyse(STATION, ground).status == "full"
    # Entrance at level 1 above platforms in a cutting (as at High Barnet).
    raised = station(
        [with_level(area("e", 36), 1), with_level(platform("p1", "NB"), 0)],
        [path("e", "p1", ("RAMP", 0))],
    )
    assert analyse(STATION, raised).status == "full"
    # A platform at ground level is not a starting point.
    level_platforms = station(
        [with_level(platform("p1", "NB"), 0), with_level(platform("p2", "SB"), 0)],
        [path("p1", "p2", ("LEVEL", 0))],
    )
    assert analyse(STATION, level_platforms).status is None


def test_unknown_without_entrances_or_platforms():
    assert analyse(STATION, station([platform("p1", "NB")], [])).status is None
    assert analyse(STATION, station([area("e", 32)], [])).status is None
    assert analyse(STATION, {}).status is None
