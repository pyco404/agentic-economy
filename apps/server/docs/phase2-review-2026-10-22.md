# Phase 2 verification and internal security review — 22 October 2026

This is an internal development review, **not an independent security audit** or permission for Mainnet execution. Desktop Phantom Developer Buy remains VERIFIED by Zappercoin; it was not repeated. Phase 2 is TOKEN/SOL only. Phase 3 has not started.

## 1. SOL creator-fee verification

Actual eligible earned SOL creator fees have now been collected on public Devnet, from the existing controlled 3% launch:

- Token mint: `4PMot5KMVbwR1XE4waWGVoWhax3wXcAUv6E9xapPdy8p`.
- Accrual source: [original finalized Developer Buy](https://explorer.solana.com/tx/5ZC3TLEaS5VJfx8ZBq7tftJpwHbt7XV3smNCFKbspGRoGZNa8zMRUo4sjB16VinC1jxJYYxm6hxLVD78rUnUZmph?cluster=devnet), authenticated creator fee 25,887 lamports; protocol fees are excluded.
- The locked sharing configuration has exactly 6000 bps to test Agent Rewards `D8p7CytykA5Q7vSDGGoCJC6mNyLKXVwiEXLboih2ZHJs`, 4000 bps to test Platform `GcQFWipjZvpuk2sdJAZ4BwyTMdWTDmfjxWSdw4bTVzvp`, and revoked admin rights.
- A direct distribution initially simulated as successful but paid nothing because the rewards recipient was empty and the SDK's minimum-distribution threshold was not met. No no-op transaction was sent.
- The owner explicitly approved two transactions only: [650,240-lamport recipient prefunding](https://explorer.solana.com/tx/4S4FsX1TWtPSRhF46CHevoH8NupzqhD5WbByR7EqL8LE6dsaTjaKUYYYQq9qkZahjMkDbzM944XeH2geDU4YGJSP?cluster=devnet), then [creator-fee distribution](https://explorer.solana.com/tx/CTppmQatgJYhGdbUqzh8xredAi6jNDHgTmJhjkJZZ9AUx5eXRPnpfjdnPC4GAEnY34KtTPsFAJBtTSqx128jFJS?cluster=devnet). Both finalized successfully. No new trade or token was created.

| Reconciliation | Lamports |
|---|---:|
| Eligible accrued creator fee | 25,887 |
| Agent Rewards: floor(25,887 × 60%) | 15,532 |
| Platform: floor(25,887 × 40%) | 10,354 |
| Actually distributed | 25,886 |
| Retained rounding dust | 1 |
| Vault rent reserve, excluded from revenue | 650,240 |
| Final creator-vault balance | 650,241 |
| Separate recipient test funding, excluded from revenue | 650,240 |
| Network fees: two transactions | 10,000 |
| Total disposable payer debit | 660,240 |
| New platform launch charges | 0 |

Only the existing disposable payer `49Y2BZrtXmkKPTphcsx5riMDX4s4uqwC6yDmrprYaX3F` signed. No production/treasury private key was accessed. These test transfers are not Agent Rewards payouts or Mainnet receipts.

The first finalized read revealed a real verifier bug: the protocol event's `distributed` field means the net sum paid, not the pre-rounding gross amount. Re-splitting the net incorrectly rejected the valid 15,532/10,354 allocation. The fix checks actual recipient credits, their exact allowed floor allocations, the authenticated net event and creator-vault debit. Zero-distribution no-ops are rejected. A captured finalized public transaction is now a regression fixture; changed amounts, vault debits, event authority and arbitrary funding siblings remain rejected.

Where a gross amount cannot be uniquely identified, dust is **null / not determined**, never fabricated as zero. Contract 0.5.1 adds that truthful nullable evidence value and the UI handles it. Historical receipt records are not rewritten. A pre-existing receipt with contradictory legacy rounding evidence remains an immutable-history audit conflict, not permission to alter it.

The original successful signature was reconciled without another on-chain submission. Exactly two finalized creator-fee ledger rows were inserted into the existing isolated test database; concurrent duplicate ingestion inserted none. The rows survived reopening PostgreSQL. The funding signature has no revenue-ledger entry. [Public evidence](evidence/creator-fee-public-devnet-2026-10-22.json).

Fresh local-validator graduation verification passed before migration and after migration/pool trading. Supported post-graduation SOL consolidation paid 8,888,889 / 5,925,926 lamports; canonical sweep support also passes its captured local fixture and tamper tests. [Local graduation evidence](evidence/creator-fee-local-graduation-2026-10-22.json). This is not a new public-Devnet post-graduation/sweep collection. Unknown batches, noncanonical sweep accounts and unsupported structures remain rejected. USDC execution/fee acceptance is outside Phase 2.

## 2. Phantom mobile acceptance

**Physical acceptance remains pending.** Device supplied by the owner: Samsung Galaxy Z Fold6, Android. The dedicated non-production wallet's public address is still needed. No mobile wallet transaction has been authorized or submitted.

Folded/unfolded representative browser viewports (344×882 and 690×829) passed with mocked RPC/Pinata. Signing rejection and interrupted-submission recovery passed in a mocked browser test. These do not prove physical Phantom compatibility.

Prepared isolation:

- Temporary HTTPS tunnel to a loopback-only invitation gateway; unauthenticated public requests return 401, with certificate verification enabled.
- Separate 256-bit invitation and backend gateway secrets; host/origin validation; Secure, HttpOnly, SameSite=Strict access cookie; bounded access attempts and 30-minute expiry.
- Same HTTPS frontend/API/WebSocket origin, avoiding cross-site session cookies. Only a prebuilt frontend is served, not Vite's development filesystem.
- Backend direct access requires the private gateway token. Challenges and existing sessions are restricted to the owner's nominated test wallet; production treasury/deployer identities are rejected. Query strings do not bypass route restrictions.
- Existing explicit manual Devnet entrypoint retained; fixed Devnet RPC/genesis, test recipients and active lookup table, exact approved test database and schema-checksum gate. Mobile launch registration uses finalized commitment.
- Broadcasting stays blocked until a separate manual transaction approval. No financial setting changes on normal localhost, Railway staging or production.

The invitation gate is prepared; the Devnet test API remains closed until the account is nominated. Exact current URL/access-code location are supplied in the chat, not embedded as permanent repository URLs. See [physical test procedure](phantom-mobile-acceptance.md). Access may need renewal when the owner is ready.

## 3. Security and regression review

| Boundary | Review result / remaining risk |
|---|---|
| Authentication | Ed25519 signatures, single-use nonce, origin/domain binding, expiry, hashed opaque sessions, secure browser cookies, logout/replay/ownership checks covered by tests. No master JWT/session secret exists to rotate. Current staging message authentication also passed with a generated signer; that is not physical Phantom acceptance. |
| Inputs and launch integrity | SOL-only backend requests, 350-bps cap, exact integer quoting, slippage ceiling, signer/mint binding, exact prepared-message comparison, canonical accounts and atomic 0.05 SOL charge retained. No Mainnet execution enabled. |
| Recovery | HOME fixes retained: persist signed evidence before broadcasting; no new attempt while uncertain; full signature history, finalized height and mint absence required for safe expiry; exact-payload recovery; finality and concurrent submission tests pass. |
| Treasury | Real source-event credits only; denomination-aware, idempotent, append-only ledger; funding/rent/protocol/LP fees excluded. Real public earned-fee collection now has evidence. No payouts or custody signing enabled. |
| Programs | Four Devnet program binaries still match prior attestation; all share upgrade authority `GUYCUEpxSkm1ccDo3LSKMR4Xpe5bgMnEZaFygWUSEVH3`. External programs remain upgradeable. Mainnet program/IDL attestation is not complete. |
| Lookup table | Existing active 47-entry Devnet ALT, controlled by disposable setup payer `Et8CBt2TorNEjSs55uHVLLD8YynA44drKcVxCWQ2u5pB`. It remains a mutable test table, not approved production infrastructure. |
| Pinata | Genuine current staging image and metadata uploads, HTTP 200 retrieval, artwork references, draft reload/review and idempotent request replay passed. Both uploads use V3 `/v3/files`. Existing backend credential retained; rotation pending maintenance, no upgrade requested. |
| Helius | Replacement configured and read checks previously passed; running backend still differs from configured key while deployment is queued. Keep previous key active. No separate Helius URL found in staging service configuration. |
| Database | Staging migrations 001–004 match local checksums; none pending. No migration or password rotation performed. A current backup is listed, but an isolated restore has not been rehearsed. Only the already approved local database was used for write/restart tests. |
| Operations | Production repository triggers are empty. Staging remains demo with financial execution disabled. No production/DNS/public-demo changes. Queue status must be checked again at release. |

Evidence: [program/ALT attestation](evidence/phase2-program-attestation-2026-10-22.json), [current real staging Pinata](evidence/pinata-staging-2026-10-22.json), [atomic local retry](evidence/atomic-local-regression-2026-10-22.json).

Regression results: 235 backend tests passed, 23 explicitly gated/archived tests skipped; the existing non-reset PostgreSQL signed-payload restart/concurrency test separately passed. Shared contracts: 34 tests passed; world-spec: 7 passed. Frontend: all 245 tests passed on the final fixture/code rerun. Workspace typecheck, root/frontend lint, frontend/backend production builds and API-schema freshness passed; two pre-existing frontend effect-cleanup warnings remain. Gateway: one Node test covering multiple access boundaries; mobile policy and public-fee fixture: four targeted tests passed. Typecheck/lint/build/contract freshness are final release gates, not inferred from unit tests.

Initial restricted-sandbox WebSocket/deployment runs failed for EPERM; reruns with loopback/process permissions passed. An unfolded browser run was interrupted by fixture regeneration; an isolated rerun passed with unchanged assertions. An initial local atomic launch expired; its evidence is retained, and the isolated retry passed successful creation, exact one platform charge, duplicate submission and failed-last-instruction rollback. No public or user-wallet retry occurred.

External review still required: Mainnet programs/upgrade monitoring, production custody and frozen ALT, single-provider RPC trust, deployment-wide rate limits/trusted-proxy boundaries, historical rounding metadata and public post-graduation coverage. Prefer independently controlled hardware-backed multisignature treasury vaults with documented signer recovery, change approval and destination verification; do not change the official addresses without separate authorization. See [Squads vault guidance](https://docs.squads.so/main/additional-resources/key-aspects-of-using-a-multisig).

Phase 2 is not formally closed: physical mobile acceptance and final deployed-release verification remain open. Mainnet launching, real payments, treasury signing and payouts remain disabled.
