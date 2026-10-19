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

## Final verification pass (later on 19 October)

Codex's three unpushed frontend commits were already integrated into `main` by Codex (merge `cad37ad`), along with its startup-gating work. All earlier Phase 2 commits are still on `main`. This pass was done in an isolated worktree; Codex's worktree was not touched.

### New findings, all fixed

| # | Finding | Severity | Status |
|---|---|---|---|
| 8 | **Post-graduation creator fees were not recorded.** After a coin migrates to PumpSwap, the SDK distributes with pump-amm `transfer_creator_fees_to_pump` followed by `distribute_creator_fees`. The ledger rejected that envelope. Observed on a local validator: 14,814,815 lamports reached the treasuries and nothing was recorded | High (financial accounting; mainnet blocker; staging unaffected) | **Fixed** (`5b08596`) and verified on a fresh graduation |
| 9 | **Rent previews were constants.** Devnet rent is 1,488,440 per token account; mainnet is 2,039,280. A USDC launch creates four token accounts, not two, so at mainnet rates the old USDC preview understated rent by 3,426,480 lamports | Medium (disclosure accuracy) | **Fixed**: prepared launches show rent measured from their own simulation, equal to the rent paid to the lamport (SOL 15,834,000; USDC 24,005,040). The pre-prepare figure is an upper bound |
| 4 | Expired sign-in rows were never deleted | Medium | **Fixed, disabled**: bounded, lock-skipping, idempotent pruner behind `AUTH_PRUNE_ENABLED=false`. No migration. Enabling it on staging deletes rows and needs approval |
| 5 | Communities registered at `confirmed` | Low; mainnet gate | **Fixed for production**: `LAUNCH_REGISTRATION_COMMITMENT` is `finalized` by default and mandatory in production; confirmed-only launches stay `submitted` with nothing registered. Existing records are unchanged |

### Finality policy

| Evidence | Launch | Ledger |
|---|---|---|
| `processed`, or not found | Pending, retried by later confirms | Nothing recorded |
| `confirmed` | Registered on non-production networks. Production stays `submitted` with signature and slot bound | Entry appended as `pending` |
| `finalized` | Registered | Entry appended, or superseded, as `finalized` |
| Not in a finalized block past its slot (orphaned) | Never registered under the production policy | `reversed` entry appended |
| Contradictory RPC status, or a different genesis | Rejected; confirmation stays pending | Nothing recorded |
| Blockhash expired, never landed | `expired`; a fresh preparation is required, and nothing is charged | Nothing recorded |

### Acceptance checklist

| # | Item | Classification | Evidence / blocker |
|---|---|---|---|
| 1 | Phantom desktop Create Coin | **VERIFIED — PHYSICAL WALLET/DEVICE** (desktop) + **PUBLIC DEVNET**, for the flow as of this morning | User-signed launch `4Pyp7A…`, finalized ([evidence](evidence/pump-phantom-devnet-2026-10-19.json)). A re-check on the latest UI **needs the user** |
| 2 | Phantom mobile | **BLOCKED** | Needs the user's physical device |
| 3 | Real Pinata uploads and metadata | **VERIFIED — REAL EXTERNAL SERVICE** | Real CIDs, retrieved through the gateway ([evidence](evidence/create-coin-devnet-2026-10-19.json)). Not configured on staging (demo) |
| 4 | SOL launch | **VERIFIED — PUBLIC DEVNET** and **LOCAL VALIDATOR** | Finalized devnet launches; local run with exact rent |
| 5 | USDC launch | **VERIFIED — LOCAL VALIDATOR** (full app). **PUBLIC DEVNET** for the protocol launch and for unsigned simulation of the app's builder with the current lookup table: 1,225 of 1,232 bytes at maximum metadata, so no table extension is needed | A real-app USDC launch on public devnet needs a devnet server with `USDC_LAUNCH_ENABLED=true` and a signature (**user approval**). Staging stays `planned` |
| 6 | Atomic 0.05 SOL charge | **VERIFIED — PUBLIC DEVNET** | Exactly 50,000,000 lamports, one ledger entry; failed simulations never broadcast |
| 7 | Confirmation and recovery | **VERIFIED — PUBLIC DEVNET** (restart, concurrent confirm, duplicate submit) and **DETERMINISTIC TESTS** (finality gate, dropped transaction) | — |
| 8 | Creator-fee accrual | **VERIFIED — LOCAL VALIDATOR** | 2,550,161 lamports, decoded from Pump's trade event. Public devnet **needs one approved test buy** |
| 9 | Creator-fee collection | **VERIFIED — LOCAL VALIDATOR** (before graduation, after curve completion, and after migration) | Public devnet needs approval. USDC fees: **not verified** (needs Circle-faucet devnet USDC) |
| 10 | 60/40 accounting | **VERIFIED — LOCAL VALIDATOR** + **DETERMINISTIC TESTS** | Earned 2,550,161 = 1,530,096 + 1,020,064 + **1 lamport left in Pump's creator vault** (per-share floor). It carries into the next distribution and is not income until it moves. Ledger written once after three indexer passes |
| 11 | Graduation | **VERIFIED — LOCAL VALIDATOR** | Buy-out → 100% progress → migration → pool trade → consolidation + distribution 8,888,889 / 5,925,926. Sweep-containing and USDC post-graduation distributions: **NOT IMPLEMENTED** (rejected, never inferred) |
| 12 | Explore market data | **VERIFIED — PUBLIC DEVNET** (read-only) for progress, quote pair and trades on four real coins; **DETERMINISTIC TESTS** for unavailable, stale and lower-bound states | Holder counts are **BLOCKED** on public RPC (rate-limited; needs an indexed RPC). Price, volume, market cap and liquidity come only from verified providers, and stay unavailable for devnet coins, never invented |
| 13 | Launch provenance | **VERIFIED — PUBLIC DEVNET** | Server-derived PLATFORM/HUMAN; clients cannot set it |
| 14 | Treasury security and reconciliation | **VERIFIED — LOCAL VALIDATOR** (reconciliation). Custody: **NOT IMPLEMENTED** | Production blocker; see the [security review package](security-review-package.md) |
| 15 | Database cleanup | **VERIFIED — DETERMINISTIC TESTS** (isolated Postgres) | Disabled on staging pending approval |
| 16 | Wallet security | **VERIFIED — DETERMINISTIC TESTS** + **PHYSICAL WALLET** (desktop sign-in) | — |
| 17 | Transaction finality | **VERIFIED — DETERMINISTIC TESTS** | Policy above |
| 18 | Railway staging | Checked after each deploy (demo mode, financial features off) | See the release report |
| 19 | Production risks | See the [security review package](security-review-package.md) §6 | No independent review has been performed |

### Tests (this pass)

Server: 208 passed, 0 skipped (including the Postgres suites on a disposable `*_test` database). Shared: 26 passed. Web unit: 214 of 215; `lakeChannel` exceeded its 5 s timeout under full-suite load and passes alone in 2.3 s (Codex's world code, unchanged here). Typecheck, lint, server build and web build all pass. Contracts are unchanged (0.4.1).

Two repository issues outside Phase 2: `apps/web/package-lock.json` has been out of sync with `package.json` since `bdea6af`, so `npm ci` fails locally (Railway builds with pnpm and is unaffected). The `lakeChannel` timeout is load-sensitive.
