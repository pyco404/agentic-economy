# Initial world reveal and camera preset — local review

## Camera reference status

The supplied attachment contains the written specification. The follow-up says the picture will be attached; no image has arrived in that attachment directory yet. Exact visual matching therefore remains pending. No different zoom, framing, tilt or world scale has been guessed.

`WORLD_CAMERA` now names the existing `civic-isometric` preset. Its existing eye direction (100,90,100), desktop zoom 2.85, portrait civic-neighborhood width 58 and Civic Core target are preserved. Initialization, framing and Reset share `worldCameraOffset()`. Beginning an OrbitControls gesture cancels a pending programmatic focus so user input is not followed by an automatic recenter. Existing mouse mappings, touch ONE/PAN and TWO/DOLLY_ROTATE mappings, damping, zoom limits and polar limits are unchanged.

When the reference image is available, compare the final desktop capture with it and adjust only the shared preset. Do not describe the current unchanged framing as a verified screenshot match.

## Reveal architecture

- `sceneryPlan.ts` prepares the same procedural terrain, street and building parts using current authoritative chunks and existing seeds. Chunks are ordered deterministically by distance from Civic Core, with stable ID tie-breaking. It emits roads first, renderable chunks next, and the heavier frontier/rail/clearance plan last.
- `scenery.worker.ts` runs that CPU planning off the UI thread. Only public visual data and math/geometry descriptions cross the worker boundary; no WebGL scene, authentication secret, financial command or simulation clock is sent to it. Revision tags reject stale worker results. Maps retain their identity model and vector helpers are explicitly restored after structured cloning.
- `City.tsx` compiles the prepared parts into the existing instanced batches using a bounded work queue. Landscape and architecture were already separate material/role keys; final instance buffers, instance counts, coordinates, colors and material settings are tested against the previous combined batching.
- `CityReveal` gates existing meshes by stage and spatial rank. Architecture gets an optional three-percent vertical entrance over 0.22 seconds, ending at its exact original transform. No transparent materials, post-processing, per-object timers or extra draw passes are introduced.
- Terrain/paving appears first; building chunks spread from the civic neighborhood; trees, water and environmental infrastructure follow. Each railway's supports, deck, rails and portals reveal together. Citizens, labels, cargo/effects and ambient vehicles stay hidden until their supporting world preparation completes.
- Simulation snapshots, WebSocket events, activity age and authoritative identities continue normally. Rail elapsed time remains independent and advances continuously; newly prepared train geometry is sampled at current elapsed time before display. There is no fabricated growth or replay of old economic work.
- The reveal controller lives inside the persistent City effect. Navigation, reconnects and new snapshots do not recreate it. Already-visible objects and actors stay active during later updates; genuinely new chunks get a short local entrance without restarting the initial sequence.
- Reduced motion skips entrance effects. Sustained long frames or an expensive initial draw accelerate the presentation. Slow initial drawing yields intermediate redraws briefly while ready mesh batches assemble; the normal render policy resumes after completion.

## Tunable values

`src/world/reveal.ts` owns presentation tuning:

| Setting | Default |
|---|---:|
| Building stage start | 0.35 s |
| Building spatial spread | 1.45 s |
| Environment start / spread | 2.05 s / 0.55 s |
| Actor gate | 2.9 s, plus infrastructure/queue readiness |
| Subtle entrance | 0.22 s |
| Work budget / max jobs per frame | 6 ms / 2 |
| Sustained slow-frame threshold | 120 ms |

The sequence is approximately three seconds after first prepared terrain on capable devices; network/preparation time and slower hardware can extend readiness. Ready content is not artificially held to a fixed total duration on slow devices. The development-only `revealReview=1` clock exists for exact staged screenshots; production has no review clock handler.

Modern browsers use the module worker. If workers are unavailable or fail to load, the existing synchronous planning functions provide a compatibility fallback. That fallback cannot promise the same off-thread responsiveness; it does not substitute fixtures or alter simulation state.

## Preservation and review boundary

Both existing railway routes and their 120-second underground behavior remain. No backend source, shared contract, deployment environment, fee policy, city layout, parcel identity, building generator, river geometry, colors, navigation structure or database migration is changed.

The preceding mirrored railway changes and touch-test correction are preserved. The backend-owned integration notes stay unstaged and byte-for-byte intact. No new commit or push is performed during this review; the previous 22 one-file commits remain local. Screenshots and temporary diagnostics stay ignored.

New/updated files for the next individual-file plan, alongside the preceding mirrored-rail plan:

1. `src/world/reveal.ts` — `feat(world): coordinate one-shot staged city presentation`
2. `src/world/sceneryPlan.ts` — `refactor(world): prepare spatial scenery outside the renderer`
3. `src/world/scenery.worker.ts` — `perf(world): move scenic planning off the main thread`
4. `src/world/framing.ts` — `refactor(world): centralize the default isometric camera preset`
5. `src/world/ambient.ts` — combine the reviewed mirrored-service work with presentation-only actor visibility, in one inspected file commit.
6. `src/world/City.tsx` — combine the reviewed mirrored integration with worker scheduling, staged visibility and gesture focus cancellation, in one inspected file commit.
7. `src/world/reveal.test.ts` — `test(world): cover reveal order budgeting and one-shot behavior`
8. `src/world/sceneryPlan.test.ts` — `test(world): preserve instance buffers and worker math boundaries`
9. `tests/city-life.spec.ts` — `test(world): expect both ambient railway services`
10. `tests/riverside-rail.spec.ts` — `test(world): retain original route checks alongside its mirrored service`
11. `tests/world-reveal.spec.ts` — `test(world): verify staged reveal persistence and reconnect behavior`
12. `WORLD_REVEAL_REVIEW.md` — `docs(world): record reveal implementation and camera reference status`

Use explicit paths and exactly one file per commit. Do not push or trigger Railway deployment before visual review, including the still-missing camera reference.

## Validation checkpoint

Build, typecheck and lint pass on the final source. The full unit run passed 115 cases; one unchanged railway obstruction test exceeded its 20-second limit under host load, then passed in isolation. All 116 cases are covered across the full run and that rerun. The eight focused reveal/worker cases also passed again after preserving pre-scaled object transforms in the entrance controller.

All 13 targeted browser cases are covered across the initial run and successful reruns. The initial run passed 11: three responsive camera cases, two touch-control cases, three mirrored-rail cases, two reduced-motion/refresh cases, and the slow-bootstrap/WebSocket-reconnect case. Desktop orbit/pan/zoom/reset/inspection exceeded its first run's time limit and passed its isolated rerun in 1.7 minutes. The staged-reveal case initially counted Vite's development socket as another simulation socket; the assertion now counts only `/api/v1/ws`. Its isolated rerun passed in 2.6 minutes, including all four captures, unchanged camera, live event advancement, persistent canvas, route navigation and building inspection. No production socket code changed for that test correction.

Reviewed ignored captures in `artifacts/`: `reveal-1-ground.png`, `reveal-2-buildings.png`, `reveal-3-environment.png`, `reveal-4-complete.png`, `reveal-complete-820.png` and `reveal-complete-390.png`. They show the staged presentation and final tablet/phone layouts. The exact reference-camera comparison remains pending the user's image.

Browser checks use local demo API/WebSocket services and Chromium SwiftShader; framebuffer resolution is lowered for functional testing. These are not hardware frame-rate benchmarks. The existing large JavaScript chunk warning remains; no claim of a measured production FPS improvement is made. Worker preparation and render jobs still need representative device profiling before promising a fixed load time on every device.
