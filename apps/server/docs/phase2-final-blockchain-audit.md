# Phase 2 — final blockchain verification audit

18 October 2026. **Actual public-devnet SOL and USDC creation passed. This is not
approval or a declaration of readiness for production financial execution.**
The website, world, camera and economic simulation have not been redesigned.

## Capability classifications

| Capability | Classification | Scope and remaining limit |
|---|---|---|
| Phantom desktop message authentication | Verified on actual supported public network/service | Previously user-confirmed; authentication is an off-chain signature. |
| Phantom transaction signing | Implemented but unverified | Manual localhost devnet preview prepared and user approved testing; actual result pending. |
| Phantom mobile transaction signing | Implemented but unverified | No physical-device acceptance result. No desktop signer result substitutes for this. |
| SOL launch through existing UI | Verified on actual supported public network | Actual official devnet programs, real Pinata, authenticated API and PostgreSQL; automated Wallet Standard signer. |
| USDC transaction construction and creation | Verified on actual supported public network | Devnet USDC, initialized quote vaults, exact separate SOL charge and locked shares. Dedicated protocol harness. |
| USDC Launchpad/API acceptance | Blocked or unsupported | Remains disabled; application contract, confirmation, preview and quote-specific integration still require work. |
| Token-2022 mint, metadata, creator and locked shares | Verified on actual supported public network | Both public transactions independently checked at finalized commitment. |
| 0.05 SOL atomic platform charge | Verified on actual supported public network | 50,000,000 devnet lamports per successful token, not real SOL. |
| Failed-transaction rollback | Verified on isolated local validator | Prior SOL final-instruction failure rolled back mint and platform charge; not a public-network failed-USDC experiment. |
| SOL restart, concurrency, refresh and duplicate recovery | Verified on actual supported public network | Actual public transaction plus existing UI/API and disposable PostgreSQL; one submission, one receipt and community. |
| SOL Explore provenance | Verified on actual supported public network | Actual devnet launch record discoverable in the isolated application; not inserted into staging or production. |
| Earned creator-fee eligibility and ledger reconciliation | Verified through deterministic tests only | Actual locked routing is verified, but no positive earned-fee collection, trade or graduation occurred. |
| Mainnet launches, claims, signing and payouts | Blocked or unsupported | Hard-disabled; separate engineering, security review and authorization required. |
| Super-Agent execution and AECO quoting | Blocked or unsupported | Future phases; disabled. |

“Public network” refers to Solana devnet, never to a mainnet financial transaction.
The automated signing wallet was newly generated for this task and funded by the
user with devnet SOL. No user recovery phrase, private key or treasury signing key
was requested. Its test signing key stays only in ignored local audit storage.

## Protocol and network findings

Official documentation HEAD remains `639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22`, matching
the pinned snapshot; SDK 4.1.0 is unchanged. The real transactions invoked:

- Pump: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`.
- Pump Fees: `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ`.
- Pump AMM: `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` is referenced by the sharing path; no graduated AMM trade was performed.

Public devnet genesis was checked before preparation, signing and confirmation:
`EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`. No supported Pump public-testnet deployment
was independently verified. No mainnet fallback was used.

The earlier failed faucet transaction's actual log says its source held 8,999,737
lamports while trying to transfer 1,000,000,000. A single smaller supported request
also returned an internal error. No faucet bypass was attempted. After the user's
funding, the dedicated wallet's finalized devnet balance was verified as 5 SOL.

The official [creation specification](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/COIN_CREATION.md)
was checked against live account configuration, not just SDK defaults. The example
USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` is **not** a token mint on devnet.
The live devnet Global allowlist contains `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`,
which is an initialized, six-decimal SPL Token mint. The verification harness checks
that allowlist and owner. It never substitutes a mint based on its ticker.

The SDK adds quote-control metadata after the three non-native quote accounts;
the audited construction has 20 creation accounts. Both quote vault source ATAs
must exist before the final share update. Merely supplying a quote-mint argument
made creation simulate successfully but the final sharing instruction fail with
InvalidAccountData. The constructor now initializes the two canonical vault ATAs
idempotently **inside the same atomic transaction**, without splitting the charge.
The SOL instruction sequence is unchanged; USDC uses seven instructions, 803 bytes
for the tested metadata, two signatures and no initial buy.

## Public transaction evidence

Both results were independently reread at finalized commitment, checking successful
metadata, mint owner, decimals, token identity, platform transfer, authenticated
initiator, curve quote and the revoked sharing administrator.

| Quote | Mint | Signature |
|---|---|---|
| SOL | `81jmbNJyn4CTBPqnQ7UVgfpy4SoWfoSrEiM9WKgFjjJd` | `5TvrNRQazQQgGKs8VNWoDxVs1pcsqjJX2TSK2dojTdALr58etvZi9U3y5puetwndugWPxvUBpyRPjfE41bRETbJ7` |
| USDC | `EvqsbYiQFtB7iEEYyrYuMngvNP8DzqrqRumqKUUUBmZK` | `4JqCkWnfm5YCLPyBbaU6efzTZ2tzEFr3VKMR2PgeMJDkqMmzC8fFkCDYwp7azQFcCosvVDzKSReMDPyir6FY5cA2` |

[Finalized RPC evidence](evidence/pump-public-devnet-2026-10-18.json) records destination
accounts, network fees, actual metadata and locked 6000/4000 shares. Each creation
paid exactly 50,000,000 devnet lamports to its dedicated test platform destination;
the 10,000-lamport network fee is accounted for separately. No production treasury
address or real SOL was used. No trading volume was created.

[Existing-UI evidence](evidence/pump-devnet-ui-2026-10-18.json) records real image and
metadata CIDs, the SOL launch, restart recovery and public provenance. This is
actual Pinata, not the mocked browser fixture. The public test exercises the existing
Launchpad, not a replacement application. The token is not represented as a mainnet
listing and has no fabricated market statistics.

## Phantom compatibility and security

Phantom documents [v0 transactions and lookup tables](https://docs.phantom.com/developer-powertools/solana-versioned-transactions).
Its [sign-only method](https://docs.phantom.com/solana/sending-a-transaction) can be
available on the injected provider even when its Wallet Standard registration only
exposes message signing. That registration previously hid the injected transaction
method in our adapter. The adapter now selects declared standard v0 support, or the
same named injected provider. It checks the connected account around the injected
call. A rejected standard request never triggers a second fallback prompt.

The mint's partial signature and exact version-0 message survive the fallback.
The backend still checks both signatures, exact server-persisted message bytes,
creator ownership, blockhash, network identity, destination and the exact charge.
New regressions reject recipient, amount, mint and lookup-table substitutions.
No wallet callback alone registers a successful launch.

Existing tests cover expired attempts, RPC timeouts/disconnections, contradictory
or incomplete evidence, wrong networks, stale drafts, ownership/replay attacks,
unsupported quotes and insufficient-funds simulation. Submitted uncertain signatures
remain recoverable rather than prompting a fresh charge. The real SOL UI test
stopped the complete backend context before confirmation, reopened database
connections, confirmed concurrently, refreshed the browser and retried submission.
It produced one broadcast, one community and one launch-charge entry.

The API currently accepts confirmed commitment for registration. The independent
public audit subsequently verified finalized evidence. This does **not** implement
multi-provider consensus or a finalized-only listing policy. Post-confirmation fork
handling and registration policy remain independent production review items.

The manual Phantom preview is the existing UI at `http://localhost:5187/#launchpad`,
using API port 8797 and only the exact approved disposable test database. Its script
requires explicit opt-in, fixes RPC/genesis to public devnet, binds loopback only and
uses separate public test treasury addresses. Staging launch flags are unchanged.
The real Phantom result must be recorded separately after the user completes it.

## Creator fees and Explore limits

The actual share configuration is active and locked to 60% Agent Rewards and 40%
Platform, with no human-launcher share. This proves routing configuration, not
collection of positive eligible fees. The USDC quote vault has zero tokens: that is
not a fee receipt. No claim, earned-fee payout or treasury signing was performed.

The official [fee-sharing lifecycle](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/CREATOR_FEE_SHARING.md)
separates pre-graduation creator vault distributions from AMM sweeps after migration.
Recipient entitlement derives from the verified sharing PDA and exact shareholder
accounts. SOL fees use lamports; USDC fees use the actual quote mint and canonical
ATAs. Platform launch charges, protocol fees and LP fees are separate categories.
Only the eligible creator component may be allocated by our ledger.

The existing authenticated CPI/event parser, balance-delta verification, duplicate
protection, finality/reversal and denomination-aware accounting passed deterministic
tests. Floor/dust examples remain synthetic evidence, not observed protocol payouts.
A later separately authorized test must verify a legitimate test trade's eligible
fee, entitlement, explicit distribution/AMM sweep, positive recipient deltas and
idempotent ledger reconciliation to its finalized signature. Do not manufacture
public trading volume to make those statistics appear successful.

Explore verifies PLATFORM origin separately from HUMAN initiation; clients cannot
supply either attribution. Super-Agent initiation is not enabled. The actual devnet
SOL record is discoverable after confirmation, including its mint, network, pair,
metadata and signature. Testing-network market metrics correctly stay unavailable.
USDC harness output is not silently inserted as a complete application launch.

Remaining market gaps are holder counts, graduation percentage, individual trade
history, independent provider source timestamps and mainnet acceptance. Existing
provider-derived price/volume/liquidity/capitalization retain attribution, a fetch
time and pool verification; fetch time is not proof of the provider's source time.
OHLCV requires a verified indexed pool. Provider failures/stale snapshots must not
be ranked as current statistics. None of the new test tokens has invented price,
liquidity, holders, market capitalization or graduation activity.

## Previously skipped database tests

All were skipped because TEST_DATABASE_URL was absent in the general invocation;
the Launchpad group additionally requires explicit migration approval. Each was run
successfully against `aeco_launch_execution_20261018_test` during this audit:

| Group | Previously skipped case |
|---|---|
| Storage | Full transactional launch, append-only constraints and idempotency |
| Storage | Exact simulation crash/snapshot/command-log recovery |
| Storage | Reject a different persisted world seed |
| Identity | One agent per mint/wallet and append-only identity rows |
| Identity | Atomic identity reservation rollback |
| Identity | One winner across two concurrent API replicas |
| Identity | Names and activation eligibility survive restart/replay |
| Coordination | Simulation leadership takeover without duplicate processing |
| Coordination | Fence a superseded leader |
| Coordination | Durable inbox, retries and API restart |
| Coordination | WebSocket replay across an API restart |
| Coordination | Single indexer and no duplicate creator-fee accounting |
| Migrations | Apply once under concurrent startup |
| Migrations | Repeat startup preserves simulation and treasury records |
| Migrations | Reject checksum tampering and schemas newer than the build |
| Launch workspace | Reconnect, ownership, versions, quota and idempotency |
| Launch workspace | Media receipts and last quota slot across replicas |
| Launch workspace | Concurrent integrity check does not reapply migrations |

The full database-backed suite passed **171/171** before two additional builder
regressions were added; the final seven-case builder suite also passed. The later
normal backend invocation passed 155 cases, with those same 18 database cases
intentionally skipped while the manual
Phantom preview is using it: resetting that schema during the user's test would
be unsafe. Previously gated cases are not reported as untested.

Only the previously approved disposable target was reset by those tests. A custom
backup was made first and restored afterward; the prior confirmed local launch
and four migration records were checked. The existing local world, Railway staging
and production databases were not reset or migrated. No schema file was changed.

## Verification and release gates

- Frontend: 207/207 tests passed with one worker. The first parallel run had one
  existing lake-generation timeout under CPU contention; no assertion was weakened.
- Shared contracts: 26/26 passed. Contract 0.3.1 is unchanged.
- Browser fixture: seven cases passed, including hybrid Phantom registration,
  signing rejection, real test signatures, desktop/tablet/mobile draft workflows,
  unavailable uploads, retries and account changes. Pinata/RPC are mocked there.
- Real public-devnet UI: one passed with actual Pinata, signatures, RPC and PostgreSQL.
- Local USDC: passed after quote-vault initialization and bounded identical-transaction
  RPC retries. Earlier InvalidAccountData and expired attempts remain recorded as
  failed attempts; they are not presented as successful executions.
- Workspace typecheck, root lint, frontend lint, backend build and frontend production
  build passed. Existing native-bigint fallback and bundle-size warnings remain.
- Real Phantom manual result, final Git SHAs and staging deployment evidence are
  reported with the release. Test records do not imply Phantom approval.

Production is **not ready for financial enablement**. Required gates include actual
Phantom desktop/mobile acceptance, complete USDC application contracts and recovery,
legitimate earned-fee and graduation evidence, explicit fork/finality policy,
mainnet program/IDL attestation, audited custody destinations/lookup table,
independent transaction/security review, and separate approval for any mainnet
submission, real charge, claim, treasury signing, routing or payout.

The 101 protected original files must remain unchanged. Use normal main pushes and
one-file commits. Recheck that production has zero deployment triggers and staging
has no pending schema changes before release. Staging must remain MODE=demo, with
launching and financial execution disabled; production configuration is untouched.
