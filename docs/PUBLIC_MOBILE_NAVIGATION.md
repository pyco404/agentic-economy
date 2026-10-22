# Public mobile navigation and presentation — 22 October 2026

## Reproduced cause

On the actual public frontend at `aa1f53a`, Chrome at a folded 344px viewport placed the hamburger at x=357.09 with width 44px. The header's branding, About/social controls and `production · connected` text exhausted its width. Document overflow was clipped, so a document-width-only check incorrectly passed. Separately, the max-600px stylesheet explicitly set the wallet button to `display:none`.

## Changes

- Reserve header space for branding, a visible wallet control and hamburger; all have at least 44px touch targets. Apply safe-area padding. Keep desktop navigation intact.
- Reuse the existing accessible, portal-mounted drawer and focus trap; add the existing World route. Keep existing Launchpad, Explore, Communities, Agent Studio, Economy, Treasury, Roadmap and About routes. The city canvas and complete-world reveal remain mounted across navigation.
- Remove production connection/mode labels, tick/FPS/draw-call counters and developer IDs from rendered UI. Vite's compile-time development guard retains local diagnostics without a production query-string override. Rename the public building statistic to Buildings and remove backend terminology from status badges. API health checks, logs and monitoring are untouched.
- Keep zoom controls available on mobile; put secondary camera/world controls in an accessible collapsible More group with Escape handling and 44px buttons. Preserve desktop controls and all original camera handlers. Hide desktop mouse instructions on small screens.
- Preserve wallet authentication, transaction/recovery behavior, SOL-only pairing, the 3.5% Developer Buy cap, 0.05 SOL charge and 60/40 policy. No backend, database, domain or financial configuration changes.

## Verification and release boundary

All 251 frontend unit tests pass with bounded workers. Typecheck and production build pass; lint has no errors and two existing LaunchWorkspace effect-cleanup warnings. Production-build browser checks use the actual production API and WSS; local candidate assets alone are substituted at the official origin for pre-deployment compatibility checks. These are Chrome viewport checks, not a new physical Phantom acceptance test. No wallet signature, token transaction or upload is requested by this regression.

The browser regression checks folded 344×882, unfolded 690×829, tablet 820×1180 and desktop 1440×1000, header hit targets, drawer links, keyboard Escape/focus restoration, collapsible controls, absent diagnostics, all relevant routes, Back/Forward and retention of the same canvas. Screenshots are local test artifacts. Run `public-mobile.spec.ts` with `PUBLIC_UI_VERIFY=1` against the built/public site; `PUBLIC_UI_CANDIDATE` optionally supplies local frontend bytes while the real production API/WSS remain unchanged.

Only the frontend is eligible for this public UI release. Production API remains pinned to `6758f91`, with Mainnet launching, broadcasting and financial execution disabled. Automatic production promotion must remain off. No migration or backend deployment is part of this change. Actual deployed SHA and post-deployment results are recorded separately after verification.
