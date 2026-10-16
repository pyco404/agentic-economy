# Root city and hide/reopen page navigation

This supersedes the earlier “X navigates to World” behavior in `CLOSABLE_PAGES_REVIEW.md`.

Inspected reference: `/home/pikoo/Desktop/Oxude/web/app/shell.tsx` and `site-bar.tsx`. Oxude's page X changes panel visibility without changing its route; a “Show the page” action reopens it. Its logo opens `/`, and navigation marks a section current only while its panel is visible. No Oxude code, backend, authentication or styling was modified/copied into this application.

Agentic Economy now follows that behavior with its existing ivory/forest-green style:

- `/` is the sole canonical World URL. The brand links to `/` (preserving source query settings). No World navbar item exists. Old `/world`, `#world` and `#/world` locations are normalized to `/` with replaceState, so they do not remain alternate World routes or create extra history entries.
- Secondary path/hash deep links still open their pages. Existing Back/Forward behavior reopens the destination page. Token-detail routes retain their mint.
- X is labelled “Close page and view city.” It changes page visibility, clears transient inspectors and reveals the same interactive city. It does not push a World route or history entry.
- “Show page” appears only when a secondary page is hidden. It identifies the retained section, reopens the same mounted panel/detail and restores input isolation. Clicking the section's navbar link also reopens it. No section stays highlighted while its panel is hidden.
- The World layer, camera, zoom, geometry, cosmetic clocks and backend subscriptions are preserved. Treasury's cosmetic stillness is applied only while Treasury is visible. Hidden pages have the native hidden attribute and are excluded from accessibility navigation/input. World UI, controls and labels return while a page is hidden.
- Hidden forms stay mounted, preserving fields, search state and selected community details. The previous tab-local session draft storage and reload warnings remain. Hiding cannot discard a draft, so it does not ask for confirmation; changing away from a memory-only draft still uses the existing guard. No backend save, wallet verification or financial permission is implied.
- Opening focuses a visible panel close button; hiding focuses the existing city canvas. Community details keep their own close and separate Back to communities action. The Show page button uses a 44px minimum target, mobile placement above the HUD and the existing restrained styling. Loading/backend-error overlays also hide/reopen.

Only frontend paths changed. The earlier urban railway work is still a clearance survey; no tracks, buildings, streets, economic data or backend-owned files were modified by this navigation change.

Validation is covered by root/secondary route unit tests and updated browser journeys for hide/reopen, one canvas/connection, camera preservation, nav highlighting, logo root destination, canonicalized old URLs, history, drafts and errors. Ignored screenshot artifacts: `artifacts/root-city-{1440,390}-show-page.png`.

## Verified results

- Production build, TypeScript and ESLint pass. The build retains the existing large-bundle warning and dependency annotation warnings.
- All 69 unit tests pass across 21 files (`npm test -- --maxWorkers=1`). Serial execution avoids contention with software WebGL on this machine.
- All five `closable-pages.spec.ts` browser tests pass: desktop/mobile live-backend journeys, old URL normalization, retained drafts and backend-error panels.
- All five additional `frontend.spec.ts` / `global-world.spec.ts` browser tests pass: existing selection, growth, demo-agent controls, mobile navigation and the same persistent live scene at desktop/mobile sizes. The latter verifies unchanged camera/geometry, one canvas, one WebSocket and advancing authoritative events across every page.
- Functional browser runs use `PLAYWRIGHT_SOFTWARE_LOW_RES=1`, an opt-in test-only framebuffer scale of 0.5. CSS viewport sizes remain 1440×1000 and 390×844; production DPR is unchanged. These results validate behavior and layout, not native-GPU performance. The two Show page review screenshots use this lower framebuffer resolution.
- Local frontend `/` and backend `/readyz` respond successfully. Development remains on `codex/frontend` at `80166de`. Existing frontend files and the pre-existing 10-line integration-notes change are preserved; no backend-owned files were edited.

Proposed focused commits after the existing frontend checkpoint review:

1. `feat(web): make the root city home to hideable page panels` — router, shell visibility, common close control and responsive reopen affordance kept together.
2. `test(web): cover root navigation and retained page panels` — updated unit/browser coverage and this review.

No commits or pushes have been made. Screenshots, test output, node_modules and build artifacts remain ignored.
