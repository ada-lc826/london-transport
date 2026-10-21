import json

from mind_the_step.races_export import build, journey


def leg(mode, depart, arrive, line=None, start="A", end="B", obstacles=(), path=None):
    return {
        "mode": {"id": mode},
        "routeOptions": [{"name": line or ""}],
        "departureTime": f"2026-10-27T{depart}:00",
        "arrivalTime": f"2026-10-27T{arrive}:00",
        "departurePoint": {"commonName": start},
        "arrivalPoint": {"commonName": end},
        "obstacles": [{"type": t} for t in obstacles],
        "path": {"lineString": json.dumps(path)} if path else {},
    }


RESPONSE = {
    "journeys": [
        {"startDateTime": "2026-10-27T08:30:00", "duration": 40, "legs": []},
        {
            "startDateTime": "2026-10-27T08:32:00",
            "duration": 32,
            "legs": [
                leg(
                    "walking",
                    "08:32",
                    "08:35",
                    start="4-6 STATION ARCADE, LONDON",
                    end="South Kensington Underground Station",
                ),
                leg(
                    "tube",
                    "08:38",
                    "08:59",
                    "Piccadilly",
                    "Knightsbridge Underground Station",
                    "Archway Station  / Holloway Road",
                    ["LIFT", "STAIRS", "LIFT"],
                    [[51.5, -0.17], [51.51, -0.16], [51.52, -0.15]],
                ),
            ],
        },
    ]
}


def test_journey_takes_the_fastest_and_times_legs_from_departure():
    result = journey(RESPONSE)
    assert result["depart"] == "08:32" and result["minutes"] == 32
    walk, tube = result["legs"]
    assert (walk["start"], walk["end"], tube["start"], tube["end"]) == (0, 3, 6, 27)
    # Names cleaned for the wall: suffixes dropped, capitals and doubled spaces tidied.
    assert walk["from"] == "4-6 Station Arcade" and walk["to"] == "South Kensington"
    assert tube["to"] == "Archway Station / Holloway Road"
    assert (tube["line"], tube["lifts"], walk["line"]) == ("Piccadilly", 2, None)
    # Paths come as [lat, lon]; the asset stores [lon, lat].
    assert tube["path"][0] == [-0.17, 51.5]


def test_journey_without_results_is_none():
    assert journey({"journeys": []}) is None
    assert journey({}) is None


def test_build_pairs_scenarios_by_race(tmp_path):
    (tmp_path / "r1-standard.json").write_text(json.dumps(RESPONSE))
    spec = [
        {"name": "r1-standard", "race": "r1", "origin": "O", "destination": "D"},
        {"name": "r1-step-free", "race": "r1", "origin": "O", "destination": "D"},
    ]
    (race,) = build(spec, tmp_path)["races"]
    assert (race["id"], race["origin"], race["destination"]) == ("r1", "O", "D")
    assert race["standard"]["minutes"] == 32
    # No saved response for the step-free request: no journey, not an error.
    assert race["stepFree"] is None
