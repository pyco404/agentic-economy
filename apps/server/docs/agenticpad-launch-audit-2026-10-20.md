# AgenticPad launch audit and targeted reuse

> Status correction, 22 October 2026: **Phantom desktop Developer Buy VERIFIED** — Zappercoin ($ZAP), 2%, exactly 20,000,000 tokens. Finalized Devnet transaction and database receipt independently checked. Physical mobile remains unverified. Older pending-desktop wording below is historical and superseded; no repeat desktop transaction is requested. [Acceptance evidence](phantom-desktop-developer-buy-2026-10-22.md) · [Current Phase 2 priorities](phase2-sol-only-acceptance.md). USDC is outside current scope.

20 October 2026. Reference repository: `/home/pikoo/Desktop/Oxude`; frontend project `web/` is named `agenticpad-web`. Oxude was read-only throughout: no installation, source change, database change, deployment, secret import or push. Its tests used a temporary config and cache directory outside Oxude.

## HOME reconciliation comes first

The preserved HOME draft is `dcb1bbfc-a1ce-40a5-a1c1-3572375209db`, version 5, with a 300-basis-point requested purchase. Its two launch attempts are `lch_31963308e0804ebe2d4903a6` and `lch_d4a0ff36249a0f998aed8891`. Both are expired, with no stored signature, submission transition, community or fee receipt. Their preparation idempotency operations are done; that does not mean a coin launched.

Finalized public Devnet reads found neither mint account nor any mint transaction history. Neither HOME holding nor a corresponding new wallet transaction was observed. There is no observed HOME launch, purchase, platform charge or failed transaction/network fee to recover into Explore. See the [detailed reconciliation](../../web/docs/home-devnet-reconciliation-2026-10-20.md). No new HOME, signature request or public transaction was initiated during this audit.

The historical Phantom result cannot be conclusively reconstructed: the browser did not retain its signed payload/public signature or the failed API response. The generic error hid the actual HTTP rejection. The disabled verification broadcaster is a separate outstanding gate, not proof of the historical failure, because no submitted signature was persisted before reaching it.

## Feature comparison

Paths in the AgenticPad column are relative to Oxude. Classifications describe compatibility with Agentic Economy, not a claim of independent mainnet verification.

| Component | AgenticPad reference | Classification and decision |
| --- | --- | --- |
| Token creation | `web/lib/pump-transaction.ts` | Reusable with adaptation: same create_v2, Token-2022, v0 transaction, mint partial signature and atomic instructions. Economy already uses SDK 4.1.0 and supports quote-aware verification; retain its builder. |
| SDK / program integration | `web/lib/pump-sdk.ts` | Already implemented equivalently: server-side CommonJS SDK loading. Pad launch SDK is installed at 2.0.0; do not downgrade Economy. |
| Phantom signing | `web/lib/wallet.ts:signTransactionWith` | Reusable with adaptation: injected-provider v0 signing, preserve mint signature. Economy already supports Wallet Standard plus injected v0 fallback, account switching and server signature verification. Retain these. |
| Shared address tables | `web/lib/pump-transaction.ts:commonLookupAddresses`, `web/scripts/setup-pump-lookup-table.ts` | Reusable with adaptation: shared static-account tables, exclude dynamic signer/mint accounts, packet size <=1232. Economy already checks Developer Buy account coverage; retain its separately approved Devnet table. |
| Simulation / fees | `web/lib/launchpad-server.ts:prepareLaunch` | Already implemented better in Economy: exact buy amount and spending ceiling, simulated token receipt and actual rent. Pad's old 0.1 SOL fee is incompatible; retain Economy's 0.05 SOL fee. |
| Initial purchase | `web/lib/pump-transaction.ts:launchInstructions` | Reusable with adaptation: atomic create+lock+buy+charge concept. Pad selects a SOL budget, not an allocation percentage. Its code cannot substitute for Economy's exact 0–350 bps cap. |
| Durable submission | `web/lib/launchpad-server.ts:submitLaunch`, `web/lib/launchpad-store.ts` | Reusable with adaptation: persist signed bytes and signature before broadcast. Economy already saves signature/state before RPC and has PostgreSQL optimistic concurrency; do not import SQLite or single-host assumptions. Full signed-payload replay remains a separate gap. |
| Browser recovery | `web/lib/launchpad-client.ts` | Reusable with adaptation: save pending state before POST and block a second launch. Prior local Economy fixes now preserve public signature and uncertainty across refresh and preserve HTTP errors. Exact signed-byte replay is not newly enabled. |
| Expiry reconciliation | `web/lib/launchpad-server.ts:statusOfLaunch` | Adapted: finalized block-height expiry is insufficient without finalized mint absence. This audit adds the mint-absence guard to Economy submission and status refresh. RPC failure, unavailable reader or existing mint leaves the record unchanged and returns a recovery error. |
| Fee sharing / network policy | `web/lib/launchpad-config.ts`, `web/lib/launchpad-fees.ts` | Outdated/incompatible product policies: Pad uses mainnet only, 0.1 SOL and 15/50/35. None imported. Economy retains safe-network-only execution, separate 0.05 SOL charge and locked 60/40 human creator fees. |
| Image / metadata | `web/lib/launchpad-server.ts` | Already implemented better for Economy's flow: authenticated deferred V3 Pinata uploads and owned PostgreSQL drafts. Do not copy legacy upload endpoints or credentials. |
| Registration / discovery | `web/lib/launchpad-server.ts:statusOfLaunch`, `listPumpTokens` | Reusable verification concept already implemented: only list after actual transaction and locked routing verification. Economy additionally verifies exact prepared message, purchase and provenance. HOME's omission is correct. |

## Protocol compatibility

Both builders use the official Pump program `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`, Pump Fees `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ`, Token-2022 and create_v2. Both require creator and mint signatures and preserve identical message bytes through wallet signing. Fee recipients must come from live protocol state, never copied old constants.

Current official [coin-creation documentation](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md) describes native SOL defaults, optional non-native quote accounts and disabled cashback for new coins. Its [creator-sharing documentation](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/CREATOR_FEE_SHARING.md) remains the protocol reference. Program behavior was tested against a fresh local clone of public Devnet programs; no claim of immutable mainnet binary equivalence is made.

SOL launches are the verification target. USDC remains gated pending complete public acceptance; AECO remains future. No old treasury addresses, launch fees, mainnet enablement, signing keys or payout code were copied.

## Tests and evidence

- AgenticPad: 33 tests passed across `web/test/pump.test.ts`, `launch-service.test.ts`, `wallet-sign-in.test.ts`. RPC, IPFS and chain confirmations are mocked. Its documentation explicitly says a real mainnet smoke launch had not been performed by that implementation. A separate documented payout is not proof of a compatible launch or Developer Buy.
- Economy: 56 targeted backend tests passed across execution, finality, Developer Buy, builder, chain verification and market readers. This includes cap/rounding validation, exact-message signatures, duplicate protection, ownership, interrupted RPC recovery and the new finalized mint checks.
- Nine deployment/bundle tests passed. An initial broad sandbox run encountered process-spawn EPERM errors; the deployment tests were rerun successfully outside that restricted process sandbox. A first AgenticPad test invocation used the wrong working directory/cache location; the corrected read-only invocation passed.
- Fresh isolated validator: zero-buy, 3% and 3.5% launches passed. The latter two received exactly 30,000,000 and 35,000,000 tokens respectively. Each used one atomic transaction and exactly one 50,000,000-lamport platform receipt; duplicate submission did not create another receipt. Real local account balances, authenticated Pump events, locked 60/40 routing and Explore chain metrics matched.
- Local 3% cost: 8,736,818 lamports including 107,863 Pump fees. Local 3.5% cost: 10,242,053 lamports including 126,446 Pump fees. These are local test results, not charges to the HOME wallet.
- A deliberately failing final protocol instruction rolled back mint creation and kept the platform balance unchanged on the isolated validator. Local network fees may still apply.
- Workspace build, typecheck and lint passed; lint retains two pre-existing frontend ref-cleanup warnings.

[Sanitized local transaction evidence](evidence/agenticpad-reuse-local-2026-10-20.json) records the local genesis, signatures, token receipts, fee amounts and checks. Local signatures are not public Devnet Explorer receipts. Pinata used mocked CIDs and memory storage; this run does not prove PostgreSQL restart durability, actual Pinata upload or real Phantom Developer Buy.

## Remaining release / Phase 2 gates

The public Phantom Developer Buy acceptance remains incomplete: the HOME attempts expired, and no historical signed payload is available. Its exact rejection needs captured browser diagnostics on a separately authorized future test. The isolated broadcaster stays disabled; no funded public launch was authorized by this audit. No automatic retry is introduced.

Economy still lacks AgenticPad-style durable storage and controlled replay of the exact signed payload across a lost pre-persistence request. This audit deliberately strengthens read-only recovery and blocks retries rather than enabling new replay paths without their full persistence/security tests.

Production, mainnet, payouts and Railway financial settings remain unchanged. Staging migrations 001–004 were audited read-only over SSH and match all local checksums; no migration is pending or applied. Production has no repository deployment triggers. The authorized release includes the earlier five one-file HOME recovery commits plus this audit's granular changes. Intermediate commits are not independently certified; the complete series is validated together.
