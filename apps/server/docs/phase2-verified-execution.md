# Phase 2 — verified Solana launch execution

Audit date: 18 October 2026. **The existing SOL pipeline passed actual local-validator
execution and the existing Launchpad UI with real Pinata and PostgreSQL. Production
rollout is still blocked by the external acceptance items below.** Staging stays demo;
mainnet transaction submission, payments, fee claims and payouts remain disabled.

## Protocol compatibility and network evidence

The current official documentation HEAD is still
[`639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22`](https://github.com/pump-fun/pump-public-docs/tree/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22),
matching the builder's pinned snapshot. SDK 4.1.0 remains pinned. No replacement
protocol or speculative SDK update was introduced.

| Item | Finding |
|---|---|
| Pump | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| Pump Fees | `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` |
| Pump AMM | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` |
| Public devnet | Correct genesis, all three programs executable; read-only verified. |
| Public testnet | No supported deployment independently verified; not used. |
| SOL | Default quote; actual cloned-program execution and UI pipeline passed locally. |
| USDC | Documented by official V2 protocol; application construction, safe-network mint/ATA handling and fee-denomination launch tests remain unverified. Disabled. |
| AECO | Future phase; disabled. No eligibility claim. |
| Mainnet | No launch, transfer, approval or deployment performed. Writes remain hard-disabled. |

The official [creation specification](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/COIN_CREATION.md)
confirms create_v2, the mint/creator signers, Token-2022, six decimals, and the optional
non-native quote accounts. We checked the actual name, symbol and URI in the minted
token's metadata extension. Mayhem, cashback and holder rewards remain off. The
builder's default native quote and 16 creation accounts match this route. USDC uses
additional quote accounts and cannot be enabled by just changing a label.

A fresh public-devnet wallet requested faucet funds. The returned airdrop signature
`4R9RPxUMvZTdEcesvd3L7oZXkxQJ5A96tj4QUqxPJFCG8NnzWNzZ4pkUfRtBdwYB3zb5dKj8MNeVnQzqZmWrfrJp`
finalized with `InstructionError [0, Custom 1]`; its balance was zero. A returned
signature was not treated as successful funding. No public token launch was attempted,
and no mainnet fallback or existing wallet was used.

A new loopback validator at port 18999 cloned only devnet programs/configuration.
Its distinct genesis is `6ipNj9MegH4hTivNXuiPn13ACBJouXzNaakdGW36gfpB`. The six cloned
upgradeable binaries (Pump, Pump Fees, Pump AMM, Mayhem, SPL Token and Token-2022)
were byte-compared to public devnet after excluding loader metadata. They match.
The source deployment slots, code SHA-256 hashes and all three official IDL hashes
are recorded in [program evidence](evidence/pump-program-audit-2026-10-18.json).
This is evidence about those devnet artifacts, not a mainnet binary attestation.

## Implemented flow retained

The existing backend-owned draft, real Pinata upload, metadata, review, official
SDK builder, wallet adapter and chain gateway were reused. A server-created mint
key signs only the prepared message; its secret is neither returned nor persisted.
The authenticated creator must sign the exact stored message. Unsupported quotes,
stale drafts, changed messages and invalid/missing signatures fail closed.

One version-0 transaction contains compute budget, one exact 50,000,000-lamport
transfer to the saved platform destination, create_v2, create_fee_sharing_config,
and update_fee_shares_v2. The lookup table supplies compression; this tested packet
was 744 bytes, under the 1232-byte limit. The route does not silently split the
charge or include an initial buy. Treasury private keys do not sign.

The UI discloses the platform destination, platform charge, network-fee estimate
and rent estimate before requesting a signature. Account rent remains an estimate.
Solana network fees can still apply to a failed transaction; this is distinct from
our atomic platform charge. See [Solana transaction semantics](https://solana.com/docs/core/transactions).

## Findings fixed in this audit

1. **Recovery-network binding.** Preparation and submission already checked safe
   genesis, but expiry/confirmation reads could use a subsequently changed RPC.
   Recovery now checks the genesis persisted with that attempt, including the
   genesis attached to observed transaction evidence. Wrong/unavailable networks
   retain the saved attempt and do not expire, confirm, broadcast or credit it.
   RPC errors are sanitized.
2. **Incomplete/inconsistent RPC evidence.** Missing transaction metadata previously
   normalized its absent error to null. RPC reads now return pending when metadata
   is absent or signature status is missing/processed. Contradictory execution and
   signature-status errors reject confirmation instead of crediting success.

These changes require no shared-contract or database-schema changes. Regression
coverage includes network changes, missing metadata, inconsistent status, RPC
outages, invalid instructions, insufficient-funds simulation and stale blockhash
simulation. They do not remove default-off launch gates.

## Actual local execution, platform charge and rollback

[Normalized protocol evidence](evidence/pump-local-metadata-2026-10-18.json) includes
real local RPC instructions, signatures, mint metadata, routing and duplicate outcome.
The metadata URI is an actual previously retrieved Pinata CID, not a placeholder.
Token-2022 owner, initialization, decimals, supply and on-chain metadata were checked.
The native sharing config was active with exactly 6000/4000 basis points and its
admin revoked. Duplicate broadcast could not add a second platform charge.

A negative local execution deliberately changed the final shares to 5999/4000.
Simulation reached and rejected the final instruction. Only this guarded negative
local test bypassed preflight to execute the expected failure. The actual transaction
failed with custom error 6014 at instruction 4; no mint remained and platform balance
was unchanged. This demonstrates rollback even though transfer and creation precede
the failing instruction. Production submission still always uses preflight.

These signatures exist only on the isolated local ledger; they cannot be looked up
as public Solana launches. No production fee-verification claim is made from them.

## Existing UI, real Pinata and approved PostgreSQL restart

The explicit opt-in suite `apps/web/tests/local-protocol-launch.spec.ts` uses the
existing frontend and real API handlers. It requires a loopback RPC, exact non-public
genesis, a separately approved disposable database and server-only Pinata credential.
It is skipped by default and never enables Railway execution. A Wallet Standard test
signer lives in the test process; it is not an actual Phantom extension approval.

The user approved the newly created `aeco_launch_execution_20261018_test` database
and existing migrations 001–004 only. The target was checked before migration and
again before the browser run. No existing local world or Railway database was touched.

The actual browser run verified:

- Authentication, owned draft creation, logo upload and metadata pinning through the
  existing Launchpad, with actual Pinata CIDs and public gateway retrieval.
- Actual local program simulation before any wallet signature; unconfirmed
  preparations remain owner-only and absent from the public launch endpoint.
- Wallet rejection before broadcast, with zero platform charge.
- One signed submission and signature persisted in PostgreSQL before broadcast.
- Full API/context shutdown and new PostgreSQL connections before confirmation.
- Concurrent confirmation after restart against actual chain evidence, with one
  community and one launch-charge entry; restored browser session/draft/attempt.
- Duplicate submission and status calls without a second broadcast or charge.
- PLATFORM origin plus HUMAN initiator and localnet/SOL provenance, metadata URI,
  actual mint/signature, and the verified listing in the existing Explore UI.
- Market fields remain unavailable/null for the local token; no fabricated price,
  volume, liquidity, holder count or market capitalization.

The dedicated test database and isolated ledger are retained for inspection. Test
wallet secrets were generated in memory and are absent from committed evidence.
The separate workspace PostgreSQL tests also passed connection-level persistence,
ownership isolation, quota concurrency, idempotency and migration-integrity checks.

Reproduction requires explicit opt-in and the approved test target, never a real
wallet or production database. The local-only browser config uses ports 5186/8796,
separate from the user's active localhost 5173/8795 and preserved PostgreSQL API 8787.
PINATA_JWT must be supplied securely in the test process environment, never VITE_*,
a command argument, source code, logs or chat. Stop before running if any prerequisite
is unavailable. This suite itself does not create a database or grant migration approval.

## Recovery, confirmation and finality limits

Attempt IDs and idempotency keys survive preparation outages. Only an intentional
new attempt uses a new key. Wallet rejection sends no transaction. Signature/message
integrity is checked against the server record. Finalized block height determines
unsubmitted expiry. A submitted transaction missing from RPC history remains uncertain;
it is not called failed or safe to pay again. The same saved signature can recover.

Confirmed chain evidence registers the community and platform receipt atomically in
PostgreSQL. Concurrent requests return the winner. Non-finalized receipts remain
pending and the existing reconciliation tests cover finalization/reversal and missing
history. The launch status currently accepts Solana confirmed commitment; finalized-only
listing or independent multi-RPC confirmation is not claimed. See
[Solana confirmation guidance](https://solana.com/developers/cookbook/transactions/confirmation).

## Creator-fee accounting evidence

The official [fee-sharing lifecycle](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/CREATOR_FEE_SHARING.md)
confirms migration of creator rights to a sharing-config PDA and one-time final-share
updates. The separate platform launch charge is not a trading or creator fee.

For eligible human launches, the route fixes 60% Agent Rewards and 40% Platform,
with no human creator share. No Super-Agent execution is enabled. Protocol and LP
fees are not allocated to the platform. After graduation, AMM creator fees require
appropriate sweep/distribution paths; successful creation alone does not verify them.
Native distributions use lamports; non-native quotes use the actual quote-token
accounts and denomination. Direct single-creator collection is a different flow from
a migrated multi-recipient sharing config. See the official
[collection](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/COLLECT_CREATOR_FEE.md)
and [sweep](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/SWEEP_FEES.md) descriptions.

The existing parser tests authenticate instruction/CPI-event accounts, verified
platform provenance, SOL/USDC denominations, balance deltas, idempotency and ledger
reconciliation. Deterministic fixtures model integer-share floors and retained dust
(1001 units → 600/400, 1 retained). That dust behavior and actual fee eligibility have
not been independently observed in a genuine trade/distribution during this audit.
No fee claim, real fee collection, treasury signing or payout was enabled or performed.

## Remaining production gates

- Funded public-devnet execution using isolated test keys and an environment-specific
  verified lookup table; public faucet funding failed in this audit.
- Actual Phantom launch-transaction approval/rejection, network behavior and mobile
  acceptance. Prior real Phantom desktop authentication remains user-confirmed;
  automated signing is separate evidence.
- SOL trading/graduation and actual eligible creator-fee collection/reconciliation
  under a separately approved safe test plan; no production payout permission.
- USDC application support, correct network mint/ATAs and denomination-specific
  launch, trade and creator-fee evidence. Keep its option disabled meanwhile.
- Audited mainnet program/IDL snapshot, trusted RPC/finality policy, treasury custody
  destinations, lookup-table provisioning and an independent transaction/security review.
- Separate explicit approval for any production deployment, mainnet signing or
  submission, real 0.05 SOL charges, financial routing, claims or payouts. Current
  mainnet guards would also require a separately reviewed implementation change.

This audit proves the local protocol path and recoverable application integration.
It does not declare a production-ready financial launch service or a public Pump.fun
launch successful merely because tests or Railway health checks are green.

## Verification results and audit records

| Verification category | Result |
|---|---|
| Backend unit/integration suite | 153 passed; 18 PostgreSQL-gated cases skipped in that general invocation. |
| Explicit approved PostgreSQL workspace suite | 3 passed against the newly approved database. |
| Relevant frontend wallet/media/preparation/reveal tests | 32 passed. |
| Real local-validator CLI execution | Passed Token-2022 creation, actual Pinata metadata, locked routing, exact charge, duplicate broadcast and negative atomic rollback. |
| Existing UI + real Pinata + actual local programs + PostgreSQL | 1 browser test passed, including restart, concurrent confirmation and Explore. |
| Public devnet token launch | Not executed: faucet transfer failed on-chain and wallet stayed unfunded. |
| Real Phantom transaction signing | Not verified; automated Wallet Standard message/transaction signatures used in this audit. |
| Actual Pinata | Logo and metadata pinned and retrieved through the existing UI. |
| Creator-fee receipt accounting | Deterministic fixtures and reconciliation tests passed. No actual earned-fee receipt/claim/payout performed. |
| Build/typecheck/lint | Workspace packages/backend build, frontend build, workspace typecheck and lint passed. |

The initial broad backend run was blocked by sandbox process/listener permissions;
its authorized rerun passed. A new typed signature-status fixture initially failed
TypeScript checking, was corrected, and the final typecheck passed. Those earlier
failures are not presented as passing evidence. Existing native-bigint fallback and
frontend chunk-size warnings remain; neither changes protocol behavior.

The final actual UI launch is recorded in
[persisted UI evidence](evidence/pump-local-ui-2026-10-18.json). Its mint and signature
are real **local-ledger** identifiers; use that evidence's network/genesis when
interpreting them. Public token/market provenance is never fabricated from them.

Only existing migrations 001–004 were applied to the explicitly approved disposable
local target, after current_database verification. No new migration was introduced.
The migration files are unchanged relative to origin/main. All original unfinished
work remains preserved. Commit and deployment SHAs are reported with the release;
execution configuration stays default-off on Railway staging.
