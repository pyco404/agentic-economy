# Token Launchpad: security review package

Prepared 19 October 2026 for an independent reviewer. **No independent review has been performed yet.** Everything below comes from the development team's own review and tests. Read it alongside [the Phase 2 completion record](phase2-completion-2026-10-19.md) and [the blockchain audit](phase2-final-blockchain-audit.md).

Current posture: staging runs `MODE=demo`. Mainnet launches, real charges, payouts, claims and treasury signing are disabled. Mainnet writes are hard-rejected in code.

## 1. What moves money

| Flow | Mechanism | Who signs | Where it is enforced |
|---|---|---|---|
| Platform launch charge, 0.05 SOL | `SystemProgram.transfer` to the configured platform treasury, in the same atomic transaction as the Pump `create_v2` instruction | Launcher wallet (Phantom), plus a fresh mint keypair | Built server-side (`chain/pump-builder.ts`). The signed message must equal the server-persisted prepared message byte for byte (`validateSignedPumpLaunch`). On confirm, the landed transaction is re-verified from RPC: charge amount, recipient, instruction set and signers (`chain/verify.ts`) |
| Creator fees (human launches) | The Pump Fees sharing config is created and locked at launch: 60% Agent Rewards treasury, 40% Platform treasury, 0% launcher, admin revoked | Nobody. Distribution is permissionless | Locked routing is verified on confirm (`getFeeRoutingState`). The ledger records only verified distributions (`chain/creator-fees.ts`) |
| Payouts and claims | Not implemented | — | Disabled |

The server holds **no long-lived private keys**. The only key it creates is the mint keypair. It partially signs the prepared launch and is never persisted.

## 2. Trust boundaries

1. **Browser and wallet.** Untrusted input. The client never supplies treasury addresses, the quote mint, fee splits or provenance; the server derives all of them. Wallet sign-in uses a single-use, origin-bound challenge. Sessions are hashed, and the cookie is HttpOnly, SameSite=Strict and Secure. An Origin allowlist protects mutations.
2. **API server.** Builds transactions, verifies evidence and writes the ledger. Configuration (treasuries, lookup table, RPC URL, Pinata JWT) comes only from server environment variables.
3. **PostgreSQL.** Drafts, launches, communities, and the append-only `treasury_entries`, `communities` and `task_receipts` tables, enforced by triggers. Treasury entries are pending, then finalized or reversed, always by appended superseding entries.
4. **Solana RPC.** A single configured provider. Its answers are trusted for reads, with these guards:
   - genesis-hash binding to the expected network;
   - contradictory transaction and status errors are rejected;
   - `processed` commitment is never accepted;
   - orphan detection compares against finalized blocks.

   There is **no multi-provider consensus**.
5. **Pinata.** Server-only JWT. Returned CIDs are trusted and not recomputed locally (residual risk).
6. **Pump.fun programs.** External, upgradeable programs (see §3).
7. **Railway.** Secrets live in service variables. Staging and production are separate environments, and production currently has no service and no deploy trigger.

## 3. On-chain dependencies (observed on public devnet, 19 October 2026)

| Program | Deployment slot | Binary SHA-256 (matches 18 October audit) |
|---|---|---|
| Pump `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | 510,657,843 | `bcee35d3…` ✔ |
| Pump Fees `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` | 508,659,783 | `446db246…` ✔ |
| PumpSwap `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` | 508,659,436 | `494d2257…` ✔ |
| Mayhem `MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e` | 483,199,576 | `25ac2612…` ✔ |

All four devnet programs share the upgrade authority `GUYCUEpxSkm1ccDo3LSKMR4Xpe5bgMnEZaFygWUSEVH3`. **Pump can change program behavior at any time.** Instruction layouts are pinned to SDK `@pump-fun/pump-sdk` 4.1.0 and public docs commit `639b87fb…`.

Mainnet binaries, IDLs and upgrade authorities have **not** been attested. Evidence: [devnet audit](evidence/pump-devnet-readonly-audit-2026-10-19.json), produced by `scripts/devnet-readonly-audit.ts`.

## 4. Protocol assumptions the code depends on

- `create_v2`, `create_fee_sharing_config` and `update_fee_shares_v2` behave as in SDK 4.1.0. Locked shares cannot be changed after `adminRevoked`.
- A SOL bonding curve reports its quote as the all-zero address (observed on devnet). It is normalized to wrapped SOL.
- Allowed USDC quote mints come from Pump's Global allowlist, checked live before every USDC build. Devnet uses `4zMMC9…`; mainnet configuration uses `EPjFWdd5…`.
- A USDC launch creates up to four SPL token accounts paid by the launcher: the curve vault, two fee-sharing vaults and the creator's USDC account.
- Creator-fee distributions:
  - before graduation, `distribute_creator_fees` (SOL) or `_v2`;
  - after graduation (SOL), pump-amm `transfer_creator_fees_to_pump` first, then `distribute_creator_fees`, in one transaction (observed locally).

  Each shareholder's share is floored. The remainder (1 lamport in the observed case) stays in Pump's creator vault and carries into the next distribution.
- Pump refuses to distribute below a minimum vault balance. The SDK reports this through `getMinimumDistributableFee`.
- `DistributeCreatorFeesEvent` is emitted by self-CPI and authenticated through Pump's event-authority PDA.

## 5. Attack surfaces and current controls

| Surface | Control | Residual |
|---|---|---|
| Transaction substitution after signing | Exact message comparison with the persisted preparation, and a signer check | — |
| Client-chosen treasury, quote mint or split | Ignored. Server config only; the USDC mint is checked against the live allowlist | — |
| Forged fee or trade events from other programs | The verifier accepts only events from Pump's event authority at the expected stack height; the trade parser tracks the invoke stack | — |
| Replays and duplicate submissions | Idempotency keys; one signature per launch; unique ledger keys (signature + instruction index) | — |
| Ledger inflation from crafted transactions | Strict account derivation, exact lamport/token reconciliation, 60/40 shares and treasury identity required; unknown envelopes are rejected and never inferred from balances | Distributions containing sweep instructions (`sweep_creator_fee`, pool sweeps) are not accepted yet. They are rejected and not recorded, never guessed, so that income would be missing from the ledger until supported |
| Sign-in challenge flooding | Per-IP rate limit; bounded pruning of expired rows (`AUTH_PRUNE_ENABLED`, off until approved) | Pruning is disabled on staging pending approval |
| Fork or rollback after `confirmed` | Ledger entries stay pending until finalized; orphans are appended as reversed; production registers communities only at `finalized` | Communities registered at `confirmed` on non-production networks are not reversible |
| Malicious RPC | Genesis binding; contradiction checks | Single provider; no consensus |
| Lookup-table tampering | Configured address; owner check; active check; tables are append-only, so existing indexes cannot change | The devnet table authority is a test wallet. A mainnet table must have its authority frozen |
| Pinata content substitution | Server-only credential; CIDs checked for format | CIDs not recomputed locally |
| Rent and fee misstatement | Rent measured from each prepared transaction's own simulation; equals the paid rent to the lamport on a local validator | Shown before preparation as an upper bound |

## 6. Production blockers

1. Mainnet program and IDL attestation, and a monitoring policy for Pump upgrades.
2. Audited custody for both treasuries: hardware or multisig, and an address-change procedure.
3. A mainnet lookup table with a frozen authority, audited once.
4. A multi-provider RPC policy, or a documented acceptance of single-provider risk.
5. Support or explicit handling for sweep-containing distributions and USDC post-graduation consolidation (`transfer_creator_fees_to_pump_v2`).
6. Public-devnet evidence for creator-fee collection (needs one approved test buy) and for USDC creator fees.
7. Phantom mobile acceptance on a physical device.
8. An independent security review of this package.
9. Separate written authorization before enabling any real charge, routing, payout or treasury signing.
