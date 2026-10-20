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
