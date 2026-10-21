# Method: standard versus step-free travel times (S3)

How S3's numbers are produced, and how far to trust them.

## Source and design

TfL's Journey Planner (`/Journey/JourneyResults`), asked twice for each trip: once with no accessibility requirement and once with `accessibilityPreference=StepFreeToPlatform`, both departing **08:30 on Tuesday 27 October 2026** with `journeyPreference=LeastTime`. The fastest returned journey is used in each case.

- **Origins**: 12 stations, 6 with step-free access and 6 without (as classified in [step-free-access.md](step-free-access.md)), including South Kensington.
- **Destinations**: all 272 tube stations; 6,504 requests in total.
- **Endpoints**: street points, the station's entrance nearest its centre (or its centre where no entrance is recorded), so **both scenarios are timed street to street**. Where the planner answers 404 for a point, the request moves both ends to nearby points (the centre, then about 55 m away) and records which were used.

Code: `pipeline/src/mind_the_step/journeys.py` (sampling), `journeys_export.py` (the web asset). Raw records: `journeys/s3-street-2026-10-27-0830/` on the `data` branch.

## Result

6,492 of 6,504 requests returned a journey. The other 12 are step-free trips to Moor Park, for which the planner answers "No journey found" from every origin; they are shown as "no step-free route".

| Origin                                                                                    | Step-free station? | Median extra minutes | Step-free at least 2× as long |
| ----------------------------------------------------------------------------------------- | ------------------ | -------------------- | ----------------------------- |
| Arnos Grove                                                                               | no                 | +33                  | 17%                           |
| Tooting Broadway                                                                          | no                 | +26                  | 4%                            |
| Walthamstow Central                                                                       | no                 | +22.5                | 1%                            |
| South Kensington                                                                          | no                 | +21                  | 14%                           |
| Highbury & Islington                                                                      | no                 | +16                  | 6%                            |
| Camden Town                                                                               | no                 | +8                   | 0%                            |
| King's Cross St. Pancras, Stratford, Wembley Park, Canary Wharf, Ealing Broadway, Brixton | yes                | +9 to +11            | 0–6%                          |

Even between two step-free stations the step-free trip is usually longer: King's Cross to Green Park is 18 minutes (5 + 7 on the Victoria line + 6) and 28 step-free (12 + 7 + 9), because the routes through lifts are longer than those through escalators.

## Two approaches rejected

1. **Station centres as coordinates** (batch `s3-origins`): the planner answered 404 for 1,147 requests, all from Camden Town and, step-free, to the same 55 destinations from every origin, including fully step-free stations such as Waterloo. An experiment (`pipeline/experiments/endpoint-404s.json`) showed these depend on the point, not on accessibility.
2. **Stop ids** (batch `s3-ids`): no artefactual 404s, but biased. With ids a standard trip is timed platform to platform while a step-free trip includes the walk from the street through the lifts, adding about 15 minutes to one side only.

## Limitations

- **One departure** (08:30, a Tuesday): no variation by time of day or service pattern.
- **The planner is a model**: real step-free trips can be longer (lift outages, waiting for ramps, crowded buses). In a 2023 trial by Bolt Burdon Kemp, five wheelchair users' real journeys took 49% longer overall, and one was 83% slower than TfL's own step-free estimate ([Able Magazine](https://ablemagazine.co.uk/london-transport-nightmare-new-travel-experiment-reveals-dire-commutes-for-wheelchair-users/)).
- **Search noise**: in 33 pairs the step-free answer is up to 7 minutes _faster_ than the standard one, because the "least time" search settles on different routes. These are kept as returned; they do not move the medians.
- **Endpoints**: points tens of metres apart can give different answers; 4% of requests needed a fallback point.

## S6: the race

S6 replays nine of these trips leg by leg. The same requests were sent again for the nine pairs (spec: `pipeline/experiments/s6-races.json`, same endpoints, 08:30 on Tuesday 27 October 2026), keeping the planner's full answers (`journeys/experiments/s6-races/` on the `data` branch). `races_export.py` takes the fastest journey of each and keeps every leg's mode, line, departure and arrival time, stops and route. The durations match the batch above for all 18 requests.

| Trip                                | Standard | Step-free | How the step-free journey goes                                          |
| ----------------------------------- | -------- | --------- | ----------------------------------------------------------------------- |
| South Kensington → Archway          | 32       | 69        | 29 minutes on foot to Knightsbridge, Piccadilly line, bus 17            |
| King's Cross → Ladbroke Grove       | 23       | 58        | four buses                                                              |
| Arnos Grove → Old Street            | 32       | 75        | two buses, 49 minutes on the 141                                        |
| Brixton → Kentish Town              | 30       | 56        | Victoria line, 14 minutes on foot, bus 214                              |
| Tooting Broadway → Oxford Circus    | 33       | 65        | bus 270, South Western Railway train, bus 139                           |
| Walthamstow Central → Warren Street | 29       | 59        | Weaver line, Elizabeth line, bus 73                                     |
| Stratford → Snaresbrook             | 15       | 38        | buses 257 and 66                                                        |
| Canary Wharf → Swiss Cottage        | 31       | 59        | Jubilee line, 18 minutes on foot, bus 113                               |
| King's Cross → Green Park           | 18       | 28        | the Victoria line too; 7 more minutes getting in and 3 more getting out |

The first eight were picked for large gaps among trips of at most 35 minutes standard, one each from eight of the twelve origins; the last is a fair comparison between two step-free stations. Each scenario's journey starts at the time the planner chose (08:30 to 08:44), and the race starts both at zero, so it compares durations, not arrival times.
