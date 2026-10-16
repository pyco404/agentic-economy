# Urban presentation review — 2026-10-15

All changes are frontend presentation inside `apps/web`. Persisted terrain, roads, building origins, types, dimensions, floors, heights, props and economic rules are unchanged. Existing roofs, camera controls, authoritative movement and WebSocket replay are retained.

## Implemented

- Primary windows and doors remain visible at normal zoom. Glass sits behind selected shallow frames/reveals, with occasional mullions/sills and restrained opaque reflection strips. Fine joinery uses the existing detail LOD; no transparency, texture assets or extra render passes.
- Vegetation has separate civic, market, industrial, residential, waterfront, agricultural, park and natural policies. Built districts have substantially less cover. Street planting follows regular world-coordinate intervals on safe grass strips beside actual roads. Whole-canopy tests protect road/path cells, parcels and authoritative entrance approaches, including neighboring chunks.
- Six procedural silhouettes share existing primitives: broadleaf, layered evergreen, slender columnar, layered oval street tree, small ornamental and shrub. Districts select appropriate seeded mixtures. Scenic outskirts use the same family. At most three instanced parts describe each plant.
- Facades use six controlled wall colors: sandstone, cream, clay, sage, stone and blue-grey. Building type selects a restricted family; a neighborhood base tone plus seeded accents prevents unrestricted random color assignment. The eight canonical roof indices map into five coordinated terracotta/brick/olive/slate/taupe tones. Existing HQ branding inputs remain connected.
- Residential/waterfront houses use a 0.66 visual footprint multiplier, apartments 0.70; outer houses use 0.64. Civic houses retain 0.76; civic/commercial structures generally use 0.80 and industrial structures 0.76. Farms retain their planted footprint. Floors, heights and parcel ownership are not changed. Slight gaps around lot paving and distinct courtyard surfaces separate adjoining parcels. Existing wider roads have an arterial tone; small curb sections remain inside existing road cells and use detail LOD.

## Matched comparisons

All captures use the live PostgreSQL demo, viewport 1440×1000, DPR 1, identical home camera and zooms **1.65**, **2.8512**, **4.9269**. The paused frontend still displays authoritative server data; it does not pause the backend simulation.

| Change | Before at normal zoom | After at normal zoom |
|---|---|---|
| District vegetation density | [Before](artifacts/tree-planning-before-overview.png) | [After](artifacts/tree-planning-after-overview.png) |
| Tree silhouettes | [Before](artifacts/tree-planning-after-overview.png) | [After](artifacts/tree-variety-after-overview.png) |
| Controlled building palette | [Before](artifacts/tree-variety-after-overview.png) | [After](artifacts/mediterranean-palette-after-overview.png) |
| District setbacks and street hierarchy | [Before](artifacts/mediterranean-palette-after-overview.png) | [After](artifacts/urban-spacing-after-overview.png) |

Close-up comparisons use the same filenames with `architecture` replacing `overview`; intermediate zoom uses `detail`. Each capture prefix also has a JSON diagnostic report. All rendered images and generated reports remain ignored and are not commit candidates.

The persisted building-parameter hash matches across every step: `01dc0978ab81424e2dd6b0e0b52d2ebb48a281bb0b925b221f2237e2b735a1f4`. Geometry builds stayed at **16** in the matched views. From the pre-vegetation baseline to the final result, overview draw calls were **725 → 716**, triangles **488,240 → 392,992**; close-up calls were **629 → 608**, triangles **478,306 → 432,960**. Live effects can slightly change counts. These are software-renderer workload measurements, not certification of native GPU frame rate. The existing overview budget is fewer than 1,000 draw calls.

## Validation and limits

Frontend build, typecheck, lint, 43 unit tests and all nine selected browser tests pass. Tests cover seeded output, unchanged inputs, density differences, preserved dense safe park/natural vegetation, full-canopy clearance, six bounded silhouettes, facade LOD, glass/frame separation, palette families, district setbacks, cross-chunk road hierarchy, and curbs contained within road cells. Browser tests cover actual WebGL windows/roofs, real HTTP/WebSocket updates, durable replay, UI selection/navigation, mobile layout and live vegetation clearance. The state-changing mock-chain launch test was excluded from this presentation review.

The live planning check found **1,045 source tree props → 147 planned plants**, with all six silhouettes represented and zero full-canopy route/parcel/entrance violations. This count excludes the separate scenic outer greenbelt and existing small backend bush props. Retention rates in the district policy are followed by strict clearance checks, so dense residential parcels can lose more vegetation than the nominal 48% retention suggests. Civic plazas stay open where no safe grass planting strip exists. All **413 authoritative building/lot records** remain, including the five reserved lots; the dashboard reports 408 built structures. The test writes its counts and static-layout hash to ignored `artifacts/planning-validation.json`.

Actual road widening, removal/reallocation of occupied lots, new persistent parks and reserved parcels require backend-persisted world planning. The frontend does not hide economic buildings or manufacture undeveloped plots. Current road widths and all persisted buildings/lots remain. Backend contracts do not identify designated forest/conservation polygons; explicit fixture parks and safe undeveloped natural groves retain dense planting. Exact conservation-zone handling needs a future canonical designation from Claude.

## Proposed focused follow-up commits

1. `feat(world): keep facade openings readable and add stylized glazing`
2. `feat(world): plan district vegetation and diversify tree silhouettes`
3. `feat(world): coordinate warm pastel building colors by type`
4. `feat(world): add district setbacks and clarify existing street hierarchy`

These follow the existing uncommitted frontend checkpoint plan. Shared-file changes need a reviewed content split; generator imports and their helper modules must land together. No staging, commits or pushes were performed. Screenshots, generated JSON, build output and browser artifacts remain excluded.
