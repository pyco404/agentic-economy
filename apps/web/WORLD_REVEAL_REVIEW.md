# Complete-world cinematic reveal

The branded loading screen still covers preparation of the complete static world.
A 2.6-second presentation animation begins only after that barrier and the first
complete GPU render. Reduced-motion users receive the completed scene directly.

## Preparation dependencies

`City.tsx` requests the complete advertised chunk catalog before first presentation.
The scenery worker prepares roads and chunk terrain/architecture, followed by its
final scenery message. Main-thread assembly jobs create both railway systems,
bridges, stations, portals, the irregular landmass, joined frontier terrain, water,
forests, farms, aviation/parking facilities and support compounds. The existing
`WorldReadiness.commit` requires the full catalog, all assembled chunks, completed
scenery and an empty assembly queue. Camera-visible core chunks alone cannot pass.

`CityReveal` registers the resulting meshes and chains existing material shaders,
including water animation. One world-space tile mask covers ordinary meshes,
instanced scenery and large merged outer terrain/water surfaces. Ground is revealed
before raised scenery. Updating its shared presentation uniform creates no geometry,
imports or requests, and preserves final geometry, transforms, materials and camera.
Decorative outline materials compile with zero opacity behind the loader, then
return to their exact original opacity at the end of the same animation.
Moving actors activate after the reveal. Page navigation keeps the same scene and
does not restart it. Slow frames do not trigger the former acceleration shortcut.

## Verification

`data-world-timings` records actual core, outer terrain, railway, waterway, complete
static-world, reveal-start and rendered reveal-finish milestones in milliseconds
from navigation. The first complete render stays behind the loader to allow shader
compilation before starting the presentation clock.

`world-reveal.spec.ts` holds back the real final worker message while core buildings
assemble. Desktop and mobile must retain the loader until that message and all
assembly jobs finish. It checks ordering, duration, both railways, irregular terrain,
413 primary building geometries, no rebuild during reveal/navigation, and recovery
from unavailable nonessential dashboard data. Unit tests cover reduced motion,
assembly budgets, shader chaining, stable transforms and no replay.

This frontend-only change requires no API contract or database migration. Granular
one-file commits form one release series; intermediate commits are not independently
validated releases and the foundational reveal API needs its City.tsx integration.
