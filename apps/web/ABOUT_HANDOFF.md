# About page

## Behavior

Open `/about`, `/#about`, or `/#/about`. Internal links use the existing hash router and preserve the selected data-source query. A compact header information link and secondary-page footer links make About discoverable without expanding the primary navigation.

The page is an editorial overlay above the existing global city. It creates no Three.js scene, WebSocket connection, world geometry, camera animation, economic action, or backend endpoint. The right side of the desktop hero is a transparent window onto the actual world. The city is inert behind the page; scrolling belongs to the page rather than the camera.

The X follows the existing closable-page behavior: reveal World, keep the page route and content, and offer **Show page**. **Explore the World** and **Enter the World** navigate to `/`. Browser back/forward and direct-link refresh remain supported.

About can render even when city loading fails. Its connection disclosure distinguishes HTTP connection failure, connected demo simulation, and explicitly selected offline fixtures. It never silently switches sources or draws a replacement world.

## Content and financial boundaries

`src/content/about.ts` is the capability/status register. Update it when verified implementation changes. It is editorial content, not an authorization source. Actual source and connection status are supplied separately by App.

Fee figures reuse existing shared constants: 0.05 SOL platform launch charge, 60%/40% target allocation of eligible actually received and verified creator fees, and 0% of that allocation to launchers. The platform launch charge goes entirely to Platform Treasury. Protocol and liquidity-provider fees remain separate. No signing, payment, activation, live settlement, or launch is enabled by this page.

House names and shortened wallet strings are illustrative identity examples, not invented ownership records. The one-token/one-agent/one-verified-wallet design is explained as unavailable until authoritative activation is implemented and enabled. Ambient transportation is explicitly distinguished from authoritative economic activity.

## Validation

- Production build, TypeScript, ESLint, and 86 unit tests passed.
- Four About browser cases passed against the local demo backend and explicit fixtures: same canvas/camera/geometry-build count and one WebSocket; internal links and history; X/Show page; direct links and refresh; 390px/900px layouts; backend failure without fallback.
- Both responsive About cases were rerun successfully after adding reduced-motion assertions.
- Seven existing closable-page/global-world browser tests passed, including desktop/mobile camera and connection persistence, continued backend events, draft retention, browser history, and failure states. In total, 11 distinct browser cases passed.
- Native-resolution screenshots were captured and visually inspected at 1440×1000, 900×1000 and 390×844. Hero, systems, agent identities, fees, architecture and status remain readable. Screenshots live only under ignored `artifacts/`.
- Functional browser tests use the existing optional half-resolution software-WebGL framebuffer setting. Review captures use device pixel ratio 1. This validates lifecycle stability and responsive behavior, not GPU performance on user hardware. No extra render loop, geometry or per-frame About updates were added.

Run:

```bash
npm run build
npm run typecheck
npm run lint
npm test
PLAYWRIGHT_SOFTWARE_LOW_RES=1 npm run test:browser -- tests/about.spec.ts tests/closable-pages.spec.ts tests/global-world.spec.ts
node scripts/capture-about.mjs
```

The frontend and demo backend must be reachable for the screenshot script. Playwright config starts the existing integration services if needed.

Local review captures (ignored by Git):

- [Desktop hero](artifacts/about-desktop-hero.png)
- [How it works](artifacts/about-how-it-works.png)
- [Agent identities](artifacts/about-agents.png)
- [Economic model](artifacts/about-economic-model.png)
- [Technology](artifacts/about-technology.png)
- [Current status](artifacts/about-status.png)
- [Tablet](artifacts/about-tablet.png)
- [Mobile](artifacts/about-mobile.png)

## Proposed focused commits

The repository still has the frontend directory untracked, awaiting the coordinated feature-based checkpoint. Do not commit the entire directory as part of About. After the foundational frontend commits exist, group this addition as:

1. `feat(web): add editorial About overlay above the persistent world` — About component, content register, scoped styles, route, header and footer integration.
2. `test(web): verify About navigation and persistent world lifecycle` — content tests, About browser tests, capture script and this handoff.

Do not include `artifacts/`, screenshots, `dist/`, dependencies or test output. No files have been staged or committed for this change. Backend-owned files and existing integration notes are untouched. Railway work remains unchanged; the separate western-route review is preserved for future coordination.
