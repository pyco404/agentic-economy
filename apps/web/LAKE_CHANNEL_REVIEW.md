# Lake–river connection

## Scope and alignment

The renderer detects the disconnected western lake and the long main river from loaded terrain cells. For the genesis layout, the new channel joins `(23.5,111.5)` to `(79.5,111.5)`, bending gently north through the open strip between existing farm and residential parcels. Width is 2.6 world units with 0.65-unit landscaped banks. This follows the reference's lake-to-river direction while fitting the actual free corridor.

The planner checks sampled curves against every loaded building footprint, entrance, reserved cell, plaza, and road junction. It tries restrained alternative bends and fails closed if the water bodies are unavailable or no alignment is clear. Existing building coordinates, IDs, entrances, economy, canonical chunks, and backend state are not changed. The derived terrain mask is renderer-owned; it is not a persistent world-layout migration.

## Actual geometry

`lakeChannel.ts` provides topology discovery, clearance checks, derived water/bridge cells, quarter-cell excavation, bank planting, and future small-craft clearance checks. `geometry.ts` replaces intersected solid ground with a lowered bed and sloping banks; water is not drawn on top of intact terrain. New water has the existing blue-turquoise material and animated shader at exactly the existing `-0.25` surface elevation. The bed is at `-0.65`, giving 0.4 units of water depth. Adjacent original lake and river water tiles are retained, avoiding overlapping coplanar water faces.

`sceneryPlan.ts` prepares the connector before roads and static landscape batches. Authoritative chunk data stays attached to prepared meshes for later inventory/selection updates; only render-time topology changes. Deterministic geometry signatures include the connector. `City.tsx` exposes read-only connection diagnostics for browser verification.

Roads at x=40.5, 56.5, and 72.5 become bridge decks using the existing two-lane street generator. Their coordinates, elevations, pedestrian nodes, and vehicle routes stay intact. Expanded bridge approaches preserve both lanes where a curving bank reaches the pavement edge; an added regression caught and fixed a missing lane microcell at the middle crossing. Bridge edges follow the existing muted palette. Minimum measured underside clearance above water is 0.57 units; the other two crossings provide 0.65.

Reeds and small stones are instanced along selected banks, away from bridge/sidewalk envelopes. The core, field footprint, camera presets, and UI are unchanged. Rail alignment and ambient car paths are checked against the original plans.

## Navigation limitation

Current main has no active boat router or boat actors; that work remains in the preserved unfinished workspace. No boat movement, cargo, or economic events are invented here. The connector's clearance gate includes width, bridge headroom, and draught. A future router can admit low service craft, but must reject tall/wide/deep craft; the low existing road decks are not claimed to support arbitrary ferries. Pedestrian connectivity is identical before and after; existing vehicle nodes and ambient routes are retained.

## Verification and evidence

- Full frontend suite: 146 tests passed; subsequently added railway/car preservation case passed with the four focused channel tests. Existing street and worker round-trip tests also passed.
- Workspace typecheck, root lint, and frontend production build pass. No backend/schema change or migration is required for this feature.
- Browser check passes against the actual local main Three.js scene and a memory-only backend: same camera before/after, three crossings, advancing water-animation time, bridge close-up, and mobile capture.
- The before capture disables only the new planner through a test-only module interception; the after capture loads the normal unmodified application. Both use target `(52,0,110)` and zoom 3.3. Reduced motion prepares the static comparison; motion is then explicitly resumed to verify water animation.
- Initial browser attempts exposed a slow software-rendering setup and a paused state retained from reduced-motion initialization; final captures/checks pass with explicit native GPU settings and proper animation resume. No production application workaround or camera change was added.
- Local comparison recorded 302 draw calls before and 314 after; the browser regression permits at most 20 additional calls. This is a local comparison, not physical-device performance certification.

Ignored evidence in `apps/web/artifacts/`: `lake-channel-before.png`, `lake-channel-after.png`, `lake-channel-bridge.png`, `lake-channel-mobile.png`, and `lake-channel-report.json`.

## Release gate

Follow main-only, one-file Conventional Commits and normal pushes. The files form a dependent series; validation applies to the combined final tree, not every intermediate revision. Do not deploy the frontend alone against the existing staging contract 0.2.0 backend: main is contract 0.3.0. The earlier staging release remains blocked because the required current restorable PostgreSQL backup was not verified (Railway backup inventory was empty). No migration, source switch, staging deployment, or production change is part of this channel refinement. See `infra/railway/MAIN_TRANSITION.md` for the conditional identity-migration prerequisites.
