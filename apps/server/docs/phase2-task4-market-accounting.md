# Phase 2 Task 4 — market reads and creator-fee accounting

Implementation date: 18 October 2026. Contract: 0.3.1, additive to 0.3.0. This is a read-only market/accounting release. Mainnet launches, treasury signing, disbursements, and Super-Agent launches remain disabled. No migration is introduced or applied.

## Explore implementation

The existing six sections remain: New launches, Hot volume, Top market cap, Graduating soon, Most active agents, Most holders. Existing search, filters, ordering, pagination, token details, and community/agent links remain. Hot volume uses the selected checked pool's reported 24-hour USD volume, not a composite popularity score. Market cap is the provider's marketCap field; FDV is never substituted. Missing data is null, never synthetic zero.

New public read endpoints:

- GET `/api/v1/token-markets/:mint`
- GET `/api/v1/token-markets/:mint/history`

A registration must match a confirmed platform launch, mint, community, and signature. Mainnet reads reverify the launch's actual transaction/metadata/fee routing and RPC genesis before querying providers. Demo, devnet and localnet launches are never looked up as mainnet tokens. Unknown or mismatched registrations return 404. Provider failures return explicit unavailable or briefly stale data, never demo prices.

Pair selection accepts Pump/PumpSwap SOL or mainnet USDC quote mints only. The candidate's actual on-chain account must be either the canonical Pump bonding curve with a matching decoded quote, or a PumpSwap-owned Pool with the correct discriminator and exact base/quote mints. Symbol strings and advertised URLs are not proof. Unsupported, reversed, mismatched or AECO pairs are rejected. Among checked candidates, the most liquid provider-reported pair is selected, with stable address ties; metrics describe that pool rather than summed cross-pool volume. USDC read support does not enable USDC launches.

Available fields where the selected provider/pool reports them: USD price, 24h USD volume, market cap, USD liquidity, 24h price change and 24h buy/sell counts. On-chain curve completion and checked PumpSwap pools supply distinct bonding_curve / curve_complete / graduated status. Hourly USD OHLCV (up to 48 candles) is requested for the exact checked mint/pool from GeckoTerminal. The chart also offers an accessible values table. No fabricated trade-by-trade feed is provided.

Holder counts and exact percentage graduation progress remain unavailable. A largest-token-accounts RPC result would not be a unique-holder count, and current global curve settings cannot safely reconstruct a historical coin's starting reserves. Those discovery sections remain explicit unavailable states until an adequately verified source is integrated. Historical coverage, new-pool indexing delays and provider gaps remain possible.

Retrieval time is displayed and distinct from source/trade time: DEX Screener does not supply an observation timestamp for every metric. No freshness SLA is asserted. Cache TTL is 30 seconds; failed refreshes may return a stale snapshot only within 90 seconds of its original retrieval, excluded from rankings. Browser refresh is 60 seconds. Histories cache for 60 seconds. Requests coalesce, timeout after five seconds, use fixed provider hosts, and have bounded caches and process-local provider budgets (240 DEX / 25 Gecko requests per minute; four active fetches). Multiple API replicas need a shared budget or a paid plan before scaling these limits. No paid provider or API credential is configured.

## Provider evaluation and live read evidence

Primary sources checked:

- [DEX Screener API reference](https://docs.dexscreener.com/api/reference): public pair/token endpoints, price, volume, liquidity, price change, market cap and transaction-count coverage; token/pair endpoints document 300 requests/minute. No holder census or OHLCV endpoint is assumed.
- [GeckoTerminal public API](https://apiguide.geckoterminal.com/): free beta public OHLCV, attribution provided; [published rate limit](https://apiguide.geckoterminal.com/changelogs) is 30 calls/minute. Coverage/availability is not guaranteed.
- [Birdeye pricing](https://docs.birdeye.so/docs/pricing): key/plan-based alternative; free Standard is limited, while larger plans and endpoint access incur costs. No subscription or credential was requested or enabled; holder/trade integrations require a separate coverage and cost decision.

[Read-only provider evidence](evidence/market-provider-read-2026-10-18.json) records real Node-fetch HTTP 200 responses for public DEX pair data and 48 hourly Gecko candles, plus finalized Solana RPC pool reads. The initial Python urllib probe returned 403, while the backend's Node transport worked. One advertised SOL/USDC pair was actually USDC/SOL on-chain: this mismatch was recorded and would be rejected by the adapter. An additional public PumpSwap sample matched its actual base/quote mints. **These external tokens are not claimed as Agentic Economy launches or treasury receipts.** They verify provider connectivity and account coverage only. UI success/failure fixtures are separately labeled mocked tests.

## Creator-fee eligibility and denomination

Official protocol sources are pinned to [pump-public-docs 639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22](https://github.com/pump-fun/pump-public-docs/tree/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22):

- [Creator fee sharing](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/CREATOR_FEE_SHARING.md)
- [Sweeps](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/SWEEP_FEES.md)
- [Single-recipient collection](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/COLLECT_CREATOR_FEE.md)
- [Pump IDL](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/idl/pump.json)

Trades may retain creator fees on the curve/pool; they must first be swept into the creator vault. For fee-sharing coins, PumpSwap creator fees can be moved to the Pump creator vault, then distributed through Pump V2. This collection is permissionless but pays only the configured recipients; the transaction payer does not acquire fee ownership. Single-recipient collection instructions do not apply once the creator is a sharing configuration. Graduation changes the accrual location and may add AMM sweep/transfer steps; it does not make protocol fees or LP fees platform revenue. Cashback/holder-reward redirection is not eligible under our human-launch policy. Trading fees merely accrued, unclaimed vault balances and balance donations are not realized platform receipts.

Real ingestion now requires:

1. Successful normalized RPC evidence with the expected accounting-network genesis and one recognized top-level `distribute_creator_fees_v2`, with only optional ComputeBudget siblings.
2. Canonical mint, curve, sharing-config, creator-vault, event-authority, quote-program and ATA accounts.
3. A Pump CPI distribution event under that instruction, authenticated by the event-authority account and exact event discriminator. Arbitrary log strings are never accepted.
4. Matching event mint/curve/config and exactly the human policy's 6000/4000 recipients, using the original launch's treasury addresses.
5. A persisted matching non-demo confirmed platform launch.
6. Actual creator-vault debit and recipient credits matching the distribution. SOL checks account balance changes within the restricted instruction envelope, adjusting only a recipient-payer's actual network fee. USDC checks canonical SPL token account mints, owners, six decimals and balance changes. Native rent and SOL paid to create USDC ATAs are never counted as USDC revenue.

The adapter deliberately rejects unknown denominations/ABIs, arbitrary sibling transfers, nested/batched distributions and complex combined sweep-plus-distribute transactions until instruction-level evidence for those envelopes is independently implemented. Such events are logged as rejected with signature/reason and not credited. Separate sweep/transfer transactions followed by a supported distribution are acceptable. This conservative coverage limit must be considered before any collection workflow is enabled. No collection/signing workflow was enabled here.

## Ledger, rounding, finality and audit

The 0.05 SOL launch charge remains a separate platform-only stream. The store also enforces its exact denomination and amount. Creator receipts carry asset mint, symbol, decimals, source signature, instruction, slot, platform launch/token, source verification version/network, event distributed amount and retained dust. Treasury totals never sum different assets. Demo receipts explicitly say simulated and cannot enter non-demo verified creator totals. Legacy non-demo creator receipts without source evidence are excluded from verified totals and flagged for audit; records are not deleted or rewritten.

Actual distribution amounts use each shareholder's integer floor; any residual is retained in the creator vault, **not fabricated as a platform credit**. Reconciliation examples, all synthetic base units:

| Event amount | Asset | Agent 60% floor | Platform 40% floor | Vault dust | Platform launch charge |
| --- | --- | --- | --- | --- | --- |
| 1000 | SOL lamports | 600 | 400 | 0 | separate 50,000,000 lamports if a verified launch occurred |
| 1001 | USDC micro-units | 600 | 400 | 1 | never denominated or deducted in USDC |

Store uniqueness remains `(signature, instruction, account, stream, finality)`. PostgreSQL additionally takes a per-receipt transaction advisory lock and reads its history before insertion. Concurrent pending/finalized observations atomically attach the new status to the prior source entry, rather than creating two effective credits. The same source cannot change amount, asset, destination, launch or evidence. Memory storage applies the same transition rules synchronously. No new database columns or migrations are needed: the existing JSON receipt document stores additive evidence fields.

Pending receipts finalize only with rooted transaction evidence. A null/pruned RPC response leaves them pending. A reversal requires a finalized canonical block at the original slot that is available and excludes the signature. If that proof is unavailable, uncertainty is retained. Reorg/finality updates append superseding receipts and preserve the audit trail.

The indexer now pages through backlogs instead of skipping events beyond the newest 100 signatures. It advances a page only after processing it, keeps cursors on RPC failures, renews its lease while scanning and yields after bounded work. Cursors are in memory; restarts reread history and persisted receipt uniqueness prevents double accounting. An archival RPC may be necessary for pruned history; unavailable evidence blocks that page rather than silently skipping it. PostgreSQL stores both treasury accounts in one transaction. Database concurrency tests against a restored staging copy remain gated below.

The existing Treasury surface retains its layout and columns, with expandable source/evidence details, retained dust, supersession references and reconciliation notes. Points/City Credits remain simulation data, never cryptocurrency payouts.

Future Super-Agent policy remains documented only: active renter 50/40/10, no renter 60/40. No Super-Agent execution, renter payout or treasury signing was enabled.

## Validation and release status

Final validation: **340 passed** (web 162, server 145, shared 26, world spec 7); **18 database-dependent tests skipped**. **10 distinct browser checks passed** across Explore discovery, mocked market/history success, demo isolation and Treasury scrolling/precision at desktop, tablet and mobile sizes. Typecheck, root/web lint, backend/packages build, web build, server bundle and generated OpenAPI checks passed. Initial concurrent runs hit unchanged world-test deadlines under resource pressure; the complete final frontend rerun passed all 162 tests without changing those tests or world code. Native bigint uses the existing JavaScript fallback; the web build retains existing chunk-size/dependency-annotation warnings. Tests distinguish mocked provider/RPC/transaction fixtures from live read-only public provider calls. No actual creator-fee collection, payout, new token launch, real wallet signature, or staging release is claimed by this task.

Railway read-only recheck again found zero staging PostgreSQL volume backups and zero production deployment triggers. Staging sources still point to the existing codex/frontend web and staging API branches. Migration 003 and its verified backup/restore/identity rehearsal gate remain unresolved; migration 004 was already present, and neither it nor any other migration was run. Changing the backend release/source would auto-run pending migrations, so this release must not deploy until that gate passes.

Read-only checks reconfirmed that the running staging website and API return HTTP 200, PostgreSQL readiness and simulation leadership pass, and API contract 0.2.0 remains in demo mode with financial features disabled. Rechecked staging releases remain web deployment `782235db-f44c-4208-912d-fb00c2290dad`, source `74085709342074c8366f8021bfcbec4ded2cb627`, and API deployment `5925f299-12f7-41ed-96c3-0f4bcd4e054a` with no native Git SHA for its manually uploaded artifact. These are prior releases, not Task 4 deployed SHAs. No production settings, Railway sources, credentials or financial gates were changed.

The one-file commit sequence preserves published history. Intermediate schema/service dependencies are not claimed to build independently; validation applies to the complete series.

All 101 preserved files in the original unfinished workspace matched their recorded hashes. No city, camera, agent, road, water or railway source was changed. The active implementation is in the main worktree; no old unfinished workspace files were staged.
