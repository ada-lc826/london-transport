# Method: street-to-platform step-free access

How the S2 scene's numbers are produced, and how far to trust them.

## Result (snapshot 2026-10-19)

| Status  | Tube stations | Meaning                                                      |
| ------- | ------------- | ------------------------------------------------------------ |
| Full    | **95**        | Every tube platform reachable from the street without a step |
| Partial | 14            | Some tube platforms reachable                                |
| None    | 162           | No tube platform reachable                                   |
| Unknown | 1             | Topology unusable (Croxley: empty response)                  |

TfL's own published count is about 93 step-free tube stations; our 95 includes Battersea Power Station and Nine Elms (opened 2021).

## Source

TfL's **Stop Structure API** (`api.tfl.gov.uk/jp_public/api10/XML_STOPSTRUCTURE_REQUEST`, [Tech Forum announcement](https://techforum.tfl.gov.uk/t/stop-structure-station-and-stop-topology-api/2796)). For each station it returns:

- **areas**: entrances, halls, concourses, platforms, each with a type, a level and the services that call there;
- **footpaths** between areas, each a list of segments typed `LEVEL`, `RAMP`, `ELEVATOR`, `ESCALATOR` or `STAIRS`, with step counts and lift and ramp dimensions.

The request parameters (`sSStopNr`, `sSInclSP`, `sSFEA`, …) are not documented by TfL; they come from the EFA interface the API is built on ([community EFA documentation](https://github.com/pietr26/EFA-Documentation)). Responses are stored verbatim on the `data` branch (`snapshots/<date>/stopstructure/`).

## Algorithm (`pipeline/src/mind_the_step/stepfree.py`)

1. Build a directed graph: a node per area, keyed by (stop, area id); an edge per footpath whose **every** segment is `LEVEL`, `RAMP` or `ELEVATOR` with zero steps. Where a hop has alternatives (stairs and a lift), each is its own footpath, so any step-free one suffices.
2. **Street** nodes: any entrance-typed area (types 32, 36), or any non-platform area at level 0. Both rules are needed: Battersea Power Station's entrances are type 33 (a type that elsewhere marks bus-stop areas), and High Barnet's entrance is at level 1 above platforms in a cutting.
3. **Platform** nodes: the station's areas where the topology lists a tube service (product class 2). Area type is not reliable (Pimlico's platforms are type 65; type 81 also marks National Rail platforms).
4. A platform is step-free if it is reachable from any street node. The station is _full_, _partial_ or _none_ by how many of its platforms are.

This is the same rule TfL applies to its own data. The [step-free station topology data specification](https://content.tfl.gov.uk/step-free-access-and-toilet-data-guide.pdf) (v1.0, July 2021) describes stations as points joined by same-level, ramp and lift pathways, and states: "If there is a sequence of pathways from an outside station point to a platform, then we consider that platform to have 'Full' step-free status." Our street nodes play the part of its "outside station point".

### Interchanges

About 50 stations sharing an interchange (Bank, Euston, Stratford, …) return nothing for their own NaPTAN id. The fetch retries with the station's hub code, then its ICS code. In those merged responses the tube platforms are often filed under the complex's main stop (Bank's under the DLR stop, Euston's and Waterloo's under the rail station), and neighbouring tube stations appear too. A station's platforms are therefore those under its own id if there are any, otherwise the complex's tube platforms not filed under another tube station.

## Validation

- **Known stations**: Westminster, Green Park, Wembley Park, Battersea Power Station and Nine Elms come out _full_; South Kensington, Baker Street and Camden Town _none_.
- **TfL's 2024 priority list**: all twelve stations TfL named in August 2024 as the next to be made step-free (Alperton, Arnos Grove, Colliers Wood, Croxley, Eastcote, East Finchley, Neasden, North Acton, Northwood, Tooting Broadway, Turnham Green, West Hampstead) come out _none_, except Croxley (unknown).
- **Lift counts**: StopPoint's separate "Lifts" facility count is broadly consistent: 145 of the 162 _none_ stations have no lifts recorded, and 58 of the 95 _full_ stations have lifts. The 34 _full_ stations with no lifts recorded would need level or ramped access throughout; that has not been checked station by station.
- **Total**: 95 fully step-free against TfL's published ~93.

### Sources rejected

- **StopPoint accessibility attributes** (Unified API): present for only 82 of 272 tube stations; Bond Street has none.
- **Zenodo 18313509** (London Underground stations dataset, January 2026): marks South Kensington, Baker Street and Camden Town step-free and Wembley Park not, and four of TfL's 2024 priority stations as already step-free. Not used.
- **TfL's published station topology files** (GTFS/CSV, replacing the unmaintained lrad-v2.xml): tfl.gov.uk refuses automated downloads (HTTP 403), so they could not be fetched by the pipeline. Their specification (above) shows what they would add: per-platform step and gap in mm and whether a manual boarding ramp is needed (step-free _to the train_, not just to the platform), and a lift list whose ids (e.g. `HUBLBG-Lift-3`) match the lift-disruption feed.

## Limitations

- Street to **platform** only. The gap between platform and train, and whether a ramp or level boarding is needed, is not in the topology.
- A snapshot: lifts out of service are not reflected here (that is the lift log's job, S5).
- Terminus bay platforms with no services listed (a few, e.g. Brixton's second Victoria line platform) are not counted.
- The interchange rules are heuristics checked on the cases above; individual interchange results (e.g. Euston Square partial, Bank 4 of 6) have not each been verified against TfL's step-free map.
