from mind_the_step.equity_sources import iod_attachments, pick_iod, pick_service


def test_iod_attachments_from_details_and_html():
    content = {
        "details": {
            "attachments": [{"title": "File 1: index of multiple deprivation", "url": "a.xlsx"}],
            "documents": ['<a class="x" href="b.csv">File 7: all ranks, deciles and scores</a>'],
        }
    }
    found = iod_attachments(content)
    assert [a["url"] for a in found] == ["a.xlsx", "b.csv"]
    assert pick_iod(found)["url"] == "b.csv"


def test_pick_iod_falls_back_to_file_1_and_none():
    assert pick_iod([{"title": "File 1: IMD", "url": "a"}])["url"] == "a"
    assert pick_iod([{"title": "Technical report", "url": "t"}]) is None
    # "File 10" is not File 1.
    assert pick_iod([{"title": "File 10: underlying indicators", "url": "x"}]) is None


def test_pick_service_prefers_latest_version():
    services = [
        {"name": "LSOA_Dec_2021_PWC_for_England_and_Wales"},
        {"name": "MSOA_Dec_2021_PWC_for_England_and_Wales"},
        {"name": "MSOA_December_2021_EW_PWC_V2"},
        {"name": "MSOA_Dec_2021_Boundaries_Full_Clipped_EW_BFC"},
    ]
    assert pick_service(services) == "MSOA_December_2021_EW_PWC_V2"
    assert pick_service([{"name": "Wards_2024"}]) is None


def test_london_bus_stops_keeps_active_london_bus_stops():
    from mind_the_step.equity_sources import london_bus_stops

    text = (
        "ATCOCode,StopType,Latitude,Longitude,Status\n"
        "490000001A,BCT,51.5,-0.1,active\n"
        "490000002B,BCT,51.6,-0.2,inactive\n"
        "490000003C,RSE,51.5,-0.1,active\n"
        "1800SB01,BCT,53.4,-2.2,active\n"
        "490000004D,BCT,,,active\n"
    )
    assert london_bus_stops(text) == [
        {"atco": "490000001A", "type": "BCT", "lat": 51.5, "lon": -0.1}
    ]
