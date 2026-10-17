# Opposite-side railway — local review

## Geometry and preserved infrastructure

The new railway reuses the existing `createRiversideScene` generator, ribbons, rails, ballast, sleepers, materials, bridge, active through-platform, galleries and portal geometry. The original plan is not edited. City buildings, authoritative parcels, roads, river geometry, camera framing, agent identities, UI and backend contracts remain unchanged.

The current 4 × 4 loaded field spans Z=0…128, with center Z=64. The planner reflects the route around that center and tests small outward translations in increasing one-unit steps. The live world's first fully clear train-height alignment is **Z′=130−Z**, a two-unit outward adjustment. Exact reflection and a one-unit offset encounter road/scenery clearance conflicts. The exposed path remains **137.40976040218928 world units** on both sides; rail gauge, curves, elevations, carriage spacing and grades are identical.

Current copied western portal: **(20,137)**; eastern portal: **(148,129)**; active through-platform: **(56,135)**. Coordinates are derived from the source route, not screen positions. The planner checks persisted parcels, full-height train clearance, scenery, road headroom and dry support foundations. Future incompatible expansion disables only the new line rather than silently moving authoritative structures.

Small destination-specific adaptations:

- Slender foundation feet meet the actual opposite-side terrain while rail elevation stays unchanged.
- Physical cover is extended where the destination approach has shallower terrain. Covered train hiding never moves out into open air.
- Only decorative frontier trees intersecting the new works/train envelope are reserved, as whole trunks/canopies. Existing urban landscaping is retained.
- The original disconnected legacy depot ornament remains in place. Its access stairs would conflict on the opposite side, so the copy uses the existing active through-platform rather than duplicating the disconnected ornament. The copied sign belongs to that through-platform.

## Trains and performance

Two trains share the existing arc-length sampler, carriage geometry and elapsed-time state machine. The second service has a 40-second phase offset. Each retains the production 120-second underground interval, forward travel, per-carriage hiding/emergence and correct reflected heading. No economic cargo, passenger or payment events are created.

Planning and clearance run on scenic-world rebuilds, not in the animation loop. Train parts remain instanced together with the existing transport batches, with selective 30 Hz animation updates. Static track geometry is batched. The frontend bundle increases approximately 5.6 KB uncompressed / 2.0 KB gzip against the preceding local checkpoint. Software WebGL browser tests validate behavior, not native-device frame-rate certification.

## Review and Git

New railway changes remain local for visual approval. Do not push or trigger Railway deployment yet. Screenshots and temporary studies remain ignored. Backend-owned `contracts/integration-notes.md` remains excluded and preserved.

Proposed one-file Conventional Commits after review:

1. `src/world/mirroredRail.ts` — `feat(world): validate an opposite-side railway reflection`
2. `src/world/ambient.ts` — `feat(world): animate independent mirrored railway service`
3. `src/world/City.tsx` — `feat(world): integrate mirrored rail terrain and diagnostics`
4. `src/world/mirroredRail.test.ts` — `test(world): verify mirrored rail clearance and carriage alignment`
5. `tests/mirrored-rail.spec.ts` — `test(world): inspect twin railways across responsive views`
6. `MIRRORED_RAILWAY_REVIEW.md` — `docs(world): record mirrored railway alignment and validation`

The separately held touch-test correction in `tests/isometric-controls.spec.ts` verifies uncovered canvas targets and starts the two synthetic contacts sequentially. It changes no production controls and belongs in its own test commit.

## Validation

Build, typecheck and lint passed. All 108 unit tests across 30 files passed, including existing original-service continuity and exact 120-second timing tests, new mirror clearance/identity tests and blocked-expansion behavior. All five targeted Chrome browser checks passed against the locally running demo backend: phone/tablet two-finger controls, plus matching railways and independent trains at 1440px, 820px and 390px. Desktop checks include four orbit views, mirrored underground/emergence/surface phases, accelerated repeated cycles, preserved parcel coordinates and no API writes. Screenshots show default and aerial views on all three sizes, four rotated desktop views, and portal close-ups. The production hidden duration remains 120 seconds; this task uses accelerated browser cycles and unit timing checks, not a new unaccelerated two-minute witness.

The preceding content/quote checkpoint also passed 20 of 21 browser checks initially; its synthetic phone-pinch case was corrected to target uncovered canvas and send contacts sequentially. Both touch cases then passed in the final five-test run. No production camera mapping was changed.

Native-resolution visual review: `artifacts/mirrored-rail-review-aerial.png` shows both routes and the complete field. `artifacts/mirrored-rail-review-emergence.png` shows the second train emerging from its eastern portal. Other ignored captures cover mobile/tablet, default camera and four orbit views. Aerial diagnostic sample: 366 draw calls, 628,317 triangles; this is a single software-renderer scene sample, not a before/after FPS benchmark.
