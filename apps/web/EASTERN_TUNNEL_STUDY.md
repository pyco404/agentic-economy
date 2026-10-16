# Eastern tunnel approach and two-portal cycle

Status: **eastern approach studied against the live backend; complete cycle remains blocked at the western end**. No tunnel, terrain excavation, carriage hiding, or service change has been enabled.

The user authorized an eastern-outskirts study, preserving the current urban corridor and all persisted parcels, with implementation conditional on both entrances and the complete cycle being safe. The previously requested western/depot-side portal was never built. Treating it as existing would silently skip a confirmed obstruction.

## Live eastern approach

`scripts/study-eastern-tunnel.mts` reads only `/world/bootstrap` and `/world/chunks` from the running local demo backend. It uses the real chunk catalog, the current 16 chunks/413 buildings, existing pedestrian/road cells, generated frontier scenery and exact frontier terrain triangles. Output is saved in `reviews/eastern-tunnel-study.json`. Run it with the repository's installed tsx loader; it is not imported by the renderer.

Candidate extension from the existing eastern endpoint:

- Start `(146,1)`, rail Y1.05; end `(274,1)`, rail Y−2.0.
- A smoothstep descent over 128 units, sampled every 0.25 unit; maximum grade **3.574%**, below the existing 4.5% limit. The ends have horizontal tangents.
- A conservative **3.2-unit-wide excavation envelope** clears all supplied persisted building footprints, road/pedestrian cells, advertised chunks and generated tall frontier scenery.
- Five transverse samples across that envelope at each path sample found **zero water samples and zero missing terrain samples**. Sampled terrain heights range from approximately −0.168 to 1.222.
- Ground cutting first becomes necessary around **X157.5**. Terrain is high enough to provide a 1.5-unit tunnel interior plus 0.3 cover around **X229.75**. The carriage height envelope is 1.25 units, leaving 0.25 nominal interior headroom before detailed pitched-body/curved geometry checks.

These findings validate a candidate descent footprint and terrain profile, not a constructed tunnel. Portal cross-sections, retaining walls, cut terrain mesh boundaries, pitched train envelopes and underground walls must still be generated and checked together. Existing land cannot simply remain rendered through the approach. The script conservatively excludes tall scenery in plan view; it does not certify underground foundations, subsurface utilities or land reservations absent from the contracts. Future advertised chunks must trigger revalidation.

## Remaining western obstruction

The same live response confirms Power Station 1, `bld_0p3nc76`, centered at `(66.5,22)` with a 5×4 footprint. Its parcel begins at Z20, immediately beyond the existing western terminus `(64,18,Y3)`. The 0.95-unit train/track clearance envelope reaches that parcel after **1.05 units**. The prior grade and turning analysis in `RIVERSIDE_TUNNEL_REVIEW.md` still applies. The live extension check also encounters Depot C and Depot J farther along the same alignment.

The eastern approach is therefore **not blocked by an identified existing surface obstacle**, but the complete western-entry/eastern-exit cycle is blocked by the western parcel. Do not place a tall covered box at the elevated western terminus and call it an underground entrance, hide the train before a portal, or jump it from the western buffer to this eastern approach.

## Two-minute underground behavior

If a western corridor is later approved, both entrances must join one continuous sampled three-dimensional route. The underground timer should count from the last carriage becoming fully covered until the first carriage re-emerges. A stop or speed adjustment inside a real covered section can provide approximately 120 seconds; a timer alone cannot justify a position reset. At the current cruise speed, 120 seconds corresponds to 192 units of travel, but the actual connection length, grades, foundations and bend clearances remain unvalidated. No claim is made that such a connection currently exists.

The next decision is a dedicated western corridor reservation or an explicitly approved broader western reroute. Claude must coordinate any authoritative layout migration; none is authorized implicitly by the eastern study. With the present requirement to preserve both the western corridor and nearby parcels, implementation of the requested two-portal cycle cannot proceed safely.

## Preservation

Only this report, its read-only study script and JSON output were added. Existing railway geometry, bridge, depot, train service, roads, buildings, agents, other ambient actors, water and economic rules remain unchanged. Backend source and contracts were not modified. There are no tunnel screenshots or browser-cycle results for an unbuilt feature.

Build, TypeScript, ESLint and all **82 unit tests across 23 files** pass after the study. Existing dependency annotation and bundle-size build warnings remain. No browser-cycle test is claimed for the unbuilt two-portal route. The production bundle hash remains unchanged (`index-BoFxWXvT.js`). No commits or pushes were made.
