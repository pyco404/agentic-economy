# Western through-running railway study

The user rejected a visible depot reversal. **No railway geometry or service was modified.** `reviews/western-railway-route-proposal.svg` is a route-study diagram, not an implemented world. `reviews/western-reroute-study.json` contains the sampled proposals and checks from the live 16-chunk/413-building world.

| Alignment | Finding |
| --- | --- |
| Northern return, radius 4 | No detected parcel/scenery conflicts; 4.17% grade; 1.91 minimum clearance above crossed paving. Rejected as a service choice because it needs a depot reversal. |
| Northern return, radius 6 | Also needs a reversal; intersects one generated tree's component volumes. Not recommended. |
| Forward west from the current endpoint `(64,18)` | Intersects Power Station 1 (`bld_0p3nc76`) and Depot I (`bld_1wixh6t`). |
| Forward east from the current endpoint | Intersects Power Station 1. |
| Earlier western curve beginning at `(64,10)` | Intersects Depot D (`bld_0hfmt49`), Residence 4 (`bld_1ex6698`), Residence 11 (`bld_1etyvx6`), Residence 9 (`bld_1nda9ly`) and Sunfield Farm (`bld_1ve8jsu`); also conflicts with existing presentation geometry/paving. |

The last three are rejected diagnostic paths, not recommendations to relocate these structures. The original endpoint has only 1.05 units before the train envelope reaches the power-station parcel. A four-unit-radius turn cannot clear that obstruction. A gentler radius needs more room. The tested forward-running continuations do not establish a feasible connection through the fixed current depot. This is not a proof that every future alignment is impossible.

## Smallest promising alternative without moving authoritative parcels

Add a **new northern through-platform**, keeping the existing depot and spur intact. The loop would serve that new platform rather than stop at the original platform. This is a product/service change requiring agreement before construction, not permission inferred from a clear footprint.

The proposed connector leaves the northern rail at `(68,1,Y3)`, makes two four-unit-radius curves through `(64,-3)` to `(60,-7)`, then descends west along Z−7. A candidate added platform footprint centered `(56,-5)`, 6×2 units, has no detected parcel/tall-scenery footprint conflicts. Platform structure, stairs and final access are not yet designed. The original Riverside Depot would remain unchanged and off the repeating train loop.

Study portals, including a 0.25 roof and at least 0.3 ground cover along the sampled covered path:

- Western: approximately **`(-40.75,-7)`**, rail Y−0.990. The descent reaches Y−3 at `(-94,-7)`.
- Eastern: approximately **`(214.75,1)`**, rail Y−1.138, on a revised descent from `(146,1,Y1.05)` to `(274,1,Y−3)`.
- Western grade ceiling: **4.17%**; revised eastern grade ceiling: **3.43%**.
- Neither approach detects water, missing terrain, occupied parcel or tall generated-scenery conflicts in this study. The north connector itself intersects no paved tiles.

The underground connection rounds a 16-unit-radius bend west of `(-94,-7)` to Z25, travels east below the city at Y−3, and uses a 12-unit-radius bend east of X274 to join the eastern approach with matching direction. The sampled covered length is approximately **568.53 units**, with minimum 0.302 units of cover above a nominal 0.25-unit roof. It does not intersect the checked generated building volumes. This checks visible geometry only; authoritative underground foundations/reservations are not provided by current contracts.

Portal frame envelopes (2-unit opening, 1.5 internal height) show no detected building/scenery intersections. Eleven preliminary dry, non-paved pier sites were found on the new connector; final transition spans, turnout construction, full portal corners, earthworks and excavated terrain meshes remain unchecked. These must pass before rendering or modifying the train. `constructionApproved` and `completeCycleApproved` remain false in the report.

## Proposed 120-second service

If the through-platform alternative is accepted and fully validated, use one continuous closed arc-length route, with the same path for each carriage and fixed spacing. Do not reset position at a portal. Start the fully hidden interval only when the trailing carriage is wholly behind the western cover; end it when the leading carriage begins emerging in the east. With a conservative 7.8-unit consist envelope, approximately 560.73 center-travel units must fit into 120 seconds, averaging **4.67 units/second** underground. Ease speed inside cover; keep the existing restrained surface speed.

The 120 seconds must use a frontend elapsed-time service clock, not backend ticks or the existing 50ms cosmetic timestep. Navigation must retain the same service epoch and route state. Reduced motion, explicit pause and background visual stillness need deliberate treatment: visual stillness alone must not reset or silently restart the underground interval. No animation/timing implementation or new browser-cycle result is claimed by this study.

## Validation and preservation

The study is reproducible using `scripts/study-western-reroutes.mts` with the installed tsx loader and local backend. It issues GET requests only. A new regression test confirms both endpoint turn directions encounter the power station. Typecheck, lint, production build and **83 unit tests** pass; production bundle hashes remain unchanged. Existing dependency/bundle warnings remain.

No backend-owned files, economic state, parcel IDs, roads, waterways, working railway, agents or other transport changed. The pre-existing integration notes and unrelated root `note.txt` remain untouched. No commits or pushes were made. The subsequent About-page request took priority after this proposal; railway construction remains pending the through-platform service decision and final geometry validation.
