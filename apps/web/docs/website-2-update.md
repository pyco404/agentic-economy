# Website 2.0 content and Launchpad audit

19 October 2026. This is a product-content and interaction update, using the
existing visual theme and world. It does not activate financial execution.

## Audit and implementation

| Surface | Finding and resulting change |
| --- | --- |
| Home | Replace vague AI-powered claims with token creation/discovery and a persistent rule-based economy. Create Coin, Explore Tokens and immersive World entry connect to existing routes. |
| Navigation/footer | Reusable accessible X and GitHub links; compact header icons only when space permits; mobile menu and overlay footers include official profiles. |
| Launch | Reuse the single Create Coin pipeline already verified on devnet. Add token-owned website/X/Telegram links to the live Explore-card preview. Clarify metadata, wallet-approval and submission progress; confirmed tokens link directly to their Explore detail without restarting the world. |
| Explore | Preserve all six sections, filtering, sorting, search, pagination and attributed market data. Token details now expose safe token-specific social links. Missing metrics stay unavailable. |
| Communities | Distinguish official platform updates from independently branded token communities. |
| Agent Studio | Show authoritative work descriptions and identity types in the existing scrollable list; remove the 14-agent display cap. Existing inspection, workplace, follow and activity controls are reused. Remove the obsolete claim that the identity contract is unpublished. |
| Economy | Explain Wheat → Flour → Bread → Residents, assigned work and deliveries; preserve actual resource values and work evidence. |
| Treasury | Separate simulation receipts, collection evidence, pending allocations, balances and payouts. Keep 0.05 SOL separate from eligible human 60/40/0 creator fees; future rental policies remain planned. |
| About | Four explicit capability classes: staging, test environments, external verification pending, and future phases. Add official website and social links; describe current workers as rule-based. |
| Roadmap | Phase 1 core staging milestones verified with ongoing stabilization. Phase 2 current and incomplete. Preserve all eight phases; Phases 3–8 planned, including proposed $20 eligible holdings and an unspecified AECO threshold. |
| Sharing/docs | Canonical project identity, Open Graph and X card metadata use approved existing artwork. README and transition notes now reflect compatible 0.3.1 main-branch staging and the resolved migration gate. |

Official identity: [Agentic Economy](https://useaeco.xyz), **A World That Works**,
[X @useaeco](https://x.com/useaeco),
[GitHub](https://github.com/pyco404/agentic-economy).
No platform account is inserted into a user's token metadata or social fields.
New token links reject executable schemes and embedded URL credentials.

## Reused security and release boundaries

Selected images remain browser-local until an enabled Create Coin action. Existing
authenticated ownership, Pinata V3 validation, idempotency keys, fee checks, wallet
approval, confirmation and recovery remain authoritative. Demo staging does not
enable creation just because its Pinata service is configured. Explicit draft
saving never uploads selected artwork. Unuploaded local images need reselection
after a browser refresh; uploaded receipts and owned drafts persist.

No backend behavior, shared contracts, migrations, financial constants, world
geometry, camera logic or reveal code changes. No production hosting or DNS change.
Canonical production metadata is identity information, not a redirect from staging.
The approved social-card screenshot is explicitly included in the frontend Docker context; other screenshots remain excluded. Public canonical social-card availability still depends on approved production hosting.

## Verification

- Frontend: 211 tests; shared contracts: 26; world specification: 7; backend: 155.
- The general backend run skips 18 database-gated cases. The three relevant
  non-resetting Launchpad PostgreSQL tests passed separately against the previously
  approved disposable `aeco_launch_execution_20261018_test` database. Existing
  draft/launch digests and the 001–004 migration ledger are unchanged. The other
  destructive schema-reset cases were not rerun against the user's active preview.
- Workspace typecheck, root/frontend lint, shared/backend builds, frontend production
  build and generated-contract consistency pass. Existing bundle-size and native
  bigint fallback warnings remain.
- All 24 selected browser cases passed across the full run and an isolated laptop
  rerun. The laptop initially failed before canvas mounting; the traced rerun
  passed with identical assertions. Checks cover persistent canvas/camera, complete-world readiness, official
  links, preview with no early writes, image replacement, wallet rejection,
  interrupted-response recovery, demo restrictions, market attribution and the
  eight-phase roadmap across desktop, laptop, tablet and phone orientations.
- An initial browser run timed out waiting for the full page load event, despite
  an already running city. The updated roadmap test waits for DOM content and the
  actual FULLY_ACTIVE scene state. An initial harness isolated third-party font DNS.
  Live verification then found intermittent desktop startup while external fonts
  were loading. The approved DM Sans and Libre Caslon Display files are now served
  locally, unchanged, with their OFL licenses. The DNS override was removed: six
  follow-up cases passed across all five viewports and guarded wallet signing,
  verifying actual local font loading without Google requests. World-loading code
  remains unchanged.

Screenshots are generated under `apps/web/artifacts/product-*` for Home, Launch,
Explore, About and Roadmap. Fixture, mocked-provider and live-staging evidence are
kept distinct; fixture metrics are not asserted as real market results.

The release uses one-file Conventional Commits. Some intermediate revisions need
subsequent companion commits (for example capability-register consumers); only the
complete series is claimed as build-validated.

## Remaining platform gates

Real-device Phantom mobile transaction acceptance; USDC application integration
(its devnet protocol harness is already verified); earned creator-fee collection
and graduation evidence; mainnet security review and separate authorization.
AECO issuance, optional AECO pairs, Common-Agent entitlements, funded rewards,
Super Agents, rentals and autonomous finance are later phases.

Prior real external-service evidence remains in the
[blockchain audit](../../server/docs/phase2-final-blockchain-audit.md) and
[Create Coin verification](create-coin-workflow.md). This content update creates no
additional real launch, charge, claim or payout.

Font sources and redistribution licenses: [DM Sans](https://github.com/google/fonts/blob/main/ofl/dmsans/OFL.txt) and [Libre Caslon Display](https://github.com/google/fonts/blob/main/ofl/librecaslondisplay/OFL.txt). Original Google Fonts CSS subsets are retained without conversion or modification.

## Dedicated Roadmap follow-up

The complete eight-phase timeline has moved from About to its own Roadmap page.
About now links to it through a short Where We're Going section. See
[dedicated roadmap](dedicated-roadmap.md) for routing, status and verification scope.
