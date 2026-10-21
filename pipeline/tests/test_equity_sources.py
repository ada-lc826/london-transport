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
