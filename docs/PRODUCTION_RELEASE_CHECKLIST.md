# Phase 2 production release and official $AECO launch checklist

**Mandatory owner decision:** the official native $AECO token must launch through Agentic Economy's own production Launchpad on Solana Mainnet before Phase 2 closes and Phase 3 begins. Public website availability, test tokens and simulations cannot satisfy this gate. This checklist is not permission to activate execution, deploy $AECO, fund wallets or make payments.

## Required sequence

1. **Public website / restricted Launchpad — VERIFIED BROWSING; EXECUTION OFF.** Everyone may browse https://useaeco.xyz, Launchpad and Explore. Ordinary wallets cannot create Mainnet coins. The reviewed backend gate must be present in the production release before any execution is enabled. Website/DNS approval never authorizes financial activation.
2. **Mainnet production readiness and security — OPEN.** Complete backup restoration rehearsal, transaction/recovery/security/operational review and release regressions. Preserve deferred mobile evidence and track Pinata rotation accurately. Record independent-review limits honestly.
3. **Deployer-only controlled Mainnet test token — NOT APPROVED / NOT LAUNCHED.** Only `3pF1MM1PCg2tekM5KeWEDyT8LVKbVd7ia668NRAnYpAR` may launch. Separately approve exactly one test token's parameters, recipients, optional Developer Buy and maximum total debit before enabling its scoped execution. The owner personally signs through the production website. Verify actual Phantom signing, mint, metadata, exact debit/network costs, exactly one 0.05 SOL platform charge, creator-fee configuration, any approved Developer Buy, finalized transaction and Explore indexing. This is not permission for additional launches or public access.
4. **Deployer-only official $AECO launch — NOT APPROVED / NOT LAUNCHED.** Proceed only after step 3 succeeds. Separately approve every native-token parameter and cost below, and the specific transaction. The owner initiates and signs on https://useaeco.xyz using the same dedicated deployer. No silent deployment, simulated substitute or automated owner signature.
5. **Independent $AECO verification and automatic Common Agents — PENDING.** Verify mint/supply/metadata/fees/finality/Explore, then configure only the independently verified mint for read-only indexing. Every qualifying unique holder wallet receives one persistent Common Agent without connection/registration; agents must appear, move and perform basic simulated activities. Reconcile holder/agent counts and preserve identities across exits/re-entry/restarts. No custody or payouts.
6. **Open public TOKEN/SOL launching — NOT APPROVED.** Only after steps 3–5 and required release verification pass, request explicit owner approval for a separate release removing the initial deployer-only gate. Nothing automatically unlocks public launching after the test token, $AECO launch or indexer activation. Preserve unlimited intentional launches, no daily quotas/cooldowns/discretionary review, optional 0–3.5% Developer Buy, 0.05 SOL charge and 60/40 eligible creator-fee policy. Infrastructure concurrency, authentication, ownership and idempotency safeguards remain.
7. **Phase 2 completion / Phase 3 — BLOCKED.** Complete the sequence above and all release acceptance; explicitly preserve unresolved/deferred criteria. Phase 3 begins only afterward.

## Backend rollout permission gate

The fixed initial Mainnet launcher is the official deployer, never either treasury. `services/launch-permission.ts` checks the authenticated session wallet on production/Mainnet and also the network of saved attempts. No request field, environment flag, cached intent or confirmed $AECO record unlocks public access. Existing financial/network gates independently remain off until approved.

Both browser-cookie and legacy bearer preparation paths are guarded before idempotent replay. The shared launch service enforces the gate before mint allocation/construction, submission and resume, and rechecks before persisting signed payloads/broadcast. Artwork/metadata preparation and advertised capabilities respect the same policy. Historical read-only reconciliation remains available; it cannot rebroadcast. Devnet/localnet verification is unaffected.

This policy is a wallet-access gate, not transaction approval and not a per-wallet quota. Before Stage 2 activation, bind the separately approved one-test transaction to its reviewed durable launch intent/parameters/cost limit; leaving the deployer globally enabled is not approval for unlimited Mainnet tests. Stage 3 requires its own approval. Deploy this reviewed gate before enabling any production execution; do not promote unrelated changes or activate execution just to test the gate. No migrations are needed. [Automated policy and current production-off evidence](evidence/mainnet-deployer-policy-2026-10-22.json).

## Separate parameter approval before any launch

| Parameter | Current approval status |
| --- | --- |
| Supply | Not finalized or approved |
| Decimals | Not finalized or approved |
| Tokenomics, allocations and applicable controls | Not finalized or approved |
| Name, ticker, description, artwork, project links and pinned metadata | Final content not approved; $AECO identifies the planned native token |
| Launch configuration | TOKEN/SOL architecture required; exact launch settings need approval |
| Developer Buy | No allocation approved; explicitly choose within the existing optional 0–3.5% limit |
| Mainnet costs and maximum wallet debit | Fresh simulation and explicit approval required; no total estimate invented |

Verify that the protocol's actual supply/decimal constraints support the approved parameters before preparation. Existing SDK defaults and parameters used by other test tokens are not approval for $AECO. Stop if incompatible rather than silently substituting values.

Preserve the existing separate 0.05 SOL platform charge and eligible human-launch creator-fee split of 60% Agent Rewards / 40% Platform / 0% Launcher. Approval must show that charge, network fee, account rent, any approved Developer Buy/protocol costs, slippage ceiling and maximum total debit without double-counting. Re-simulate and seek new approval if material parameters, recipients or cost bounds change.

TOKEN/AECO pairing remains a later Phase 4 feature; creating the AECO token against SOL does not activate AECO quote pairs.

## Wallet and recipient integrity

- **Dedicated owner signing/deployer wallet:** `3pF1MM1PCg2tekM5KeWEDyT8LVKbVd7ia668NRAnYpAR`.
- **Platform Treasury:** `HmmnNqZbfUZ2YK4mWVLXEGTsAU2NUUAvFzLFxgdgKUT2`.
- **Agent Rewards Treasury:** `GEDMCV4WXHCAnySqH4CWNh3NYBrDfAUb3t4BBVBWVnJi`.

The deployer is never a substitute fee recipient. Do not request private keys/recovery phrases or copy signing material into services. Before signing, verify the production origin, Mainnet genesis, current programs/lookup table, exact signers/recipients and simulated instruction effects. Any required wallet funding needs separate authorization. Agents receive no custody or signing authority.

## Evidence required after the owner signs

- [ ] Preserve approved parameters, simulation and maximum debit with the production attempt/draft identifiers.
- [ ] Reconcile the original transaction signature to finalized Mainnet status with no execution error. If uncertain/interrupted, recover the same saved attempt; never create another $AECO token or charge again before reconciliation.
- [ ] Independently verify mint account/program, approved supply and decimals, relevant authorities/tokenomics and any approved Developer Buy amount/token balance/cost. Match the approved mint and dedicated deployer; a matching ticker/name alone does not establish official $AECO identity.
- [ ] Retrieve the actual metadata/artwork, verify CIDs/URIs and approved content, and match them to the minted token.
- [ ] Verify exactly one 0.05 SOL platform receipt to the official Platform Treasury and the actual 60/40 eligible creator-fee configuration/recipients. Exclude protocol fees, rent, LP fees, funding and simulated Credits. No unapproved collection or payout is part of this check.
- [ ] Verify the durable confirmed launch, mint/signature/network/provenance, idempotency/recovery record and unique platform-charge ledger entry agree with on-chain evidence.
- [ ] Open the official token detail page in Explore, verify its mint/signature/metadata and confirmed platform provenance. Show unavailable market fields honestly; do not invent price, volume or income.
- [ ] Attach evidence and explicitly accept the official launch before marking Phase 2 completed or unblocking Phase 3.

No authoritative $AECO mint, supply, metadata URI, finalized launch signature or launch date is recorded yet. Populate these only from the approved real launch. [Remaining production tasks](PHASE2_NEXT_PRODUCTION_TASKS.md), [current status](PHASE2_STATUS.md), [per-token Common Agent plan](COMMON_AGENT_PER_TOKEN_PLAN.md).

## Automatic Common Agents — mandatory Phase 2 release gate

- [ ] Separately authorize and verify the official $AECO launch before configuring its real mint. No placeholder mint or feature flag grants Mainnet launch approval.
- [ ] Enable read-only indexing only after reviewed mint/network verification and provider capacity checks.
- [ ] Reconcile finalized token accounts by owner and exclude reliably identified non-user recipients.
- [ ] Verify one persistent Common Agent per positive-balance qualifying $AECO wallet, without login, registration, activation or site visit.
- [ ] Verify partial sales, transfers, full exits, re-entry, restart and interrupted reconciliation preserve identities.
- [ ] Verify public movement, agent selection and accurate holder/Common Agent counts against the real mint.
- [ ] Confirm no wallet controls, economic permissions or real payouts follow from discovered ownership.
- [ ] Confirm all earlier Phase 2 security/Launchpad release gates; only then close Phase 2. Phase 3 expands the same identities with separately authorized advanced/economic capabilities.

Implementation, Gamine reuse audit, fixture evidence and operational limits: [Automatic Common Agents](AECO_COMMON_AGENTS.md).
