# World activity scrolling and page dock

The City Activity panel is now the only scroll container. Activity and building lists grow inside it; they do not have nested scrolling or visible inner scrollbars. The panel has a four-pixel Chromium/WebKit scrollbar and standard thin Firefox fallback, transparent track, muted thumb and hover treatment. Its heading and filters stay sticky. The focusable panel supports native keyboard scrolling; overscroll containment prevents wheel/touch chaining into the world.

The former five-event presentation limit is removed. The panel displays the existing retained activity buffer, with unchanged filtering and ordering. This does not add historical fetching or change backend retention. Event rows use canonical event IDs as stable React keys rather than index-dependent keys, allowing native scroll anchoring to retain the reader's position during prepends. No activity events, API adapters, subscriptions or simulation rules changed.

**Show page** stays in the persistent app shell, fixed 20px from the bottom/right plus safe-area insets. Its appearance and action are unchanged. When it exists on narrower screens, the stats HUD occupies a separate row above it and activity height leaves that row clear. Camera controls stay in their original position. Footer text reserves horizontal room for the button. Hiding/showing activity and scrolling never reposition it.

## Mobile initial state

The App initializer hides the **entire** activity panel when first loaded at widths up to 700px. The existing **top-right expand arrows** reveal/hide it. The heading is plain text and never toggles the panel. This is initial state only: after the user expands it, live updates and navigation do not reset that choice. A fresh reload initializes it again. Desktop retains its separate collapse-arrow control and top-right immersive action.

On mobile, immersive mode remains available through the left camera controls; while immersive, the top-right button exits immersive mode. This preserves immersive functionality while assigning the normal mobile top-right arrows to City Activity as requested. No camera behavior changes.

The previous review script resized an already expanded desktop page into mobile; that preserves the user's expanded state by design. The updated capture script navigates freshly at each viewport to show the correct first-load behavior, then captures expansion separately.

## Validation

- Production build, TypeScript and ESLint passed.
- All 88 unit tests passed. An initial parallel run exceeded the existing frontier test's timeout while multiple software-WebGL captures were running; a subsequent full run with reduced worker concurrency passed without changing that test or its timeout.
- Six focused browser cases passed against the running local demo backend and explicit layout fixtures: desktop/tablet/mobile dock bounds and non-overlap; wheel/fractional-wheel and keyboard scrolling; sticky controls; filtering; building explorer; collapse/expand; navigation and immersive mode; native touch scrolling without moving the camera; native event anchoring; and fresh mobile initial state with touch expansion retained across events/navigation and reset on refresh.
- Native-resolution desktop/tablet/mobile captures were inspected. Functional tests use the existing optional lower-resolution software framebuffer. No renderer changes were made.
- Installed Snap Firefox could not launch its temporary Playwright profile in this environment. Firefox runtime behavior is unverified; standard cross-browser scrollbar and scrolling CSS is included. No browser was downloaded or user Firefox profile modified.

Review images (ignored by Git): [desktop](artifacts/activity-scroll-desktop.png), [scrolled desktop](artifacts/activity-scroll-desktop-scrolled.png), [tablet](artifacts/activity-scroll-tablet.png), [fresh mobile](artifacts/activity-scroll-mobile.png), [expanded mobile](artifacts/activity-scroll-mobile-expanded.png), [scrolled mobile](artifacts/activity-scroll-mobile-scrolled.png), [collapsed](artifacts/activity-scroll-collapsed.png), [immersive](artifacts/activity-scroll-immersive.png).

Reproduce with:

```bash
PLAYWRIGHT_SOFTWARE_LOW_RES=1 npm run test:browser -- tests/activity-scroll.spec.ts
node scripts/capture-activity-scroll.mjs
```

Branch remains `codex/frontend`. Backend-owned files, pre-existing integration notes, the camera, agents and railway work remain untouched. Nothing is staged, committed or pushed. After the coordinated frontend baseline checkpoint exists, group this as `fix(web): refine activity scrolling and anchor the page reopen dock`, including the App markup, world/global styles, focused tests, capture script and this note. Exclude artifacts, screenshots, dependencies and build output.
