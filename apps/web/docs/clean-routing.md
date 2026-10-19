# Clean URL routing

The existing History API navigation now emits `/launchpad`, `/communities`,
`/explore`, `/agent-studio`, `/economy`, `/treasury`, `/roadmap` and `/about`.
World remains `/`. Internal `studio` state is retained so existing components,
draft keys and backend contracts do not change. Token details use `/explore/<mint>`.

Legacy root hashes, including slash-prefixed hashes and World aliases, are
normalized using `replaceState`; browser Back/Forward uses `popstate`. Existing
`/studio` links normalize to `/agent-studio`. Query parameters survive navigation,
legacy normalization and token links. Meaningful page anchors such as
`/about#about-faq` remain usable. Canonical and Open Graph URLs follow the page
without development-only query parameters.

The global Three.js world is not keyed by route and remains mounted. Navigation
never rebuilds geometry or restarts the completed cinematic reveal. Existing page
hide/reopen behavior, launch draft guards and wallet session provider remain intact.
Normal internal links stay in the application; modifier-click and new-tab links
retain browser behavior. Authentication uses the same origin as before, with no
change to signing challenges, CORS, secrets or financial configuration.

## Hosting

Vite development and preview explicitly use SPA mode, guarded so known client
routes receive the entry point while unknown routes, API paths and missing assets
keep 404 responses. `/healthz` is a real local health response. Caddy on Railway
uses the same route allowlist, serves assets normally and retains immutable caching
for built assets. No production service or DNS configuration changes are needed.

## Validation scope

- Route parsing, clean URL generation, query preservation, legacy aliases,
  encoded token identifiers, ordinary anchors and invalid paths.
- Desktop/mobile navigation, Back/Forward, refresh, direct links and token details.
- Persistent canvas identity, unchanged camera/geometry and no repeated reveal.
- Existing authenticated wallet/draft preparation tests with isolated mock wallets
  and Pinata: these do not substitute for new physical-device Phantom acceptance.
- Actual Caddy configuration and compiled frontend route/asset/API probes.
- Actual staging browser checks, endpoint responses, deployed SHAs and demo flags
  verified after the release; no launch or payment is performed.

Unfinished local backend scripts and fee-accounting changes are excluded. No
migration is included. Each reviewed file is committed separately; complete-series
validation is not a claim that every intermediate commit is independently usable.

Validation before release: 215 frontend unit tests, build, typecheck and lint passed.
The 18 route/authentication/navigation browser cases passed across the final runs;
one initial legacy-World assertion was corrected to wait for hash normalization,
since its pathname was already `/` before the initialization effect completed.
Caddy 2.11.7 configuration validation and compiled-host probes passed.
The additional mock-RPC confirmed-launch test also passed, verifying that View in
Explore changes to the clean token URL without replacing the canvas.
