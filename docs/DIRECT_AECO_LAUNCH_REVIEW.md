# Direct official $AECO launch — preparation, not execution approval

Owner decision, 22 October 2026: **$AECO is the first official Mainnet launch. No intermediate Mainnet test token is required.** Do not request or create that superseded test token. Public launching and Phase 3 remain blocked until the official launch, holder/Common Agent verification, release acceptance and separate public-opening approval.

## Owner-operated Create Coin

The owner enters the name, ticker, description, artwork and project links through the existing Create Coin interface at https://useaeco.xyz. The owner chooses **any Developer Buy from 0% to 3.5% inclusive, in 0.01% increments**, personally in the form. The earlier 1% preference is not a requirement or preset. Do not pre-fill metadata, artwork or that selection. All forms, including $AECO, default to 0%, permit 0–3.5%, and restore only the authenticated owner's saved inputs. No separate native-token wizard or developer-authored token draft was created. Ordinary form fields need no separate chat approval; the owner reviews the complete transaction. The separate final Mainnet activation/transaction authorization remains required.

| Role | Public address |
| --- | --- |
| Exact planned mint | `ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco` |
| Authorized Phantom deployer | `3pF1MM1PCg2tekM5KeWEDyT8LVKbVd7ia668NRAnYpAR` |
| Platform Treasury | `HmmnNqZbfUZ2YK4mWVLXEGTsAU2NUUAvFzLFxgdgKUT2` |
| Agent Rewards Treasury | `GEDMCV4WXHCAnySqH4CWNh3NYBrDfAUb3t4BBVBWVnJi` |

The owner-supplied name is **Agentic Economy**, ticker **AECO**, pair **AECO/SOL**. Descriptions, artwork, pinned metadata and tokenomics are not supplied by this document. The official private mint key was never opened, copied, uploaded or used for a test. The vanity mint was not generated again.

## Protocol and read-only findings

The current `create_v2` accepts the mint as an independent signer and the user as transaction payer/signer; it does not require a newly generated server key. Token-2022 and six decimals are protocol constraints, not free-form Launchpad settings. The current Mainnet Global reports supply **1,000,000,000 tokens** (`1000000000000000` base units). These observations need owner acceptance in the final launch review, not a silent tokenomics choice. [Official protocol account/instruction documentation](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md).

A historical finalized Mainnet read found the planned mint account absent at slot 460144627. The owner intentionally has not funded the deployer; that is not a deployment or infrastructure blocker. Do not repeat balance checks or request funding during infrastructure preparation. This is a point-in-time account observation, not a created token or a permanent mint reservation on-chain. All four reviewed external program identities/slots/upgrade authorities match policy. The current Mainnet lookup table is active/frozen and satisfies the existing Developer Buy coverage guard.

Historical **1% illustration only**, not a locked selection or current approved quote: at Mainnet Global/fee snapshot slot **460146860**, the same exact integer quote calculation used by the Launchpad gives:

| Item | Observed calculation |
| --- | --- |
| 1% Developer Buy | 10,000,000 tokens (`10000000000000` base units) |
| Buy estimate, including protocol/creator fees | 285,747,885 lamports = **0.285747885 SOL** |
| Buy instruction cap, including existing 1% quote headroom | 288,605,364 lamports = **0.288605364 SOL** |
| Separate platform charge | Exactly 50,000,000 lamports = **0.05 SOL**, once |
| Network fee and rent | Must be measured from the actual owner-entered metadata transaction |
| Final expected/maximum wallet debit | **Not established or approved** |

These are **Mainnet** quote observations, not the much lower Devnet test prices. The buy cap excludes the platform charge, rent and network fee. No displayed total omits those costs. Do not fund, sign or activate from this estimate. When the owner initiates the actual launch review, refresh Global/fee state, programs/table/mint absence, simulation and complete costs for the actual pinned metadata. Check wallet balance only at that owner-authorized launch stage.

Capacity construction using the exact public mint/deployer/treasuries and a clearly marked, unpinned placeholder metadata URI fit in 1,184 bytes. This is not the final transaction or a successful Mainnet simulation. The actual metadata URI and fee recipients must pass again. Neither a placeholder nor a public snapshot is saved to the owner's form.

The existing atomic transaction includes the platform transfer, creation, 60/40 creator-fee sharing configuration and optional exact-token Developer Buy. Eligible creator fees route 60% Rewards / 40% Platform / 0% Launcher. This is construction verification; no Mainnet sharing configuration, receipt or collected income exists yet for the uncreated mint. Protocol fees and rent are separate.

## Signing rehearsal and deployed integration

The existing review screen now supports an operator-bound reserved draft and export/import of **public** signing artifacts. The optional backend `PUMP_PREPARED_MINT_DRAFT_ID` binds only the owner's existing draft UUID. It does not populate inputs, contain a key or activate execution. No live binding was set. Initial Mainnet preparation refuses a missing binding instead of allocating a random official mint. The normal non-Mainnet reusable flow retains random mint generation.

The original unsigned review is saved in the existing launch document and unique mint reservation. The operator-local tool signs only the mint after approval of the exact message hash; the website imports only the public signature artifact. Backend ownership, strict byte/hash/signature validation, current reservation/network/height/mint checks and independent financial gates protect the handoff. Phantom signs the unchanged message separately. Both signatures are persisted before broadcast by the existing recovery mechanism. No migration is needed.

A disposable mint rehearsal against **actual public-Devnet simulation** passed with 1% Developer Buy: the mint-only signature and repeated artifact import validated; simulated 10,000,000 tokens reached the payer's token account; exactly one 0.05 test-SOL platform transfer occurred in simulation; post-simulation mint/freeze authorities were null and decimals six. The fee payer never signed, no transaction was broadcast and the simulated mint does not exist on-chain. A separate fixture verifies the second signer and full submission/recovery message checks. This is not a new real Phantom or finalized on-chain launch claim, and it does not reopen the deferred physical mobile test.

Developer Buy signing reviews pin allowed protocol recipients so the SDK's random selection cannot change reconstruction bytes. A changed attempt, mint, message, treasury, network, signature or operator draft binding fails closed. The unique mint row/local journal block a different attempt or automatic replacement. Expired reserved attempts do not offer automatic re-creation. [Operator procedure and explicit expiry renewal](AECO_LOCAL_MINT_SIGNING.md).

## Production release and separate launch-time gates

- Production frontend and API are both **SUCCESS at `5fa0507167695df96d57cecd332a45e9422209b2`**. Frontend deployment `2de54da5-8ac0-472e-85b0-db56533be625`; API deployment `4a7f0533-98db-4e93-a47d-f0bcad9b237d`. Staging runs the same application SHA. The public domain serves the new bundle; no DNS change or duplicate build was required.
- Live authenticated ordinary-wallet requests receive 403 for legacy preparation, browser preparation/metadata, submission, resume and local mint-signature import. This verifies the deployed access gate without a blockchain signature or transaction.
- `aeco_production` is isolated, healthy and matches migrations 001–004; no pending migrations. Treasury settings are unchanged. Mainnet launch/approval/fee-routing gates remain false; no treasury signer or payout service is configured.
- Website deployment is complete independently of the future token launch. Wallet funding is exclusively the owner's decision. No funding request, repeated balance check, scheduled launch or automatic signing/broadcast belongs to infrastructure preparation.
- Expired unsigned signing reviews now renew explicitly on the same mint/attempt only after finalized expiry, mint absence, empty history and no signed receipt. The immutable initial local reservation and append-only renewal journal require fresh hash/predecessor approval. Bound official unsigned preparation is separate from financial execution; ordinary wallets remain denied. See the current production-readiness acceptance report for deployed verification.
- When the owner decides to launch, they enter their own metadata/artwork, choose their allocation, review protocol supply/decimals/authorities, recipients, fresh simulation and complete maximum debit, and explicitly approve the exact transaction. Wallet balance is checked then. No current quote is an activation approval.

The existing holder indexer is prepared for the exact official mint but remains off. After independently finalized official launch/provenance acceptance, activate reviewed mint-specific observation and verify real holder/agent reconciliation. One qualifying wallet produces one persistent Common Agent; 400 wallets sharing the same mint produce 400 agents. No wallet connection/registration/control privileges are inferred. Live Mainnet scan completeness, exclusions and real population reconciliation remain acceptance items.

Evidence: [direct-launch checks](evidence/direct-aeco-preparation-2026-10-22.json). Superseded proposal: [historical intermediate-test preparation](CONTROLLED_MAINNET_TEST_PREPARATION.md). Current required sequence: [production release checklist](PRODUCTION_RELEASE_CHECKLIST.md).
