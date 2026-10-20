# Helius read-only integration

Implemented 2026-10-20. Owner confirmed the **Free** plan. Its backend credential was already present as `HELIUS_API_KEY` in Railway staging; neither the frontend service nor VITE variables contain it. No subscription, paid add-on, production configuration, public-demo configuration or database schema was changed.

## Architecture and endpoints

| Purpose | Implementation |
| --- | --- |
| Secret-backed reads | `src/chain/helius.ts`: fixed `https://mainnet.helius-rpc.com/` and `https://devnet.helius-rpc.com/` endpoints; API-key query generated inside the backend only |
| Explore view | `src/chain/helius-market.ts`: read-only preferred source for curve/provenance reads, DAS holder enumeration and indexed metadata, with genesis-checked existing-RPC fallback |
| Runtime wiring | `src/context.ts`: shared budget across Mainnet monitoring and the configured non-demo market network; no Helius Explore requests for demo tokens or localnet |
| Treasury | Existing `OfficialTreasuryMonitor` uses the Mainnet Helius reader, retaining the separately configured Mainnet `TREASURY_READ_RPC_URL` as an optional verified fallback |
| Contracts/UI | Additive optional holder index/metadata observations and finalized wallet balance-change observations; existing cards, six discovery sections, charts and layout retained |

The API key is held only by the backend. Provider URLs, response errors and transport causes are sanitized; read transports use a non-secret placeholder URL inside web3.js. There is no browser-to-Helius call, public generic RPC proxy, signing operation or Helius transaction-submission method. No local wallet files/private keys were read.

Official references:

- https://www.helius.dev/docs/api-reference/endpoints
- https://www.helius.dev/docs/api-reference/das/gettokenaccounts
- https://www.helius.dev/docs/billing/credits
- https://www.helius.dev/pricing

## Existing services retained

`SOLANA_RPC_URL`, launch transaction construction/submission, Phantom signing, confirmation/recovery, holder eligibility and the lease-based creator-fee ingestion/reconciliation gateway remain on their existing infrastructure. Helius read verification does not authorize switching the submission endpoint. The original gateway is preserved; changes to its constructor only permit a separate injected read transport. A verified audit bug was fixed: fallback holder scans with missing owner data no longer claim exact counts.

DexScreener still supplies supported verified-pool prices, volume, market capitalization and liquidity. GeckoTerminal still supplies historical candles. Existing Pump-event decoding supplies verified bonding-curve trade activity through the original gateway. DAS does not supply invented price statistics, arbitrary trending ranks or platform provenance.

## Holder enumeration and metadata

`getTokenAccounts` scans at most five cursor pages of 1,000 accounts. It verifies the requested mint, rejects unsafe numeric amounts, deduplicates token-account addresses, groups positive raw balances by distinct owner and excludes the canonical Pump bonding curve. Multiple token accounts belonging to one wallet count once. Amounts use BigInt, never floating point. Zero balances are excluded.

An exact count requires completed pagination, advancing cursors, consistent index slots and non-conflicting account observations. A stopped scan can yield a lower bound only when the observed index snapshot remains consistent. If index slots change or an account conflicts across pages, the current count is **unavailable**, not an asserted lower bound. Owner samples cover scanned accounts only and are alphabetic, limited to 25, and explicitly not a ranking. The indexed slot, retrieval time, scanned account count and completeness/reason appear with the data.

`getAsset` retrieves informational mint-matched names/symbols. It never overwrites authenticated saved token metadata, fetches arbitrary off-chain URLs or changes launch records. Missing/unsupported metadata remains unavailable. Names/descriptions/images saved through the existing Pinata flow remain authoritative for the platform record.

Only already verified platform launches may reach public Explore market readers. Looking up USDC metadata during verification does not enable USDC launches; TOKEN/SOL-only policy is unchanged.

## Treasury observations and fee classification

Balances and recent signatures use finalized Mainnet reads. At most the first two successful recent transactions per wallet are read in full per refresh. A matching finalized transaction slot/account balance vector can label a net wallet balance change incoming/outgoing/neutral. It does not establish that the change is a creator fee, even when Helius recognizes a transfer.

Eligible creator-fee and launch-charge labels still require existing verified instruction evidence, matching network/recipient, platform-launch provenance and finalized ledger reconciliation. Arbitrary deposits, refunds, failed transactions, mock Credits and unverified indexer descriptions are never eligible creator-fee receipts. Public monitoring never inserts launch/fee records or claims/distributes funds.

Official Mainnet identities, human 60/40 split, separate 0.05 SOL launch charge and reserved AECO deployer guards are preserved. Staging remains MODE=demo, with launches/charges/payouts disabled and separate Devnet recipients untouched.

## Free-plan reliability and cost safeguards

- Shared per-process queue: at most two requests/second; eight waiting operations maximum. Ordinary JSON-RPC batches retain IDs and are drained serially under the same budget.
- Local weighted caps: 120 credits/minute, 1,000/hour and 10,000/day. Standard allowed RPC reads count as one; DAS calls count as ten, matching published pricing. Retries count against local caps too.
- Five-second request deadlines, one bounded transient retry, and a bounded 429 cooldown using Retry-After. Authorization/unsupported-method errors do not cause automatic paid upgrades.
- Genesis checks cached for 30 seconds; holders for 60 seconds with shared in-flight scans; metadata for five minutes; wallet snapshots for one minute. Existing market/trade/history caches remain.
- Cache sizes and page/owner/history samples are bounded. No perpetual full-history requests, webhooks, Enhanced Transactions, paid transfer APIs, gRPC or streaming subscription was introduced.
- Wrong-network fallbacks fail closed. Missing credentials preserve original read functionality; provider failures yield explicit partial/unavailable data or verified existing-RPC fallback.

These counters are **per process and reset on restart**, not an account-wide billing ceiling. Other applications, replicas and manual probes can share account credits. Account usage/remaining quota and billing dashboard were not accessible through the RPC key; keep Free-plan usage alerts/account controls in the Helius dashboard. No overage/autoscaling setting was enabled.

## Real external verification

See `evidence/helius-readonly-2026-10-20.json`. The audit passed real Helius responses through the production TypeScript readers using a proxy-compatible audit-only HTTPS transport; it did not use mock provider data or a browser-exposed key.

- Authenticated Mainnet and Devnet genesis checks matched their expected networks.
- Both official Mainnet treasury wallets: finalized 0 lamports; no recent signatures returned. This is not evidence of wallet ownership or complete lifetime fee coverage.
- Existing controlled Devnet mint `4PMot5KMVbwR1XE4waWGVoWhax3wXcAUv6E9xapPdy8p`: two token accounts scanned; after excluding the curve, the observed test-wallet sample held 30,000,000 tokens (30,000,000,000,000 raw units). Index slots advanced during enumeration, so no exact current holder count is claimed.
- Mint-matched Devnet test-token metadata and Mainnet USDC metadata were returned.
- Helius independently returned the existing test launch as finalized, with one 50,000,000-lamport transfer to its **original Devnet** Platform Treasury and 10,000-lamport network fee. Recent test-wallet transaction history also returned. No new transaction was signed/submitted.
- There were no real Mainnet creator-fee distributions to classify. Real balances/history reads and mocked classification/security cases are reported separately.

## Tests and deployment gates

Backend suite: 230 passed, 23 skipped (database-dependent and disabled legacy-USDC paths). Shared contracts: 31 passed. Frontend: 235 passed. Six browser scenarios passed on the corrected complete rerun. Frontend tests include partial/exact holder presentation, source attribution and unchanged financial presentation. Build, typecheck, lint and generated contract checks pass. Browser checks cover desktop/mobile Explore, six discovery sections, preserved market/chart providers, demo privacy, and desktop/tablet/mobile Treasury fallback. An old browser test was updated to wait for the actual world-ready signal before clicking; no city/reveal code changed.

All existing staging migrations 001–004 match repository checksums; no migration or database mutation was performed for this integration. Production has no repository deployment triggers. Unrelated Claude Playwright files remain uncommitted and untouched.

Railway is currently pausing builds for all workspaces. After a tested main push, retry the compatible backend deployment first, verify the new API and read-only monitoring, then deploy the frontend from the same main SHA. Confirm both actual deployed SHAs and staging browser/API/WSS behavior. A green previous deployment is not proof the Helius code is live; live staging acceptance remains pending until the release actually deploys.

Remaining limitations: no durable complete token-holder index/history backfill, no guaranteed exact counts across changing DAS pages, no complete lifetime/unclaimed-fee coverage, and no account-wide quota measurement. Those limitations are presented honestly rather than fabricating statistics or enabling higher-cost services.
