# Automatic $AECO Common Agents — Phase 2

Implementation added 22 October 2026. **Not activated on Mainnet:** the official mint has not been configured or launched. No launch/payment/broadcast/payout gate changes, migrations, new wallet controls or Phase 3 economics accompany this feature.

## Product and identity

Each qualifying unique wallet with a positive raw balance of the verified official $AECO mint receives one persistent **Common Agent**. Multiple accounts aggregate using bigint; multiple buys never create more agents. A partial exit updates the existing balance. A complete finalized exit pauses the identity and removes it from the active public roster; re-entry restores that identity. No connection, authentication, activation or website visit is required.

Positive balance is the basic Phase 2 appearance criterion. The future proposed $20 token-position requirement and unfinalized AECO minimum concern Phase 3 economic privileges; they do not govern this automatic basic population. Identifiable off-curve authorities, executable/program-owned authorities and configured non-user wallets and the configured treasury recipients are excluded. This is wallet counting, not proof of distinct human beings. Unknown custodial or on-curve pool authorities require reviewed exclusions; universal non-user detection is not claimed.

Identity is a domain-separated hash of network, mint and wallet. It is preserved in the existing simulation snapshot and applied-command journal, including inactive identities. The internal `aeco_observed` discriminator records **provenance**, not another public agent class. Display names use the shortened public wallet; canonical IDs and full provenance remain unambiguous. Merely observing ownership never grants an authenticated ownership relationship.

Existing launcher-linked activations, legacy identities, house agents and uniqueness constraints remain unchanged. The earlier [one-per-token plan](COMMON_AGENT_PER_TOKEN_PLAN.md) addresses a distinct future token-linked policy, not the native holder mapping. Phase 3 expands the same Common Agent identities with separately reviewed behavior, eligibility, owner controls and economic services. Super Agents remain a separate future category.

## Gamine reuse audit (read-only)

Reviewed actual local sources in `/home/pikoo/Desktop/gamine`:

- `docs/automatic-agents.md`: background discovery without visits, aggregated ownership, failure semantics, retirement and game-specific economic rules.
- `src/chain/holdings.ts`: paginated Helius discovery, owner aggregation, off-curve exclusions and RPC balance verification.
- `src/agent-id.ts`: owner-bound, domain-separated SHA-256 identity pattern.
- `src/holder-policy.ts`: live $20 pricing; deliberately not adopted for basic Phase 2 appearance.
- Agentic Economy's existing `sim/nav.ts`, simulation worker, command journal, snapshots, public agent APIs and batched renderer supply this city's persistence, movement and visibility.

Ported compatible aggregation/exclusion/failure/identity patterns into the existing backend rather than copying Gamine's game engine, opt-out/replacement lifecycle, random agent salts, economic thresholds, settlements or configuration. Fixed identity derivation adapts the owner-bound hash to this task's required exit/re-entry/rebuild stability. No Gamine files, secrets or deployment settings were modified or transferred.

## Finalized indexing and recovery

`chain/aeco-holders.ts` uses the existing backend-only Helius reader and its genesis verification, method allowlist, shared budget, sanitized errors and timeouts. It reads the configured mint, then a mint-filtered `getProgramAccounts` snapshot at finalized commitment with context. A 109-byte slice contains the mint, owner, exact amount and initialized/frozen state. Mint-supply reads bracket the account scan; decoded total supply must agree with both reads. Malformed, truncated, inconsistent, duplicate or incomplete scans fail as a whole. Failed requests never become zero balances.

Owner verification runs in batches of 100 via finalized `getMultipleAccounts`, excluding executable/non-system-owned authorities. Null accounts can be unfunded on-curve wallets that still own token accounts. Configured exclusions do not weaken supply-coverage validation.

Finalized mint-filtered program subscriptions provide hints only; no notification directly creates, removes or changes an agent. Unsupported subscriptions fall back to polling; disconnected sockets retry after 30 seconds. Coalesced refreshes have a one-minute floor and population-dependent pacing to reserve shared provider capacity. A complete reconciliation also runs periodically and at startup, covering missed hints and downtime. Small populations need fewer requests; notification delivery never bypasses the shared provider budget.

The cluster-wide `aeco-common-agents` lease has its own advisory-lock key and heartbeats. One complete observation is queued with a network/mint/slot dedupe key in the existing durable inbox. The fenced simulation tick atomically applies the complete population and commits its command log, outputs and optional snapshot. Duplicate and older slots are ignored. Readers see the last fully committed population, never half a pass. A lease/RPC failure preserves the last known population. A mint/network change in a populated world fails closed and requires explicit review.

RPC/API references: [Solana getProgramAccounts](https://solana.com/docs/rpc/http/getprogramaccounts), [Helius getProgramAccounts](https://www.helius.dev/docs/api-reference/rpc/http/getprogramaccounts). Their documented context and filtering support does not establish coverage for our future mint; live mint-specific checks remain mandatory.

## Basic simulation and public view

Common Agents use the existing walkable road/bridge grid and cached deterministic navigation fields. They spawn at distributed accessible building entrances, walk between permitted entrances and rest/visit between trips. Decisions are staggered and bounded; there are no AI model sessions. They bypass the economic planner, have an empty permission list, null owner-control wallet, zero starter credits and no task/reward entitlements.

All identities remain in authoritative simulation state. Ordinary movement updates are staggered over four ticks; WebSocket records batch up to 128 agents and retain existing chunk-interest filtering. New identities upsert into the client; paused full exits leave its active roster. Rendering selects up to 512 visible/nearby agents from the complete population, prioritizing selections, and re-evaluates with the camera. It no longer truncates the source roster before culling. City-agent lists paginate in groups of 50. Neither rendering nor pagination caps stored identities.

The unauthenticated world statistics response includes `aecoPopulation`: disabled, syncing, current or stale, with mint, network, indexed slot, observation timestamp and separate holder/active Common Agent counts. Equality is shown only when counts match a fresh complete snapshot; delayed/unavailable indexing displays an updating state. Other existing simulation agents are not miscounted as native-holder Common Agents.

## Configuration and rollout

Backend only, default off:

```dotenv
AECO_COMMON_AGENTS_ENABLED=false
# Set only AFTER the real official mint is launched and independently verified:
# AECO_MINT=<verified actual mint>
AECO_MINT_VERIFIED=false
AECO_RECONCILE_INTERVAL_MS=1800000
AECO_EXCLUDED_WALLETS=
```

Enabling requires a verified mint, backend Helius key, matching Devnet or Mainnet configuration, and a non-demo environment. Production additionally requires a matching confirmed production TOKEN/SOL platform launch/community from the reserved official AECO deployer; agents join that existing community. No synthetic community or launch is registered. It does not enable financial execution. Dedicated Devnet verification must use isolated data and an actual controlled mint. The loopback fixture runner explicitly injects demo observations without enabling chain access.

Before Mainnet observation activation: verify official launch provenance/mint/network, issuer-approved supply and decimals, real holder scan completeness, relevant pool/vault exclusions, provider response sizes/usage and population capacity. No fictional mint is supplied. Review API roles: indexing runs only in `all`/`indexer`; the simulation role remains chain-free.

The reader bounds single account-scan responses at 16 MB; other reads retain their 4 MB bound. Coverage/plan/budget limits yield unavailable/stale state rather than truncating the holder population or removing agents. Very large account sets beyond this envelope need a separately verified complete-snapshot provider strategy; they must not silently fall back to a top-holder list. No paid plan or add-on was enabled.

No new schema or migration is needed. Existing migrations 001–004 already provide snapshots, the durable inbox, command log and leases. No existing database was reset or migrated. With separate explicit approval, only the fresh local `aeco_common_agents_20261022_test` database received the existing 001–004 schema for the persistence rehearsal; no Railway migration was applied. Rollback disables discovery while retaining identities/evidence; once observations have been applied, keep readers compatible with contract 0.6.0. Do not roll back to a backend that cannot read the new identity provenance or replay its commands.

## Verification and remaining acceptance

Verified locally with fixtures:

- 400 unique wallets → exactly 400 persistent Common Agents; aggregated balances exceed JS-safe integers without precision loss.
- Duplicate reads/purchases, multiple token accounts, transfers, partial exits, complete exits and re-entry preserve IDs.
- Serialized state restoration and existing journal/leadership-loss recovery preserve identities; malformed/failed scans preserve the last population.
- Public HTTP access needs no login; observed identities have no owner-control wallet, permissions, starter funds, tasks or rewards.
- Navigation uses walkable cells; movement continues. A 10,000-identity engine fixture averaged approximately 7–8 ms per tick on this workstation (not a production capacity guarantee).
- Real browser fixture at 390, 768 and 1440px: complete world, public 400/400 counts, movement, no overflow; desktop 10,000-identity run also passed. Screenshots are generated under `apps/web/artifacts/common-agents-*.png`.
- Live **read-only existing ZAP Devnet** scan: mint `DJbKJVKMFQyM5qnGcydqsPTw7WyR8xRzwgBDfmXp3ZVc`, finalized slot 513930180, decimals 6, one qualifying wallet, raw balance `20000000000000` (20,000,000 tokens). This is a test token, not official AECO. No trade, signature, transaction or wallet privilege was requested.

Repeatable fixture checks:

```bash
pnpm --filter @agentic-economy/server exec vitest run test/common-agents.test.ts test/helius.test.ts
pnpm --filter @agentic-economy/web exec playwright test --config playwright.common-agents.config.ts
AECO_COMMON_AGENTS_FIXTURE_COUNT=10000 pnpm --filter @agentic-economy/web exec playwright test --config playwright.common-agents.config.ts --grep '1440px'
```

Live finalized mint-filtered Helius Devnet subscriptions received four subscription acknowledgements across two connections, including automatic reconnect after closing our own test socket. No ownership-change notification was observed and no transaction was submitted. Actual ownership-change-to-reconciliation acceptance is still separate. Provider keys were privately checked absent from the frontend build.

The owner separately approved the isolated PostgreSQL rehearsal in `aeco_common_agents_20261022_test`. A new private local cluster with TCP disabled was verified empty before applying only migrations 001–004. All 400 identities survived a full application-context restart with an exact simulation state-hash match; duplicate observations, interrupted indexing, full exits and same-identity re-entry passed. There were zero launch and treasury-entry rows. The same test database cluster was then restarted and a fresh Node process independently loaded all 400 unique identities with the exact persisted state hash and no authenticated control or financial execution. The cluster was stopped again and its directory retained at `/tmp/aeco-common-rehearsal.qmpkv_8i`; no existing local or Railway database was touched.

Staging frontend and backend deployed `84d7b2e8ad32158edfe2bc2919debf2288c02b4a` with contract 0.6.0. Actual API/readiness/capabilities and responsive browser checks passed: 170 WebSocket frames, no page errors, no horizontal overflow, clean navigation/refresh and persistent world retained. Indexing is disabled with no configured mint; execution stays disabled. Production was not deployed and its public Launchpad/API still return HTTP 200 with financial features off.

Still required: sustained large-population PostgreSQL/provider load acceptance and actual ownership-change-to-reconciliation acceptance under interruption; independently verified official Mainnet AECO launch and subsequent read-only holder/population acceptance. Unit/memory fixtures and one real Devnet scan do not prove those Mainnet or sustained operational results. Existing physical mobile on-chain acceptance remains deferred; do not request another wallet transaction. Phase 2 is not complete and Phase 3 has not started.
