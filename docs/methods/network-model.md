# Method: network model v1 and its calibration

A model of tube travel time, standard and step-free, fitted to the Journey Planner answers in [travel-times.md](travel-times.md). The planner gives answers for 12 origins; the model can answer for any pair of stations, for the network as it is or with stations changed, which the later scenes need (S6's race, S7's "what would fix it"). This page says how well it reproduces the planner, and what the gap says about step-free travel.

Code: `pipeline/src/mind_the_step/model.py`, `calibrate.py`, `topology.py`. Report: [`data/model/network-model-v1.json`](../../data/model/network-model-v1.json).

## The model

A directed graph with a **street node** per station (its entrance) and a **platform node** per station and line (272 stations, 383 station-line pairs). Every edge time is linear in 17 parameters:

| Edge   | From → to                                                         | Time                                     |
| ------ | ----------------------------------------------------------------- | ---------------------------------------- |
| ride   | platform → next platform on the line (from TfL's route sequences) | `pace[line] × km + dwell`                |
| enter  | street → platform                                                 | `access` (includes the wait for a train) |
| exit   | platform → street                                                 | `access`                                 |
| change | platform → another line's platform, same station                  | `transfer` (walk and wait)               |
| walk   | street → street, stations up to 1.5 km apart                      | `walk_pace × km × 1.3`                   |

Distances are straight lines between station centres (entrances for walking). A separate entry and exit time cannot be estimated, since every tube journey has exactly one of each, so there is one `access` time.

The **step-free graph** comes from TfL's published station topology (below). It keeps:

- enter and exit edges only where every platform of the line is step-free from the street;
- changes only where TfL's step-free pathways connect every platform of one line to a platform of the other;
- step-free enter, exit and change edges with their own times, `access_step_free` and `transfer_step_free`, because the step-free way through a station is usually longer.

Rides and walks are shared between the two graphs. Streets are assumed walkable by anyone. There are **no buses** and no other rail.

## Data

- **Targets**: the street-to-street batch `s3-street-2026-10-27-0830` (12 origins × 272 destinations × standard and step-free; [travel-times.md](travel-times.md)). The model is fitted only on journeys the planner made by tube and walking alone: **2,078 standard** and **378 step-free**. The rest use buses or other rail, which the model cannot represent.
- **Network**: TfL route sequences, snapshot 2026-10-19 (`data` branch).
- **Step-free topology**: TfL's station topology files, feed of 2026-10-20 ([`data/tfl-station-topology/`](../../data/tfl-station-topology/README.md)). A platform is step-free if it can be reached from the station's "outside" point through same-level, ramp and lift pathways, which is TfL's own definition. Platforms marked not customer-facing (e.g. Morden 1) are ignored.

## Calibration

The objective is the **mean absolute error** (MAE) against the planner's minutes. Searching the parameters directly stalls: shortest paths switch as the parameters change, so the error surface is piecewise linear with many kinks. The fit alternates instead:

1. Route every journey by the current parameters.
2. Hold the routes fixed. Each journey time is then (summed edge features) · parameters, and minimising MAE is a linear programme (solved with HiGHS).
3. Repeat until the MAE stops improving. This converges in a few rounds.

A weak L1 prior holds each line's pace near 1 min/km. It only matters for lines the calibration journeys hardly ride (the Circle, 16 journeys, and the Waterloo & City, 2), which would otherwise take arbitrary values.

Scoring is **leave-one-origin-out**: each origin's journeys are predicted with parameters fitted on the other 11 origins. That is close to how the model will be used, for origins it was not fitted on. The baseline is a straight line in crow-fly distance, fitted the same way.

## Results

| Leave one origin out     | Journeys | Model MAE   | MAPE  | Within 5 min | Baseline MAE |
| ------------------------ | -------- | ----------- | ----- | ------------ | ------------ |
| Standard, tube and walk  | 2,078    | **3.3 min** | 9.2%  | 77%          | 5.4 min      |
| Step-free, tube and walk | 378      | **4.5 min** | 10.1% | 65%          | 7.4 min      |

The in-sample MAE is 2.7 (standard) and 4.2 min (step-free); the small gap means 17 parameters are not over-fitting 2,456 journeys. Step-free, 8 of the 378 have no route in the model (see limitations).

Fitted parameters (all origins):

| Parameter                      | Value                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| pace, min per km between stops | Jubilee 0.85, Victoria 0.91, H&C 0.94, District 0.97, Northern 0.98, Central 1.00, Metropolitan 1.06, Bakerloo 1.07, Piccadilly 1.12 |
| dwell, per stop                | 0.85 min                                                                                                                             |
| `access`, street ↔ platform    | 5.7 min each way                                                                                                                     |
| **`access_step_free`**         | **8.3 min each way**                                                                                                                 |
| `transfer`, change of line     | 3.9 min                                                                                                                              |
| `transfer_step_free`           | 3.5 min                                                                                                                              |
| walking                        | 12.4 min per straight-line km                                                                                                        |

**Getting in and out of a station step-free takes about 2.6 minutes longer each way**: about 5 minutes per journey, before any detour. This matches the King's Cross to Green Park example in [travel-times.md](travel-times.md): 5 + 6 minutes of walking the standard way against 12 + 9 step-free. Step-free changes come out no slower than ordinary ones, but few calibration journeys change line step-free, so this estimate is weak.

## What the gap says: step-free London runs on buses

Run over every journey the planner returned, the tube-and-walk model shows how often the planner had to use something else:

|                                                      | Standard | Step-free |
| ---------------------------------------------------- | -------- | --------- |
| Planner journeys                                     | 3,252    | 3,240     |
| ... using a mode other than tube and walking         | 36%      | **88%**   |
| ... using a bus                                      | 15%      | **76%**   |
| No route in the tube-and-walk model                  | 0%       | **24%**   |
| Planner at least 10 min faster than the model's best | 4%       | 31%       |

With steps allowed, the tube network alone gets within a few minutes of the planner almost everywhere. Without steps, it cannot connect a quarter of the station pairs at all, and for another third the planner finds something at least 10 minutes faster, nearly always a bus. Step-free journeys on the tube are mostly stitched together with buses. This sets up the plan's residual model (§5.6a: "where does the bus fill in"), and it means a step-free model without buses would overstate the penalty.

## Validation of the step-free status itself

TfL's topology files are a second, independent source for the street-to-platform status in [step-free-access.md](step-free-access.md). The two agree on all **271** stations both cover: 95 full, 14 partial, 162 none. Croxley, which the Stop Structure API returned empty, is "none" in the topology.

## Limitations

- **No buses, no other rail**. The model is calibrated on the journeys it can represent, which favours pairs well served by the tube. Elsewhere it is an upper bound on the planner's time.
- **One node per station and line, not per direction**: a line counts as step-free at a station only if all its platforms are. At the 14 partial stations this can drop a direction that is step-free. All 8 step-free tube journeys the model cannot route end at Theydon Bois or Rickmansworth, partial stations where only one direction's platform is step-free.
- **Station-specific access is a constant**. Deep stations take longer to get through than surface ones. That is left to the residual model.
- **One sample day**. The planner's answers from Camden Town start with a 13-minute walk in 127 of its tube journeys, almost certainly to Mornington Crescent, which points to Camden Town being closed to entry in the planner's data for that morning. The model, which knows nothing of closures, is 8.7 min too fast for that origin (its fold's MAE). Walthamstow Central (−4.8 min) and Ealing Broadway (−3.5 min) are also too fast, for reasons not yet checked.
- **Straight-line distances**. Curvature is absorbed into each line's pace, which therefore varies along the line in reality.
