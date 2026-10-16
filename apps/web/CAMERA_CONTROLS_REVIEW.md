# AgenticPad camera controls (branch `claude/camera-controls`)

Written by Claude for Codex's review. Based on `codex/frontend` at `a077ad9`; touches `City.tsx` only for wiring. A three-way merge with your uncommitted `City.tsx` edits (composition/edges) has exactly one conflict: both add an import after `./selection`. Keep both lines; everything else merges automatically.

## What AgenticPad actually does

Read from source, `pyco404/oxude` at `/home/pikoo/Desktop/Oxude`: `web/lib/world/projection.ts` (`dragCamera`, `easeCamera`, `MIN_TILT`/`MAX_TILT`) and `web/app/village/world-camera.tsx` (pointer, wheel and frame loop). AgenticPad is a custom 2D-canvas projection, not Three.js, so its behaviour was ported, not its code.

- One pointer drag orbits: yaw −0.006 rad per pixel (unbounded, full orbit, shortest-path easing), tilt −0.005 rad per pixel, clamped 15°–55° elevation. Shift- or middle-drag pans.
- Two pointers: pinch zooms about their midpoint while the midpoint's motion pans (at half speed).
- Wheel zooms about the cursor by `exp(−Δ·0.002)`, each event capped at ±120.
- Drag sets a target; each frame eases toward it with `1 − e^(−14·dt)`, `dt` capped at 50 ms. No inertia after release. Zoom eases the same way.
- 8 px tap slop; a tap selects only if it ends on the target it started on.

## What changed here

- `src/world/cameraControls.ts`: the ported constants and helpers. `TOUCH_GESTURES` = one finger ROTATE, two fingers DOLLY_PAN; `orbitRotateSpeed(height)` gives exactly 0.006 rad/px on every screen (OrbitControls turns `2π·rotateSpeed/height` per pixel); `frameDamping(dt)` = `1 − e^(−14·dt)`; `TapTracker` (5 px slop, and any multi-touch press never selects).
- `City.tsx`: touches use `TOUCH_GESTURES` (previously one finger **panned**, which is why dragging slid the city on phones); `dampingFactor` and `rotateSpeed` are set from those helpers every frame (previously a fixed 0.09 per frame: frame-rate dependent and slower to settle); selection uses `TapTracker` instead of the single `pointerDown` point.
- **Unchanged on purpose:** desktop mapping (left orbit, right pan, wheel), polar limits 0.25–1.2 rad (no side-profile view), default isometric view and Home/Reset, zoom about the centre (cursor-anchored zoom would move the target that overview refit and inspection framing rely on), keyboard controls, text-selection protection, layout, simulation, API.

## Evidence

- Before (current `codex/frontend`, phone, 160 px one-finger drag): yaw 0.785 → 0.785, target (5, 5) → (−10.9, 20.9): the city slid. After: the view turns, the target stays. Screenshots and recordings: see the PR.
- New `tests/camera-gestures.spec.ts` (CDP touch on 390×844, 844×390, 820×1180, plus desktop mouse): one-finger horizontal drag turns yaw > 0.5 rad with the target fixed and the easing never reverses; vertical drag changes elevation within 0.25–1.2; two-finger drag pans without turning; pinch zooms; no text selection and no page scroll.
- `src/world/cameraControls.test.ts`: per-pixel rate on 4 screen heights, time-based damping identical at 30/60/120 fps, hitch clamp, tap vs drag vs pinch.

Note: `tests/isometric-controls.spec.ts`'s second test is titled "touch pan and pinch"; with this change its one-finger drag orbits. Its assertions still hold; you may want to retitle it.
