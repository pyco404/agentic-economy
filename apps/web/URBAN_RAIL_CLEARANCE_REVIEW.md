# Urban rail: preliminary corridor survey, not an implemented route

**Superseded for Phase 1:** The Riverside spur has now been implemented after detailed validation. See `RIVERSIDE_RAIL_IMPLEMENTATION.md`. The Civic Core constraints below still apply. This document preserves the original feasibility findings; its rejected alignments are not the rendered railway.

Read-only survey of the local persisted Genesis world: seed 3488276011, 16 chunks and 413 building records. Civic Core's advertised bounds are X41–56 / Z51–70; Genesis Town Hall is at (52,59.5). Riverside Works is X57–91 / Z9–40; Factory 1 is at (76,27.5). These are canonical records, not relocated scenic landmarks.

The candidate investigated was the western side of Riverside Works south toward Civic Core's northwest edge. A 0.5-unit sampled grid used a 1.7-unit track clearance envelope (0.85 either side). The existing train is about 1.06 units across its wheels before allowances for clearance and corner swing. Tests protected building parcels first, then separately generated low-level architecture (up to 1.7 units above ground), current vegetation/props and actual presentation street tiles. Land cells adjacent to water were excluded unless a new rail crossing is separately designed; no road bridge was assumed to be shared rail infrastructure.

Neither the conservative parcel test nor the architecture/vegetation test found a connected route between points within four units of the two district bounds. The latter found 24,743 sampled ground positions clear of low-level structures/vegetation/water; protecting current paving left 11,193 positions in disconnected areas. Even the optimistic case allowing road reuse did not connect these district neighborhoods. This is a sampled conservative feasibility result, not a mathematical proof against every possible diagonal, bridge or elevated design. It does not validate a continuous track, turn radius, station site or crossing.

The existing road network includes narrow constrained streets; its surrounding space is not automatically free rail right-of-way. A railway must not consume those road/sidewalk clearances or silently cut through decorative architecture. No track, road, tree, building, agent route, station, economy state or renderer code has been changed by this survey. The old ambient railway is retained pending a verified replacement.

## Recommended next planning step

Coordinate a dedicated rail right-of-way in future authoritative world layout/expansion, reserving a north–south corridor along the western industrial/eastern civic seam (roughly X56–57, Z14–70) plus sufficiently large turning/station parcels. This is a planning alignment, **not a verified free corridor**: survey/migration must enumerate affected parcel IDs and obtain an explicit layout decision before any relocation. It should reserve separate pedestrian approaches, short controlled road crossings, and a suitable returning corridor/turn radius rather than forcing a rectangular loop through occupied plots. Civic Station and Riverside Freight Depot remain environmental-only until economic rail data exists.

An alternative requiring no building relocation is an elevated rail study above existing transport corridors, with new support/platform sites checked individually against structures, roads, pedestrian access, water and headroom. An elevated deck cannot be declared safe merely because its centerline follows a road. Ground supports, curves, overhead clearances and station access have not been validated; no elevated alternative has been built.

Review map: ignored `artifacts/urban-rail-clearance-map.png` shows current persisted parcels, roads, water and the two district bounds. The map is an audit visualization, not an in-product replacement image. The later root-navigation request took priority before a production rail planner or complete route was implemented.

## Renewed request: bridge-aware inspection and concrete phased alternative

Refreshed the world from the running demo backend after the root-navigation work: still 16 chunks, 413 buildings, seed `agentic-economy-genesis`. The attached request contains text only; no new railway concept image was present in that attachment. The organized streets remain the basis for this study; no Organic Curves/Garden Streets redesign is involved.

### Current renderer and required changes

`src/world/ambient.ts` owns both the track and train. `planAmbient` selects a rectangular frontier route nine units outside the chunk boundary after sampling frontier terrain. `createAmbientScene` batches rails/sleepers and instances the locomotive/two carriages. The shared City frame loop updates ambient poses at most 30 times per second; no extra scene or RAF is needed. Cars already have separate lane paths and car/car overlap checks.

Train bodies sample the same path 2.6 units apart, but polyline direction changes are abrupt at rectangular corners. `loopDistance` holds at zero and half the path, not at real station locations, and immediately changes between stopped and cruising speed. There are no railway platforms, ballast beds, rail bridges or rail/car/pedestrian interlocks. These must be added rather than merely rerouting the existing line.

### Clearance results

The expanded sampled reachability study used a **1.9-unit envelope**, allowed water crossing everywhere and even allowed road reuse as an optimistic upper bound. From the surrounding area, the closest sampled reachable point to Civic Core was (77.25,65.25), 21.25 units east of its bounds. With current paving protected, the closest point was 35.25 units away. These are conservative 0.5-unit grid observations, not proof against narrow unsampled or elevated alternatives. Arbitrarily allowing water does not certify any bridge, nor permit rail running longitudinally along the canal.

Continuous swept-segment checks now supplement that grid study. `src/world/railClearance.ts` conservatively expands obstacle rectangles and tests full line segments, including endpoints, so narrow obstructions between samples cannot be silently skipped. It is read-only and not imported by the renderer. Unit tests cover width clearance, diagonal crossings, endpoints, duplicate primitive IDs, stable results, input preservation and invalid geometry.

The auditable results are in `reviews/urban-rail-clearance.json`:

| Study | Persisted parcel conflicts | Outcome |
| --- | ---: | --- |
| Direct seam at X56.5, Z−8 to 59.5 | 16 | Reject. Includes Juniper/Linden/Cedar Apartments, Genesis Market and multiple homes. It also follows existing road space. |
| Straight northern canal approach at Z6 | 3 | Reject. Clips Oakridge Homestead and two residences, plus vegetation/rocks. |
| Refined northern Works spur | 0 | Horizontal footprint candidate only. Also clears the 8,108 supplied low-level geometry/landscape obstacle rectangles. Still requires the independent checks below. |

These rejected straight alignments are diagnostic studies, not proposed rendered sharp-corner tracks. Collision IDs, segment indices and the parcel geometry digest are retained in the JSON for Claude's review. Re-run against a refreshed snapshot before placement; seed alone is insufficient when persisted parcels change.

### Proposed first phase: northern canal → Riverside Depot spur

The closest concrete alternative investigated enters from the east at approximately (136,1), approaches (68,1), then uses a four-unit-radius quarter curve to (64,5), continuing south to (64,16). Gentle deterministic northern deviations near X109.5 and X90–94 avoid existing rocks and vegetation rather than deleting them. The sampled study polyline is included in the JSON.

This passes the northern waterway around X82–84/Z1 and reaches the western part of Riverside Works near Depot D, Depot I and the power station. A candidate depot envelope centered at (61,16), five units wide and six deep, plus 0.1 clearance, also clears the supplied parcel and low-level geometry rectangles. It is only an envelope study: platform/canopy heights, upper façades, access and land rights are not approved by that test.

This is a **short industrial spur**, not the requested complete through-city railway. Much of the approach follows the northern fringe. Do not present it as a Civic Core connection, rename its station Civic Station or claim a completed urban railway. The current train has not been moved onto it.

Before implementing even this first phase:

1. Sample actual frontier heights and landscaping outside loaded chunks; the current obstacle snapshot covers loaded chunks only. Verify ballast support, city-foundation transition, embankment grades and train/carriage swing around the actual smooth render path. Check future chunks again on geometry updates.
2. Design a separate rail bridge over the waterway, with abutments on both banks, adequate deck and side clearance, no supports obstructing the channel, and no collision with the existing perimeter. The bridge location is a study location, not a surveyed construction site.
3. Verify the main street crossing around (64,8.5) and every other actual paved tile intersected by the full swept envelope, including road ends near the northern approach. Add barriers/signage and a shared visual occupancy controller before enabling traffic there. Preserve the street graph. Authoritative backend positions must never be edited to implement cosmetic crossing waits.
4. Check full-height station architecture and a pedestrian link west to the existing road near X56.5. Keep access on the west of the track where possible. A depot footprint alone does not validate a platform or pedestrian crossing.
5. Use a reversible ambient service or a validated offscreen turnaround. For reversible service, keep carriage positions continuous and use bidirectional cab treatment; do not flip the whole consist or wrap distance at a visible endpoint. Dwell/acceleration should use actual station distances. No passenger, goods or revenue events are implied.

For the full goal, the recommended coordinated next step remains a reserved Civic Core rail corridor/station footprint in authoritative layout planning. An elevated alternative may avoid parcel relocation but needs its own roof/headroom, foundation, platform access and support survey; it is not silently authorized by a clear ground centerline. Backend **economic** changes are unnecessary for ambient rail. Persisted layout changes, if selected, belong to Claude and require an explicit migration plan listing affected parcels; none were made here.

### Validation and next implementation units

Typecheck, lint, production build and all **72 unit tests** pass. The live-backend ambient browser test passes: existing train/cars/aircraft remain present, the ambient toggle preserves the WebGL canvas, and reduced motion freezes the cosmetic clock. Existing bundle-size/dependency-comment build warnings remain. Runtime bundle hashes are unchanged by these planning-only additions. New-route loops, station stops, crossing safety and rail performance have **not** been tested because that route has not been implemented.

Ignored review images: `artifacts/urban-rail-route-studies.png` (planning map only) and `artifacts/ambient-city-overview.png` (current unchanged live scene). There is no fabricated before/after or screenshot of unbuilt stations.

Suggested focused commits, after the existing frontend checkpoint grouping is settled:

1. `test(web): audit urban rail clearance against persisted parcels` — read-only checker, tests, CLI and review JSON/documentation.
2. `feat(web): generate validated urban rail and station geometry` — only after a complete corridor, bridge, crossings and station access pass review.
3. `feat(web): add station-aware ambient rail service and crossing control` — shared path/timetable and traffic/pedestrian integration.
4. `test(web): verify urban train service and crossings` — complete-cycle and multi-camera browser validation plus performance review.

No commits or pushes were made. No backend-owned files, roads, building positions, economic rules or current scene geometry were changed.
