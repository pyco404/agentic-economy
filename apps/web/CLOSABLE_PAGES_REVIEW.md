# World-first routes and closable overlays

**Superseded navigation behavior:** See `ROOT_WORLD_NAVIGATION_REVIEW.md`. World now has only `/`, no navbar item, and X hides the current page with a Show page action instead of navigating to World. Draft protection described below remains in place.

The existing persistent world remains mounted in the application shell. This change does not modify geometry, cameras, animation systems, simulation subscriptions or backend-owned files.

`navigation/routes.ts` resolves `/`, `/world`, `#world`, `#/world`, and equivalent aliases for every secondary route. Token detail links work as paths and both hash styles. Hashes retain precedence for compatibility. Navigation uses explicit same-origin history entries with canonical `#page` URLs, preserving query parameters. Both popstate and hashchange update the interface; X pushes World rather than using history.back. Back/Forward therefore still visit the actual page history. Production static hosting must retain SPA fallback for direct pathname routes, as Vite does locally.

`OverlayClose` is shared by the page shell and community details. Every secondary page, including token details and verification/error states, has an outlined ivory/forest-green 44px close button. The page-level control is sticky within the independently scrolling interface; a dialog uses its own top-right World close. A separate Back to communities action dismisses only that dialog. Opening a page focuses its close control; closing focuses the existing world canvas without scrolling or camera movement. Enter/Space use native button behavior. Escape never navigates away from a form. Reduced-motion settings remove nonessential control/page transitions.

## Draft protection

All existing Launchpad fields (name, symbol, description, manual image URL and metadata URL) and Studio configuration values use tab-local versioned session storage with a running-app memory cache. Writes occur on field edits, before navigation; close/reopen and browser Back retain them. No draft is claimed to be saved to the backend. Closing the browser tab ends normal session-storage lifetime; no cross-device persistence is promised.

Review status, authentication, verified wallets, eligibility, busy state and activation results are not persisted. Reopening requires review/eligibility again. Real activation and wallet signing remain disabled under existing restrictions. No agent is created by storing form fields.

When storage access fails, fields remain in memory across internal navigation. Normal navigation out of a changed form asks for confirmation and supports staying on the page. A beforeunload warning protects memory-only drafts on reload/tab closure. Browser Back retains in-memory drafts without destructive history rewrites. Storage errors never produce a successful-save claim. This does not implement IPFS upload or backend draft persistence; those contracts remain separate pending work.

## Validation

Route unit tests cover every pathname/hash alias, root fallback, token links and malformed escaping. Browser journeys cover every secondary close action, community/token details, keyboard activation, focus, browser history, camera/canvas identity, one backend WebSocket, local refresh persistence, Studio strategy restoration, and storage-failure confirmation/retention. Existing frontend workflows remain covered. Desktop/mobile review screenshots live under ignored `artifacts/closable-{1440,390}-launchpad.png`.

Suggested focused commits after the existing frontend checkpoint review:

- `feat(web): add draft-safe World-first page overlays` — keep route parsing/history, shared close controls, focus, field persistence, reload protection and responsive styling together so the shell never imports a missing draft module.
- `test(web): cover overlay navigation and draft recovery` — tests and this review.

Keep imports/dependencies together when reconstructing the untracked frontend history. No screenshots, build output, test artifacts, commits or pushes are included in this task's checkpoint.

Final checks: build and typecheck pass, frontend lint passes, all 69 unit tests pass. Seven relevant browser cases pass across the completed runs: desktop/mobile live close journeys, direct-route and draft/storage recovery, secondary backend-error close, and the three existing frontend workflows. Last Playwright result reports `passed` with no failed tests. The close journeys retain one canvas, the exact camera pose and one backend WebSocket before deliberate page reload. Both local review servers were restarted after session expiry and respond HTTP 200. Financial actions remain disabled. No commits or pushes were made.
