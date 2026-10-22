# Phase 2: SOL-only acceptance

Effective 20 October 2026. This supersedes earlier SOL/USDC launch checklists.

New launches accept TOKEN/SOL only. The backend rejects USDC, AECO and arbitrary quote mints in create/edit requests. The legacy `USDC_LAUNCH_ENABLED` setting cannot enable new USDC launches. Historical draft/launch schemas, protocol builders, market pairs, denominations and confirmation checks remain available for accurate historical reads. An old USDC draft is not silently converted: its owner must explicitly choose SOL, which invalidates its prepared metadata through the existing versioned update path.

Developer Buy stays optional and off by default, paid in SOL, between 0% and 3.5% of total supply. Exact integer quote calculations and atomic create/buy execution remain in place. The separate platform charge remains exactly 0.05 SOL. Eligible human-launch creator fees remain 60% Agent Rewards Treasury / 40% Platform Treasury / 0% human launcher. Accounting must never mix this charge, creator fees, protocol fees, LP fees or simulated Credits.

## Current acceptance status — 22 October 2026

**Real Phantom desktop Developer Buy: VERIFIED.** The owner reports signing Zappercoin ($ZAP) with desktop Phantom and seeing 20,000,000 ZAP in the wallet. Independent read-only Devnet checks match that report: finalized successful creation, 2% allocation, exact original receipt and current balance, one 0.05 test-SOL platform transfer, one finalized database receipt and a confirmed launch/community record. [Acceptance evidence](phantom-desktop-developer-buy-2026-10-22.md).

The earlier controlled 3% and 3.5% public-Devnet launches remain verified; their signatures were rechecked finalized. Those used an automated disposable signer, not Phantom. The ZAP test supplies the separate physical desktop Phantom acceptance. Neither proves physical mobile compatibility. Do not request another desktop Developer Buy test unless a specific new code change invalidates this evidence.

Remaining priorities:

1. Actual eligible SOL creator-fee collection and 60/40 reconciliation on public Devnet; accrual alone is insufficient.
2. Physical Phantom mobile acceptance.
3. Queued Railway deployment and proof that the replacement Helius key is active in the running backend. The prior running/configuration comparison still showed the old runtime key; no completion is inferred here.
4. Current Pinata integration verification and pending credential rotation, retaining V3 on the Free plan.
5. Final transaction-recovery, security, regression and staging acceptance.

Do not start Phase 3. USDC is outside Phase 2; staging remains demo and Mainnet financial operations stay disabled.

## Completion gates

- **VERIFIED:** SOL creation and real Phantom desktop signing, including ZAP 2% Developer Buy; see the acceptance evidence above.
- **VERIFIED:** controlled public-Devnet Developer Buy at 3% and the 3.5% limit, plus real Phantom desktop at 2%; exact token balances and one platform charge. Final failure/recovery regression review remains separate.
- Durable signed-transaction submission and explicit same-payload recovery after interrupted responses/restarts. No second coin, payment or wallet signature while an attempt remains uncertain.
- Actual SOL creator-fee accrual, eligible collection and denomination-aware reconciliation against source signatures; public-network transactions require separate approval.
- Verified, timestamped Explore market data and preserved launch provenance, with unavailable states rather than fabricated metrics.
- Physical Phantom mobile acceptance (emulation alone is insufficient).
- Final security, compatibility, staging website/API/WebSocket and operational acceptance.

USDC launch integration and USDC-specific fee verification are excluded. The earlier protocol implementation and evidence are retained but disabled; archived active-USDC route tests are explicitly skipped, while historical quote-confirmation tests still run. TOKEN/AECO is reserved for Phase 4. Neither is permission to add a launch option.

Railway staging remains `MODE=demo`, financial execution disabled. No mainnet signing, payments or payouts; no production changes or new database migrations. These policy changes do not establish that the remaining external acceptance gates have passed.

## Validation and commit-series limits

The integrated series passed frontend/backend production builds, frontend and backend typechecks, lint, 230 frontend unit tests, 206 backend tests, 31 shared-contract tests, the isolated PostgreSQL recovery/process-restart test, and four browser checks (1440px, 820px, 390px plus interrupted-submission recovery). Database-gated reset suites were not run against the preserved test world. Four archived active-USDC tests are deliberately skipped; historical confirmation tests still run. Local-browser chain transport uses mocks and actual generated signatures; this is not real Phantom Developer Buy acceptance. Initial concurrent runs hit existing terrain/test timeouts; the complete reruns passed with less contention and unchanged assertions.

Commits are one file each, ordered from shared contracts and private recovery storage through services, routes, UI and tests. Some intermediate commits require later files to build; validation applies to the complete final series, not every intermediate revision. No new migration is included.
