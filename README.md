# Mind the Step: One network, two Londons

A Data Observatory (16×4 screens) demo built on TfL Open Data, measuring how much longer London journeys take for people who need step-free access.

> Work in progress. The research and design plan (in Chinese) is at [`docs/plan/mind-the-step-plan.zh-CN.md`](docs/plan/mind-the-step-plan.zh-CN.md).

This repository is built on [`dsi-icl/do-starter-playground`](https://github.com/dsi-icl/do-starter-playground), with its upstream history kept: `git diff upstream/main...` shows everything added on top of it.

## Running it

```bash
vp install
vp run dev        # http://localhost:5780
```

| Route                     | What it is                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/`                       | Simulator: the full 16×4 wall preview (or the 3×2 one-iframe-per-screen wall) plus two control tablets                             |
| `/screen?c=<col>&r=<row>` | One physical screen; the URL Vizzy Studio loads per wall node. Coordinates outside the wall show an error instead of being clamped |
| `/world`                  | The whole wall on one page and one WebGL context: preview, screen recording, Vizzy compatibility mode                              |
| `/control?operator=A`     | A control tablet: scene, step, play/pause; city and zoom for the map-check scene                                                   |
| `/bus`                    | WebSocket bus. Owns scene state; answers binary clock pings                                                                        |

Query flags: `layout=mini` uses the 3×2 wall instead of 16×4; `m=dev` adds the debug overlay (bezels, 5|6|5 zones, eye-height band, and each screen's connection, clock offset and round trip); `bezels=0` hides the bezel lines in `/world`.

### How the wall stays in sync

- **Geometry** (`apps/website/src/wall/`): scenes lay out in wall pixels (30720 × 4320). Each screen draws only its own 1920 × 1080 rectangle and skips regions that do not touch it. Maps get a per-screen camera from one function, `cameraForRect`, which is unit-tested for continuity across every bezel and for agreement between `/screen` and `/world`. Text goes through `ScreenText`, which keeps it inside one screen.
- **Clock**: screens ping the bus every 2 s with binary frames that follow Vizzy Studio's opcodes (`CLOCK_PING 0x08`, `CLOCK_PONG 0x09`) and keep the offset from the fastest recent round trip.
- **Scenes**: control tablets send intents (`scene/goto`, `scene/step`, `scene/play`); the bus applies them and broadcasts `scene/state` with a revision number and a timeline anchor (position, server time, rate). Each screen works out the current position from its synchronised clock, so animations line up with no per-frame messages. Scene changes are rare, so the anchor travels as JSON rather than a binary frame.

## Data pipeline

`pipeline/` is a Python ([uv](https://docs.astral.sh/uv/)) project. It has two jobs so far, both writing to the `data` branch: the lift-status logger, which records TfL's live lift disruptions every 15 minutes to build a lift-reliability dataset, and a network snapshot (stations, lines, route sequences) run by hand. See [`pipeline/README.md`](pipeline/README.md).

Powered by TfL Open Data.

---

# Starter notes: DO App Kit

A starter for creating DO custom applications.

This starter repo is built with Vite+.

## Runtime Context Note (Top-Level vs Iframe)

Data Observatory deployments may render an app either:

- as a top-level document, or
- inside one or more iframes (for multi-screen orchestration/simulation).

This matters for graphics-heavy features: iframe-based deployments can increase pressure on
browser/GPU context limits (especially with WebGL). For that reason, this example includes
runtime-aware rendering decisions and fallback strategies so behavior remains stable in both modes.

## Stack Used In This Example

The example app in `apps/website` focuses on three package groups:

- `@tanstack/react-router`: file-based routing and route-level app structure (`/`, `/control`, `/screen`, `/bus`).
- `@tanstack/pacer`: throttling of high-frequency control events before broadcast (for example slider updates).
- Mapping stack:
  `maplibre-gl`, `@vis.gl/react-maplibre`, `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/react`.
  These are used to render the map, draw animated paths/markers, and support both richer and iframe-safe rendering paths. We strongly recommend the use of Deck.GL with MapLibre as the DO natively supports them.
- `vite-plus` (`vp`): monorepo task runner/repo manager used for project commands (`vp run dev`, `vp run build -r`, etc.).

## Development

- Check everything is ready:

```bash
vp run ready
```

- Run the tests:

```bash
vp run test -r
```

- Build the monorepo:

```bash
vp run build -r
```

- Run the development server:

```bash
vp run dev
```
