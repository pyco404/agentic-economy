# Outer-world scenery refinement

## Presentation

The city core, parcels, camera preset, waterways, railway alignment, portals, stations, UI, and authoritative economy remain unchanged. The existing irregular landmass now retains a lighter, varied outskirts layer instead of mostly empty aprons.

`world/outskirts.ts` creates seeded scenic lots containing mixed groves, occasional orchard/crop strips, meadow shrubs and rocks, short dirt paths, bank planting, and a few cream utility sheds. These are procedural prop meshes, not economic buildings: they have no canonical building IDs, workers, inventories, production, or fabricated deliveries. No static city images or external models are used.

Adjacent lots share a coarse seeded theme, with different tree silhouettes, heights, and meadow treatments. Ground lenses are restrained and intermittent rather than repeated under every site. All components fit within their own eight-unit tile, so the existing stepped landmass mask removes complete groups without leaving floating canopy or roof pieces.

## Clearance and railway context

Scenery is planned after the real primary and mirrored railway routes are validated. It cannot influence route selection or move either railway. Full site footprints are sampled on a half-unit grid against actual terrain; wet ground, every advertised developed chunk (including unloaded ones), and road/pedestrian approaches are excluded. Checks reserve the swept rail centerlines and rotated infrastructure bounds, including both portals and the mirrored route. No new bridge, rail extension, train stop, or economic rule is introduced.

This keeps the current compact surface lines, stations, crossings, bridges, and two-minute underground service intact. Planted verges, utility props and agricultural edges provide surrounding context. A deeper rail/layout redesign is outside this change.

Browser verification exposed an existing animation-throttle defect when the development review clock jumps backward with ambient time unchanged: negative deltas were treated as tiny updates, leaving a stale train pose. The guard now compares absolute clock differences. Normal forward animation and its 30 Hz throttle are unchanged. A regression test checks backward emergence seeks and unchanged sub-frame throttling; the production hidden interval remains 120 seconds.

## Tuning and rendering cost

`OUTSKIRTS` configures tile size (8), outer reach (32), candidate occupancy (0.82), maximum scenic sites (144), rail clearance (3.2), road clearance (2.6), and infrastructure margin (0.7). Utility sheds are capped at eight candidates. All counts refer to the pre-mask plan; the irregular boundary subsequently removes sites outside the actual landmass. Current live-local planning produced 45 groves, 18 orchards, 63 meadow sites, 8 utility sites, and 10 bank sites before masking.

The renderer reuses shared instanced primitives and color buffers. No per-frame environmental simulation, particles, new material effect, or additional animation loop is introduced. Worker/scenery caching continues to avoid regeneration during ordinary camera changes.

At identical cameras, the live-local captures recorded:

| View | Draw calls before → after | Triangles before → after |
| --- | --- | --- |
| Desktop default | 393 → 396 | 607,186 → 633,560 |
| Desktop overview | 384 → 388 | 573,124 → 599,700 |
| Desktop railway | 251 → 252 | 439,216 → 465,680 |
| Mobile default | 305 → 306 | 505,394 → 531,914 |

These are scene-complexity observations with live agents/effects, not an isolated FPS benchmark or physical-phone certification. Geometry increased approximately 4–6%; the local machine was under CPU/memory contention during validation. All camera position/target coordinates and zoom values matched exactly between paired captures. The terrain remained 442 cells with 504 edge segments and 70.72% bounding-box fill.

## Validation and review evidence

- Frontend build (including TypeScript checking) and lint passed. The existing large-bundle advisory remains.
- Full working tree: 147 unit tests across 36 files passed. Coverage includes deterministic decoration, expansion, full dry footprints, roads, portals, mirrored rail clearance, immutable parcels, and train timing.
- Isolated commit-scope candidate without the pending navigation/terrain implementation: typecheck and all 11 focused scenery/railway tests passed.
- All five final browser cases passed in one run: desktop/mobile outskirts and desktop/tablet/mobile mirrored railways. The initial pre-fix run caught the backward-clock issue described above; the final run passed after the focused guard correction.
- The local demo API was resumed after interruption using the existing persisted world. Applied migration checksums were verified read-only, and migration execution was bypassed. No schema changes, backend source edits, staging deployments, Git pushes, or production changes were made.

Ignored review captures live under `apps/web/artifacts/`:

- `outskirts-before-default-1440.png` / `outskirts-after-default-1440.png`
- `outskirts-before-overview-1440.png` / `outskirts-after-overview-1440.png`
- `outskirts-before-railway-1440.png` / `outskirts-after-railway-1440.png`
- Corresponding `default-390.png` and `overview-390.png` pairs.
- `outskirts-before.json` / `outskirts-after.json` contain camera and scene-complexity measurements.

## Commit and publication boundary

Each file is committed separately. Mixed `composition.ts`, `sceneryPlan.ts`, `City.tsx`, and `ambient.ts` stage only this feature's reviewed hunks. The existing city-edge tag, irregular-landmass wiring, worker/navigation caching, boats, and city-wide navigation remain in the prior uncommitted series. No screenshots, browser outputs, unused image, or integration-note append are staged.

The new scenery works independently against the previously committed world as well as the local irregular-landmass version. Publishing these commits alone does not publish that pending irregular-terrain/boat/navigation series. The full local screenshots include those preserved pending features.

Intermediate one-file commits introducing an import before its final consumer is updated are not claimed independently validated; the completed candidate is the test target. Codex prepares commits; the project owner handles normal pushes and approves merges to `main`. Staging continues to follow its existing branches, and no migration/deployment branch change is authorized here.

## Implementation commit ledger

| Commit | Single file | Conventional Commit |
| --- | --- | --- |
| `2a426e9` | `apps/web/src/world/ambient.ts` | fix(rail): update train poses after backward review-clock seeks |
| `90ccfc2` | `apps/web/src/world/mirroredRail.test.ts` | test(rail): cover backward seeks with a stationary ambient clock |
| `983c259` | `apps/web/src/world/outskirts.ts` | feat(world): generate seeded groves meadows and scenic edge parcels |
| `319c149` | `apps/web/src/world/composition.ts` | feat(world): compose outskirts around validated railway infrastructure |
| `297ae06` | `apps/web/src/world/sceneryPlan.ts` | fix(world): reserve mirrored railway clearance for outer scenery |
| `29b55e5` | `apps/web/src/world/City.tsx` | chore(world): expose outskirts planning diagnostics |
| `8a71ee6` | `apps/web/src/world/outskirts.test.ts` | test(world): validate deterministic outskirts and transport clearance |
| `f5c01eb` | `apps/web/src/world/composition.test.ts` | test(world): preserve curb and parcel invariants with outer scenery |
| `0bcd9a6` | `apps/web/tests/outskirts.spec.ts` | test(world): inspect seeded outskirts on desktop and mobile |

This report and the main-PR scope update are separate documentation-only commits; their hashes are available in Git history.

## Zoned turf follow-up

`terrainSurface.ts` now supplies deterministic, world-coordinate turf colors using two smooth noise scales (24 and 7 units). Existing grass tiles use lighter worn greens near civic/taller buildings, restrained residential turf, and fuller meadow greens in undeveloped areas. Industrial surroundings remain subdued. The same meadow sampler colors the outer frontier, and existing woodland/bank ground lenses blend into it. The page/background palette stays unchanged.

Only grass-cell colors change inside canonical chunks: roads, sidewalks, plazas, sand, fields, reserved cells, bridges, water, buildings and elevations retain their existing treatment and geometry. Existing orchards, gardens, shrubs and clustered trees provide ground context without additional foliage density. Turf is diffuse instance/vertex color, not an extra mesh layer, texture download, transparency effect or animation. Camera and navigation inputs are unchanged.

Matched review captures use the ignored `artifacts/turf-coverage-before-*` and `artifacts/turf-coverage-after-*` files. The targeted terrain/landscaping run passed 23 tests, including continuous seeded variation, civic/residential zoning, preserved surface codes, and source-data immutability. These changes remain local pending review and release coordination.

The full frontend unit suite passed 151 tests across 37 files, and all four desktop/mobile landmass/outskirts browser checks passed against the local backend. Build (including typecheck) and lint passed. The existing bundle-size advisory remains. No screenshot, generated build output or browser artifact is intended for a commit.
