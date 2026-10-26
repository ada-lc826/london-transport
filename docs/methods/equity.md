# Method: who pays for the steps (S4)

RQ2 asks whether the step-free penalty falls hardest on the people who most need step-free access. S4 measures the penalty for every London neighbourhood near the tube and sets it against who lives there.

## Sources

Fetched by `pipeline/src/mind_the_step/equity_sources.py` (the `fetch-equity` workflow) to `equity/raw/` on the `data` branch:

- **Census 2021 TS038** (disability, Equality Act definition) and **TS007A** (age in five-year bands), MSOA level, Nomis bulk files. ONS, Open Government Licence.
- **English Indices of Deprivation 2025**, File 7 (every score, rank and decile, with mid-2022 population denominators), LSOA level. MHCLG. The attachment URL is read from GOV.UK's content API.
- **MSOA (December 2021) population weighted centroids**, ONS Open Geography Portal, found by name in ONS's ArcGIS service directory.
- **NUMBAT 2025** weekday station entries ([demand.md](demand.md)), to weight destinations.
- **Network model v1** ([network-model.md](network-model.md)), standard and step-free graphs with the calibrated parameters.

London is the 33 local authorities E09000001–E09000033. An LSOA's 2021 name is its MSOA's name plus a letter ("Camden 001A" is in "Camden 001"), which joins IoD to MSOAs; an MSOA's IMD score is the population-weighted mean of its LSOAs'.

## Method

`pipeline/src/mind_the_step/equity.py`:

1. **From the door.** Each MSOA's population weighted centroid walks to any tube station within 3 km (straight line × 1.3, at the calibrated walking pace). Its time to every station is the best walk-then-tube time, by the standard graph and by the step-free one: a min-plus product of the walk times and the model's station-to-station times.
2. **In reach.** MSOAs with no tube station within 2 km are left out of the penalty: their residents travel by bus, Overground or National Rail, which the model does not have. They are counted apart and drawn grey.
3. **Destinations** are all tube stations, weighted by weekday entries, so the penalty is that of the journeys Londoners make.
4. **Measures**, per MSOA:
    - **extra**: the weighted mean of step-free minus standard minutes, each time censored at 120 minutes (no step-free route counts as 120);
    - **gap**: 1 − (weighted share of destinations within 45 minutes step-free) ÷ (the same, standard): the share of the reachable tube that step-free access loses.
5. **Who.** Each MSOA's penalty is averaged over its disabled residents and over everyone else; correlated (Spearman) with disability share, share aged 65+, IMD score and distance to Charing Cross; and regressed, all variables standardised, with HC1 robust standard errors. The regression is descriptive, not causal.
6. **Where.** Bivariate classes (tertiles of extra × tertiles of disability share); global Moran's I and local Moran (LISA) on extra, with 8 nearest neighbours, 999 conditional permutations and Benjamini–Hochberg at 5%; boroughs ranked by their residents' mean penalty.

## Results

|                                                       |                                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| MSOAs in reach of the tube                            | 619 of 1,002; 5.45 million residents. 3.35 million (467,000 disabled) live beyond its reach            |
| Mean extra minutes per tube journey, step-free        | 18.9                                                                                                   |
| For the average disabled resident / everyone else     | 18.9 / 18.9 minutes                                                                                    |
| Share of the tube within 45 minutes lost, step-free   | 69% (disabled 68.7%, everyone else 69.0%)                                                              |
| Spearman ρ of extra with disability share             | −0.01 (65+: 0.13; IMD: −0.08; distance from centre: −0.08)                                             |
| OLS, standardised β (95% CI), R² = 0.02               | disability share 0.01 (−0.06, 0.09); 65+ 0.10 (0.00, 0.20); IMD −0.06 (−0.17, 0.05)                    |
| Mean extra by London IMD quintile (1 = most deprived) | 18.2, 18.1, 18.8, 18.0, 21.9                                                                           |
| Global Moran's I                                      | 0.64 (p = 0.001)                                                                                       |
| LISA high-high clusters                               | 42 MSOAs, 354,000 residents, in Barnet, Enfield, Haringey, Waltham Forest, Lambeth, Merton, Wandsworth |
| Top third of both penalty and disability share        | 64 MSOAs, 87,000 disabled residents                                                                    |
| Disabled residents in reach losing more than half     | 554,000 of 698,000 (8 in 10)                                                                           |
| Boroughs with the largest mean penalty                | Enfield 37, Waltham Forest 30, Haringey 29, Wandsworth 26, Hillingdon 26 minutes                       |

**The penalty does not fall more on neighbourhoods where more disabled people live.** It is strongly clustered in space: whether you pay is decided by where you live, not by who you are. The scene says so, as plan §4.1 asks: the hypothesis that disability share and penalty go together does not hold, and that is a finding.

## Limitations

- **Tube only.** London's buses are all wheelchair accessible, and Overground, Elizabeth line and DLR stations are often step-free. A step-free journey that the tube cannot make may be possible by other means: these are penalties of the Underground, an upper bound on the whole network's. S3's Journey Planner times include them; the planned residual model (plan §5.6a) would bring that back here.
- **Reach.** 38% of Londoners live more than 2 km from a tube station and are not in the penalty at all.
- **Censoring** at 120 minutes affects the few MSOAs with no step-free station within 3 km (parts of Haringey and Enfield), where nearly every step-free journey is censored.
- **Same walking pace** for everyone; a slower step-free pace would raise every step-free time and the penalty with it.
- Centroids stand for the whole MSOA; the correlations are ecological (between neighbourhoods, not people).
