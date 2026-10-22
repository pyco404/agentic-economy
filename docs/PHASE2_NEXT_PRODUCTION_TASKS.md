# Remaining Phase 2 production work

**Deployment policy:** one permanent Railway `production` environment (frontend, backend/API, isolated PostgreSQL). Local tests/isolated Devnet verification → production build → explicit tested-commit production deployment → live verification. Staging promotion is not required. Migrations, secrets and financial activation are separate; legacy environments remain preserved pending verified retirement requirements and explicit deletion approval. [Release workflow](../infra/railway/README.md), [retirement audit](RAILWAY_SINGLE_PRODUCTION.md).

The public website may run with execution off before Mainnet launch acceptance is complete. DNS/website deployment does not authorize a transaction, treasury signing or payouts. Physical mobile on-chain acceptance remains deferred at the owner's request; do not restart its old gateway or request another signature.

## Mandatory restricted rollout before Phase 3

Public browsing remains open. Prepare the direct official $AECO launch using only the official deployer and exact reserved mint. No intermediate Mainnet test token is required. Rehearse the local mint-signing mechanism with a separate disposable Devnet mint, complete readiness/security, then obtain explicit final native-token parameter and exact-transaction approval. Verify its signing, fees, metadata, finality, Explore listing and automatic holder agents. Public token creation opens only after a further explicit owner approval and reviewed removal of the initial backend restriction. [Exact release sequence and backend gate](PRODUCTION_RELEASE_CHECKLIST.md).

## Mandatory official $AECO launch before Phase 3

The official planned mint is **`ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco`**, supplied by the owner after vanity-keypair generation. Preserve it exactly and do not allocate another official mint. [Launch/signing, treasury-reference and holder-indexing preparation](OFFICIAL_AECO_LAUNCH_PLAN.md). This records a planned identity, not a verified on-chain launch or Mainnet authorization.

The reserved deployer remains `3pF1MM1PCg2tekM5KeWEDyT8LVKbVd7ia668NRAnYpAR`. It must never substitute for Platform or Agent Rewards recipients. Current production treasury, SOL-only, 0.05 SOL and 60/40 rules remain unchanged. No official $AECO token has been launched by this deployment and no real transaction is authorized. The owner deliberately has not funded the deployer. Funding is not a website or infrastructure prerequisite; do not request it or repeat balance checks during preparation. Check balance only when the owner prepares to authorize the actual launch. Historical read-only observations are retained as evidence, not current deployment blockers.

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

## Direct official-mint checkpoint

Public-only construction, operator-bound draft reservation and the existing review-screen mint-signature handoff are deployed at application `5fa0507`; the official private key was never opened. [Operator workflow, deployed production handoff and remaining recovery gates](AECO_LOCAL_MINT_SIGNING.md). The intermediate Mainnet test proposal is withdrawn. [Direct official launch review and launch-time gates](DIRECT_AECO_LAUNCH_REVIEW.md). Wallet funding is intentionally deferred to the owner-initiated launch; no final transaction cost or signing request is approved. Program metadata matches the reviewed policy, and the representative 1% construction fits the existing frozen table and its Developer Buy coverage checks pass. Keep financial execution and public launching off.

Deployment follow-up: production frontend/API and staging frontend/API are now SUCCESS at `5fa0507`. Public HTTPS, API/database health and authenticated ordinary-wallet denial checks pass; no duplicate deployment or migration was requested. Earlier BUILD_IMAGE failures are historical, not current deployment blockers. Financial execution and holder indexing remain disabled. Before eventual execution, complete expiry/recovery/security acceptance and the owner-controlled final transaction review. No transaction is initiated or scheduled by a website deployment.
