# Agentic Economy frontend

React, strict TypeScript, Vite and Three.js. The default frontend connects to the **authoritative demo backend**, including its PostgreSQL-backed simulation. The minimalist city, original parametric meshes, muted palette and application layout are preserved. No premade building models, city images or background textures are used.

## Local development

Start Claude's backend in demo mode using its documented commands. HTTP defaults to **http://localhost:8787**, WebSocket to **ws://localhost:8787/api/v1/ws**. For persistence use a dedicated database:

```bash
createdb agentic_economy_frontend_integration_20261014
cd apps/web
node scripts/serve-integration-backend.mjs
```

Run the frontend in another terminal:

```bash
cd apps/web
npm run dev
```

Open **http://127.0.0.1:5173/?source=backend**. `.env.example` contains the API defaults. Backend demo mode means the simulation and database are running, while blockchain activity is **mock-chain only**. There are no real SOL transfers, live Pump.fun launches or reward payouts.

`TEST_DATABASE_URL` overrides the integration server's database (never use a production database). The helper only starts the existing backend; it does not edit backend source, regenerate contracts, drop tables or change backend environment files. The backend runs its own startup migrations.

Frontend dependencies remain managed within `apps/web` using npm. Use `npm install --workspaces=false` if needed. Coordinate root pnpm installation with Claude; backend installs are filtered to its packages. Canonical schemas are consumed through the existing source bridge in `src/api/shared.ts`, without copying definitions.

## Explicit offline fallback

Open **http://127.0.0.1:5173/?source=fixtures** for local fixture preview. API failures also offer a clearly labeled, user-selected offline option. The application never silently replaces backend state with fixtures. Backend outages retain the last received city with a connection notice. `VITE_DATA_MODE=demo` is an explicit fixture configuration; the default and `.env.example` use `api`.

Offline agent activation, pause/resume and capacity preview are in-memory demonstrations. They do not affect the backend or blockchain. Backend mode uses only server agents, registered communities, stocks, production, tasks and receipts.

## Procedural planning and architecture

- `src/world/layout.ts`: deterministic renderer-only fixture layout. Compact civic core, residential blocks, commercial streets, a separate industrial area, peripheral farms and park parcels. Existing chunks are unchanged when the explicit fixture growth preview adds chunks.
- `src/world/geometry.ts`: all building and landscape meshes are generated from seed and configuration. Distinct farms with crop rows and silos; mills with towers and blades; bakeries with ovens, chimneys and awnings; covered markets; warehouses with loading doors; factories with sawtooth roofs and chimneys; branded headquarters; town hall; lumber yards; terraced quarries; power stations.
- Persisted footprints and positions remain authoritative. Visual setbacks provide room around buildings **within their existing parcels**. Primary streets are distinguished on existing wide road cells. Existing plaza/field/bridge terrain receives code-generated landscaping, crop rows, benches and railings; server props include trees, bushes, rocks and lamps. Frontend styling never changes pathfinding or production capacity.
- `src/world/planning.ts`: deterministic scenic greenbelt outside known authoritative chunks. This contains nature only, **no economic district, roads or buildings**. When the backend publishes a chunk there, the scenic background yields to its persisted terrain. It is not evidence that expansion has occurred.
- `src/world/City.tsx`: orthographic camera, pointer selection, hover stock labels, keyboard navigation, district framing, agent location controls, frustum chunk streaming/unloading, material-based instancing, merged outlines and zoom-based detail LOD. Inventory/condition updates do not rebuild unchanged geometry. Reserved HQ plots remain empty; actual `under_construction` configurations render scaffolds.

Camera: drag to orbit, right-drag to pan, scroll to zoom. Mobile: one-finger pan and two-finger zoom/orbit. Focus the canvas for arrows, `+`/`-`, `Home` and `Escape`. Toolbar and searchable building/type filters provide alternatives. District labels use projected persisted landmarks. Reduced-motion preference starts movement paused. Pausing the **view** does not pause the authoritative simulation.

## Living economic activity

Agent positions and activity states come from HTTP and `agent.moved`, interpolated over the backend's `tickMs`. Delivery crate indicators require the actual `delivering` state; working agents receive a distinct color. The economy overlay shows recent consecutive **server position samples**, never invented routes. Histories reset across long gaps.

Validated production, useful service, maintenance and HQ-placement events produce brief colored rings at their actual building IDs. Live activity can be filtered by category. Inventory and condition are shown from canonical chunks; resource prices and production totals update from the backend. Agent profiles read real cargo, performance, strategy and decision logs, with streamed action updates and periodic refresh.

No background timers fabricate economic events in backend mode. Rings are event indicators, not claims that a production cycle is still running. The backend does not expose cycle-progress telemetry, so the frontend does not invent it.

## API and WebSocket integration

- Canonical Zod models, route registry and event schemas come from `packages/shared` and contract v0.2.0.
- Bootstrap, chunks, world statistics and agents; cursor-paginated community registry; activities, simulated markets, tasks, treasury; individual agent profiles and logs are connected.
- WebSocket path: **`/api/v1/ws`**, public protocol v1. If `VITE_WS_URL` is absent it is derived from `VITE_API_URL`, including HTTPS → WSS.
- On first join seed the snapshot. On reconnect preserve the saved durable cursor while the new join snapshot arrives, request `resume`, process retained events, then restore the visible-region subscription. Subscription snapshots retain offscreen agents in global lists. Sequence gaps are normal.
- Ignore additive unknown event types, deduplicate durable messages, process unsequenced control notices, detect 45-second silence, and reconnect with exponential backoff. `resume_gap` rehydrates snapshots/chunk versions; `server_restart` clears old tick/version barriers for a database reset.
- Initial chunk window is bounded by the published radius. Camera-visible advertised chunks are fetched as needed; snapshot version mismatches re-fetch affected chunks. Aggregate statistics/tasks refresh every 3 seconds; full reconciliation runs every 20 seconds without overwriting newer streamed positions.
- Authentication/session provider and idempotency headers are supported by the HTTP adapter. **Wallet sign-in UI is not connected yet**, so backend agent controls are explicitly read-only. Offline fixture controls remain available. The launch form remains draft-only and wallet transaction signing remains disabled.

## Validation and screenshots

```bash
cd apps/web
npm run build
npm run typecheck
npm run lint
npm run test
npm run test:browser
```

Browser tests reuse healthy local services or start the backend and frontend with the helpers. PostgreSQL and the dedicated database must exist. Tests require backend `mode=demo`, `store=postgres` and financial features disabled; they do not substitute HTTP/WebSocket mocks for the live suite. Chrome defaults to `/usr/bin/google-chrome`; override `CHROME_PATH` when needed.

Coverage includes movement, production and stock, streamed markers, canonical seeds, community/HQ placement through the real mock-chain launch flow, authenticated backend agent commands, retained-event replay after a forced transport disconnect, district controls, mobile overflow, unchanged geometry during simulation, and the original explicit-fixture journeys. Test wallet seeds are public demo-only seeds; no real wallet keys or transactions are used.

`node scripts/check-persistence.mjs` runs the manual restart check: after `READY_FOR_OWNED_BACKEND_RESTART`, restart **only your integration backend process**. It checks stable world identity, seed, geometry hash and agent identities, continued ticks and browser reconnection. Results are written to `artifacts/persistence-result.json`.

Updated review images:

- `artifacts/roof-repair-after-architecture.png` (matched `before` close-up available)
- `artifacts/roof-repair-after-detail.png`
- `artifacts/roof-repair-after-overview.png`
- `artifacts/living-economy-overview.png`
- `artifacts/living-economy-industry.png`
- `artifacts/living-economy-mobile.png`
- `artifacts/backend-headquarters.png`

A browser check enforces fewer than 1,000 draw calls in the overview and verifies that stock/condition changes do not rebuild geometry. Software-rendered headless FPS is **not** a native GPU benchmark. Hardware profiling and code splitting remain production work; the current build is about 941 kB JavaScript / 263 kB gzip.

Roof regression tests check outward-wound closed solids, wall/roof clearance and trim overlaps; an isolated WebGL browser test verifies actual slope pixels independently of lighting. Seeded architecture adds window rhythms, façade treatments and upper-floor setbacks without changing authoritative parcels. `node scripts/capture-building-palette.mjs before|after roof-repair` captures matched live-city views and geometry/camera diagnostics. PNG artifacts remain excluded from Git; see `FRONTEND_HANDOFF.md` for the verified root cause and rendering counts.

## Backend limitations requiring Claude

The current backend fixes development to Genesis and 12 HQ plots. It does not yet persist new districts/infrastructure beyond Genesis, expose general construction commands/progress, or support agent-owned/operated businesses. The renderer can consume added chunks, changed terrain and construction statuses when published; it does not fabricate these transitions. Full cycle-progress telemetry is absent.

Metadata upload and the real Pump.fun transaction builder/fee-routing verification remain missing; real payouts are outside MVP. Existing auth and eligibility endpoints are available, but connecting the wallet UI is frontend work. Keep City Credits non-withdrawable, verified contributions as points only, fee streams separate, 0.05 SOL launch charge entirely platform-directed, launcher creator-fee share 0%, and conditional 60/40 of actual creator fees received. `$AECO` remains a future token.
