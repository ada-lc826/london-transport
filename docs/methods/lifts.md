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

## Results (log of 19 October – 8 November 2026, 1,656 samples, none failed)

|                                                     |                                           |
| --------------------------------------------------- | ----------------------------------------- |
| Fully step-free stations on paper                   | 95                                        |
| Of them, downgraded at the latest sample            | 5, plus 2 of the 14 partial stations      |
| Downgraded at least once in 19 days                 | **41 of the 95**, and 4 of the 14 partial |
| Lifts out of service across TfL at a typical sample | 17                                        |
| Outages logged                                      | 236, of 150 lifts at 97 stations          |

Twelve stations' latest TfL message gives the reason as staffing ("unavailability of station staff") rather than a broken lift, among them Mill Hill East, Southfields, Wimbledon Park, Kilburn and Knightsbridge.

These numbers grow with the log: the demo's deploy rebuilds `lifts.json` and `lift-survival.json` from the `data` branch every morning.

## How long outages last (S5, step 3)

`pipeline/src/mind_the_step/lift_survival.py`:

- **An outage** is a run of consecutive samples that list a lift. A single missing sample inside a run is treated as a feed glitch, so it does not split the outage.
- **Duration.** An outage began between the last sample without the lift and the first with it, and ended between the last with it and the next without. Its duration is the midpoint of the shortest and longest durations those bounds allow, so it is accurate to about one sampling interval.
- **Censoring.**
    - Outages still under way at the latest sample are right-censored at their length so far (10 of them).
    - Outages already under way at the first sample have an unknown start and are left out (15). Keeping them would favour long outages, which are more likely to be under way at any given moment.
    - That leaves 221 outages, 211 seen to end.
- **Groups:**
    - **single-lift station** (one lift in TfL's `Lifts.csv`);
    - **cuts access**: losing this lift alone worsens a tube station's step-free status on TfL's topology (61 such lifts);
    - **mode**: Underground, or rail, Overground, DLR and Elizabeth line.
- **Methods:**
    - Kaplan–Meier survival curves, overall and by group;
    - log-rank tests between groups;
    - a Cox proportional-hazards model with all three covariates, checked with the Schoenfeld-residual test.

| Kaplan–Meier                     | Outages | Median | Still out after 1 day | after 3 days | after 1 week |
| -------------------------------- | ------: | -----: | --------------------: | -----------: | -----------: |
| All                              |     221 |  6.0 h |                   23% |           8% |           2% |
| Underground                      |      67 |  1.8 h |                    7% |           5% |           0% |
| Rail, Overground, DLR, Elizabeth |     154 |  9.3 h |                   30% |           9% |           3% |
| Single-lift station              |      26 |  4.3 h |                    8% |           0% |           0% |
| Lift that cuts access            |      99 |  3.0 h |                   13% |           8% |           2% |

| Cox model (hazard of repair) | Hazard ratio (95% CI) | p      |
| ---------------------------- | --------------------- | ------ |
| Underground                  | 2.14 (1.39–3.30)      | 0.0006 |
| Single-lift station          | 1.11 (0.72–1.72)      | 0.64   |
| Cuts access                  | 1.04 (0.70–1.54)      | 0.85   |

- **Half of all outages last more than 6 hours,** and almost a quarter are still under way a day later. Of the outages seen to end, the median is 5.5 hours and the mean 17.2: a long tail, up to 163 hours. Tube Alerter's 80-day study found a median of 5.7 hours and a mean of 30.8, so the two logs agree on the typical outage.
- **Underground lifts are repaired about twice as fast** as those elsewhere, even allowing for the other two covariates.
- **Lifts that cut access, and single-lift stations, look faster to fix in the simple comparisons** (log-rank p = 0.0005 and 0.04). That difference disappears once mode is in the model: such lifts are mostly on the Underground. Mode is a confounder, and the wall states only the effect that survives it.
- **The proportional-hazards assumption fails for the single-lift covariate** (p = 0.006). Its hazard ratio is an average over time, and with only 26 outages it should not be read further.

## Limitations

- **Three weeks so far**: 221 usable outages, fewer than the few hundred the plan hoped for. Group estimates (26 single-lift outages) are rough, and the figures move as the log grows.
- **Gaps in sampling**: the logger runs on GitHub's scheduler, which sometimes delays a run (25 gaps over an hour, the longest under 5 hours). An outage spanning a gap is still one outage, but its start or end is less precise.
- **15-minute resolution**: an outage shorter than the gap between samples may be missed, and lengths are known to about 15 minutes.
- **What the feed lists**: lifts out for planned works and long replacements (Canada Water until spring 2027) count alongside faults; the feed does not say which is which, except in its free text.
- **Topology as of 20 October 2026**: a lift added or removed since would not be modelled.
