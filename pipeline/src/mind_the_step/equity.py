"""S4 (Who pays): where the step-free penalty falls, and on whom (plan §5.4–5.5, RQ2).

For every London MSOA (1,002 neighbourhoods of about 8,000 people), from its population
weighted centroid to every tube station, with the calibrated network model
(network-model-v1.json): the standard time and the step-free time. A neighbourhood reaches the
network on foot, to any station within ACCESS_KM; with step-free access only, it can board
and alight only where the model's step-free graph allows. Destinations are weighted by how
many people use each station on a typical weekday (NUMBAT entries), so the penalty is that of
the journeys Londoners actually make, not of reaching a remote terminus.

Two measures per neighbourhood:

- `extra`: the weighted mean of (step-free − standard) minutes, each time censored at
  CAP_MINUTES (no step-free route counts as CAP_MINUTES);
- `gap`: 1 − (weighted share of destinations within TAU minutes step-free) / (the same,
  standard): the share of the reachable city that step-free access loses.

Joined to Census 2021 TS038 (disabled under the Equality Act), TS007A (aged 65 and over) and
IoD 2025 (IMD score, population weighted over the MSOA's LSOAs), it reports:

- the headline: the mean penalty a disabled Londoner faces against a non-disabled one, each
  neighbourhood weighted by its disabled (or non-disabled) residents;
- the penalty by London IMD quintile, and Spearman correlations;
- an OLS of `extra` on distance to central London, IMD and disability share (standardised,
  HC1 robust standard errors): descriptive, not causal;
- the bivariate classes (tertiles of penalty × disability share) and the "double
  disadvantage" neighbourhoods (top tertile of both);
- global Moran's I and LISA clusters (8 nearest neighbours, permutation tests, Benjamini–
  Hochberg at 5%), and a ranking of boroughs.

Neighbourhoods with no tube station within REACH_KM are left out of the penalty (their
journeys are by bus, Overground or rail, which the model does not have) and counted apart.

    uv run python -m mind_the_step.equity --raw <data-branch>/equity/raw \\
        --snapshot <data-branch>/snapshots/2026-10-19 \\
        --topology ../data/tfl-station-topology/2026-10-20 \\
        --model ../data/model/network-model-v1.json \\
        --network ../apps/website/public/data/network.json \\
        --pulse ../apps/website/public/data/pulse.json --out equity.json
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import sys
import zipfile
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr

from .model import DETOUR, PARAMS, build_graph, haversine_km, read_adjacency
from .topology import line_access, read_topology

ACCESS_KM = 3.0
REACH_KM = 2.0
CAP_MINUTES = 120.0
TAU = 45.0
NEIGHBOURS = 8
PERMUTATIONS = 999
FDR = 0.05
CHARING_CROSS = (51.5073, -0.1276)
LONDON = {f"E090000{n:02d}" for n in range(1, 34)}


# ---------------------------------------------------------------- inputs


def _zip_csv(path: Path, member_suffix: str) -> list[dict]:
    with zipfile.ZipFile(path) as archive:
        name = next(n for n in archive.namelist() if n.endswith(member_suffix))
        text = archive.read(name).decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def read_areas(raw: Path) -> list[dict]:
    """London MSOAs with their centroid, residents, disability, age and deprivation."""
    iod_path = next(raw.glob("iod2025-*.csv"))
    with iod_path.open(encoding="utf-8-sig") as f:
        lsoas = list(csv.DictReader(f))
    score_col = next(
        k for k in lsoas[0] if k.startswith("Index of Multiple Deprivation (IMD) Score")
    )
    pop_col = next(k for k in lsoas[0] if k.startswith("Total population"))
    # An LSOA's 2021 name is its MSOA's name and a letter ("Camden 001A" in "Camden 001").
    imd: dict[str, list[float]] = {}
    borough: dict[str, str] = {}
    for row in lsoas:
        if row["Local Authority District code (2024)"] not in LONDON:
            continue
        msoa = row["LSOA name (2021)"][:-1]
        people = float(row[pop_col])
        acc = imd.setdefault(msoa, [0.0, 0.0])
        acc[0] += people * float(row[score_col])
        acc[1] += people
        borough[msoa] = row["Local Authority District name (2024)"]

    centroids = {}
    collection = json.loads((raw / "msoa2021-pwc.geojson").read_text(encoding="utf-8"))
    for feature in collection["features"]:
        lon, lat = feature["geometry"]["coordinates"]
        centroids[feature["properties"]["MSOA21CD"]] = (lat, lon)

    disability = {
        r["geography code"]: r for r in _zip_csv(raw / "census2021-ts038.zip", "-msoa.csv")
    }
    age = {r["geography code"]: r for r in _zip_csv(raw / "census2021-ts007a.zip", "-msoa.csv")}
    older = [k for k in next(iter(age.values())) if k.startswith("Age: Aged") and _age(k) >= 65]

    areas = []
    for code, d in disability.items():
        name = d["geography"]
        if name not in imd or code not in centroids or code not in age:
            continue
        residents = int(d["Disability: Total: All usual residents"])
        a = age[code]
        lat, lon = centroids[code]
        areas.append(
            {
                "code": code,
                "name": name,
                "borough": borough[name],
                "lat": lat,
                "lon": lon,
                "residents": residents,
                "disabled": int(d["Disability: Disabled under the Equality Act"]),
                "over65": sum(int(a[k]) for k in older),
                "ageTotal": int(a["Age: Total"]),
                "imd": imd[name][0] / imd[name][1],
            }
        )
    return sorted(areas, key=lambda a: a["code"])


def _age(column: str) -> int:
    """Lower bound of a TS007A band: 'Age: Aged 65 to 69 years' -> 65."""
    return int(next(t for t in column.split() if t.isdigit()))


def destination_weights(pulse: dict, stations: list[str]) -> np.ndarray:
    """Weekday entries at each station (NUMBAT); a station absent from NUMBAT weighs 0."""
    entries = pulse["stations"]
    return np.array([float(sum(entries.get(s, []))) for s in stations])


# ---------------------------------------------------------------- travel times


def access_minutes(
    areas: list[dict], network: dict, walk_pace: float
) -> tuple[np.ndarray, np.ndarray]:
    """Walking minutes from each area to each station (inf beyond ACCESS_KM), and the
    straight-line km to the nearest station."""
    where = [
        tuple(s["entrance"]) if s.get("entrance") else (s["lat"], s["lon"])
        for s in network["stations"]
    ]
    km = np.array([[haversine_km((a["lat"], a["lon"]), w) for w in where] for a in areas])
    walk = np.where(km <= ACCESS_KM, km * DETOUR * walk_pace, np.inf)
    return walk, km.min(axis=1)


def door_to_station(walk: np.ndarray, between: np.ndarray, chunk: int = 64) -> np.ndarray:
    """min over boarding station s of walk[a, s] + between[s, d]: a min-plus product."""
    out = np.empty((walk.shape[0], between.shape[1]))
    for start in range(0, walk.shape[0], chunk):
        block = walk[start : start + chunk, :, None] + between[None, :, :]
        out[start : start + chunk] = block.min(axis=1)
    return out


def penalties(
    standard: np.ndarray, step_free: np.ndarray, weights: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per area: weighted mean extra minutes (censored), the accessibility gap at TAU, and
    the weighted share of destinations with no step-free route."""
    std = np.minimum(standard, CAP_MINUTES)
    sf = np.minimum(step_free, CAP_MINUTES)
    w = weights / weights.sum()
    extra = (sf - std) @ w
    reach_std = (standard <= TAU) @ w
    reach_sf = (step_free <= TAU) @ w
    with np.errstate(invalid="ignore", divide="ignore"):
        gap = np.where(reach_std > 0, 1 - reach_sf / reach_std, np.nan)
    unreachable = (~np.isfinite(step_free)) @ w
    return extra, gap, unreachable


# ---------------------------------------------------------------- statistics


def weighted_mean(values: np.ndarray, weights: np.ndarray) -> float:
    return float((values * weights).sum() / weights.sum())


def ols_hc1(y: np.ndarray, columns: dict[str, np.ndarray]) -> dict:
    """OLS of standardised y on standardised columns, with HC1 robust standard errors."""

    def z(v: np.ndarray) -> np.ndarray:
        return (v - v.mean()) / v.std()

    names = list(columns)
    x = np.column_stack([np.ones(len(y)), *(z(columns[n]) for n in names)])
    target = z(y)
    xtx_inv = np.linalg.inv(x.T @ x)
    beta = xtx_inv @ x.T @ target
    resid = target - x @ beta
    n, k = x.shape
    meat = (x * resid[:, None] ** 2).T @ x
    cov = xtx_inv @ meat @ xtx_inv * n / (n - k)
    se = np.sqrt(np.diag(cov))
    r2 = 1 - (resid @ resid) / (target @ target)
    return {
        "n": int(n),
        "r2": round(float(r2), 3),
        "coefficients": {
            name: {
                "beta": round(float(beta[i + 1]), 3),
                "se": round(float(se[i + 1]), 3),
                "ci95": [
                    round(float(beta[i + 1] - 1.96 * se[i + 1]), 3),
                    round(float(beta[i + 1] + 1.96 * se[i + 1]), 3),
                ],
            }
            for i, name in enumerate(names)
        },
    }


def knn_weights(lat: np.ndarray, lon: np.ndarray, k: int = NEIGHBOURS) -> np.ndarray:
    """Indices of each point's k nearest neighbours (equirectangular distance)."""
    x = np.radians(lon) * math.cos(math.radians(float(lat.mean())))
    y = np.radians(lat)
    d = (x[:, None] - x[None, :]) ** 2 + (y[:, None] - y[None, :]) ** 2
    np.fill_diagonal(d, np.inf)
    return np.argsort(d, axis=1)[:, :k]


def morans_i(values: np.ndarray, neighbours: np.ndarray) -> float:
    z = values - values.mean()
    lag = z[neighbours].mean(axis=1)
    return float((z @ lag) / (z @ z))


def lisa(
    values: np.ndarray, neighbours: np.ndarray, rng: np.random.Generator
) -> tuple[np.ndarray, np.ndarray, float, float]:
    """Local Moran quadrants ('HH', 'LL', 'HL', 'LH', or '' when not significant after FDR),
    the local pseudo p-values, global Moran's I and its permutation p-value."""
    n = len(values)
    z = (values - values.mean()) / values.std()
    lag = z[neighbours].mean(axis=1)
    local = z * lag
    k = neighbours.shape[1]
    # Conditional permutation: each area's neighbours drawn at random from the others.
    extreme = np.zeros(n)
    for i in range(n):
        others = np.delete(z, i)
        draws = rng.choice(others, size=(PERMUTATIONS, k), replace=True).mean(axis=1)
        sims = z[i] * draws
        extreme[i] = (np.abs(sims) >= abs(local[i])).sum()
    p = (extreme + 1) / (PERMUTATIONS + 1)
    significant = benjamini_hochberg(p, FDR)
    quadrant = np.where(z > 0, np.where(lag > 0, "HH", "HL"), np.where(lag > 0, "LH", "LL")).astype(
        object
    )
    quadrant[~significant] = ""

    observed = morans_i(values, neighbours)
    sims = np.array([morans_i(rng.permutation(values), neighbours) for _ in range(PERMUTATIONS)])
    global_p = float(((sims >= observed).sum() + 1) / (PERMUTATIONS + 1))
    return quadrant, p, observed, global_p


def benjamini_hochberg(p: np.ndarray, q: float) -> np.ndarray:
    order = np.argsort(p)
    ranked = p[order]
    passed = ranked <= q * (np.arange(1, len(p) + 1) / len(p))
    keep = np.zeros(len(p), dtype=bool)
    if passed.any():
        keep[order[: passed.nonzero()[0].max() + 1]] = True
    return keep


def tertile(values: np.ndarray) -> np.ndarray:
    """0, 1 or 2 by the values' tertiles."""
    cuts = np.quantile(values, [1 / 3, 2 / 3])
    return np.searchsorted(cuts, values, side="right")


# ---------------------------------------------------------------- report


def build(
    areas: list[dict],
    network: dict,
    adjacency: dict,
    topology_dir: Path,
    params: dict[str, float],
    pulse: dict,
    seed: int = 20261021,
) -> dict:
    theta = np.array([params[name] for name in PARAMS])
    topology = read_topology(topology_dir)
    standard_graph = build_graph(network, adjacency)
    step_free_graph = build_graph(
        network, adjacency, line_access(topology.platforms), topology.transfers
    )
    every = list(range(len(standard_graph.stations)))
    between_std = standard_graph.times(theta, every)
    between_sf = step_free_graph.times(theta, every)

    walk, nearest_km = access_minutes(areas, network, params["walk_pace"])
    reached = nearest_km <= REACH_KM
    weights = destination_weights(pulse, standard_graph.stations)
    std = door_to_station(walk[reached], between_std)
    sf = door_to_station(walk[reached], between_sf)
    extra, gap, unreachable = penalties(std, sf, weights)

    inside = [a for a, r in zip(areas, reached, strict=True) if r]
    residents = np.array([a["residents"] for a in inside], dtype=float)
    disabled = np.array([a["disabled"] for a in inside], dtype=float)
    share_disabled = disabled / residents
    share_older = np.array([a["over65"] / a["ageTotal"] for a in inside])
    imd = np.array([a["imd"] for a in inside])
    lat = np.array([a["lat"] for a in inside])
    lon = np.array([a["lon"] for a in inside])
    centre_km = np.array([haversine_km((a["lat"], a["lon"]), CHARING_CROSS) for a in inside])

    rng = np.random.default_rng(seed)
    neighbours = knn_weights(lat, lon)
    quadrant, _, moran, moran_p = lisa(extra, neighbours, rng)
    biv_penalty = tertile(extra)
    biv_disabled = tertile(share_disabled)
    double = (biv_penalty == 2) & (biv_disabled == 2)

    # London quintiles of IMD score, numbered as IoD numbers its deciles: 1 = most deprived.
    imd_quintile = 4 - np.searchsorted(np.quantile(imd, [0.2, 0.4, 0.6, 0.8]), imd, side="right")

    def spearman(v: np.ndarray) -> float:
        return round(float(spearmanr(extra, v).statistic), 3)

    boroughs: dict[str, list[int]] = {}
    for i, a in enumerate(inside):
        boroughs.setdefault(a["borough"], []).append(i)
    borough_rows = sorted(
        (
            {
                "name": name,
                "areas": len(idx),
                "extra": round(weighted_mean(extra[idx], residents[idx]), 1),
                "disabledShare": round(float(disabled[idx].sum() / residents[idx].sum()), 3),
            }
            for name, idx in boroughs.items()
        ),
        key=lambda r: -r["extra"],
    )

    outside = [a for a, r in zip(areas, reached, strict=True) if not r]
    return {
        "params": {
            "accessKm": ACCESS_KM,
            "reachKm": REACH_KM,
            "capMinutes": CAP_MINUTES,
            "tauMinutes": TAU,
            "neighbours": NEIGHBOURS,
            "permutations": PERMUTATIONS,
            "fdr": FDR,
        },
        "coverage": {
            "areas": len(areas),
            "inReach": len(inside),
            "residentsInReach": int(residents.sum()),
            "residentsOutOfReach": sum(a["residents"] for a in outside),
            "disabledOutOfReach": sum(a["disabled"] for a in outside),
        },
        "headline": {
            # Each neighbourhood's penalty, averaged over the people living there.
            "disabled": round(weighted_mean(extra, disabled), 2),
            "notDisabled": round(weighted_mean(extra, residents - disabled), 2),
            "everyone": round(weighted_mean(extra, residents), 2),
            "disabledGap": round(weighted_mean(gap, disabled), 3),
            "notDisabledGap": round(weighted_mean(gap, residents - disabled), 3),
            "disabledInReach": int(disabled.sum()),
            # Disabled residents of neighbourhoods where step-free access loses more than half
            # of what the tube reaches within TAU minutes.
            "disabledLosingHalf": int(disabled[gap > 0.5].sum()),
        },
        "byImdQuintile": [
            {
                "quintile": q + 1,
                "extra": round(
                    weighted_mean(extra[imd_quintile == q], residents[imd_quintile == q]), 2
                ),
                "disabledShare": round(
                    float(disabled[imd_quintile == q].sum() / residents[imd_quintile == q].sum()), 3
                ),
            }
            for q in range(5)
        ],
        "spearman": {
            "disabledShare": spearman(share_disabled),
            "over65Share": spearman(share_older),
            "imd": spearman(imd),
            "centreKm": spearman(centre_km),
        },
        "ols": ols_hc1(
            extra,
            {
                "centreKm": centre_km,
                "imd": imd,
                "disabledShare": share_disabled,
                "over65Share": share_older,
            },
        ),
        "moran": {"i": round(moran, 3), "p": round(moran_p, 4)},
        "lisaCounts": {q: int((quadrant == q).sum()) for q in ("HH", "LL", "HL", "LH")},
        "hotspots": {
            "residents": int(residents[quadrant == "HH"].sum()),
            "disabled": int(disabled[quadrant == "HH"].sum()),
            "boroughs": sorted(
                {a["borough"] for a, q in zip(inside, quadrant, strict=True) if q == "HH"}
            ),
        },
        "doubleDisadvantage": {
            "areas": int(double.sum()),
            "residents": int(residents[double].sum()),
            "disabled": int(disabled[double].sum()),
        },
        "boroughs": borough_rows,
        "areas": [
            {
                "code": a["code"],
                "name": a["name"],
                "borough": a["borough"],
                "lon": round(a["lon"], 4),
                "lat": round(a["lat"], 4),
                "residents": a["residents"],
                "disabledShare": round(float(share_disabled[i]), 4),
                "over65Share": round(float(share_older[i]), 4),
                "imd": round(float(imd[i]), 2),
                "extra": round(float(extra[i]), 2),
                "gap": round(float(gap[i]), 4),
                "noRoute": round(float(unreachable[i]), 4),
                "biv": [int(biv_penalty[i]), int(biv_disabled[i])],
                "lisa": str(quadrant[i]),
            }
            for i, a in enumerate(inside)
        ],
        "outOfReach": [
            {"code": a["code"], "lon": round(a["lon"], 4), "lat": round(a["lat"], 4)}
            for a in outside
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--raw", type=Path, required=True, help="equity/raw on the data branch")
    parser.add_argument("--snapshot", type=Path, required=True, help="snapshots/<date> dir")
    parser.add_argument("--topology", type=Path, required=True, help="tfl-station-topology/<date>")
    parser.add_argument("--model", type=Path, required=True, help="network-model-v1.json")
    parser.add_argument("--network", type=Path, required=True, help="network.json")
    parser.add_argument("--pulse", type=Path, required=True, help="pulse.json (NUMBAT entries)")
    parser.add_argument("--out", type=Path, required=True, help="output JSON")
    args = parser.parse_args(argv)

    network = json.loads(args.network.read_text(encoding="utf-8"))
    model = json.loads(args.model.read_text(encoding="utf-8"))
    pulse = json.loads(args.pulse.read_text(encoding="utf-8"))
    adjacency = read_adjacency(args.snapshot, {s["id"] for s in network["stations"]})
    areas = read_areas(args.raw)
    report = build(areas, network, adjacency, args.topology, model["params"], pulse)
    result = {
        "source": {
            "description": "Step-free penalty by London MSOA, network model v1",
            "census": "Census 2021 TS038 and TS007A (ONS, via Nomis)",
            "deprivation": "English Indices of Deprivation 2025 (MHCLG)",
            "centroids": "MSOA (Dec 2021) population weighted centroids (ONS)",
            "demand": "NUMBAT 2025 weekday entries",
            "attribution": "Contains National Statistics data © Crown copyright and database "
            "right 2025; Powered by TfL Open Data",
        },
        **report,
    }
    args.out.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")
    summary = {k: result[k] for k in ("coverage", "headline", "spearman", "moran", "lisaCounts")}
    print(json.dumps(summary, indent=1), file=sys.stderr)
    print(json.dumps(result["ols"]), file=sys.stderr)
    print(json.dumps(result["byImdQuintile"]), file=sys.stderr)
    print(json.dumps(result["boroughs"][:6]), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
