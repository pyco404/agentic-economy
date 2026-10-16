# Directional water surface

Water uses an opaque Lambert material with a small procedural surface pattern.
The pattern combines broad ripples and short, softer streaks; its phase advances
at 0.85 world units per animation second. Its horizontal axis is the camera's
right vector projected onto the ground, so orbiting preserves perceived
left-to-right travel. This is environmental presentation, not simulation flow
or a new economic event.

The existing instanced canal boxes and frontier water triangles use the same
world-coordinate pattern. Geometry clips the effect to the actual water shape;
upward-facing normals limit ripples to the surface. No texture downloads,
transparent overlays, displacement, new meshes, or extra render passes are
required. A restrained teal adjustment differentiates water from sandstone.
Buildings, banks, bridges, terrain, camera controls, and backend records retain
their existing geometry and behavior.

Pause freezes the phase. Reduced motion freezes it without disabling other
frontend features. No water geometry rebuilds occur during animation.

## Validation

- Typecheck, lint, build and all 48 unit tests pass.
- Browser pixel tests at zoom 1, 1.65 and 4.9269 verify a ten-pixel rightward
  translation, unchanged pixels beyond the banks, and one draw / twelve
  triangles for the existing instanced water box.
- Live backend browser checks cover WebSocket connection, pause, reduced motion,
  camera rotation and absence of rendering errors. Existing roof and facade
  rendering regressions pass.
- `node scripts/capture-water-flow.mjs` captures paired material-isolation views
  at default, close and maximum zoom-out cameras in `artifacts/water-*.png`,
  with camera and rendering counters in `artifacts/water-comparison.json`.
  Strength zero reproduces the prior flat material on the same geometry.
- Initial independent captures also record the unchanged persisted-building
  hash in `artifacts/water-flow-{before,after}.json`.

Browser validation uses SwiftShader software rendering. Mesh and draw budgets
are unchanged; these runs do not establish a native GPU frame-rate benchmark.
Screenshots, diagnostics and build output remain ignored review artifacts.
