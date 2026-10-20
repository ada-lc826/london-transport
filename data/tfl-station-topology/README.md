# TfL station topology

TfL's published step-free station topology, downloaded by hand from tfl.gov.uk (the site refuses
automated downloads) and committed as-is. Each folder is named by the feed's `FeedStartDate`.

- `detailed/`: "Station topology files (detailed)", CSV: stations, platforms, the lines serving each
  platform with step and gap measurements, step-free paths (same level, ramp, lift) and step-free
  interchange distances.
- `gtfs/`: "Station topology files (GTFS)": the same network as GTFS `stops.txt` and
  `pathways.txt`, which only lists step-free pathways.

Specification: [step-free station topology data guide](https://content.tfl.gov.uk/step-free-access-and-toilet-data-guide.pdf)
(v1.0, July 2021). Read by `pipeline/src/mind_the_step/topology.py`.

Powered by TfL Open Data. Contains OS data © Crown copyright and database rights.
