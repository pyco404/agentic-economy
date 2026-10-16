# Immersive World presentation

World occupies the viewport below a compact 64px navigation bar, without fixed
minimum page heights or scrolling on portrait screens. The existing procedural
renderer, city geometry, warm palette, waterways, simulation and backend adapter
are retained.

- Hero text has a transparent background, following the requested revision.
- Activity is a floating, collapsible panel with a bounded scrolling feed.
  Search and filtering retain their existing state while collapsed.
- Statistics form a compact floating HUD. Camera controls remain on the left.
- Immerse hides the hero, activity, HUD and district labels; camera controls,
  source/connection status and object inspectors remain available. The explicit
  exit button and Escape restore the regular interface. This mode does not pause
  the simulation or request browser fullscreen.
- Overview zoom fits occupied footprint corners and building peaks to the
  viewport. Resize refreshes the overview while preserving deliberate close-up
  zoom. Reset returns to the new viewport's overview.
- Inspectors pan the selected position into the available space beside the
  desktop inspector or above the mobile sheet. Live agent movement is not
  replaced by camera interpolation.
- Orthographic eye distance scales with the available zoom range, preventing
  foreground near-plane clipping in portrait views. The viewing angle and
  projected scale stay unchanged. The unbounded background ground surface was
  extended to cover wide views; no new urban frame or terrain parcels were added.
- ResizeObserver and window resize update projection, render size and capped
  pixel ratio (1.75). Opening or hiding panels does not recreate WebGL.

Validation: typecheck, lint, build and all 50 unit tests pass. Browser coverage
checks desktop (1440×1000), tablet (820×1180), and mobile (390×844) against the
local PostgreSQL-backed demo server. It covers collapse, immersive entry/exit,
building inspection, zoom-out, viewport bounds, and canvas identity across UI
transitions. Roof, facade and directional water rendering regressions are also
checked. Screenshots live in ignored `artifacts/world-{desktop,tablet,mobile}-`
files for default, collapsed, immersive, inspection and wide views.

All source edits are frontend-owned. No backend data, economic rules, financial
actions, Git refs or published commits are changed. Browser timing uses software
rendering and does not establish native GPU frame rates.
