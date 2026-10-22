# Remaining Phase 2 production work

The public website may run with execution off before Mainnet launch acceptance is complete. DNS/website deployment does not authorize a transaction, treasury signing or payouts. Physical mobile on-chain acceptance remains deferred at the owner's request; do not restart its old gateway or request another signature.

## Mandatory restricted rollout before Phase 3

Public browsing remains open. Before the official native token, complete one separately approved controlled Mainnet test token using only the official deployer. Verify its signing, fees, metadata, finality and Explore listing. Then separately approve and verify the deployer-only $AECO launch and automatic holder agents. Public token creation opens only after a further explicit owner approval and reviewed removal of the initial backend restriction. [Exact release sequence and backend gate](PRODUCTION_RELEASE_CHECKLIST.md).

## Mandatory official $AECO launch before Phase 3

The official planned mint is **`ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco`**, supplied by the owner after vanity-keypair generation. Preserve it exactly and do not allocate another official mint. [Launch/signing, treasury-reference and holder-indexing preparation](OFFICIAL_AECO_LAUNCH_PLAN.md). This records a planned identity, not a verified on-chain launch or Mainnet authorization.

The reserved deployer remains `3pF1MM1PCg2tekM5KeWEDyT8LVKbVd7ia668NRAnYpAR`. It must never substitute for Platform or Agent Rewards recipients. Current production treasury, SOL-only, 0.05 SOL and 60/40 rules remain unchanged. No official $AECO token has been launched by this deployment and no real transaction is authorized. A [read-only finalized Mainnet checkpoint](evidence/aeco-deployer-readonly-2026-10-22.json) found the reserved deployer balance at 0 lamports and no signatures in the bounded recent-history query. This is not an exhaustive mint/history audit. Any eventual funding and real transaction need separate authorization; no funds were moved.

Phase 2 completes only after this real Mainnet launch is initiated and approved by the owner through useaeco.xyz and independently verified. Phase 3 is blocked until then. [Mandatory production release sequence](PRODUCTION_RELEASE_CHECKLIST.md). Supply, decimals, tokenomics, metadata, launch configuration, Developer Buy and all transaction costs remain separately unapproved; existing protocol defaults are not owner approval. TOKEN/AECO pairing stays Phase 4.

Before preparing its signing request, reconcile any existing official launch record, confirm the owner-approved token details/artwork/links and Developer Buy choice, re-attest live program/lookup-table and treasury configuration, produce an unsigned simulated transaction and exact maximum debit, then obtain separate transaction/activation approval. Do not invent a mint, copy a Gamine secret, fund a wallet, or silently create an official draft. Keep signature collection and broadcasting disabled until that approval.

## Agent identity and activation audit

Confirmed launches durably register communities/HQs but do not yet reserve a separate unactivated token-agent identity. Current `AgentService.activate` combines identity creation with verified activation and remains demo-only. The correct rule is **one distinct agent identity per token, at most one activated token-linked agent per wallet**. Unlimited launches must never reuse the first token's identity or automatically grant control.

Migration 003's `UNIQUE(activating_wallet)` is correctly scoped to activations and must remain. The earlier proposal to remove it is withdrawn. The smallest candidate adds a separate per-token identity registry, preserves existing activated IDs and binds activation to that token's identity. [Corrected audit, Gamine reuse and review-only schema candidate](COMMON_AGENT_PER_TOKEN_PLAN.md). No migration is applied or authorized; backup restoration, copied-data rehearsal and compatible application changes precede separate approval.

Automatic $AECO Common Agents are a different network/mint/holder-wallet mapping, already durable in the simulation journal/snapshots. They bypass activation reservations intentionally and grant no owner controls. Four hundred holders of one mint produce four hundred identities, including holders who already have a token-linked activation. Existing Gamine-compatible deduplication is reused without importing Gamine's different activation policy.

## Financial activation gates

Complete actual isolated backup restoration, final recovery/security/operational review and remaining release regressions. Keep Pinata rotation tracked as pending maintenance without requiring an upgrade. Record independent-review limitations honestly. Obtain separate Mainnet activation approval, then separately authorize any controlled real transaction. Do not enable payouts or begin Phase 3 as part of website availability.

## Updated automatic Common Agent scope

Phase 2 additionally requires automatic one-per-$AECO-holder Common Agents, basic movement and reconciled public counts after the official mint is launched and verified. No login or manual activation is needed. Phase 3 expands those same identities. [Implementation and remaining acceptance](AECO_COMMON_AGENTS.md). Token-linked identity provisioning remains separate from holder appearance and must preserve one verified token-linked activation per wallet.

## Prepared-mint and controlled-test checkpoint

Public-only construction and local mint co-signing are prepared; the official private key was never opened. [Operator workflow, remaining production handoff and recovery gates](AECO_LOCAL_MINT_SIGNING.md). [Controlled Mainnet test proposal, packet verification and cost blockers](CONTROLLED_MAINNET_TEST_PREPARATION.md). The deployer currently has zero Mainnet SOL; no final transaction cost or signing request is approved. Program metadata matches the reviewed policy, and the representative no-buy construction fits the existing frozen table. Keep financial execution and public launching off.

Deployment follow-up: the preparation build `7be7be4` and a narrow production gate promotion of the previously healthy `2d68187` both failed in Railway `BUILD_IMAGE` without Docker/application diagnostics. Production continues serving API `6758f91`, so deployer-only policy is tested on main but not verified live; execution remains disabled for everyone. Resolve image building before activation or requesting a Mainnet signature. [Exact final checkpoint](CONTROLLED_MAINNET_TEST_PREPARATION.md#final-deployment-checkpoint--blocked-existing-website-healthy).
