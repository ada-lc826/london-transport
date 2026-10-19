import gzip
import json

from mind_the_step import network


def write(path, payload):
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(payload, f)


def test_build_network(tmp_path):
    write(
        tmp_path / "stoppoints-tube.json.gz",
        {
            "stopPoints": [
                {
                    "stopType": "NaptanMetroStation",
                    "naptanId": "940GZZLUVIC",
                    "commonName": "Victoria Underground Station",
                    "lat": 51.4965123,
                    "lon": -0.1447234,
                    "lines": [{"id": "victoria"}, {"id": "district"}, {"id": "some-bus"}],
                },
                {"stopType": "NaptanMetroPlatform", "naptanId": "9400ZZLUVIC1"},
                {
                    "stopType": "NaptanMetroStation",
                    "naptanId": "940GZZNOTUBE",
                    "commonName": "Not A Tube Station",
                    "lat": 0,
                    "lon": 0,
                    "lines": [{"id": "dlr"}],
                },
            ]
        },
    )
    for line_id in network.LINE_COLOURS:
        route = {"lineName": line_id.title(), "lineStrings": []}
        if line_id == "victoria":
            route["lineStrings"] = [json.dumps([[[-0.1447234, 51.4965123], [-0.1, 51.5]]])]
        write(tmp_path / f"route-{line_id}.json.gz", route)

    result = network.build_network(tmp_path)

    assert result["stations"] == [
        {
            "id": "940GZZLUVIC",
            "name": "Victoria",
            "lon": -0.14472,
            "lat": 51.49651,
            "lines": ["district", "victoria"],
            "stepFree": None,
        }
    ]
    victoria = next(line for line in result["lines"] if line["id"] == "victoria")
    assert victoria["paths"] == [[[-0.14472, 51.49651], [-0.1, 51.5]]]
    assert victoria["colour"] == "#0098D4"
    assert len(result["lines"]) == 11
