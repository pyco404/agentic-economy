# Phase 2 (Token Launchpad): completion record, 19 October 2026

Owner: Claude (took over from Codex). Builds on [the final blockchain audit](phase2-final-blockchain-audit.md). Staging stays `MODE=demo`; mainnet, real charges, claims, payouts and treasury signing remain disabled. No migration was added or applied.

## What changed today

| Area | Change | Commits (main) |
|---|---|---|
| USDC Launchpad | Contract 0.4.0 (USDC drafts/executions/provenance), default-off `USDC_LAUNCH_ENABLED`, per-network quote mint (never client-supplied), live Global-allowlist check before building, exact vault rent in the fee preview (+2 × 2,039,280 lamports), quote-aware confirmation, Create Coin pair picker, Explore USDC filter | `a258aeb`…`31d1af2` |
| SOL confirmation | Curves report SOL as the all-zero quote address (observed on real devnet launches); normalized so valid SOL launches are not held for recovery | `5d14a91`, `b9540ca` |
| Explore | Contract 0.4.1: on-chain holders (exact or lower bound), graduation progress (exact bps of initial real reserves), recent trades decoded from Pump's own events (forged events from other programs rejected), slot/block-time freshness, independent failure, stale→unavailable | `806dd12`…`4407922` |
| Creator fees | The ledger only accepted `distribute_creator_fees_v2`; the SDK's standard SOL path is `distribute_creator_fees`, so real SOL fee income was not being recorded. Both are now verified with the same strictness; devnet USDC mint accepted for v2 | `113eede`…`dccd5f0` |

## Verification levels

| Capability | Level | Evidence |
|---|---|---|
| USDC launch through the real application (sign-in → draft → logo → metadata → review → prepare → sign → submit → confirm → provenance → receipt → Explore metrics) | **Isolated local validator** (cloned devnet programs); Pinata stubbed | [evidence](evidence/pump-local-launchpad-usdc-2026-10-19.json): 1,139-byte packet, 7 instructions, curve quote = USDC, 60/40 locked, exactly 50,000,000 lamports to platform, one receipt, duplicate submit idempotent |
| SOL launch through the same path | **Isolated local validator** | [evidence](evidence/pump-local-launchpad-sol-2026-10-19.json) |
| Earned creator fee: accrual → standard distribution → 60/40 → ledger, once | **Isolated local validator** (one test buy, local lamports) | Creator fee 2,550,161; paid 1,530,096 agent / 1,020,064 platform (exactly 60/40, 0 dust); two ledger entries after three indexer passes |
| Pump enforces a minimum distributable vault balance | **Isolated local validator** | A 0.5 SOL buy's fee (1,481,482) was below the minimum then required (2,375,680); Pump logged and skipped. Distribution needs enough accrued fees |
| Trade decoding | **Public devnet (read-only)** | 12/12 real devnet trades matched the trader's token-balance change; fixture `test/fixtures/pump-trade-devnet.json` |
| Curve quote/progress readers | **Public devnet (read-only)** | Codex's devnet SOL launch reports the all-zero quote; its USDC launch reports `4zMMC9…` |
| USDC fee accrual/distribution | **Not verified** | No devnet USDC available to the local buyer; public devnet needs Circle-faucet USDC and approval |
| Static-only lookup table fits USDC | **Deterministic** | 1,163 bytes at maximum metadata lengths with 20 static entries |

## Security review findings

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | SOL creator-fee distributions via `distribute_creator_fees` were never accounted | High (financial accounting) | **Fixed** and verified on chain (local) |
| 2 | Devnet USDC distributions rejected (verifier hard-coded mainnet USDC) | Medium | **Fixed** |
| 3 | SOL confirmation could fail on curves reporting the all-zero quote | High (would block valid launches) | **Fixed** before release |
| 4 | Expired `auth_challenges` and `sessions` are never deleted; challenge creation is unauthenticated (rate-limited per IP), so storage can grow without bound | Medium (resource exhaustion) | **Open**: fix deletes staging rows, so it awaits approval |
| 5 | Communities register at `confirmed`, not `finalized`; community rows are immutable | Low on Solana, mainnet gate | **Open**: explicit fork/finality policy before mainnet (receipts are already pending → finalized/reversed) |
| 6 | Holder enumeration needs an RPC that indexes Token-2022; public RPCs refuse and rate-limit the fallback | Low (data availability) | Shown as unavailable or a marked lower bound; a paid/indexed RPC is needed for exact counts |
| 7 | Pinata-returned CIDs are trusted (not recomputed locally) | Low | Residual; Codex's evidence confirmed real CIDs |

Reviewed without findings: sign-in (single-use, origin-bound, consumed before verification), sessions (hashed, HttpOnly/SameSite=Strict/Secure), CSRF (Origin allowlist on mutations), draft ownership and versions, image validation and re-encoding, Pinata secret isolation, exact prepared-message signing, signer checks, idempotency, blockhash expiry on finalized height, network/genesis binding, treasury role separation, no server-held private keys, mainnet hard-disable, rate and concurrency limits.

## Remaining gates (need the user)

1. **Phantom desktop** signing of one devnet launch in the combined Create Coin flow; **Phantom mobile** on a physical device.
2. **Public devnet creator fees**: one test buy above the minimum distributable fee on a platform-launched devnet token, then distribution and ledger check (devnet SOL only).
3. **Devnet USDC**: extend the devnet launch lookup table with the USDC static entries (one devnet transaction), set `USDC_LAUNCH_ENABLED=true` on a devnet deployment, and verify one USDC launch; USDC fees need Circle-faucet devnet USDC.
4. **Real Pinata** on a non-demo deployment (server-only `PINATA_JWT`).
5. **Approval for finding 4** (pruning expired auth rows).
6. **Mainnet**: fork/finality policy, mainnet program/IDL attestation, audited custody destinations and lookup table, independent security review, and separate authorization for any real charge, claim, routing or payout.
