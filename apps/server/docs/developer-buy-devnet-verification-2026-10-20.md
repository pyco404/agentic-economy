# Controlled Developer Buy: public Devnet verification

20 October 2026. Two actual public-Devnet launches finalized through the current application's wallet authentication, owned drafts, real Pinata image/metadata pipeline, production transaction builder, exact signed-message validation, submission persistence, chain verification and launch/community registration. This is an automated disposable signer, **not Phantom acceptance**. No mainnet, Railway financial enablement, production configuration or migration was involved.

## HOME diagnosis

The newer HOME attempt `lch_81180034cef889665c3273a4` persisted signature `FPNuUdggBKf8SyMiZTe11VeCMVtPHK83zBEzrcEL4mYHKdsMDDex7fmGwH5jbNPgaGufwgKF34a2kpbHRSDrMhg` for mint `9r4CjUUxuiHhYJtcfKtNvDKKX5rzUDxSfziLU5EfP776`. The local verification server had its explicit broadcast gate disabled. Persistence happened before that gate rejected broadcasting. Polling then remained submitted indefinitely. This was not an on-chain insufficient-compute or oversized-packet failure.

Full-history signature lookup, transaction lookup, finalized mint lookup and mint history were absent after its blockhash expired. It was reconciled to expired, retaining the original signature, mint and wallet-owned draft. No successful HOME creation, token receipt, platform charge or network fee was observed. HOME was never replayed. Earlier unsigned HOME attempts also remain preserved. [Evidence](evidence/home-devnet-expired-2026-10-20.json).

## Actual chain results

Dedicated disposable wallet: `49Y2BZrtXmkKPTphcsx5riMDX4s4uqwC6yDmrprYaX3F`.

It received exactly 0.25 faucet-issued Devnet SOL from the previously funded test setup payer `Et8CBt2TorNEjSs55uHVLLD8YynA44drKcVxCWQ2u5pB`; [funding transaction](https://explorer.solana.com/tx/2xhd2PRsUvb4saGzm2UsgbDu9FaWZ7WRu2GmZnKNhg81uVuRduRYd4Cv8hftA3ByFVF4GKj3umXewemZ3EM68ge6?cluster=devnet). No user/Phantom wallet key was used. Each launch was guarded below 0.10 Devnet SOL, and the harness will not automatically replace an uncertain/expired attempt.

| Result | 3% | 3.5% |
| --- | --- | --- |
| Mint | `4PMot5KMVbwR1XE4waWGVoWhax3wXcAUv6E9xapPdy8p` | `6BqWNJQZGVYWEbanASYtDgQ7skpT3LjXeDfozWvkirfZ` |
| Finalized signature | `5ZC3TLEaS5VJfx8ZBq7tftJpwHbt7XV3smNCFKbspGRoGZNa8zMRUo4sjB16VinC1jxJYYxm6hxLVD78rUnUZmph` | `4dbksmrgciU8HSzjiqSWefMfsntrWXAJqKhqQA7U4hMNgprxs34SBXZxmDBvBVP2YfqnX7GmT432tUYcYjYXqtPX` |
| Token supply / decimals | 1,000,000,000 / 6 | 1,000,000,000 / 6 |
| Wallet tokens received | 30,000,000 | 35,000,000 |
| Purchase, including protocol/creator fees | 0.008736818 SOL | 0.010242053 SOL |
| Curve price, excluding fees | 0.008628955 SOL | 0.010115607 SOL |
| Pump protocol fee | 0.000081976 SOL | 0.000096099 SOL |
| Eligible creator fee accrued by purchase | 0.000025887 SOL | 0.000030347 SOL |
| Account rent | 0.015102840 SOL | 0.013761720 SOL |
| Network fee | 0.000010000 SOL | 0.000010000 SOL |
| Separate platform charge | 0.050000000 SOL, once | 0.050000000 SOL, once |
| Actual wallet debit | **0.073849658 SOL** | **0.074013773 SOL** |
| Wire packet / compute consumed | 1,171 bytes / 361,860 units | 1,172 bytes / 393,556 units |
| Application record | `lch_fb08c407f58b519d32a7b0d3`, confirmed | `lch_12783f89d727426dd305693f`, confirmed |

[3% transaction](https://explorer.solana.com/tx/5ZC3TLEaS5VJfx8ZBq7tftJpwHbt7XV3smNCFKbspGRoGZNa8zMRUo4sjB16VinC1jxJYYxm6hxLVD78rUnUZmph?cluster=devnet) · [3.5% transaction](https://explorer.solana.com/tx/4dbksmrgciU8HSzjiqSWefMfsntrWXAJqKhqQA7U4hMNgprxs34SBXZxmDBvBVP2YfqnX7GmT432tUYcYjYXqtPX?cluster=devnet) · [machine-readable evidence](evidence/developer-buy-controlled-devnet-2026-10-20.json).

Amounts come from actual finalized transactions, authenticated Pump trade events, mint supply, the wallet's Token-2022 account and account balance deltas. Purchase + rent + network fee + platform charge equals the wallet debit exactly. Rent varies with accounts already present. Buyback is included within the protocol fee, not added twice. The accrued creator amounts above are **not a collected treasury payout**; they do not complete earned-fee collection acceptance.

Both transactions atomically created the token, initialized accounts, locked 60/40 sharing, created the buyer's token account and bought the exact requested allocation. Both use the existing active 47-entry ALT `3fzk4ecq4NZ6XtVyayTBo2cYJTcMJMgNYr4cAFcgYLrn`, with its extension already activated. No new ALT or changed compute-budget instruction was required. The platform account delta is exactly 50,000,000 lamports per transaction, and each saved launch has exactly one launch-fee receipt. Confirmed communities/market reads are available to the existing Explore interface; no market prices were invented for Devnet.

## Recovery and failures

After broadcasting, the test discarded the response for confirmation purposes and restarted the backend/context. The first harness then incorrectly reused an idempotent login challenge; the server correctly rejected that replay. Correcting the harness to request a fresh challenge recovered the original confirmed 3% launch, without another launch/signature/broadcast. The 3.5% launch recovered after its backend restart too. A separate OS process subsequently reopened both PostgreSQL records and checked finalized chain evidence and terminal resume idempotency.

Public RPC returned temporary HTTP 429 responses during read verification; its retries completed. No failed replacement transaction was submitted. Deliberate timeout, lost-response, rejected-signature, refresh, pre-submit recovery and concurrency cases use mocks for controlled fault injection. They are not presented as independently induced public-network failures.

## Fixes and safety

- Operator broadcast guards run before recording submitted; capability/review responses no longer advertise launch execution when the guard is closed.
- Signed-but-unobserved expiry requires the prepared network, finalized height beyond validity, full-history signature absence and finalized mint absence. Missing readers, RPC errors, observed signatures or an existing mint remain unresolved rather than permitting a replacement. This follows [Solana confirmation/expiration guidance](https://solana.com/developers/cookbook/transactions/confirmation), with additional history and mint checks.
- Signed payloads remain owner/mint/network-bound with 24-hour retention. Private test copies are erased after confirmation; private keys and signed bytes never enter evidence, logs or Git. Diagnostics contain stage, launch ID, public signature and a sanitized reason code only.
- The frontend distinguishes verified signed expiry from an unknown interrupted submission. Saved status remains readable after execution is disabled, without offering another signature or broadcast. No automatic new token or payment is introduced.
- SOL-only pairing, optional 3.5% cap, exact arithmetic, atomic platform charge and 60/40 eligible creator-fee allocation are unchanged.

The local preview backend was restarted on current code with its public broadcaster still disabled. A real Phantom transaction test requires separate manual acceptance enablement; the independent harness opens no public listener. Railway staging remains demo with financial execution disabled. No production settings or migrations were changed.

## Regression validation

- 210 backend tests passed; 23 intentionally gated/archived tests skipped (including deferred USDC execution and reset-based database suites). The separate approved-database signed-payload process-restart/concurrency test passed without resetting its world or launch records.
- 230 frontend tests, 31 shared-contract tests and 7 world-spec tests passed.
- Five isolated browser checks passed: Developer Buy at desktop/tablet/mobile sizes, unavailable execution, interrupted submission, same-payload resume, refresh and verified signed expiry. These fault-injection/signature cases use mocks, not actual Phantom.
- The actual local Explore page rendered both confirmed public-Devnet test tokens on desktop/mobile. Screenshots are in the ignored `apps/web/artifacts/controlled-dev-buy-explore-*.png` files.
- Fresh local-validator zero-buy and 3.5% launches passed, with exact balances, packet constraints, 60/40 routing, one platform charge/receipt, measured rent and duplicate-submit idempotency. [Local evidence](evidence/developer-buy-local-regression-2026-10-20.json). Shared/API/builder tests reject values over 3.5% and retain exact integer rounding.
- Frontend/backend builds, typechecks, root lint and API-contract freshness passed. Frontend-specific lint reports two existing effect-cleanup warnings and no errors. One-file commits are validated as a complete final series; intermediate dependent commits are not independently certified.

Outstanding: actual Phantom signing acceptance (including physical mobile), public earned SOL creator-fee collection/reconciliation and final independent security/staging acceptance. The controlled tests establish the real backend transaction path; they do not replace physical wallet testing or authorize mainnet.
