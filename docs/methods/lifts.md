# Method: step-free on paper, step-free in practice (S5)

A station is step-free only while its lifts work. S5 compares the stations step-free on paper ([step-free-access.md](step-free-access.md)) with the ones that were step-free at each moment, from a lift log this project has kept since its first day.

## Source

- **The lift log** (`pipeline/src/mind_the_step/lifts.py`, `collect-lifts` workflow): TfL's lift disruption feed (`/Disruptions/Lifts/v2/`), fetched every 15 minutes since 19 October 2026 and kept on the `data` branch (`lifts/log/`, one line per sample, and `lifts/payloads/`, each distinct response once). Failed fetches are logged too.
- **The station topology** (`data/tfl-station-topology/2026-10-20/`): TfL's published step-free pathways, where every lift pathway's id ends in `-lift-<lift id>`, the same ids the disruption feed names (`940GZZLUWYP-Lift-5`).

## Method

`pipeline/src/mind_the_step/lift_outages.py`:

1. For each sample, the set of lifts the feed lists as out of service.
2. For each distinct set, the topology is recomputed with those lifts' pathways removed, and each tube station's street-to-platform status worked out again (`topology.read_topology(lifts_out=...)`).
3. A station is **downgraded** at a sample when that status is worse than on paper: full to partial or none, partial to none.
4. A lift's **outage** is a run of consecutive samples listing it; runs that reach either end of the log are flagged, since their length is a lower bound.

The recomputation is checked against TfL's own words: at the latest sample it finds Canary Wharf with no step-free access, and the feed says "Step free access is not available to the Jubilee line due to a faulty lift"; Willesden Junction ("not available to the Bakerloo line"), Bond Street ("not available to the Central line") and Earl's Court ("no step-free access to/from the westbound District line") agree the same way. Conversely, Wembley Park's street lift is out until autumn 2026 but the station stays step-free, through its level entrance on Bridge Road, as TfL's message says.

## Results (log of 19–21 October 2026, 155 samples, none failed)

|                                                     |                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Fully step-free stations on paper                   | 95                                                                                                     |
| Of them, downgraded at the latest sample            | 5 (Bond Street and Earl's Court to partial; Canary Wharf, Canada Water and Willesden Junction to none) |
| Downgraded at least once in 2.2 days                | 13 of the 95, and 2 of the 14 partial                                                                  |
| Lifts out of service across TfL at a typical sample | 17                                                                                                     |
| Outages logged                                      | 39; median 1.8 hours for the 17 seen to start and end                                                  |

Three stations (Mill Hill East, Southfields, Wimbledon Park) lost step-free access not to a broken lift but, in TfL's words, to "unavailability of station staff".

These numbers grow with the log: the demo's deploy rebuilds `lifts.json` from the `data` branch every morning.

## Limitations

- **Two days so far.** The plan's survival analysis of outage lengths (Kaplan–Meier, Cox) needs a few hundred outages; at about 18 a day that is a few weeks of log.
- **15-minute resolution**: an outage shorter than the gap between samples may be missed, and lengths are rounded to 15 minutes.
- **What the feed lists**: lifts out for planned works and long replacements (Canada Water until spring 2027) count alongside faults; the feed does not say which is which, except in its free text.
- **Topology as of 20 October 2026**: a lift added or removed since would not be modelled.
