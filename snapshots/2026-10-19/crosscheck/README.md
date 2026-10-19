# London Underground Stations: Geospatial, Passenger Usage and Accessibility Data (2026)

## Description

This dataset provides a structured geospatial and operational record of London Underground (Tube) stations, combining spatial coordinates, line information, historical opening data, accessibility status, and passenger usage statistics.

It is intended to support transport network analysis, accessibility and step-free infrastructure studies, optimisation and graph-based modelling, historical analysis of Underground development, and teaching in GIS, Operations Research, and related areas.

The dataset focuses exclusively on London Underground stations and intentionally excludes:
- Elizabeth line
- London Overground
- Docklands Light Railway (DLR)
- London Trams
- National Rail services

---

## Contents

- `london_underground_metadata.csv` — Main dataset
- `README.md` — This document

---

## Columns

### Identifiers and Station Information

- **`Station_ID`**  
  Unique identifier for each station entry (e.g. `LU001`, `LU174`).

- **`Station_Name`**  
  Public-facing name of the Underground station. Some station names appear more than once to reflect distinct station components with different opening years or line groupings.

- **`Lines_Served`**  
  Semicolon-separated list of Underground lines serving the station.

- **`Local_Authority`**  
  Local authority or borough associated with the station.

- **`Zone`**  
  London Underground fare zone.

- **`Opening_Year`**  
  Year in which the station (or station component) opened. Where a station has multiple historical openings, multiple rows are used.

---

### Passenger Usage (2024)

- **`Annual_Usage_Millions_2024`**  
  Estimated annual passenger entries and exits in millions, based on the latest available TfL usage data.

- **`Usage_Rank_2024`**  
  Rank ordering of stations by 2024 usage (1 = busiest). Stations with missing or shared usage data may have blank ranks.

- **`Usage_Band_2024`**  
  Categorical usage band derived from annual usage values (e.g. *Very High*, *High*, *Medium*, *Low*).

> **Note:** Passenger usage figures for **Bank and Monument** are reported jointly by TfL. As a result, both stations share the same 2024 usage value and ranking.

---

### Accessibility

- **`Step_Free_Dec2025`**  
  Boolean indicator specifying whether the station is step-free from street to platform level as of December 2025, following Transport for London’s official definition.

- **`Step_Free_Year`**  
  Year in which step-free access was delivered through major upgrade works, where available. Stations that were step-free from opening or where no specific upgrade year is documented are left blank.

---

### Spatial Coordinates

- **`latitude`, `longitude`**  
  Geographic coordinates in decimal degrees (WGS 84).

- **`easting_utm_m`, `northing_utm_m`**  
  Projected planar coordinates in metres, using WGS 84 / UTM Zone 30N (EPSG:32630). These coordinates are suitable for Euclidean distance calculations, optimisation models, and graph-based analyses.

---

### Descriptive Information

- **`notes`**  
  Free-form descriptive text (1–2 sentences) providing contextual information about the station, such as nearby landmarks, historical significance, or urban setting. Notes are intentionally non-standardised to support qualitative exploration and extension.

---

### Example Row
**`Station_ID,Station_Name,Lines_Served,Local_Authority,Zone,Opening_Year,Annual_Usage_Millions_2024,Usage_Rank_2024,Usage_Band_2024,Step_Free_Dec2025,Step_Free_Year,latitude,longitude,easting_utm_m,northing_utm_m,notes
LU093,Green Park,Jubilee; Piccadilly; Victoria,City of Westminster,1,1906,38.42,8,High,TRUE,2011,51.5067,-0.1428,699184,5712384,Adjacent to Green Park and serving Buckingham Palace, Mayfair, and St James’s.`**

---

## Coordinate Reference System

- **Geographic coordinates:** WGS 84 (EPSG:4326)  
- **Projected coordinates:** WGS 84 / UTM Zone 30N (EPSG:32630)  
- Units: metres

The projected coordinates allow:
- distance-based optimisation (e.g. TSP, shortest paths),
- clustering and spatial density analysis,
- integration with planar graph algorithms.

---

## Design Notes

- The dataset models London Underground stations only; other TfL modes are excluded by design.
- Some station names appear more than once (e.g. Paddington, Hammersmith, Edgware Road) to represent distinct station components with different opening years or line groupings, not data errors.
- Passenger usage data reflects TfL reporting conventions and may be shared across stations where combined figures are published.
- Accessibility data follows TfL’s street-to-platform definition of step-free access as of December 2025.

---

### Modelling Choices

- Duplicate station names are intentional and preserve historical and operational structure.
- Bank and Monument share passenger usage figures due to TfL aggregation.
- Step-free status represents a snapshot as of December 2025 rather than a full historical accessibility timeline.

---

## Citation

If you use this dataset, please cite the Zenodo DOI: 10.5281/zenodo.18313509
