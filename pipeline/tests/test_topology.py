from pathlib import Path

from mind_the_step.topology import line_access, read_topology, station_status

TOPOLOGY = Path(__file__).parent / "fixtures" / "topology"


def test_platforms_reached_from_outside_are_step_free():
    platforms = {(p.id, p.line): p for p in read_topology(TOPOLOGY).platforms}
    # One entry per platform and line, however many destinations PlatformServices lists.
    assert set(platforms) == {
        ("940GZZA-Plat1-NB-victoria", "victoria"),
        ("940GZZA-Plat2-WB-jubilee", "jubilee"),
        ("940GZZA-Plat4-EB-jubilee", "jubilee"),
        ("HUBB-Plat1-EB-central|national-rail", "central"),
    }
    assert platforms[("940GZZA-Plat1-NB-victoria", "victoria")].step_free is True
    assert platforms[("940GZZA-Plat2-WB-jubilee", "jubilee")].step_free is False
    # A one-way pathway still counts in its own direction.
    assert platforms[("940GZZA-Plat4-EB-jubilee", "jubilee")].step_free is True
    # Filed under the hub, keyed by the stop area the line calls at; no information -> None.
    hub = platforms[("HUBB-Plat1-EB-central|national-rail", "central")]
    assert (hub.station, hub.step_free) == ("940GZZB", None)


def test_platforms_not_facing_customers_do_not_count():
    # Plat3 (out of use, no step-free path) would otherwise make the station partial.
    platforms = read_topology(TOPOLOGY).platforms
    assert station_status(platforms) == {"940GZZA": "partial", "940GZZB": None}
    assert line_access(platforms) == {
        ("940GZZA", "victoria"): True,
        ("940GZZA", "jubilee"): False,
        ("940GZZB", "central"): None,
    }


def test_transfers_need_a_step_free_path_from_every_platform_of_the_line():
    # Victoria -> Jubilee: Plat1 reaches Plat4. Jubilee -> Victoria: Plat2 reaches nothing.
    assert read_topology(TOPOLOGY).transfers == {("940GZZA", "victoria", "jubilee")}


def test_a_lift_out_of_service_cuts_its_pathways():
    # Plat1 is reached from the street only by the lift p2.
    platforms = read_topology(TOPOLOGY, lifts_out=frozenset({"940GZZA-Lift-1"})).platforms
    assert station_status(platforms)["940GZZA"] == "none"
