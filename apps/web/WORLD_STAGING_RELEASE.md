# Local world release audit — 18 October 2026

## Why staging differed

GitHub main and both Railway staging services were at `dd17c4f82c932bf7d6ebff26cc637f537eb89724`. The original checkout remained on historical `codex/frontend` commit `7408570` with 101 modified/untracked files. Completed world rendering and navigation work in those files was not present in main or its Docker build input. The previous green deployment was genuine, but it did not contain that local work.

The running local 5173/8787 website and staging both use `agentic-economy-genesis`, generator version 1. Local version-2/3 demo preview servers on 5174/5175 and 8788/8789 were not running. Those alternate layouts redistribute parcels or widen canonical waterways; they are not an approved migration of the persisted staging world.

No service-worker registration exists in source. Camera preferences are not restored from browser storage. Static assets use Vite content hashes, immutable caching only under `/assets/`, and revalidated HTML (`Cache-Control: no-cache`). Cache clearing cannot publish uncommitted source. The production domain is a separate issue: `useaeco.xyz` and `www.useaeco.xyz` return Vercel 404 responses; staging returns Railway HTTP 200. No production/DNS changes are included.

## Included rendering work

- Irregular stepped scenic landmask and shallow perimeter; preserve every canonical developed cell, existing water triangles, parcels and rail corridors.
- Sage terrain separation, denser groves, orchards, agricultural/service scenery, connected outer aviation apron and parked aircraft, vehicle parking, maintenance and wetland compounds.
- Procedural cargo/ferry/service boats, clearance-tested water graphs and docks; directed road navigation and staggered destination journeys. These are decorative, with no fabricated deliveries or financial events.
- Responsive front-facing `[100,65,100]` camera preset and consistent reset. Preserve desktop controls, one-finger orbit, explicit touch pan, two-finger orbit/pinch and manual camera intent on resize.
- Complete-world preparation barrier and branded loader; static chunks, terrain and both railways become visible together. Optional dashboard or transport failure does not replace authoritative information with invented data.
- Preserve current main's lake-to-river connector, work poses/following/highlights, authentication, public Launchpad, transaction safeguards and verified accounting. Navigation cache invalidation prevents stale routes through removed road cells.
- Launch navigation entry moves first and reads “Launch”, followed by Explore and the existing pages.

## Boundaries and validation

No backend, shared-contract, world-spec generator, persisted coordinate, database migration or production configuration changes are included. The western basin helper and waterfront bridge/scenery helpers are conditionally supported; legacy narrow-water terrain does not acquire the version-3 basin automatically. Version-2/3 neighborhood layouts and their wider canonical river remain local previews pending a separately approved adoption plan.

The running original local website was also captured at 1440px; its version-1 scenic footprint, support sites and front-facing preset are the comparison basis. Current main's completed lake connector and visible-work integration are intentionally retained where the older local checkout lacks them.

201 frontend unit tests pass. Workspace typecheck, lint and production build pass; the existing large-bundle advisory remains. API/auth/agent-work regression checks pass (32), shared contracts pass (26), and unchanged world-generator tests pass (7). Desktop/mobile world-readiness, landmass, support compounds and one-finger controls pass. Two additional live-browser destination-navigation cases verify moving boats and traffic. Candidate default and overview screenshots are captured at 1440px, 820px and 390px. Two-finger phone/tablet checks pass on focused rerun after correcting moving-label touch targets and allowing a 1e-9-unit floating-point target tolerance; the initial combined run was not clean. Native GPU and a reduced test framebuffer were used, not physical-device performance certification. Unit rail tests retain full-loop and exact 120-second assertions.

Each reviewed file is committed individually. Intermediate dependency revisions are not independently claimed to build. Final staging acceptance must identify the actual deployed SHA and compare matching desktop/tablet/mobile camera, landmass and support metadata plus screenshots. Dynamic simulation actors/activity may differ between the local and staging databases; canonical geometry and the release rendering must match.

## Inventory of all 101 preserved files

The original files remain untouched. “Integrated” means a reviewed copy/three-way combination on main, not a destructive overwrite of the preserved checkout.

| Original path | Classification | Disposition |
| --- | --- | --- |
| `apps/server/src/config.ts` | Completed preview; dependent on approval | Retained locally: v2/v3 geography is memory-only; persisted-world adoption requires an approved parcel migration. |
| `apps/server/src/http/handlers.ts` | Completed and ready | Relevant fixes already superseded by current main; retained newer auth/launch/workflow implementation. |
| `apps/server/src/http/launchpad.ts` | Completed and ready | Relevant fixes already superseded by current main; retained newer auth/launch/workflow implementation. |
| `apps/server/src/runtime.ts` | Completed preview; dependent on approval | Retained locally: v2/v3 geography is memory-only; persisted-world adoption requires an approved parcel migration. |
| `apps/server/src/services/auth.ts` | Completed and ready | Already identical to main; no duplicate commit. |
| `apps/server/test/auth-message.test.ts` | Completed and ready | Already identical to main; no duplicate commit. |
| `apps/web/FRONTEND_COMMIT_PLAN.md` | Unrelated documentation or temporary work | Preserved historical review/report or unused asset; not included in the world release. |
| `apps/web/OUTSKIRTS_REFINEMENT.md` | Unrelated documentation or temporary work | Preserved historical review/report or unused asset; not included in the world release. |
| `apps/web/PHASE2_LAUNCHPAD_REVIEW.md` | Unrelated documentation or temporary work | Preserved historical review/report or unused asset; not included in the world release. |
| `apps/web/playwright.config.ts` | Completed and ready | Already identical to main; no duplicate commit. |
| `apps/web/scripts/serve-launch-workspace-test.mjs` | Completed and ready | Already identical to main; no duplicate commit. |
| `apps/web/src/App.tsx` | Completed; dependent on this release | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/api/adapter.ts` | Completed; dependent on this release | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/api/useWorld.ts` | Completed; dependent on this release | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/api/walletSession.test.ts` | Completed and ready | Already identical to main; no duplicate commit. |
| `apps/web/src/api/walletSession.tsx` | Completed and ready | Relevant fixes already superseded by current main; retained newer auth/launch/workflow implementation. |
| `apps/web/src/components/LaunchWorkspace.tsx` | Completed and ready | Relevant fixes already superseded by current main; retained newer auth/launch/workflow implementation. |
| `apps/web/src/styles.css` | Completed and ready | Already identical to main; no duplicate commit. |
| `apps/web/src/world/City.tsx` | Completed; dependent on this release | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/agentLabels.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/agentMotion.test.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/agentMotion.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/ambient.ts` | Completed; dependent on this release | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/citizens.test.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/citizens.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/composition.ts` | Completed; dependent on this release | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/framing.test.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/framing.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/frontier.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/geometry.ts` | Completed; dependent on this release | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/outskirts.test.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/outskirts.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/palette.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/railTerrain.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/reveal.test.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/reveal.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/scenery.worker.ts` | Completed; dependent on this release | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/sceneryPlan.test.ts` | Completed; dependent on this release | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/sceneryPlan.ts` | Completed; dependent on this release | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/streets.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/undergroundRail.test.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/camera-framing.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/city-life.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/closable-pages.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/frontend.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/global-readability.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/global-world.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/isometric-controls.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/launch-quotes.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/launch-workspace.spec.ts` | Completed and ready | Relevant fixes already superseded by current main; retained newer auth/launch/workflow implementation. |
| `apps/web/tests/mobile-navigation.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/outskirts.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/selection.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/world-fallback.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/world-reveal.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `contracts/integration-notes.md` | Unrelated documentation or temporary work | Preserved historical review/report or unused asset; not included in the world release. |
| `packages/world-spec/src/generate.ts` | Completed preview; dependent on approval | Retained locally: v2/v3 geography is memory-only; persisted-world adoption requires an approved parcel migration. |
| `packages/world-spec/src/index.ts` | Completed preview; dependent on approval | Retained locally: v2/v3 geography is memory-only; persisted-world adoption requires an approved parcel migration. |
| `README.md` | Unrelated documentation or temporary work | Preserved historical review/report or unused asset; not included in the world release. |
| `apps/server/test/layout-version.test.ts` | Completed preview; dependent on approval | Retained locally: v2/v3 geography is memory-only; persisted-world adoption requires an approved parcel migration. |
| `apps/web/CITY_NAVIGATION_HANDOFF.md` | Unrelated documentation or temporary work | Preserved historical review/report or unused asset; not included in the world release. |
| `apps/web/DISTRICT_LAYOUT_REVIEW.md` | Unrelated documentation or temporary work | Preserved historical review/report or unused asset; not included in the world release. |
| `apps/web/WATERFRONT_LAYOUT_REVIEW.md` | Unrelated documentation or temporary work | Preserved historical review/report or unused asset; not included in the world release. |
| `apps/web/WESTERN_RIVER_REVIEW.md` | Unrelated documentation or temporary work | Preserved historical review/report or unused asset; not included in the world release. |
| `apps/web/WORLD_READINESS_REVIEW.md` | Unrelated documentation or temporary work | Preserved historical review/report or unused asset; not included in the world release. |
| `apps/web/public/aeco-cbg.png` | Unrelated documentation or temporary work | Preserved historical review/report or unused asset; not included in the world release. |
| `apps/web/public/gitbut-website-image.png` | Completed and ready | Already identical to main; no duplicate commit. |
| `apps/web/src/api/worldPresentation.test.ts` | Completed; dependent on this release | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/WorldLoading.tsx` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/boats.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/bridgeSurface.test.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/bridgeSurface.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/journeys.test.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/journeys.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/landmass.test.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/landmass.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/navigation.test.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/navigation.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/sceneryFailure.test.ts` | Completed; dependent on this release | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/supportDistricts.test.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/supportDistricts.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/vehicleNavigation.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/waterNavigation.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/waterfrontScenery.test.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/waterfrontScenery.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/westernRiver.test.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/westernRiver.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/worldReadiness.css` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/worldReadiness.test.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/src/world/worldReadiness.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/district-layout.spec.ts` | Completed preview; dependent on approval | Retained locally: v2/v3 geography is memory-only; persisted-world adoption requires an approved parcel migration. |
| `apps/web/tests/landmass.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/navigation.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/support-districts.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `apps/web/tests/waterfront-layout.spec.ts` | Completed preview; dependent on approval | Retained locally: v2/v3 geography is memory-only; persisted-world adoption requires an approved parcel migration. |
| `apps/web/tests/western-river.spec.ts` | Completed and ready | Integrated with current main; preserves newer work/auth/launch features. |
| `infra/railway/STAGING_DEPLOYMENT_AUDIT.md` | Unrelated documentation or temporary work | Preserved historical review/report or unused asset; not included in the world release. |
| `packages/world-spec/src/districts.ts` | Completed preview; dependent on approval | Retained locally: v2/v3 geography is memory-only; persisted-world adoption requires an approved parcel migration. |
| `packages/world-spec/src/waterfront.ts` | Completed preview; dependent on approval | Retained locally: v2/v3 geography is memory-only; persisted-world adoption requires an approved parcel migration. |
| `packages/world-spec/test/districts.test.ts` | Completed preview; dependent on approval | Retained locally: v2/v3 geography is memory-only; persisted-world adoption requires an approved parcel migration. |
| `packages/world-spec/test/waterfront.test.ts` | Completed preview; dependent on approval | Retained locally: v2/v3 geography is memory-only; persisted-world adoption requires an approved parcel migration. |
