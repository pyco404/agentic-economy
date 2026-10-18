# Pump.fun Integration: Findings, Route, Trust Boundaries, Test Plan

**Status (2026-10-18):** the SOL atomic builder, authenticated draft execution API, wallet-signing UI and strict confirmation/provenance checks are implemented behind default-off safe-network gates. The actual route passed on an isolated validator with cloned devnet programs; mainnet remains hard-disabled. Staging rollout, real Phantom and real Pinata acceptance remain blocked. See [Task 3 execution report](phase2-task3-execution.md) and [recorded local-chain evidence](evidence/pump-local-2026-10-18.json). The earlier research below remains relevant; its broader fee-distribution test plan is not claimed complete.

## 1. Sources checked

Public official material only. Re-check before mainnet, because Pump.fun changes its programs frequently. For example, on 2026-10-14 the docs README listed "Depth 2 Pump Coin Quotes (Oct 13)", "Fees Kept on the Curve" and "Holder Rewards Coins / End of Cashback".

- `github.com/pump-fun/pump-public-docs`
  - `README.md`
  - `docs/instructions/COIN_CREATION.md`
  - `docs/instructions/CREATOR_FEE_SHARING.md`
  - `docs/instructions/SWEEP_FEES.md`
  - `docs/HOLDER_REWARDS_README.md`
  - `docs/FEE_PROGRAM_README.md`
  - `idl/pump_fees.json`
- `github.com/pump-fun/pump-fun-skills`: `coin-fees/SKILL.md`
- npm `@pump-fun/pump-sdk` (4.1.0, published 2026-10-13) and `@pump-fun/pump-swap-sdk` (2.1.0): versions only. The npm page itself returned 403, so SDK method names come from the skills document and must be checked against the installed package.

Program IDs (in `packages/shared/src/constants.ts`):

| Program | ID |
|---|---|
| Pump (bonding curve) | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| Pump AMM (PumpSwap) | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` |
| Pump Fees | `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` |

## 2. What the official mechanics support

| Question (spec §2.4–2.5) | Finding | Confidence |
|---|---|---|
| Can creator fees be split between several recipients? | **Yes, natively.** A Pump Fees `SharingConfig` (PDA `["sharing-config", mint]`) holds up to 10 shareholders whose `share_bps` sum to 10,000. | Documented |
| Can the split be fixed at launch so the launcher gets 0%? | **Yes, if done right.** `create_fee_sharing_config` (signed by the coin creator) moves `bonding_curve.creator` to the config PDA with shares initially `[(creator, 10000)]`. `update_fee_shares_v2` (signed by `sharing_config.admin`) replaces them, e.g. `[(agent_treasury, 6000), (platform_treasury, 4000)]`, and **sets `admin_revoked = true`**, making the split one-time and final (IDL error 6009 `SharingConfigAdminRevoked`, 6024 `FeeSharesAlreadyUpdated`). | Documented. Who `admin` is after create is **not** documented: expected to be the creator; verify on devnet. |
| Does it survive graduation to PumpSwap? | **Yes, by design.** When the coin migrates, `pool.coin_creator` is the sharing-config PDA. AMM creator fees accrue in the AMM creator vault (`["creator_vault", sharing_config]`). The permissionless `transfer_creator_fees_to_pump_v2` moves them to the Pump creator vault, and the permissionless `distribute_creator_fees_v2` pays shareholders pro-rata. | Documented; **must be verified end-to-end** |
| Are fees paid per trade? | **Not necessarily.** The new `buy_v3`/`sell_v3` (curve) and `buy_v2`/`sell_v2` (PumpSwap) instructions keep creator fees in `BondingCurve.creator_fee` / `Pool.creator_fees` until a permissionless `sweep_creator_fee`. Distribution fails with `CreatorFeesNotSwept` until swept, but the SDK helper prepends the sweep. | Documented |
| Is the creator fee a fixed percentage? | **No.** Fee tiers depend on market cap (Pump Fees `FeeConfig`). We therefore never estimate fees from volume: we only account for lamports actually received by our treasuries. | Documented |
| Can protocol/LP fees be redirected? | **No.** Only the creator-fee bucket is configurable. Protocol fees go to Pump.fun recipients, and LP fees stay in pool reserves. Agentic Economy never claims otherwise. | Documented |

## 3. Risks and trust boundaries we cannot remove

1. **Pump.fun admin powers.** The Pump Fees IDL contains `admin_cto_sharing_config(new_admin)`, signed by Pump.fun's pool authority, and the docs describe community takeovers (CTO). A CTO can reassign the creator or the sharing-config admin, or convert a coin into a **holder-rewards coin**, irreversibly sending creator fees to holders instead of our treasuries. Our 60/40 depends on Pump.fun not exercising these powers for our coins. `TreasuryIndexer.checkRoutingDrift` re-reads every registered coin's `SharingConfig` and `bonding_curve.creator` (about every 5 minutes outside demo). On any mismatch it logs and broadcasts `system.notice` with `code: fee_routing_drift`.
2. **Program upgrades.** All three programs are upgradeable by Pump.fun. Account layouts (we decode `SharingConfig` and the `BondingCurve.creator` offset) can change. The decoders verify Anchor discriminators and fail closed. Re-verify after every Pump.fun release note.
3. **Holder-rewards / cashback flags.** We must never set `is_holder_reward = [true]`. `is_cashback_enabled` is deprecated and rejected. The verifier requires the bonding-curve creator to be the sharing-config PDA, which fails for holder-rewards coins.
4. **Treasury custody.** `PLATFORM_TREASURY` and `AGENT_REWARDS_TREASURY` must be **Squads multisig vault addresses** (or equivalent), never a server hot key. For SOL-quoted coins `distribute_creator_fees_v2` pays shareholders in lamports, so a system-owned vault PDA works as a recipient. Verify on devnet that the program accepts a PDA shareholder.
5. **Quote assets.** USDC-quoted and pump-coin-quoted pairs pay creator fees in that token to the shareholders' ATAs (`initialize_ata`). MVP launches only SOL-quoted coins. The ledger already records `assetMint` per entry and never sums across assets.

## 4. Implemented SOL launch route (default-off safe-network gates)

One **atomic** v0 transaction prepared by the backend, partially signed by a fresh mint keypair, then signed and sent by the launcher's wallet:

| # | Instruction | Purpose |
|---|---|---|
| 0 | ComputeBudget (600,000 unit limit, no priority-price instruction) | bounded compute |
| 1 | `SystemProgram.transfer(launcher → PLATFORM_TREASURY, 50_000_000)` | fixed 0.05 SOL platform charge (100% platform) |
| 2 | Pump `create_v2(name, symbol, uri, creator = launcher, is_mayhem_mode = false)`, holder-reward and cashback omitted | official token creation (Token-2022, 6 decimals) |
| — | No initial purchase | trading/buy instructions are outside the implemented launch route |
| 4 | Pump Fees `create_fee_sharing_config` (payer = launcher = creator) | creator → sharing-config PDA |
| 5 | Pump Fees `update_fee_shares_v2([(AGENT_REWARDS_TREASURY, 6000), (PLATFORM_TREASURY, 4000)])` | locks 60/40; launcher 0%; admin revoked |

Atomicity: if any instruction fails, nothing is charged except network fees. A "launched but charged" or "charged but not launched" state is therefore impossible for this route.

The backend never trusts the client's account of what happened. `POST /launches/confirm` re-reads the transaction and accounts from RPC and runs `verifyLaunch` (`src/chain/verify.ts`):

- **failed:** the transaction errored, or the exact 0.05 SOL transfer to the platform treasury is missing, or there is no `create_v2` for the expected mint, or the fee payer is wrong.
- **recovery_needed:** the transaction succeeded (fee paid) but the `SharingConfig` is missing, not Active, has `admin_revoked = false`, or has shareholders other than exactly agent 6000 + platform 4000; or `bonding_curve.creator` ≠ the config PDA. The fee receipt is recorded, but **no community is registered**.
- **confirmed:** the community is registered immutably, together with the platform launch-fee receipt, in one DB transaction.

The atomic route fits with address-lookup compression and passed local program execution. If a configured lookup table cannot compress a particular preparation below 1,232 bytes, preparation fails before signing. The implementation does **not** silently split the platform charge and creation into separate transactions. Any future multi-transaction settlement design needs independent verification and approval.

## 5. Devnet test plan (gate for `FEE_ROUTING_VERIFIED=true`)

Run with funded devnet wallets and two Squads devnet vaults as treasuries. Record transaction signatures in `integration-notes.md`.

1. Confirm the three program IDs are deployed and current on devnet (if not, use a mainnet-fork validator with cloned programs).
2. Implement `SolanaRpcChain.buildLaunchTransaction` with the **installed** `@pump-fun/pump-sdk` (`createV2Instruction`, `createFeeSharingConfig`, `updateFeeShares`), then run the route above. Expect: success, `confirm` → `confirmed`, decoded `SharingConfig` = Active, `admin_revoked = true`, shares 6000/4000, and `bonding_curve.creator` = PDA. Record `sharing_config.admin` (answers the open question in §2).
3. Negative: send `update_fee_shares_v2` again from the launcher. It must fail with 6009/6024.
4. Trade on the curve with legacy and v3 instructions, `sweep_creator_fee`, then `distribute_creator_fees_v2` (permissionless, from a third wallet). Check that the treasury lamport deltas are 60/40 within 2 lamports and that `TreasuryIndexer` ingests them exactly once (run it twice).
5. Push the coin through graduation (synthetic migration on devnet if needed). Trade on PumpSwap, then sweep, `transfer_creator_fees_to_pump_v2` and distribute. Expect the same 60/40 and successful ingestion.
6. Failure paths on devnet: expired blockhash → client re-prepares; wrong fee amount → `failed`; a tampered shareholder list → `recovery_needed`.
7. Re-run `verifyLaunch` decoders against real account data (BondingCurve `creator` offset 49).
8. Only then set `FEE_ROUTING_VERIFIED=true` on devnet. Mainnet remains hard-disabled in this release; the reviews in spec §8.10 and separate explicit approval are still required before any future mainnet implementation.

## 6. What exists in code today

| Piece | File | State |
|---|---|---|
| Program IDs, Anchor discriminators, PDAs, `SharingConfig`/`BondingCurve` decoders | `src/chain/pump.ts` | done; unit-tested on encoded layouts |
| Launch verification rules | `src/chain/verify.ts` | done; tested with mock chain (success, tx failed, wrong fee, missing config, launcher share, admin not revoked, wrong mint) |
| RPC reads: transactions, accounts, Token-2022 balances, signature listing | `src/chain/solana.ts` | transaction/account verification exercised on the isolated local validator; public-chain release acceptance remains pending |
| Launch transaction **builder** | `src/chain/solana.ts`, `src/chain/pump-builder.ts` | implemented using SDK 4.1.0; explicit safe-genesis/lookup/simulation gates; disabled by default |
| Creator-fee indexer and finality/reversal reconciler | `src/services/indexer.ts`, `src/services/treasury.ts` | done; mock-chain tested; runs every 30 s outside demo |
| Append-only ledger, platform-only launch fees | `src/store/*` | done; Postgres triggers + CHECK tested |

## 7. Real-money agent payouts: required controls (NOT implemented)

The MVP records **dry-run points and share estimates only**. Before any SOL leaves the agent rewards treasury, all of the following must exist and be reviewed:

1. **Funding and budget:** each epoch's payout budget is a fixed fraction of the *finalized* agent-treasury balance, with a hard per-epoch cap and a reserve kept back. The budget is published before the epoch starts.
2. **Eligibility policy:** only receipts that pass every verification check, with no anti-abuse adjustment, and from wallets that pass risk checks. One payout cap per wallet per epoch. Never based on holding, price or volume.
3. **Claims, not pushes:** a separate claim program, or multisig-approved batch transfers, with per-claim limits, expiry, and receipts referencing `rewardRecord.id` and receipt hashes.
4. **Dispute window:** reward records stay `disputed`-able for N days before becoming claimable. A `voided` status removes them.
5. **Emergency pause and recovery:** a multisig-controlled pause, plus a documented procedure for a compromised or buggy distribution.
6. **Public accounting:** every payout is an append-only `debit` entry on `agent_rewards`, reconciled against on-chain transfers.
7. **Independent review:** contract audit, plus legal review of fee-funded agent compensation and the related promotional claims.
