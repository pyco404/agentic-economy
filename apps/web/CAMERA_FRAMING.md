# Civic Core default camera

The default now frames the developed civic center rather than fitting every occupied chunk. `defaultWorldFrame` in `src/world/framing.ts` targets the actual town hall (stable canonical-ID order if several exist), falling back to the bounds of buildings when no civic landmark exists. Empty future chunks do not change a civic-anchored composition.

`WORLD_CAMERA` is the tuning source:

- `desktopZoom: 2.85`
- `civicWidth: 58` world units of minimum horizontal view on portrait screens
- `minDefaultZoom: 0.8`

The viewport-aware zoom is capped at the desktop value. The existing `(100, 90, 100)` isometric eye direction, polar limits, orthographic projection, and geometry scale are unchanged. The full-city overview calculation still supplies the minimum zoom, preserving the previous zoom-out range.

Initialization, resize while still at home, the reset button, and keyboard Home all use the same default. Initialization sets it before the first render; there is no fit-then-zoom animation. Manual pan/zoom survives resize and page navigation. The existing renderer has no saved camera preference feature; none was added. Opening overlays or immersive mode does not remount the scene or reset the camera.

The two referenced screenshots were not attached to the camera request available in this session. Visual review therefore follows the written direction and compares the actual prior distant view with the new civic-centered view, rather than claiming an exact match to an unseen image.

## Validation and review captures

Build, typecheck, and lint passed. All 88 unit tests passed, including civic targeting, expansion/order stability, portrait width, and unchanged overview/inspection behavior. All five relevant browser tests passed: three responsive framing cases and two existing mouse/touch control cases. They cover fresh load, refresh, button/keyboard reset, manual controls, resize, routes, immersive mode, camera limits and absence of profile mode.

Capture with `node scripts/capture-camera-framing.mjs after`. Native-resolution review images are ignored by Git:

- [Before](artifacts/camera-before-first-load.png)
- [First load](artifacts/camera-after-first-load.png)
- [Refresh](artifacts/camera-after-refresh.png)
- [Reset](artifacts/camera-after-reset.png)
- [Return to World](artifacts/camera-after-return-world.png)
- [Immersive](artifacts/camera-after-immersive.png)
- [Tablet](artifacts/camera-after-tablet.png)
- [Mobile](artifacts/camera-after-mobile.png)

Functional browser runs use `PLAYWRIGHT_SOFTWARE_LOW_RES=1`; review captures use DPR 1. No new geometry, materials or rendering passes were added for framing. A closer view may expose the existing high-detail LOD on more central buildings; this is the renderer's existing behavior.

## Preservation

No backend-owned code, economic state, city coordinates, navigation, UI components, agent motion, or railway behavior was changed. Two declaration-only repairs allow the previously interrupted railway work to compile: its existing four rail-part tags are included in `Part.role`, and its existing underground route reference uses a lint-compliant type import. The unfinished tunnel modules remain preserved and are not wired into the running railway by this camera change.

Branch remains `codex/frontend` at `80166de`. Existing integration-note changes and unrelated root files remain untouched. Nothing is staged, committed or pushed. After the coordinated frontend baseline commits exist, this change belongs in `fix(web): open the world with closer Civic Core framing`, including framing/City changes, tests, capture script and this note. Keep the declaration-only railway prerequisites separate from the camera commit where practical.
