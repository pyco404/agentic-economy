# Frontend handoff — live integration and living-city improvements

**Date:** 2026-10-14. **Contracts reviewed:** OpenAPI v0.2.0, public WebSocket protocol v1, backend integration notes. Source changes are restricted to `apps/web`; shared integration notes are appended. Backend/server/program/schema files are untouched.

## Working end to end

The default source is the real backend in demo mode: persistent world bootstrap, terrain/elevation, building parameters, stocks/condition/status, registered communities, agents and movement, decision logs, prices, production totals, tasks and treasury. Communities consume opaque cursor pages. `/api/v1/ws` supplies live state, validated economic activity and action logs.

Backend demo uses the authoritative simulation and PostgreSQL, with a **mock blockchain**. Real SOL transfers, real Pump.fun launches, wallet transaction signing and payouts remain disabled. Receipt pages explicitly identify mock-chain entries. City Credits stay simulated and non-withdrawable; points do not imply a real payout.

Live browser tests exercise actual API/WS responses, a mock-chain launch through prepare/demo-sign/confirm, resulting HQ placement, authenticated agent creation/pause/resume, visible updates and durable replay after a forced transport disconnect. Public deterministic demo wallet seeds are used only in tests; production keys are not used.

## Presentation improvements

- Existing minimalist architectural rendering, muted colors and application layout preserved.
- Seeded visual setbacks inside authoritative parcels, clearer arterial markings on existing wide roads, existing plaza/bridge/field landscaping, rendered server props, and scenic undeveloped greenbelt outside persisted chunks.
- Distinct procedural farm barns/silos, mill towers/blades, bakery ovens/chimneys/awnings, warehouse loading bays, sawtooth factories, covered markets, muted community HQ branding, lumber yards, terraced quarries and power stations.
- Offline fixture planning now separates civic/commercial/residential/industrial areas, reserves park parcels and starts with a compact town. It is explicitly selected with `?source=fixtures`; it never replaces failed backend requests automatically.
- Live positions interpolated over `tickMs`, delivery markers tied to `delivering`, work colors tied to `working`, and short production/service/maintenance/HQ rings triggered by actual backend events. Economy overlay shows only consecutive recorded server positions; long gaps reset trails.
- District framing and projected landmark labels; building-type and activity filters; hover stocks; live selected-building details; agent location control and live decision/profile refresh. Improved contrast and mobile readability.

## Reconnection and rendering integrity

The reconnect join snapshot does not advance the durable cursor past retained events. Replay runs from the saved seq before visible-region subscription is restored. Filtered seq gaps are accepted; control messages are unsequenced; additive unknown types are ignored. Silence detection, exponential retries, snapshot/version recovery and database-reset tick/version barrier clearing are implemented.

Offscreen agents remain in global lists when subscription snapshots cover only one view. Older HTTP/replayed positions cannot regress newer snapshots. Inventory/condition changes update metadata without rebuilding geometry. New advertised/persisted chunks are fetched and rendered; decorative greenbelt yields to them. No frontend construction/economy authority is introduced.

## Validation and artifacts

Commands: `npm run build`, `typecheck`, `lint`, `test`, `test:browser` from `apps/web`. The live browser suite requires PostgreSQL and uses/reuses the actual backend, not mocked HTTP or WebSocket messages. The transport replay test forwards real server messages while forcing one connection close.

The dedicated database is `agentic_economy_frontend_integration_20261014`. A manual restart check verified identical world ID, seed, geometry hash and agent identities, with continued ticks and automatic frontend reconnection; report: `artifacts/persistence-result.json`. Normal restart had no missing events to replay; retained replay is independently tested with a forced transport gap.

The browser rendering check enforces <1,000 overview draw calls and verifies unchanged geometry allocation during ordinary simulation updates. Headless software FPS is not a native GPU measurement. Bundle/code-splitting and hardware profiling remain production work (about 941 kB JS / 263 kB gzip).

Screenshots: `artifacts/living-economy-overview.png`, `living-economy-industry.png`, `living-economy-mobile.png`, and `backend-headquarters.png`.

## Missing backend functionality / frontend follow-up

- Backend development is currently Genesis-only, with 12 HQ plots. No implemented automatic district/infrastructure expansion or public construction-command/progress API. General construction progression cannot be demonstrated honestly; actual HQ placement is demonstrated. `under_construction` is supported by the renderer when the backend publishes it.
- Agent-owned/operated businesses are not implemented; existing autonomous workers perform real simulated logistics, production shifts and maintenance in city-operated buildings.
- No production-cycle progress telemetry: completion events and stocks are connected; intermediate progress is not fabricated.
- Metadata upload and the real Pump.fun builder/fee-route verification remain backend gaps; payouts remain outside MVP.
- Backend auth/eligibility/agent-write APIs **exist**. Connecting the wallet sign-in UI is frontend follow-up; public live mode remains read-only, and explicit offline fixture controls retain their prior functionality.
- Larger district creation must be implemented/persisted by Claude; frontend layout changes cannot substitute for it. Shared package export/package-manager coordination remains open; canonical source schemas are consumed without duplication.

See `README.md` for exact run commands, configuration, fallback semantics and the restart-check procedure.

## Parchment theme and procedural citizens

The shared presentation palette in `src/world/palette.ts` supplies warm parchment terrain, cream roads/walls, richer foliage, terracotta and slate-blue roofs for both canonical chunks and explicit fixtures. Ivory activity/stats surfaces retain the existing layout. Directional lighting is 1.71, with fill 0.9; sRGB output, no tone mapping, no fog, and no extra rendering passes remain. These are presentation changes only; persisted origins, seeds, parcel geometry and economy authority are unchanged.

Capsules are replaced by three instanced batches: faceted heads/hands, coats/sleeves and paired legs. Each citizen is 120 triangles; the supported 512 citizens use three draw calls instead of one. Movement distance drives the stride and bob, headings follow interpolated travel, and stopped/paused agents rest. Arms swing opposite the legs while walking; simple hands rest at the sides or reach around the crate when actual delivery state is active. Existing delivery state controls crates, carried in front of the character. Clicking any character part resolves to the same agent inspector. No fabricated actions or per-agent scene graphs are introduced.

Local review screenshots: `artifacts/warm-world-overview.png`, `warm-world-detail.png`, and `warm-world-mobile.png`. PNG artifacts are excluded from Git. The earlier clarity JSON captures predate this art-direction update and should be treated as historical measurements, not benchmarks of the current palette.

### Building surface clarity

Walls retain the lighter warm off-white, sandstone and cream palette and gently brighter roof colors. The earlier emissive facade lift has been removed: all structure materials use opaque, non-emissive Lambert shading. Architecture uses a small diffuse response gain (1.08), which retains directional contrast. Hip and gable roofs use flat shading so cone-based hip roofs no longer smooth normals across hard architectural corners. Geometry, outlines, seeds, parcels, palette, UI and simulation ownership are unchanged.

Hemisphere fill is 0.9 and directional light 1.71, rebalancing the prior 1.2/1.35 setup while keeping horizontal terrain illumination approximately constant. There is no fog, atmospheric blend, post-processing, or canvas-wide CSS veil. Captured canvas and ancestor styles have `filter: none`, `opacity: 1` and `backdrop-filter: none`; the captured 1440×914 backing resolution matches CSS size at DPR 1. Panel-local backdrop effects remain confined to their cards. sRGB output and no tone mapping remain explicit.

`node scripts/capture-building-palette.mjs before|after solid-city` captures the live backend at identical overview, detail and closer architectural cameras. `artifacts/solid-city-before.json` and `solid-city-after.json` record canvas styles, matched camera settings, persisted building geometry hashes and geometry-build counts. PNG review images use the same prefix and are excluded from Git. No mesh batches, render passes or shadow maps are added. Transient activity can change draw-call/triangle counts slightly between live captures; these software-rendered comparisons are not native GPU frame-rate benchmarks. Earlier `buildings-*`, `warm-world-*` and `clarity-*` captures are historical.

### Roof topology repair and seeded architecture

The white rooftop triangles were a geometry defect: every original gable triangle was wound inward (closed-solid signed volume −0.5). Back-face culling removed the intended slopes, while its upward-facing underside shared the wall-top plane. `roofGeometry.ts` now generates an outward-wound, watertight gable solid. Roof bases clear the wall top. Shed roofs use closed wedges instead of tilted slabs intersecting walls, and sawtooth rows meet without overlapping roof areas. Flat-roof parapets butt at corners rather than overlapping coplanar top faces; awning stripe tops are seated on the canopy. No lighting, palette, transparency, culling bypass, polygon offset or post-processing workaround is used.

`architecture.ts` deterministically varies two-to-four window columns, pane proportions, sparse/grid/banded/storefront treatments, lintels, pilasters, limited balconies, ridge caps/skylights and upper-floor setbacks on some taller homes. Canonical origin, footprint, floors, height, roof style and economic state remain unchanged. Variation stays inside existing parcels and uses the existing instanced geometry/material batches and LOD rules.

Regression coverage checks outward winding, positive solid volume, watertight boundaries, roof rays, roof/wall separation, disjoint sawtooth rows, trim clearance, seeded reproduction, immutable building inputs, varied silhouettes, canonical window patterns and bounded decorative complexity. `tests/roofs.spec.ts` renders actual roof geometry in WebGL with unlit colors and verifies both slopes cover the pale wall top. It uses a minimal same-origin document to isolate geometry from simulation timing; separate live backend tests continue to exercise the complete city.

Matched review images: `artifacts/roof-repair-before-architecture.png` and `roof-repair-after-architecture.png`, plus overview/detail variants. The corresponding JSON files confirm identical cameras, canvas settings and persisted building-parameter hashes. Overview draw calls measured 655 → 678; detail 717 → 777, with detail triangles 530,968 → 507,316. These counts include transient live activity and do not establish native GPU frame rates. No branch pointers were changed, nothing was staged or pushed, and backend-owned files were untouched.

### Facade readability at normal gameplay zoom (2026-10-15)

Primary windows and doors previously carried `detail: true`, hiding them at the default backend camera zoom of 1.65 until zoom exceeded 2.3. They now remain in base instanced batches, with modestly larger panes, muted slate glazing and warm timber doors. Fine mullions, sills, balconies and pilasters retain the existing detail LOD. Openings have no individual outlines. Ground-floor front glazing and its trim leave a clear door bay; canonical `none`, sparse, banded and storefront patterns remain respected. Roof topology, wall palette, camera, layout and persisted economic types are unchanged.

Matched live-backend captures: `artifacts/facade-readability-{before,after}-{overview,detail,architecture}.png` and the corresponding JSON reports. All three cameras and the persisted building-parameter hash match. Overview draw calls measured 678 → 710, detail 775 → 783; geometry builds stayed at 16. Overview triangles increased 404,024 → 467,876 because primary openings now render at that distance; close-detail triangles decreased after removing entrance overlaps. These are rendering counts, not native GPU frame-time measurements. Artifacts remain ignored.

Architecture regression coverage checks base-LOD openings, clear entrance bays and seeded reproduction. `tests/facades.spec.ts` renders the actual generator and instancing pipeline in WebGL with the city lighting, checking that windows and doors contribute visible pixels at zooms 1.65 and 2.8512. Roof and real-backend integration tests remain separate checks.

### Stylized window depth and architectural families (2026-10-15)

`windows.ts` adds shared procedural glazing with opaque, softly colored reflection strips and selective projecting reveals, mullions and sills. Glass sits behind the frame faces; the underlying solid wall is not Boolean-cut. Trim uses the existing detail LOD, while glass and restrained reflection cues remain visible at normal zoom. No transparency, environment maps, shaders, extra render passes or per-window scene objects are introduced.

Authoritative `sourceKind` distinguishes houses (fewer, larger panes), apartments (repeated residential bays), headquarters (office-style grid), civic buildings and workplaces (larger openings where the configured pattern allows). Existing `none`, sparse, bands and storefront patterns take precedence. There is no invented office economic building type. Selected bays and reflection distribution derive from the building seed and floor/column indices. Canonical footprints, building types, roof geometry and the warm wall palette remain intact.

Review captures: `artifacts/architectural-windows-after-{overview,detail,architecture}.png`, compared with the preceding `facade-readability-after-*` captures at identical cameras and persisted geometry hash. Overview calls 710 → 723, detail 783 → 814; geometry builds remain 16. Overview triangles 467,876 → 488,144. These are software-renderer workload counts, not a native GPU frame-time guarantee. Window tests cover glass/reveal ordering, non-coplanar reflection placement, trim LOD, deterministic generation and canonical type-specific rhythm.

### Urban presentation — 2026-10-15

See `URBAN_VISUAL_REVIEW.md` for district-specific vegetation, six procedural tree silhouettes, controlled warm pastel wall/roof families, larger residential/outer visual setbacks, courtyard paving and the existing-road hierarchy. All persisted building identities/parameters, terrain, props and navigation cells remain unchanged. Visual tree placement checks the full crown against routes, parcel bounds and authoritative entrances, using neighboring chunks; newly loaded/structurally changed neighbors invalidate the affected landscape, while ordinary economic metadata does not. Instancing and fine-detail LOD remain in place.

True road widening, fewer occupied lots, additional persistent public spaces and canonical forest/conservation designations remain backend planning work. Frontend presentation does not fabricate those state changes. Matched screenshots and generated validation results stay in ignored `artifacts/`. No backend-owned files were changed and the existing shared integration notes were preserved.

### Riverside railway — Phase 1

See `RIVERSIDE_RAIL_IMPLEMENTATION.md`. The old exterior rectangular train route has been replaced by a validated northern spur into Riverside Works, with a canal bridge, grade-separated street crossing and depot near (61,16). The open route uses continuous bidirectional service with fixed carriage order, smooth station stops and no endpoint wrapping. The depot is environmental geometry, not an invented backend building, inventory or transaction source. No Civic Core connection is claimed.

The renderer checks persisted parcel footprints, full-height architecture/landscape, frontier terrain, grades, dry foundations, road/pedestrian headroom and depot access before enabling the railway. New geometry conflicts disable it with diagnostics rather than silently moving a building. `reviews/riverside-rail-validation.json` records current clearance results. Existing roads, agents, other ambient actors and authoritative economic behavior are preserved. A bounded service clock fixes excessively prolonged station dwells under slow rendering; pause/reduced motion still apply. Native review screenshots remain ignored under `artifacts/riverside-*`.
