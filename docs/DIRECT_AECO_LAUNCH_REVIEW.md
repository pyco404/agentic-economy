# Direct official $AECO launch — preparation, not execution approval

Owner decision, 22 October 2026: **$AECO is the first official Mainnet launch. No intermediate Mainnet test token is required.** Do not request or create that superseded test token. Public launching and Phase 3 remain blocked until the official launch, holder/Common Agent verification, release acceptance and separate public-opening approval.

## Owner-operated Create Coin

The owner enters the name, ticker, description, artwork and project links through the existing Create Coin interface at https://useaeco.xyz. The owner selected **1% Developer Buy** and will select it personally in the form. Do not pre-fill metadata, artwork or that selection. Ordinary forms default to 0%, permit 0–3.5%, and restore only the authenticated owner's saved inputs. No separate native-token wizard or developer-authored token draft was created. Ordinary form fields need no separate chat approval; the owner reviews the complete transaction. The separate final Mainnet activation/transaction authorization remains required.

| Role | Public address |
| --- | --- |
| Exact planned mint | `ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco` |
| Authorized Phantom deployer | `3pF1MM1PCg2tekM5KeWEDyT8LVKbVd7ia668NRAnYpAR` |
| Platform Treasury | `HmmnNqZbfUZ2YK4mWVLXEGTsAU2NUUAvFzLFxgdgKUT2` |
| Agent Rewards Treasury | `GEDMCV4WXHCAnySqH4CWNh3NYBrDfAUb3t4BBVBWVnJi` |

The owner-supplied name is **Agentic Economy**, ticker **AECO**, pair **AECO/SOL**. Descriptions, artwork, pinned metadata and tokenomics are not supplied by this document. The official private mint key was never opened, copied, uploaded or used for a test. The vanity mint was not generated again.

## Protocol and read-only findings

The current `create_v2` accepts the mint as an independent signer and the user as transaction payer/signer; it does not require a newly generated server key. Token-2022 and six decimals are protocol constraints, not free-form Launchpad settings. The current Mainnet Global reports supply **1,000,000,000 tokens** (`1000000000000000` base units). These observations need owner acceptance in the final launch review, not a silent tokenomics choice. [Official protocol account/instruction documentation](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md).

Finalized Mainnet reads found the planned mint account absent and the deployer balance **0 lamports**, slot 460144627. This is a point-in-time account observation, not a created token or a permanent mint reservation on-chain. All four reviewed external program identities/slots/upgrade authorities match policy. The current Mainnet lookup table is active/frozen and satisfies the existing Developer Buy coverage guard.

At Mainnet Global/fee snapshot slot **460146860**, the same exact integer quote calculation used by the Launchpad gives:

| Item | Observed calculation |
| --- | --- |
| 1% Developer Buy | 10,000,000 tokens (`10000000000000` base units) |
| Buy estimate, including protocol/creator fees | 285,747,885 lamports = **0.285747885 SOL** |
| Buy instruction cap, including existing 1% quote headroom | 288,605,364 lamports = **0.288605364 SOL** |
| Separate platform charge | Exactly 50,000,000 lamports = **0.05 SOL**, once |
| Network fee and rent | Must be measured from the actual owner-entered metadata transaction |
| Final expected/maximum wallet debit | **Not established or approved** |

These are **Mainnet** quote observations, not the much lower Devnet test prices. The buy cap excludes the platform charge, rent and network fee. No displayed total omits those costs. Do not fund, sign or activate from this estimate. Refresh Global/fee state, programs/table/mint absence and funded-payer simulation for the actual pinned metadata before presenting a final debit.

Capacity construction using the exact public mint/deployer/treasuries and a clearly marked, unpinned placeholder metadata URI fit in 1,184 bytes. This is not the final transaction or a successful Mainnet simulation. The actual metadata URI and fee recipients must pass again. Neither a placeholder nor a public snapshot is saved to the owner's form.

The existing atomic transaction includes the platform transfer, creation, 60/40 creator-fee sharing configuration and optional exact-token Developer Buy. Eligible creator fees route 60% Rewards / 40% Platform / 0% Launcher. This is construction verification; no Mainnet sharing configuration, receipt or collected income exists yet for the uncreated mint. Protocol fees and rent are separate.

## Signing rehearsal and candidate implementation

The existing review screen now supports an operator-bound reserved draft and export/import of **public** signing artifacts. The optional backend `PUMP_PREPARED_MINT_DRAFT_ID` binds only the owner's existing draft UUID. It does not populate inputs, contain a key or activate execution. No live binding was set. Initial Mainnet preparation refuses a missing binding instead of allocating a random official mint. The normal non-Mainnet reusable flow retains random mint generation.

The original unsigned review is saved in the existing launch document and unique mint reservation. The operator-local tool signs only the mint after approval of the exact message hash; the website imports only the public signature artifact. Backend ownership, strict byte/hash/signature validation, current reservation/network/height/mint checks and independent financial gates protect the handoff. Phantom signs the unchanged message separately. Both signatures are persisted before broadcast by the existing recovery mechanism. No migration is needed.

A disposable mint rehearsal against **actual public-Devnet simulation** passed with 1% Developer Buy: the mint-only signature and repeated artifact import validated; simulated 10,000,000 tokens reached the payer's token account; exactly one 0.05 test-SOL platform transfer occurred in simulation; post-simulation mint/freeze authorities were null and decimals six. The fee payer never signed, no transaction was broadcast and the simulated mint does not exist on-chain. A separate fixture verifies the second signer and full submission/recovery message checks. This is not a new real Phantom or finalized on-chain launch claim, and it does not reopen the deferred physical mobile test.

Developer Buy signing reviews pin allowed protocol recipients so the SDK's random selection cannot change reconstruction bytes. A changed attempt, mint, message, treasury, network, signature or operator draft binding fails closed. The unique mint row/local journal block a different attempt or automatic replacement. Expired reserved attempts do not offer automatic re-creation. [Operator procedure and remaining expiry limits](AECO_LOCAL_MINT_SIGNING.md).

## Live release and remaining blockers

- Public HTTPS browsing and the approved frontend remain healthy. Production frontend release: `d5d3d7cb56db6e0baff4a5fa4605a1a9caa6522b`. Fresh desktop/folded/unfolded/tablet browser navigation and persistent-world checks passed. The new local-signing UI is a candidate change, not yet a verified live production feature.
- Production API still actively serves `6758f91bd2e8a69c242584133f0e5932b862bf7e`. Its attempted gate update `2d6818776f41bfe58eac301a6e0932b77fcff9c3` failed during Railway BUILD_IMAGE, with no actionable cause beyond the generic image failure and builder-start log. Staging's earlier `7be7be4` attempt failed similarly. Do not claim the new deployer gate or handoff is live until an actual compatible release passes health, authenticated denial and browser checks. No duplicate retry of these failed deployment IDs was requested.
- `aeco_production` is isolated, healthy and matches migrations 001–004; there are no pending migrations. No database or treasury setting changed. Mainnet launch/approval/fee-routing gates remain false; no treasury signer or payout service is configured.
- Complete funded-payer simulation with the owner's actual metadata and UI-selected 1%. The zero-balance deployer prevents a successful final simulation/quote now. No funding transaction is authorized by this task.
- Finish the short-blockhash expiry/renewal operational procedure and final recovery/security acceptance before execution. No automatic journal release or replacement message is implemented; do not bypass the reservation. Record independent security-review limitations.
- Obtain explicit final approval of protocol supply/decimals/authorities, metadata, 1% amount, exact transaction, recipients and total maximum debit **before making execution possible**. This document is not that approval.

The existing holder indexer is prepared for the exact official mint but remains off. After independently finalized official launch/provenance acceptance, activate reviewed mint-specific observation and verify real holder/agent reconciliation. One qualifying wallet produces one persistent Common Agent; 400 wallets sharing the same mint produce 400 agents. No wallet connection/registration/control privileges are inferred. Live Mainnet scan completeness, exclusions and real population reconciliation remain acceptance items.

Evidence: [direct-launch checks](evidence/direct-aeco-preparation-2026-10-22.json). Superseded proposal: [historical intermediate-test preparation](CONTROLLED_MAINNET_TEST_PREPARATION.md). Current required sequence: [production release checklist](PRODUCTION_RELEASE_CHECKLIST.md).
