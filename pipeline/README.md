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
