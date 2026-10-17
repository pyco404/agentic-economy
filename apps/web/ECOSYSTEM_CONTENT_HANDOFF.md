# Expanded ecosystem content — frontend review

This is a content/presentation checkpoint. Nothing in it enables launches, custody, signing, conversion, rentals, auctions, or financial settlement. No deployment or push is performed.

## Information architecture

- World retains its existing city headline, scene and controls. Copy introduces the persistent Solana economy, useful work, planned agent classes and planned $AECO rewards. Compact actions open Economy, Launchpad, or the Roadmap.
- About retains the existing route and floating layout. Its dedicated `#about-roadmap` **DOM section** is reached using View Roadmap controls; it is not a new URL hash route. All eight official phases are shown, with available demo components separated from remaining integration work. Phase 2 is named Token Launchpad. Planned sections use native accessible disclosure controls.
- Common Agents and Super Agents are clearly distinct. Qualifying Common-Agent positions, $20/token, mandatory cross-token AECO holding, duration/value/performance factors, funded rewards and multiple future positions are explained. No AECO minimum is invented.
- Super-Agent rental, controlled wallets, research/trading/launching, reputation, release/expiry, and marketplace policies are explicitly future capabilities. No superior returns or earnings are promised.
- FAQ clarifies current demo functionality, future participation, lack of present Credit redemption, optional AECO pairing, and rental expiry.
- Launchpad, Studio, Economy, Treasury and Explore distinguish current preview/records from roadmap capabilities. Existing API requests, execution gates and agent activation behavior are unchanged.

## Fee disclosures versus current code

The human launch charge remains 0.05 SOL, 100% Platform Treasury, independent of SOL/USDC pairing. Executable shared fee constants and backend accounting remain unchanged.

A reusable proposed-policy table describes human 60/40/0, Super-Agent active-rental 50/40/10, and Super-Agent no-renter 60/40/0. This table is editorial data in `src/content/ecosystem.ts`, never imported by backend fee calculation. It applies only to eligible, actually received and verified creator-fee revenue in its received asset, excluding protocol/LP fees.

The proposed renter share accumulates and is claimable only during an active rental. Expiry removes access/claims and redirects unclaimed entitlement to Agent Rewards under the proposed policy. The next renter receives only future eligible portfolio fees, including the agent's prior tokens, never historical entitlement. All of this still requires design, implementation, audit and verification.

## Claude-owned dependencies

1. **Identity model migration:** the current v0.3.0 one-token/one-agent/one-wallet implementation is not silently replaced by this copy. Planned holder-based Common-Agent positions permit several qualifying token positions per wallet. Claude must design and review explicit future entitlements, holding-value oracle/provenance, duration snapshots, minimum AECO rule, anti-abuse checks, and historical identity preservation before enabling that model. Ordinary fungible holdings remain distinct from exclusive agent ownership. Simulation house agents are not Super Agents.
2. **Verified launch provenance:** shared `TokenLaunch`/community records inspected on the current frontend/staging contain no authoritative PLATFORM/HUMAN/SUPER-AGENT origin. `LaunchOriginTag` therefore renders only unverified status, prefixed Demo for an explicitly demo launch. It accepts no user-controlled origin. Styling for the three future classifications is prepared but dormant. Claude should publish an authoritative provenance discriminator derived from verified launch authorization and immutable actor records, with a documented response/event version. No origin inference from wallet presence, ticker, names, metadata, or mock status.
3. **Versioned fee policy:** future Super-Agent routing differs from current human 60/40. It needs verified launch origin, active-rental intervals, actual asset receipts, historical policy snapshots and audited expiry/claim/carry-forward rules. A static Pump fee-sharing config that revokes its admin cannot be assumed to automatically rotate renter access. Design the safe claim/custody/authority model before implementation, and preserve human fees and existing records. Do not activate this proposal through frontend percentages.
4. **Super Agents:** controlled wallets, policy limits, authorization, rental locks, auctions, claims, release and expiry are absent and remain disabled. No transaction construction or signature request is introduced.
5. **Market/reward data:** no AECO mint, supply, price, launch date, minimum lock, minimum additional AECO balance, APR, conversion rate, payouts or revenue is invented. A future funded conversion program needs separate eligibility, funding and security approval.
6. **Multi-quote work:** see `MULTI_QUOTE_HANDOFF.md`. SOL is the local draft default. Native USDC/AECO execution and verified pair filtering remain blocked on backend/protocol support. AECO is optional and a later phase.

## Preservation and Git plan

The pre-existing uncommitted `world/City.tsx`, `tests/isometric-controls.spec.ts`, and `contracts/integration-notes.md` are preserved byte-for-byte during this task. The in-progress multi-quote changes are retained; Pages and Explore integrate content edits on top of them. No world geometry, camera, infrastructure, economic rules, database files or shared contracts are changed here.

Pending approval, use one inspected, explicitly staged file per Conventional Commit. Combined final file series (foundations first):

1. `src/api/launchQuotes.ts` — guarded draft quotes.
2. `src/launch-quotes.css` — pair-card styling.
3. `src/components/LaunchQuotePicker.tsx` — accessible pair cards.
4. `src/content/ecosystem.ts` — official roadmap and proposed policy copy.
5. `src/ecosystem.css` — responsive ecosystem and provenance styles.
6. `src/components/Ecosystem.tsx` — agent, fee, roadmap and FAQ sections.
7. `src/components/LaunchOriginTag.tsx` — unverified provenance disclosure.
8. `src/content/about.ts` — available/developing/planned status copy.
9. `src/components/About.tsx` — ecosystem and roadmap information architecture.
10. `src/components/Pages.tsx` — quote draft flow plus relevant page disclosures.
11. `src/components/Explore.tsx` — unavailable pair data and verified-origin dependency.
12. `src/App.tsx` — homepage copy and Roadmap entry point.
13. `src/api/launchQuotes.test.ts` — draft quote guards.
14. `src/api/launchTreasury.test.ts` — received-asset display regression.
15. `src/content/ecosystem.test.ts` — roadmap, policy and provenance boundaries.
16. `tests/frontend.spec.ts` — scoped existing SOL draft review assertion.
17. `tests/launch-quotes.spec.ts` — quote draft/persistence/responsive tests.
18. `tests/ecosystem.spec.ts` — content, roadmap, preserved world and provenance tests.
19. `MULTI_QUOTE_HANDOFF.md` — multi-quote integration handoff.
20. `ECOSYSTEM_CONTENT_HANDOFF.md` — expanded-content handoff and final validation record.

Use descriptive Conventional Commit messages reflecting each final file. Do not include screenshots, generated outputs, dependencies, or backend-owned notes. Do not merge or push any series until validated and approved; `codex/frontend` pushes can trigger Railway automatically. Existing camera restoration files remain a separate checkpoint.

## Validation results

- Frontend build, typecheck, lint and `git diff --check`: passed. Build retains the existing large-chunk warning.
- Full frontend unit suite: 105 passed (29 files). Focused content/quote/receipt disclosure checks: 12 passed.
- Existing About browser suite: 4 passed, including backend connection, canvas/camera/socket preservation, deep-link refresh, mobile/tablet layouts, and readable failure state.
- New ecosystem browser suite: 4 passed, covering desktop 1440px, tablet 820px and phone 390px, eight roadmap phases, agent classes, proposed 50/40/10 policy, FAQ, no API writes, preserved canvas/camera and non-fabricated origin tags. The initial strict serialized camera comparison was corrected to an eight-decimal numerical tolerance for negligible floating-point differences. Production camera code was not changed.
- Screenshots remain ignored browser artifacts. Source camera, prior control regression test and backend-owned notes were hash-checked unchanged. No commit, push, migration, Railway deployment or financial action occurred.
