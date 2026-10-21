# Method: a day of demand (S1)

S1 plays one weekday on TfL's railways. Its numbers come from **NUMBAT**, TfL's model of passenger demand on a typical day, published on [crowding.data.tfl.gov.uk](https://crowding.data.tfl.gov.uk/).

## Source

- **File**: `NUMBAT/NUMBAT 2025/NBT25TWT_Outputs.xlsx`, a typical autumn **Tuesday to Thursday** in 2025 (published 1 July 2026), fetched by the `fetch-numbat` workflow (`pipeline/src/mind_the_step/numbat.py`) to `numbat/raw/` on the `data` branch.
- **What NUMBAT is**: TfL's own estimate, from smartcard and gateline data, of how many people enter and leave every station and ride every link between stations, in 96 quarter-hours from 05:00 to 04:59. Days with major disruption are left out. TfL rates its confidence high for station entries and exits (they come straight from the gatelines) and for most link loads; it is lower where routes run parallel to non-TfL lines.
- **Built by** `pipeline/src/mind_the_step/pulse_export.py` into `apps/website/public/data/pulse.json`: boarders by tube line, load on every tube link (both directions added), entries and exits over the whole network, and entries at every tube station.

## Numbers on the wall

| Figure                                                       | Value                          | How                                                                                                                                                                  |
| ------------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| People on the network, peak                                  | **219,648** at 17:30–17:45     | Entries so far minus exits so far, over tube, Overground, DLR and Elizabeth line (5.18 million entries, 5.19 million exits in the day)                               |
| Tube journeys starting at a station with no step-free access | **42%** (1.70 of 4.06 million) | Entries at each tube station, by its street-to-platform status from [step-free-access.md](step-free-access.md); 44% at fully step-free stations, 14% at partial ones |

## Matching stations

NUMBAT names stations its own way ("Brixton LU", "Heathrow Terminals 123 LU"). Names are matched to `network.json` after normalising (case, punctuation, "&", "LU" and bracketed qualifiers), plus three aliases: Bank and Monument, which NUMBAT treats as one complex, count as **Bank**; "Heathrow Terminals 123" is Heathrow Terminals 2 & 3; "Paddington TfL" is Paddington. All 268 tube station names on tube links match.

## Limitations

- **A model, not a count**: link loads are NUMBAT's assignment of journeys to routes, not counts on trains.
- **Shared stations**: entries are counted at the gateline, so at stations shared with other TfL rail (Stratford, Paddington, …) they include passengers for those lines too.
- **Bank and Monument** share one count, attributed to Bank (partial step-free access), so Monument's entries (no step-free access) are counted as partial: the 42% is if anything an underestimate.
- **H&C and Circle** are one line in NUMBAT and are drawn in the H&C's colour.
- **Map**: links are straight lines between stations; the Metropolitan line's fast services appear as long links that skip stations.
