# Riverside railway — Phase 1

The northern Riverside spur is implemented in the existing world renderer. It replaces the old exterior rectangular train loop; there is no rectangular fallback. Civic Core rail remains outside this phase. The train, depot, freight props and sign are environmental presentation only, not agents, inventory, deliveries or economic events.

## Alignment and safety

The approved corridor needed two practical corrections during detailed validation:

- The eastern entry extends to X146 so a gentle approach can reach a rail level of Y3 without a steep climb. The route follows the surveyed northern deviations, crosses the canal near X82–84/Z1, curves with a four-unit radius toward X64/Z5 and terminates at X64/Z18. Total length is approximately 98.1 world units.
- A slender raised deck bridges existing paving rather than introducing a level crossing. This preserves car routes, pedestrian routes and authoritative agent positions. The depot sits beside that deck near (61,16), with stair access to the actual sidewalk at (57.7,12.65). Nothing blocks the street near (64,8.5); no traffic or agent waiting logic is needed at a grade-separated crossing.

`planRiversideRail` validates before creating a usable path. It samples persisted terrain and the actual generated frontier triangles, including outside the loaded city. Checks protect all canonical building footprints; full-height generated building geometry, relevant landscape and frontier props; terrain beneath the deck; every paving tile intersecting the swept deck; pier spans; dry support footprints; station/access geometry; and the sidewalk landing. Failure produces an unavailable railway with diagnostic reasons, never tracks through an obstruction or a restored exterior loop. Geometry changes trigger the existing scenery rebuild and revalidation.

Measured on the current persisted 16-chunk/413-building world:

- Maximum grade: **3.74%**, below the configured 4.5% ceiling.
- Minimum deck clearance above intersected paving: **1.99 units**, above the 1.65-unit requirement. This is clearance above paving, not clearance above a vehicle roof.
- Minimum bridge underside clearance above water: **2.62 units**.
- 20 checked piers plus two separately checked canal-bank abutments. Footings extend to the lowest sampled corner elevation rather than floating above stepped terrain. Supports do not occupy roads, sidewalks or water.
- The generated depot includes a small building, canopy, platform edge, stairs, bench, lighting, freight props and Riverside Depot sign. It does not get a fabricated backend building/parcel ID or invented ownership.

These checks apply to the existing procedural rendering geometry. No backend coordinates, road graph, agent movement, waterways, ownership, economic rules or persistence were modified.

## Geometry and service

`riversideRail.ts` owns the validated path and joined rail/deck/ballast ribbons. Shared cross-sections avoid overlapping coplanar track faces and gaps on curves. Sleepers, low approach embankments, piers and depot primitives use the existing batched geometry library. The canal span has bank abutments and restrained side rails. Endpoint buffers make the open route explicit.

The existing instanced train uses the same path for all three vehicles, 2.6 units apart by arc distance. Vertex-tangent interpolation removes segment-to-segment yaw steps. Pitch follows the approach grade. The service is reversible: bidirectional cab details, fixed carriage order/orientation, seven-second depot/eastern dwells, smooth acceleration/deceleration and no modulo position wrap at either visible endpoint. The initial view begins near the end of a depot dwell (0.5 seconds left), so the city does not open on a long stationary train. One complete service cycle is covered by tests of the actual ambient actor poses. There is still only the existing City animation loop, with ambient matrices updated at most 30 Hz.

The train has a bounded elapsed-time clock (maximum catch-up 0.25 seconds per frame), separate from the legacy 50ms cap retained for other ambient actors. The live browser test exposed that the old cap made a nominal seven-second depot dwell last over 90 wall-clock seconds on heavily loaded software WebGL. This correction preserves normal-speed service and bounds motion after a long rendering stall. Pause, scenery disabling, Treasury stillness and reduced-motion preferences freeze both clocks. No backend simulation clock changes.

Tuning lives in `RIVERSIDE_RAIL`: speed 1.6, acceleration 0.45, dwell 7, initial remaining dwell 0.5, spacing 2.6, envelope half-width 0.95, maximum grade 0.045, minimum road headroom 1.65, sample distance 0.25, deck level 3 and maximum support span 8.5. The current validated alignment is specific to the persisted Riverside warehouse anchor; unrelated fixture layouts do not inherit an unsafe hard-coded railway.

`data-railway` exposes validation results and `data-rail-service` exposes cosmetic positions/state for browser checks. These are diagnostics, not authoritative transport data. Updates to the service diagnostic are limited to four per rail-animation second. No second canvas, scene renderer or animation loop was introduced. The station sign's texture/material are disposed on scenery rebuild.

## Validation and review artifacts

The structural fixture in `src/world/fixtures/riverside-rail-world.json` contains the four northern chunks needed for repeatable geometry checks, with no agent/authentication/event data or inventory. Unit tests check current geometry, new parcel conflicts, overhead obstructions, changed paving elevations, unchanged inputs, clamped endpoints and a complete service cycle with continuous actual carriage poses. Existing car/car collision tests remain in place.

Native-resolution captures use `node scripts/capture-riverside-rail.mjs`. Browser functional tests can use the existing `PLAYWRIGHT_SOFTWARE_LOW_RES=1` option on CPU-only WebGL; it does not alter production DPR. Screenshots, browser output and capture metrics remain ignored in `artifacts/`.

Focused checkpoint grouping:

1. `feat(web): integrate the validated Riverside urban railway` — rail terrain/planning/geometry, ambient train integration, scene diagnostics and sign disposal kept together so imports compile.
2. `test(web): verify Riverside rail clearance and reversible service` — structural fixture, unit/browser coverage, capture script and documentation.

The repository still has the frontend implementation untracked as a whole. These are the logical groups for the coordinated frontend checkpoint; no unrelated files should be swept into a new initial commit. No commits or pushes were made for this phase.
