# Floating mobile navigation

Reference inspected read-only: `/home/pikoo/Desktop/Oxude/web/app/site-bar.tsx`, specifically `MenuPanel`. Agentic Economy now uses the same presentation pattern: dimmed world, a floating panel with its own brand header and close button, page links as vertical rows with chevrons, and a compact footer. It retains Agentic Economy's ivory/forest-green design rather than Oxude's pixel theme.

The old wrapping `.nav.open` layout is removed. Desktop navigation remains unchanged. Below 640px the panel sits near the top with safe-area margins; at 640–850px it hangs below the header at the right. Short screens scroll within the panel. Rows and the close button provide at least 44px touch targets. Reduced-motion preferences disable its brief entry animation.

`MobileNavigation` renders into a portal. While open, the existing app shell is inert, preserving the mounted world but preventing background input and focus. Focus starts on Close; Tab/Shift+Tab stay within the panel. Escape, the close button and tapping the dimmed area dismiss it and restore the opener. Switching to desktop closes it. Page links call the existing `go` function, preserving routing, active-page rules and draft guards. A rejected draft confirmation does not dismiss the menu. About remains available in the footer. No World link is added to navigation.

The live world, camera, backend subscriptions, simulation and financial restrictions are unchanged. No Oxude files, backend-owned files, integration notes or unrelated root files were modified. No branch changes, commits or pushes were made.

Review captures are ignored by Git: [mobile](artifacts/navigation-mobile.png), [tablet](artifacts/navigation-tablet.png), [desktop](artifacts/navigation-desktop.png). Generate them with `node scripts/capture-mobile-navigation.mjs`. Captures fast-forward the short CSS entry animation for a stable review image; runtime reduced-motion handling is separate.

Focused browser coverage in `tests/mobile-navigation.spec.ts` checks vertical rows/touch targets, focus containment and restoration, outside/Escape/button dismissal, all six routes plus About, active-page state, short-screen scrolling, reduced motion, resize to desktop, unchanged camera, one canvas and one live WebSocket. Functional tests use the existing optional low-resolution software framebuffer; review captures use DPR 1.

Validation: production build, TypeScript and ESLint passed. All three focused browser cases passed against the local demo backend and explicit fixtures. The outside-pointer dismissal check caught and verified a focus-restoration correction: prevent the backdrop pointer's default focus change before dismissing. This check now passes for both mobile and tablet.

After the coordinated frontend baseline exists, this belongs in `feat(web): adopt floating Oxude-style mobile navigation`, with the component, scoped CSS, App integration, removal of the old CSS rule, browser tests, capture script and this note. Keep screenshots and build/test artifacts excluded.
