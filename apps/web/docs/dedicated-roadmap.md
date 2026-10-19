# Dedicated development roadmap

The eight-phase roadmap now has its own editorial page, available through
`/roadmap`. The former `/#roadmap` links normalize to that clean path. Launch and
Explore remain first and second in both navigation menus. Home's View Roadmap,
About's View Roadmap, and About's Explore Our Roadmap all open the same page.

The timeline distinguishes Phase 1's core staging milestone and ongoing
stabilization, Phase 2's current development/verification, and planned Phases 3–8.
Each phase has an always-visible explanation and status, with keyboard-accessible
expandable milestones. Phase 2 opens by default. No dates or percentages are
invented. Staging preparation, local-validator tests, public-devnet evidence and
remaining live/mainnet gates are explicitly distinguished.

About retains mission, economic context, agent classes and capability status,
with a short Where We're Going section instead of the full roadmap. The shared
roadmap content register is editorial only; it changes no capability flags, fee
constants, treasury behavior, activation eligibility or blockchain configuration.

Both editorial pages remain readable if the dashboard API is unavailable. The
existing global city stays mounted while navigating, closing and reopening these
pages. Camera state, geometry build count and completed reveal remain unchanged.

## Verification

- Frontend typecheck, lint and production build passed; all 211 unit tests passed
  with two workers. The first parallel run hit an existing geometry-test timeout;
  the complete rerun passed without changing geometry or test timeouts.
- Direct Roadmap links, refresh, keyboard expansion, status, nav ordering and API
  failure fallback at 320, 768, 1024 and 1440 pixels.
- Product navigation and screenshots at 1440×1000, 1024×768, 768×1024, 390×844
  and 844×390; persistent canvas, unchanged camera/geometry and no API writes.
- Backend-connected ecosystem and mobile navigation regressions, including
  closing and reopening pages over the same live world. A stale navigation test
  selector was narrowed to page links, excluding the existing social links.
- Staging verification follows release: actual deployed frontend SHA, compatible
  existing backend, API health, demo/financial restrictions, WebSocket snapshots
  and desktop/mobile navigation screenshots.

Each source, test and documentation file is committed separately. Some intermediate
commits depend on companion files; build validation applies to the complete series.
No database migration, production deployment or financial enablement is included.
