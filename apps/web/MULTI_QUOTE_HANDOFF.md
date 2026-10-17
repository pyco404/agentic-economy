# Multi-quote Launchpad — frontend checkpoint and Claude handoff

Review date: 2026-10-16. **Native multi-quote execution is not complete. No financial enablement or deployment is authorized by this checkpoint.**

## Current implementation and boundary

- `src/api/launchQuotes.ts`: closed frontend draft choices SOL/USDC/AECO. No arbitrary mint, protocol-eligibility assertion, exchange rate, transaction, or signing capability.
- `src/components/LaunchQuotePicker.tsx` and `src/launch-quotes.css`: native radio cards, explanations, keyboard navigation, responsive layouts, pair preview. SOL is the existing reviewable local draft; USDC is disabled pending backend support, AECO is disabled as Coming soon. AECO is optional.
- `src/components/Pages.tsx`: quote preference shares existing per-tab draft storage. Unknown or unavailable saved choices block review without switching to SOL. Selection/details edits invalidate local review. Review displays pair, unavailable quote-denominated price and unavailable network/rent estimates. Wallet approval and real execution stay disabled. The 0.05 SOL charge and 60/40/0 eligible-receipt allocation are unchanged.
- `src/components/Explore.tsx`: quote metadata and quote filtering are explicitly unavailable. It does not relabel historical launches as SOL or infer a pair from token/metadata URLs. Existing registration/confirmation checks and unavailable-market-data handling are preserved.
- `src/api/launchQuotes.test.ts`, `src/api/launchTreasury.test.ts`, `tests/launch-quotes.spec.ts`: unsupported-input, draft persistence, review, responsive UX, denomination display and no-financial-write checks. Synthetic test receipts are not evidence of on-chain fee routing.

No backend source, shared schema, migration, contract version, simulation rule, agent identity, treasury math, Railway variable, or DNS record is changed. Pre-existing uncommitted camera restoration and `contracts/integration-notes.md` are preserved separately.

## Inspected implementation and staging

`packages/shared/src/launch.ts` defines `LaunchDraft`, `PrepareLaunchRequest`, `TokenLaunch`, and `PrepareLaunchResponse` without quote fields. The current frontend consumes contract 0.2.0 directly. The inspected `origin/main` reference contains identity contract 0.3.0 but its launch draft also lacks quote fields. This work neither merges nor changes that identity implementation.

`apps/server/src/chain/mock.ts` emits a demo `create_v2`; `BuildLaunchInput` in `chain/types.ts` has no quote selection. `chain/solana.ts` deliberately throws `pump_launch_builder_unverified`. No Pump SDK is installed in the inspected server package. `chain/verify.ts` and `chain/pump.ts` do not establish selected quote identity. `store/migrations/001_init.sql` persists launch JSON with no canonical quote fields. Schema changes must originate with Claude, not a private frontend contract.

Read-only public checks during this task:

| Endpoint | Result |
| --- | --- |
| `https://agentic-economy-staging.up.railway.app/healthz` | healthy, demo, contract 0.2.0, financialFeaturesEnabled=false |
| `https://api-staging.useaeco.xyz/healthz` | healthy, demo, contract 0.2.0, financialFeaturesEnabled=false |

Both returned `Access-Control-Allow-Origin: https://staging.useaeco.xyz` for that request origin. This is a public health/CORS check, not an audit of private Railway settings or authenticated requests. Existing frontend build API/WSS variables and pinned demo/fee-routing-disabled infrastructure stay untouched. Do not deploy code that depends on new contracts before staging supplies them.

## Official protocol findings

Primary sources were read from `pump-fun/pump-public-docs`; revision reported by GitHub during review: `639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22`. Use the current deployed program/SDK/IDL and on-chain configuration as the final gate; documentation is not proof of a deployment's eligibility.

| Quote | Documented mechanism | Agentic Economy status |
| --- | --- | --- |
| SOL | `create_v2` keeps native SOL semantics when quote accounts are omitted or WSOL is supplied. | Existing demo draft retained. Real builder/routing verification absent. |
| USDC | `create_v2` accepts a supported quote mint with its quote ATA and token program as ordered remaining accounts. The official example uses mainnet USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. | Protocol support documented; network-specific deployment support, persistence, verification and accounting not implemented here. Disabled. |
| AECO | Eligible Pump-coin quotes use extra curve/control/pool/chain accounts. The resolver must validate current allowed depth, terminal quote, mayhem exclusions, curve/pool state, and reserves. A completed quote curve awaiting migration is not ready. | No verified AECO mint/network/eligibility record provided. Eligibility unknown, not established. Disabled Coming soon. |

Creation sources: [Coin Creation](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/COIN_CREATION.md), [Pump-coin Quotes](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/CREATE_WITH_PUMP_COIN_QUOTE.md).

Pump-coin quotes can involve nested quote chains. The inspected docs reference SDK 4.1.0 and the current `Global.max_curve_depth` limit (program cap 5); do not rely on older cached claims that only depth-zero quotes qualify. Quote-chain reserves are resolved at creation. Migration remains the protocol's existing process; never create an extra pool to make the interface look successful. [Synthetic Migration](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/SYNTHETIC_MIGRATION.md).

Creator fee sharing uses a SharingConfig. Creation authorization is the current coin creator or global authorized admin; share updates require the sharing-config admin and revoke future updates. Sweep/distribute paths are permissionless but must target the correct quote vault and recipient accounts. Native SOL pays through its native path; non-native quotes require quote-token accounts, including shareholder ATAs. Pending curve/AMM fees must be swept before distributing. Holder-rewards mode redirects the creator bucket and must not be enabled for the required treasury allocation. None of this verifies our own routing or authorizes signing. [Creator Fee Sharing](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/CREATOR_FEE_SHARING.md), [Sweep Fees](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/SWEEP_FEES.md).

## Proposed contract changes — for Claude's approval/publication

These are proposals, not implemented routes or accepted frontend payloads. Coordinate an additive contract release on top of the approved v0.3.0 identity work, update OpenAPI/events/fixtures together, and preserve identity and activation behavior.

1. Add an authoritative quote discriminator to authenticated `POST /api/v1/launches/prepare`, e.g. `quote: { asset: "SOL" | "USDC" | "AECO" }` alongside `draft`. Reject arbitrary mint input and unknown assets; resolve allowed mint, token program, decimals, cluster, protocol source and eligibility exclusively on the server. If preserving legacy omitted-quote requests, default only those explicit legacy requests to SOL, never an unsupported requested quote.
2. Publish typed quote capabilities (proposed `GET /api/v1/launches/quote-assets`, name to be agreed). Include mode, contract/network revision, each asset's availability/reason, verified mint/program/decimals when configured, eligibility provenance/check time, and separate preview/demo/live capability. Do not trust this cache at execution time: prepare/confirm must revalidate. AECO must not enable based on a frontend flag or a ticker alone.
3. Persist canonical quote identity on every new launch, and return it from prepare/get/confirm/events. Bind it to transaction bytes, launcher, metadata and idempotency fingerprint. Reusing an idempotency key with another quote must conflict, not create another launch. Once approved/submitted, forbid mutating quote or reviewed terms; edited drafts require a new preparation and approval.
4. Return a structured quote-aware cost breakdown: fixed platform charge `50000000` lamports to Platform Treasury; network and rent estimates in SOL; quote funding/buy amount, decimals and slippage in the actual quote asset if applicable. Never manufacture a token price or USD conversion. The frontend must compare response selection to requested selection before any future signing flow.
5. On confirmation/indexing, verify actual program instruction accounts, canonical quote mint/program, transaction outcome, fee transfer, sharing-config recipients/authority revocation and curve/pool quote identities. A mismatched quote is not a confirmed platform launch. Handle expired eligibility, migration-in-progress, unsupported networks, cancellation, blockhash expiry and failed transactions with structured errors. Preserve existing atomic launch-charge behavior and prevent duplicate pools.
6. Return verified quote metadata with discovery/detail launch records and market observations. Prices/volume/liquidity need asset, decimals, provenance and observation time. Only then wire real pair labels and quote filtering. Historical records lacking a verified decoded quote remain unknown; backfill only from verified chain/demo provenance. No automatic SOL assignment to unknown historical records.
7. Suggested errors: `quote_asset_unsupported`, `quote_asset_unconfigured`, `quote_asset_ineligible`, `quote_network_mismatch`, `quote_launch_program_unverified`, `quote_changed_after_approval`, `quote_mismatch`, `fee_routing_unverified`. Exact codes and response shapes remain Claude-owned.

## Persistence and treasury work — Claude

Existing launch `doc` JSON may carry the new canonical quote object; Claude decides whether indexed columns/migration are needed. Do not alter existing parcels, agent activation records or the one-token/one-agent/one-wallet constraints. Quote asset confers no privileges or rewards. Do not apply a forward-only migration during this frontend task.

`TreasuryEntry`/`AssetTotals` already have `assetMint`, `assetSymbol`, `decimals`, and integer-string amounts. The existing UI formats each receipt separately; the new presentation test checks that behavior. This does **not** establish backend non-SOL collection:

- `ObservedTransaction` currently normalizes SOL transfers/lamport deltas, not authoritative SPL/Token-2022 receipt deltas. Extend verification/indexing for actual quote-token transfers, mint/program/recipient ownership, finality, and reversals. Never infer fees from prices or trading volume.
- `TreasuryService.summary()` groups totals by asset, but its creator-fee reconciliation currently keys only by signature. Reconcile separately by distribution/signature **and asset mint/program/decimals**, with explicit rounding/dust rules using existing approved allocation math. Do not add USDC/AECO base units to lamports or to one another.
- Only eligible, actually verified receipts enter allocation. Preserve the fixed launch-charge stream at 100% Platform Treasury; eligible creator-fee receipts remain 6000/4000/0 bps in the asset received. Keep pending/finalized/reversed and mock-chain versus real receipts distinct. Do not settle, swap, custody, sign, or enable production routing.

## Validation and completion gates

Frontend checks cover SOL default, all three card identities and pair previews, disabled choices, unknown/stale preference rejection, explicit recovery, review invalidation, persistence/route changes, fixed fee disclosure, no invented pricing, read-only demo behavior, unavailable discovery quote metadata, mobile/tablet layout and per-asset receipt display. Existing SOL draft review remains compatible.

Still blocked on backend publication/verification: switching to a native USDC/AECO launch; exact quote mint/program request-to-transaction equality; wallet cancellation/failure/approval locking; server rejection of invalid quotes; actual fee collection/reconciliation for non-SOL assets; native pair labels/filtering for confirmed tokens. Those must be exercised against Claude's implementation, not frontend mocks presented as live completion.

Before enabling even a devnet signing flow: Claude must publish the agreed schemas and capabilities, pass protocol/eligibility/accounting tests for each quote, deploy compatible demo contracts in staging, and coordinate API/WSS/CORS/auth. Financial enablement still requires separate approval. No staging/production deployment is performed here.

## Proposed one-file Conventional Commit sequence (approval pending)

Each path must be inspected and staged explicitly; verify exactly one file in each commit. No screenshots, artifacts or unrelated camera/notes files.

1. `src/api/launchQuotes.ts` — `feat(launchpad): define guarded quote-asset draft choices`
2. `src/launch-quotes.css` — `style(launchpad): style responsive trading-pair cards`
3. `src/components/LaunchQuotePicker.tsx` — `feat(launchpad): add accessible quote-asset cards`
4. `src/components/Pages.tsx` — `feat(launchpad): retain quote preference and review pair requirements`
5. `src/components/Explore.tsx` — `fix(explore): disclose unavailable verified trading-pair data`
6. `src/api/launchQuotes.test.ts` — `test(launchpad): reject unsupported and malformed quote preferences`
7. `src/api/launchTreasury.test.ts` — `test(treasury): preserve received-asset denominations in the UI`
8. `tests/launch-quotes.spec.ts` — `test(launchpad): cover quote drafts persistence and responsive safety`
9. `tests/frontend.spec.ts` — `test(launchpad): scope the SOL review regression to its summary`
10. `MULTI_QUOTE_HANDOFF.md` — `docs(launchpad): specify multi-quote backend and verification handoff`

The isolated picker files precede their consumers; temporary integration limitations must be stated if any commit cannot build independently. No commit/push happens before plan approval. Never deploy this checkpoint as native multi-quote support.

## Validation completed for this frontend checkpoint

Before the subsequent ecosystem-content update: build, typecheck and lint passed; 101 frontend unit tests passed; the existing server API/treasury suites passed 27 tests using their isolated in-memory demo setup; all 7 quote browser checks passed against the local demo backend or explicitly labeled fixtures. Browser checks cover desktop/tablet/mobile persistence, unsupported saved preferences, guarded review, no API writes, and truthful unavailable pair metadata. No native multi-quote execution, quote-aware backend rejection, real wallet cancellation, or on-chain receipt routing is claimed. Those remain backend completion gates above.
