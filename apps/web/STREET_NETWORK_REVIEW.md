# Two-lane street presentation

`src/world/streets.ts` plans deterministic presentation paving over the current canonical road/bridge cells and clear adjacent verges. A quarter-cell grid merges disjoint surfaces through T-junctions, crossroads and turns. Two-unit carriageways have half-unit sidewalks where clear; restrained center dashes avoid junctions and selected crossing bars mark approaches. Bridges extend only existing bridge corridors, preserve openings beneath and receive aligned outer parapets.

Actual generated ground-level building geometry, trees, lamps, rocks and shrubs are clearance obstacles. Plazas remain pedestrian-only, water is excluded outside existing bridges, and no backend coordinates or persisted terrain are changed. Decorative field-row fragments under legal paving are omitted; actual economic farm geometry remains protected.

The running Genesis demo has **2,172 road/bridge cells, 1,070 eligible for full two-way presentation and 1,102 constrained**, including **32 bridge cells**. It has no fully clearance-safe closed block route. Six validated short out-and-back lane loops provide ambient traffic without routing through structures or plazas. Complete widening requires a future authoritative infrastructure/parcel plan from Claude Code; the frontend deliberately does not move buildings to claim every road is widened.

Vehicle models fit 0.68×1.0-unit footprints. Right-hand offsets, rounded intersection corners and smooth terminal turns stay on validated carriageway tiles. Vehicles yield using oriented footprint separation; no simulation traffic or transport jobs are invented. Pedestrians are offset toward available sidewalks solely for presentation, retaining canonical route samples and activity.

Tune carriageway, sidewalk, lane offset, paving grid, corner radius and car footprint in `STREETS`; tune count/speed/holds in `AMBIENT`. World records and economy rules are untouched. Pure tests check paving overlap, bridge openings, fixed building clearance, both directions, path footprints and 400 frames of six-car separation. Browser checks verify actual demo actors and preserved canvas/UI. Screenshots remain ignored review artifacts.
