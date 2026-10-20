# pipeline

Python data pipeline for Mind the Step, managed with [uv](https://docs.astral.sh/uv/).

```bash
uv sync
uv run pytest
uv run ruff check . && uv run ruff format --check .
```

## Lift-status logger

`mind_the_step.lifts` fetches TfL's live lift disruptions (`/Disruptions/Lifts/v2/`) and writes:

| Path                           | Contents                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `lifts/log/YYYY-MM-DD.jsonl`   | One line per run (UTC date): `ts`, `ok`, `status`, `attempts`, `elapsed_ms`, `sha256`, `n_records`, `error`. Failed fetches are logged too. |
| `lifts/payloads/<sha256>.json` | The response body, stored once per distinct content.                                                                                        |

The [`collect-lifts`](../.github/workflows/collect-lifts.yml) workflow runs it every 15 minutes and commits the output to the `data` branch. It needs the repository secret `TFL_APP_KEY`.

To run it locally:

```bash
TFL_APP_KEY=... uv run python -m mind_the_step.lifts --out ../data-local
```

Exit codes: `0` for a logged run (including a failed fetch, so an API outage does not fail the schedule), `2` when the key is missing or rejected.

## Network snapshot

`mind_the_step.snapshot` fetches the reference data the scenes are built from, for the tube, DLR, Overground and Elizabeth line:

| File                                         | Source                                                  |
| -------------------------------------------- | ------------------------------------------------------- |
| `snapshots/<date>/stoppoints-<mode>.json.gz` | `/StopPoint/Mode/<mode>`                                |
| `snapshots/<date>/lines.json.gz`             | `/Line/Mode/<modes>`                                    |
| `snapshots/<date>/route-<line>.json.gz`      | `/Line/<line>/Route/Sequence/all`                       |
| `snapshots/<date>/manifest.json`             | What was fetched, when, and the outcome of each request |

The snapshot also downloads TfL's published step-free files: it reads the [open data page](https://tfl.gov.uk/info-for/open-data-users/our-open-data), keeps links that look like accessibility data (station topology GTFS/CSV, the data guide) into `accessibility/`, and fetches an independent research dataset ([Zenodo 18313509](https://zenodo.org/records/18313509)) into `crosscheck/` for validation.

Run it with the **Snapshot network data** workflow (Actions → Run workflow), which commits to the `data` branch. Unlike the lift logger, it exits `1` if any API request fails, because a partial snapshot is not usable. The `accessibility/` and `crosscheck/` downloads are best effort: failures are recorded in the manifest and printed as warnings.

## Network asset for the web app

`mind_the_step.network` turns a snapshot into `apps/website/public/data/network.json`: the 11 tube lines (geometry from route sequences) and the 272 tube stations. `stepFree` is `null` until a step-free source is joined.

```bash
uv run python -m mind_the_step.network --snapshot <data-branch>/snapshots/<date> --out ../apps/website/public/data/network.json
```

## Journey planner sampling

`mind_the_step.journeys` asks TfL's Journey Planner for the same trip twice, standard and with `accessibilityPreference=StepFreeToPlatform`, departing at the same time (default: 08:30 on a Tuesday at least three days ahead). Origins and destinations are coordinates, so the planner chooses the access legs itself.

- `probe`: two pairs in four variants, raw responses in `journeys/probe/`, to confirm the parameters and response shape.
- `batch`: the 12 S3 origins (6 at stations with step-free access, 6 without) to all 272 tube stations, both scenarios (about 6,500 requests at up to 420 a minute). One record per request in `journeys/<batch>-<date>-<time>/records.jsonl.gz`: status, fastest journey's minutes, walking minutes and legs. Re-running with the same date skips what is already recorded.

Run either with the **Journey planner batch** workflow.
