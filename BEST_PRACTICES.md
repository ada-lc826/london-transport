# DO App Kit Best Practices

This repository is a learning-oriented starter for building applications for the Data Observatory context: multiple large screens, one or more operator/control clients, and shared real-time state.

The guidance below is intentionally practical and aligned with the implementation in `apps/website` (Adapt to your usecase as required).

## 1. Architectural Separation: Control vs Screen

Use separate routes/endpoints for intent and rendering:

- `/control`: lightweight operator UI for commands (city, zoom, selections, scene changes).
- `/screen`: heavy visualization runtime optimized for deterministic rendering and smooth motion.

Why this split matters:

- Different user goals: operators issue commands; screens display results.
- Different hardware constraints: control clients may be tablets/laptops, screens are render-focused.
- Better reliability: if one control client disconnects, screen nodes can keep rendering the last valid state.

Recommended pattern:

- Controls emit domain-level messages (`screen/map-view`, `screen/segment-selection`) over a bus.
- Screens subscribe and apply messages idempotently.
- Do not couple screen rendering to local control state or assumptions about one operator.

## 2. Real-Time Transport: Why WebSockets

For collaborative walls, prefer WebSockets over polling for live control traffic.

Benefits:

- Lower interaction latency for shared controls.
- Reduced HTTP overhead under frequent small updates (sliders, selection changes).
- Natural fan-out model for multi-client synchronization.

Implementation guidance:

- Send a `hello` payload on connect with shared snapshot state for late joiners.
- Include `peerId` on broadcast to support self-echo filtering in clients.
- Keep messages schema-driven and namespaced (for example `control/*`, `screen/*`).
- Validate and sanitize all inbound payloads on both server and client.

## 3. State Synchronization Strategy

Keep synchronization intentionally small and explicit:

- Share only the minimal collaborative state needed to converge (`city`, `zoom`, selected indexes).
- Reconstruct derived UI locally (animation progress, presentation-only state).
- Sort/sanitize arrays before storing to stabilize equality checks and reduce unnecessary rerenders.

Avoid:

- Broadcasting large transient payloads every frame.
- Letting uncontrolled message shapes mutate shared state.
- Mixing persistent collaborative state with purely local interaction state.

## 4. Hydration and SSR/CSR Boundaries

Hydration mismatches are common in route-based realtime apps.

Use these guardrails:

- Gate browser-only APIs (`window`, `WebSocket`, `localStorage`, `matchMedia`) behind runtime checks.
- Apply theme class before hydration to prevent flash-of-incorrect-theme.
- Mount WebGL/map components only after client confirmation where needed.
- Keep server render markup stable and deterministic.
- Avoid pseudo-random calls at all cost such as `Math.random()` or `Date.now()`.

## 5. Performance on Multi-Screen Walls

Wall deployments multiply cost quickly (for example 6 screens means 6 renderer instances).

CPU/GPU guidance:

- Treat each screen iframe/tab as a distinct render budget.
- Prefer incremental updates (`setData`, paint property changes) over recreate-and-remount.
- Use throttling for high-frequency controls.
- Provide culling boundaries wherever practical and appropriate.
- Avoid expensive recomputation in render loops; memoize derived data.

Animation guidance:

- Use `requestAnimationFrame` for visual transitions.
- Cancel pending animation frames on cleanup and route unmount.
- Keep durations/easing centralized constants for easier tuning.

## 6. Wall-Scale Layout and Legibility

Wall applications should be authored for room-scale viewing, not laptop-scale viewing.

Layout sizing policy:

- Avoid fixed pixel sizing for containers, spacing, and typography unless strictly required by rendering math.
- Prefer relative/proportional sizing units: `%`, `vh`, `vw`, `vmin`, `cqw`, `cqh`, and `clamp(...)`.
- Build components so they scale with screen or container dimensions by default.
- Reserve hard pixel dimensions for mathematically strict cases such as camera transforms, viewport partitioning, culling regions, or shader-aligned buffers.

Typography policy for far-distance viewing:

- Text should be sized for visibility at up to ~10m viewer distance.
- For wall-facing content, enforce a minimum text size budget derived from screen height.
- Baseline rule for this starter: do not go below 20% of screen height for primary wall-readable text unless a design review explicitly approves a lower value.
- Use fluid scaling with hard floors (for example `clamp(min, preferred, max)`) so text remains legible across wall configurations.
- Validate legibility on the actual wall (or realistic mock distance), not only on developer monitors.

User viewing comfort:

- Avoid content that moves too quickly or stutter (in a space like this people may be more prone to vertigo)
- Avoid bright content or otherwise flashing interactions (in a space like this people may suffer from vision induced epilepsy)

## 7. WebGL and Iframe Constraints

Many devices have practical limits on active WebGL/WebGPU contexts and GPU memory pressure.

Recommended strategy:

- Implement a richer top-level renderer path (for example DeckGL wrapper).
- Provide an iframe-safe fallback path using direct map engine primitives.
- Decide runtime path based on context (`window.self === window.top`) or deployment flags.

Do not assume a rendering path that works in one tab scales to all wall iframes.

## 8. Network Utilization Discipline

Realtime systems should optimize message frequency and payload shape and size.

Best practices:

- Throttle noisy control streams (sliders/continuous gestures).
- Prefer semantic command messages over full state dumps on every tick.
- Debounce or coalesce optional updates where visual fidelity allows.
- Keep message payloads compact; avoid repeatedly sending unchanged fields.
- Shunt unecessary floating points data down to predictable integers.

For production, consider:

- Backoff strategies with jitter for reconnect.
- Optional heartbeat/ping for stale connection detection.
- Message versioning for forward compatibility.
- Use binary transmission as much as possible (no JSON, no BSON, ...)

## 9. Multi-Party Collaboration Behavior

Assume multiple operators can be connected concurrently.

Design for:

- Eventual convergence: all clients should settle on the same canonical state.
- Conflict tolerance: active local interactions may temporarily ignore remote echoes.
- Late join consistency: `hello` state should provide immediate usable context.

If coordination requirements increase, add:

- Role-aware permissions (read-only display, operator, admin).
- Intent timestamps or sequence numbers for deterministic conflict resolution.
- Audit/event log for troubleshooting collaborative sessions.

## 10. Data Loading and Validation

Datasets for visual layers should be treated as untrusted inputs.

Guidelines:

- Validate runtime shapes before use.
- Soft-fail optional data loads and allow retry paths.
- Keep parsed data normalized and immutable where possible.
- Surface loading/error state in stores for observability.

## 11. Maintainability and Learning Value

Because this repository is educational, it is optimized for readability and rationale, but presentations built for the DO are often maintained by an in-house team over time and as such you should generally:

- Add comments for non-obvious decisions (not for obvious syntax).
- Keep constants named and colocated with feature logic.
- Prefer small helper functions for geometry/transforms with clear intent.
- Preserve a clean message taxonomy and typed stores.

## 12. Testing Recommendations

This repository doesn not contain any testing harness at the moment but a minimum coverage for this style of app would be:

- Unit tests for message parsing/sanitization and store transforms.
- Integration tests for control-to-screen propagation over websocket bus.
- Regression checks for reconnect and hello-state restoration.
- Visual smoke checks for map fallback path in iframe context.

## 13. Deployment Checklist

The DO would typically accompany you through this process but before shipping you should:

1. Validate behavior with multiple control clients at once.
2. Validate behavior with full wall screen count (not just single-screen dev mode).
3. Confirm reconnect behavior after temporary server/network interruption.
4. Confirm fallback renderer path works in iframe deployment.
5. Confirm control interactions remain responsive under expected traffic.
6. Confirm browser memory and GPU utilization stay within stable limits over time.
7. Confirm text remains readable from expected far-view positions in the room.
