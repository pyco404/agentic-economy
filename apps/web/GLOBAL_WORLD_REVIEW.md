# One living world, every route above it

The application shell owns one persistent `City` instance, outside the World route conditional. `useWorld` remains at the same application level: no additional HTTP adapter, WebSocket, simulation timer or replay client is created. The renderer effect still initializes once and cleans up only on actual application unmount/context lifecycle. Navigation does not reset the camera or transform geometry. Existing buildings, parcels, roads, trains, vehicles, agents and water shaders are unchanged.

## Three layers

- `.global-world-layer`: fixed beneath the compact 64px sticky navigation, independent of page content height. Functional routes scroll inside their own main region, so page scrollbars cannot resize the city or trigger camera reframing. One canvas, scene, camera and animation loop. Scrolling long routes does not resize the WebGL surface.
- `.world-atmosphere`: pointer-transparent ivory tint with 280ms opacity changes. World 0%, Communities 24%, Explore 32%, Studio 42%, Launchpad 48%, Economy 50%, Treasury 64%. No world blur or scene replacement.
- Existing route surfaces: ivory headings/cards/forms with restrained borders and shadows, visible city margins and panel gaps. Mobile surfaces are more opaque with 44px form targets. Page surfaces enter over 280ms; reduced motion removes transition/entry effects.

Off World the world layer is inert, excluded from tab order/accessibility navigation, and rejects picking/keyboard/OrbitControls input. Labels are hidden to avoid background clutter. World overlays remain in the World route; their pointer-transparent layout allows canvas interaction between panels. Global navigation and functional pages remain accessible. All routes retain the existing link back to World.

Inspection focus is passed to the renderer only on World. Leaving World cancels unfinished focus movement without changing the current camera pose. Normal route navigation never moves the camera. Explicit community/agent “View in World” actions retain their existing genuine location behavior. World reset, zoom, orbit, pan and immersive mode remain available.

## Rendering and simulation

Background routes cap presentation updates at 24Hz in the existing animation loop. World retains the normal display cadence. Treasury pauses cosmetic clocks and holds the last rendered frame, refreshing for viewport resize; authoritative backend events and state reduction continue. Returning to World displays current data immediately. No server simulation command, pause, economic rule, financial permission or persisted coordinate changes.

Backend failure still exposes the existing retry/explicit fixtures controls. WebGL failure retains the graphics error and independent functional page interfaces. No screenshot replaces the world. Procedural community identity images remain the existing CPU-projected SVG artwork, not extra WebGL scenes.

## Review and validation

`tests/global-world.spec.ts` navigates all seven routes at desktop/mobile widths. It checks canvas identity, a single backend WebSocket, exact camera preservation, stable geometry build count, continued event sequence, inert controls, form/search usability and horizontal overflow. Screenshots per route live under ignored `artifacts/global-{1440,390}-{route}.png`. Existing immersive/navigation tests cover inspector focus, mobile panels and launch restrictions.

Suggested commit grouping after the pending frontend checkpoint review:

1. `feat(web): persist the city beneath floating route interfaces` — keep shell placement, input ownership, route atmosphere/styles and background cadence together so imports and layout remain valid.
2. `test(web): verify persistent world navigation and document review` — route integration coverage and this handoff.

No commits or pushes are made without the previously requested checkpoint review. PNGs, build output and browser artifacts stay ignored. Backend-owned files and existing integration notes are untouched.

## Screenshot index

All images are local ignored review artifacts, never application backgrounds.

| Route | Desktop | Mobile |
| --- | --- | --- |
| World | [View](artifacts/global-1440-world.png) | [View](artifacts/global-390-world.png) |
| Explore | [View](artifacts/global-1440-explore.png) | [View](artifacts/global-390-explore.png) |
| Communities | [View](artifacts/global-1440-communities.png) | [View](artifacts/global-390-communities.png) |
| Agent Studio | [View](artifacts/global-1440-agent-studio.png) | [View](artifacts/global-390-agent-studio.png) |
| Economy | [View](artifacts/global-1440-economy.png) | [View](artifacts/global-390-economy.png) |
| Treasury | [View](artifacts/global-1440-treasury.png) | [View](artifacts/global-390-treasury.png) |
| Launchpad | [View](artifacts/global-1440-launchpad.png) | [View](artifacts/global-390-launchpad.png) |

Native GPU frame rates have not been measured in this headless software-rendered environment. The regression checks establish one scene/canvas/connection, unchanged geometry build count across navigation and preserved input behavior; they do not claim a hardware FPS benchmark.

Final validation: production build/typecheck and frontend lint pass; all 66 unit tests pass. Eleven browser tests pass against the local demo backend: three existing navigation/activation/mobile tests, two persistent-world route journeys, three immersive viewport tests, a WebGL-unavailable fallback, and two financial readability/reduced-motion checks. Financial notice text meets a measured 4.5:1 minimum contrast in both viewport sizes. Native FPS remains unmeasured. The existing Vite bundle-size advisory remains.
