# Method: where the rest of the network makes up for the tube's steps

The network model ([network-model.md](network-model.md)) has the tube and walking only. TfL's Journey Planner, asked for a step-free route, also uses buses (every London bus is wheelchair accessible), the Overground, the Elizabeth line and National Rail: 76% of its step-free journeys in our sample use a bus. This model learns how much the rest of the network saves over the tube alone, and where (plan §5.6a).

## Target and data

- **Journeys**: the S3 Journey Planner sample, 12 origins × 271 tube stations, step-free, 08:30 on a Tuesday ([travel-times.md](travel-times.md)). 3,240 journeys with a route.
- **Residual**: r = min(model step-free minutes, 120) − Journey Planner step-free minutes. A positive r is time the wider network saves over a tube-only step-free trip. Mean 18.9 min, median 11.9; two thirds of journeys save more than 5 minutes.
- **Bus stops**: 20,058 active London stops from NaPTAN, the Department for Transport's stop register (`equity_sources.py`).

## Features

None comes from the planner's own answer.

- **The trip**: straight-line km; the model's standard and step-free minutes (capped); whether the tube has any step-free route.
- **Each end** (origin and destination station):
    - step-free status;
    - km to the nearest fully step-free station;
    - bus stops within 400 m and 800 m;
    - log weekday entries (NUMBAT);
    - number of tube lines;
    - km to Charing Cross.

## Model and validation

`pipeline/src/mind_the_step/residuals.py`: LightGBM with an L1 objective and fixed settings (15 leaves, at least 30 rows per leaf, learning rate 0.05, 400 rounds, deterministic). There is no tuning on the test folds.

Validation is spatial, so the score is what the model does somewhere it has not seen:

| MAE of the corrected step-free time (minutes) | Tube-only model | Constant correction | LightGBM | LightGBM without bus stops |
| --------------------------------------------- | --------------: | ------------------: | -------: | -------------------------: |
| Leave one origin out (12 folds)               |            20.4 |                17.5 |  **6.6** |                        6.4 |
| Leave one 5 km destination block out (42)     |            20.4 |                16.9 |  **5.5** |                        5.7 |

- **Correction:** the hybrid (tube model minus predicted residual) cuts the error of step-free times by about two thirds.
- **Bus-stop density adds nothing:** dropping it changes the error by ±0.2 minutes. London has a bus stop within a few hundred metres almost everywhere, so how many there are does not tell places apart.
- **What drives the residual:** how badly the tube fails a step-free trip. By TreeSHAP:
    - the model's step-free minutes, then trip length;
    - whether the tube has any step-free route;
    - how far the destination is from a step-free station.

## The bus fallback index

For each station, the mean out-of-fold predicted residual of the step-free journeys ending there (`data/model/bus-fallback-v1.json`; median 15.5 min):

- **Highest** (minutes saved by the wider network): Leyton 66, Highgate 64, Walthamstow Central 62, Leytonstone 62, East Finchley 60, Turnpike Lane 59, Stonebridge Park 57, Wood Green 56. These are stations the tube cannot reach step-free but buses, the Overground or rail nearby can. Predictions track the observed means closely, for example Leyton 66 against 71.
- **Lowest**: Pinner 4, Hounslow West 5, Osterley 6, Hounslow East and Wimbledon Park 7. The tube's step-free answer there is about as good as the planner's.

## What it means for S4 and S7

S4's penalties are the tube's, and the index shows they overstate the whole network's penalty most where they are largest. On the tube alone, four of S7's first seven stations (Wood Green, Walthamstow Central, Leyton, East Finchley) were in the top 3% of the index.

S7 now uses the model. `whole_network_step_free` turns the index into an estimate of today's whole-network step-free time between every pair of stations, and an upgrade counts only where its new tube route beats that ([upgrades.md](upgrades.md)). Every saving shrinks by about two thirds, TfL's list slightly more than ours, so ours now save 87% more than TfL's (66% on the tube alone).

## Limitations

- **Sample:** 12 origins and one departure time. Leave one origin out is the honest test, and with 12 folds its error estimate is itself uncertain.
- **Ends are stations,** not neighbourhoods, so the model corrects station-to-station times. Applying it to S4's MSOA journeys would extrapolate.
- **Bus service level** (frequency, routes) is not in the features, only stop locations.
