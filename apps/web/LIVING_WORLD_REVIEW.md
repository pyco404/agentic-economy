# Living-world presentation and controls

These changes remain frontend-only. They preserve procedural seeds, authoritative
building parcels, backend positions and activities, wallet restrictions, and the
transparent hero / immersive UI.

## Agent labels and movement

`src/world/agentLabels.ts` projects interpolated agent positions above their heads
into a reused DOM label layer at up to 30 Hz. Estimated text bounds avoid layout
measurements; selected/hovered/recently active agents win collision conflicts.
Labels stay upright, use warm cream text and a dark shadow, and open actual agent
inspection. Names now follow the corrected policy in
`AGENT_IDENTITY_BACKEND_HANDOFF.md`: readable stable house/legacy aliases,
no `0x` prefix, and no inferred wallet activation from `ownerWallet` or balances.
Floating labels show only the primary name; canonical ID tags remain in inspection contexts to resolve legacy short-code collisions. Shortened wallet names require
an authoritative activation record, which the current API does not publish.

`AGENT_LABELS` controls far zoom **1.2**, close zoom **3.6**, density limits
**4 / 18 / 48**, head height, spacing and update interval. At far zoom ordinary
names are suppressed. Viewport area lowers the label budget on small screens.

`src/world/agentMotion.ts` indexes loaded road, path and bridge cells. Between
consecutive live positions it reconstructs a bounded, deterministic road route
and interpolates over the backend tick interval. This is a visual route, not a
claim that the backend supplied every intermediate cell. Missing routes or large
reconnect gaps snap to the authoritative sample rather than crossing parcels or
predicting new work. Stops, work and pause states come from the backend. Walking
heading/gait follows displayed displacement; stationary working/trading agents
get a restrained hand motion. No arbitrary waits or speed variation are added to
real agent decisions.

Offline fixtures alone use seeded walkers: some wander locally and some visit
existing civic, market, headquarters or bakery access points. `AGENT_MOTION`
controls fixture speed **1.1–1.75 cells/s**, destination waits **1.5–4.5 s**,
search budgets and the live gap cutoff (**8 cells**). These paths never produce
economic events. Treasury/Arena destinations are not invented where the actual
world has no mapped building.

## Decorative ambient actors

`src/world/ambient.ts` exports `AMBIENT` for per-type enable flags, counts,
speeds, loop periods, station holds, rail offset, altitude and bobbing.

| Actor | Motion and defaults |
|---|---|
| Train | Dry outer-terrain railway; engine plus 2 carriages independently follow the same closed path, 1.6 cells/s, two 3 s holds per lap. |
| Cars | 6 small cars on clearance-validated two-way road/bridge loops; 2.2–3.0 cells/s, seeded phase offsets, some 1.2 s stops. Pedestrian-only paths are excluded. Restricted connected streets use smooth out-and-back lane loops; bounded footprint checks and yielding prevent overlap. |
| Airplane | Small tangent-facing ellipse above roof height; 190 s loop. |
| Helicopter | Smaller 150 s patrol ellipse, gentle hover, procedural rotating rotor. |
| Balloon | Slow 260 s drift ellipse, 0.6-unit bob, faceted canopy and basket. |

The train chooses a dry corridor outside occupied chunks and samples the existing
frontier height. It is omitted if no safe dry corridor exists. No waterway is
blocked, and no bridge or economic railway state is invented. Actors use shared
instanced primitives, not imported models. The left scenery button toggles the
decorative group without rebuilding WebGL. Global pause and reduced motion freeze
its clock. All actors are scenery, never counted as economic agents, shipments,
transactions or verified services.

## Richer palette and material separation

`palette.ts` defines eight restrained roof colors and cleaner terrain, glazing,
doors and cyan water. `buildingPalette.ts` assigns eight light facade tones by
canonical building family, neighborhood, parcel cadence and sparse seeded
variation. This reduces repeated adjacent facades while keeping coherent blocks.
Cool roofs avoid the blue-grey facade pairing. Branding remains authoritative.

`vegetationGeometry.ts` preserves all six existing silhouettes and placements,
adding two seeded crown tones per foliage family. No tree density is increased.
`facadeShading.ts` adds at most 8% under-eave contact tone and 2.5% base tone on
vertical wall faces within the existing opaque Lambert pass. Water retains the
left-to-right pattern, with brighter cyan and softer blue reflections. No fog,
bloom, filmic wash, emissive veil or new shadow-map pass is introduced.

Color now travels in instance buffers, grouped by geometry, shading behavior,
semantic role and LOD rather than one draw per palette color. Window/door
visibility, object picking, roof flat shading and selective detail are preserved.
The browser batching regression compares actual rendered pixels to the former
per-color approach and verifies fewer draws.

## Review artifacts

Ignored `artifacts/vibrant-world-{before,after}-{overview,detail,architecture}.png`
compare identical cameras and the persisted geometry hash. World layout modes
are captured at desktop/tablet/mobile under `world-*`; label and ambient reviews
use `agent-labels-*` and `ambient-city-overview.png`. Diagnostic JSON and screenshots
are local review artifacts and must not be staged. Native GPU FPS is not inferred
from SwiftShader browser timing.
