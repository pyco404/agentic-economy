# Official treasury configuration and read-only monitoring

Implemented 2026-10-20. Mainnet execution, real launch charges, fee claims, treasury signing and payouts remain disabled. No database schema change or migration is required.

## Public identities and environment separation

| Role | Owner-supplied future Mainnet address | Entitlement |
| --- | --- | --- |
| Platform Treasury | `HmmnNqZbfUZ2YK4mWVLXEGTsAU2NUUAvFzLFxgdgKUT2` | 40% eligible human-launch creator fees; 100% separate 0.05 SOL launch charge |
| Agent Rewards Treasury | `GEDMCV4WXHCAnySqH4CWNh3NYBrDfAUb3t4BBVBWVnJi` | 60% eligible human-launch creator fees |
| Reserved AECO deployer | `3pF1MM1PCg2tekM5KeWEDyT8LVKbVd7ia668NRAnYpAR` | No treasury/creator-fee entitlement |

These are syntactically valid distinct Solana public keys. Their business identities are supplied by the owner; a balance lookup cannot establish who controls a wallet. Obtain independent recipient-control/identity confirmation before any future irreversible Mainnet activation, without importing keys. This assignment neither deploys AECO nor enables Mainnet execution.

`MODE=production` chain-serving roles now reject treasury destinations other than the exact official pair; the private simulation role still needs no chain configuration. Demo/Devnet cannot use either official Mainnet destination as an execution recipient. All modes reject the AECO deployer as a treasury recipient. Existing Devnet destination configuration is unchanged; historical launches retain their original server-persisted recipients for recovery/accounting. No production Railway variables were modified.

## Human launch path

The existing pinned official Pump SDK 4.1.0 builder is reused, rather than replaced:

1. One System transfer of exactly 50,000,000 lamports to the configured Platform Treasury.
2. Pump token creation and native `create_fee_sharing_config`.
3. `update_fee_shares_v2`: Agent Rewards 6,000 bps + Platform 4,000 bps = 10,000; launcher 0%.
4. Optional SOL Developer Buy, after the final share update, in the same atomic transaction. Default 0%, maximum 350 bps of actual token supply.

Recipients come from server configuration. User draft schemas reject recipient overrides. The signed payload must match the exact server-persisted message. Confirmation checks the canonical sharing PDA, mint, active status, revoked admin, exact two recipients/shares, bonding-curve creator, single launch-charge transfer and optional actual Developer Buy. Existing finality/recovery/idempotency checks are preserved; tokens created elsewhere do not acquire platform provenance through wallet monitoring.

Official protocol documentation: https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/CREATOR_FEE_SHARING.md . The share update sweeps prior accrual to the current shareholders before locking the final list; our atomic creation configures the list before any Developer Buy/trading. The update is one-time and revokes the admin. Both ungraduated and graduated creator-fee collection require their appropriate protocol evidence; protocol/LP fees are not platform income.

Future Super-Agent launches are not implemented here. Do not reuse human 60/40 transaction construction for an active renter's 50/40/10 entitlement. Because the sharing recipients lock, renter changes need a separately designed and audited mechanism; repeatedly updating the locked recipient is not supported.

## Monitoring and accounting

Backend-only optional `TREASURY_READ_RPC_URL` points to a read-only Mainnet RPC. It is independent of execution `SOLANA_RPC_URL`, `MODE`, and Devnet recipients. The service permits only genesis, finalized balance and finalized recent-signature reads. It checks the Mainnet genesis hash before wallet reads; wrong networks/errors give unavailable, not fabricated zero. Requests have five-second deadlines, one-minute caching and shared concurrent refresh. Provider URLs/errors are not returned or logged. Unsafe JSON integer balances are rejected rather than rounded.

The additive optional `officialWallets` field in the treasury summary contains the public addresses, network, finalized SOL balance/slot, timestamps, recent transaction links and separately recorded fee revenue. New frontend/old backend remains compatible through an unavailable fallback; old clients can ignore the new field. Contract remains 0.5.0 with regenerated OpenAPI.

Actual wallet balances include all deposits/withdrawals and are never treated as creator fees. Official revenue totals include only finalized, matching-address/matching-network SOL ledger entries with real RPC evidence; mock, Devnet, pending, reversed, legacy-unverified and duplicate evidence is excluded. Launch-charge evidence is recorded separately. Existing creator distribution verification, denomination handling, idempotency and reorg correction remain in place.

Recorded receipts cover this deployment's ledger only. Lifetime coverage, unclaimed distributions and other-transfer totals remain explicitly unavailable until supported by sufficient verified history; zero receipts in this ledger is not a claim of zero lifetime income. Recent unrelated/unknown transactions remain unclassified. Public monitoring never inserts receipts, creates platform launches or enables any claims/payouts.

Pump rounds each recipient separately. Actual receipts record those exact amounts and authenticated retained vault dust. The existing split helper's residue-to-platform estimate is only a planning/reconciliation estimate and does not fabricate a payout.

## Verification

- Real read-only Mainnet RPC: correct genesis; both official balances 0 lamports at slots 459333196 / 459333219; no recent signatures returned. See `evidence/official-treasury-readonly-2026-10-20.json`. These observations do not prove ownership or complete historical coverage.
- Real read-only Devnet RPC: both previously authorized 3%/3.5% controlled launch sharing configs remain Active, admin revoked, exact 6,000/4,000 bps to the existing Devnet treasuries. See `evidence/official-treasury-devnet-routing-2026-10-20.json`. No new launch, signature, fee claim, transfer or payout was submitted; no wallet JSON/private key was accessed.
- Backend: 217 passed, 23 skipped (database-dependent and disabled legacy-USDC paths); frontend: 233 passed; shared contracts: 31 passed. Builds, typecheck, lint and contract consistency passed.
- Real browser fallback checks: desktop 1440, tablet 768, mobile 390; official keys/Explorer links visible, unavailable values honest, no horizontal overflow. Available balance rendering is covered with explicit synthetic observations in unit tests. Browser fixture checks are not live treasury RPC proof.
- Staging migrations 001–004 already match repository checksums; no new migration. Production has no GitHub deployment triggers. The staging backend read-only RPC variable was set to the public Mainnet endpoint with `skipDeploys:true`; demo financial gates and execution treasury variables remain unchanged.

Railway was still pausing new builds during verification. A tested push does not prove this release is deployed: re-trigger compatible frontend/backend from the final main SHA after builds resume, verify both deployed SHAs and actual `/api/v1/treasury` `officialWallets`, then open staging Treasury on desktop/mobile. Running staging remains on the previous known-good release until that succeeds. No live-staging monitoring completion is claimed yet.
