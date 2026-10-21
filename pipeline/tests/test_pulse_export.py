import openpyxl

from mind_the_step.pulse_export import QUARTERS, build, normalise

TIMES = [f"q{i}" for i in range(QUARTERS)]
TIMES[0] = "0500-0515"
NETWORK = {
    "lines": [
        {"id": "victoria", "colour": "#0098D4"},
        {"id": "hammersmith-city", "colour": "#F3A9BB"},
    ],
    "stations": [
        {"id": "A", "name": "Brixton", "stepFree": "full"},
        {"id": "B", "name": "Stockwell", "stepFree": "none"},
        {"id": "C", "name": "Bank", "stepFree": "partial"},
    ],
}


def quarters(first, rest=0.0):
    return [first] + [rest] * (QUARTERS - 1)


def sheet(workbook, title, header, rows):
    ws = workbook.create_sheet(title)
    ws.append([title])
    ws.append([])
    ws.append(header + TIMES)
    for row in rows:
        ws.append(row)


def workbook():
    wb = openpyxl.Workbook()
    sheet(
        wb,
        "Line_Boarders",
        ["Mode", "Line Code", "Line Name", "Total"],
        [
            ["LU", "VIC", "Victoria", 10, *quarters(10)],
            ["DLR", "DLR", "DLR", 5, *quarters(5)],
        ],
    )
    link_header = [
        "Link",
        "Line",
        "Dir",
        "Order",
        "From NLC",
        "From ASC",
        "From Station",
        "To NLC",
        "To ASC",
        "To Station",
        "Total",
    ]
    sheet(
        wb,
        "Link_Loads",
        link_header,
        [
            ["x", "Victoria", "NB", 1, 1, "", "Brixton LU", 2, "", "Stockwell", 0, *quarters(100)],
            ["y", "Victoria", "SB", 1, 2, "", "Stockwell", 1, "", "Brixton LU", 0, *quarters(50)],
            ["z", "DLR", "NB", 1, 3, "", "Bank and Monument", 4, "", "Shadwell", 0, *quarters(9)],
        ],
    )
    station_header = ["NLC", "ASC", "Station", "Fare Zone", "Total"]
    sheet(
        wb,
        "Station_Entries",
        station_header,
        [
            [1, "", "Brixton LU", 2, 0, *quarters(30)],
            [2, "", "Stockwell", 2, 0, *quarters(20)],
            [3, "", "Bank and Monument", 1, 0, *quarters(10)],
            [9, "", "Shadwell", 2, 0, *quarters(5)],
        ],
    )
    sheet(wb, "Station_Exits", station_header, [[1, "", "Brixton LU", 2, 0, *quarters(15, 40)]])
    return wb


def test_normalise_matches_numbat_names_to_ours():
    assert normalise("Brixton LU") == normalise("Brixton")
    assert normalise("Heathrow Terminals 123 LU") == normalise("Heathrow Terminals 2 & 3")
    assert normalise("Bank and Monument") == normalise("Bank")
    assert normalise("King's Cross St. Pancras") == "kings cross st pancras"


def test_build_keeps_the_tube_and_adds_both_directions():
    result = build(workbook(), NETWORK)
    assert [line["name"] for line in result["lines"]] == ["Victoria"]
    (link,) = result["links"]
    assert (link["line"], link["a"], link["b"], link["load"][0]) == ("victoria", "A", "B", 150)


def test_build_counts_people_on_the_network_and_entries_by_step_free_status():
    result = build(workbook(), NETWORK)
    flow = result["network"]
    # Entries 65 then 0; exits 15 then 40 a quarter: 50 on the network, then 10, then none.
    assert flow["entries"][0] == 65 and flow["onNetwork"][:3] == [50, 10, 0]
    # Only tube stations count; Bank and Monument counts as Bank.
    assert result["stations"]["A"][0] == 30
    assert {k: v[0] for k, v in result["stepFree"].items()} == {
        "full": 30,
        "none": 20,
        "partial": 10,
    }
