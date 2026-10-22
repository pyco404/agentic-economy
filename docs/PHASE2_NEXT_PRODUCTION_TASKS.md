# Remaining Phase 2 production work

The public website may run with execution off before Mainnet launch acceptance is complete. DNS/website deployment does not authorize a transaction, treasury signing or payouts. Physical mobile on-chain acceptance remains deferred at the owner's request; do not restart its old gateway or request another signature.

## Mandatory official $AECO launch before Phase 3

The reserved deployer remains `3pF1MM1PCg2tekM5KeWEDyT8LVKbVd7ia668NRAnYpAR`. It must never substitute for Platform or Agent Rewards recipients. Current production treasury, SOL-only, 0.05 SOL and 60/40 rules remain unchanged. No official $AECO token has been launched by this deployment and no real transaction is authorized. A [read-only finalized Mainnet checkpoint](evidence/aeco-deployer-readonly-2026-10-22.json) found the reserved deployer balance at 0 lamports and no signatures in the bounded recent-history query. This is not an exhaustive mint/history audit. Any eventual funding and real transaction need separate authorization; no funds were moved.

Phase 2 completes only after this real Mainnet launch is initiated and approved by the owner through useaeco.xyz and independently verified. Phase 3 is blocked until then. [Mandatory production release sequence](PRODUCTION_RELEASE_CHECKLIST.md). Supply, decimals, tokenomics, metadata, launch configuration, Developer Buy and all transaction costs remain separately unapproved; existing protocol defaults are not owner approval. TOKEN/AECO pairing stays Phase 4.

Before preparing its signing request, reconcile any existing official launch record, confirm the owner-approved token details/artwork/links and Developer Buy choice, re-attest live program/lookup-table and treasury configuration, produce an unsigned simulated transaction and exact maximum debit, then obtain separate transaction/activation approval. Do not invent a mint, copy a Gamine secret, fund a wallet, or silently create an official draft. Keep signature collection and broadcasting disabled until that approval.

## Automatic Common Agent audit

Current code has durable, idempotent confirmed-launch community registration and headquarters placement (`services/launch.ts`, `sim/engine.ts`). This is **not automatic Common Agent creation**. `AgentService.activate` in `services/community.ts` is an explicit launcher-owned operation, currently disabled outside demo. Migration 003 enforces one token-linked agent per mint and one per activating wallet; launching additional tokens is unlimited.

The owner has now chosen **one Common Agent per confirmed token**, including multiple tokens by one wallet. The previous one-agent-per-wallet constraint must therefore change under a separately approved schema migration; no such migration is authorized or applied. [Concrete implementation/schema/rollout plan](COMMON_AGENT_PER_TOKEN_PLAN.md). Preserve existing agents and names, reuse atomic identity reservation and durable commands, and reconcile provisioning without retrying a coin or charging again. No agent receives signing authority or payout custody.

Required regression coverage: finalized verified launch only; no creation for pending/failed/recovery-needed launches; exact creator ownership; duplicate/replayed/concurrent confirmation; restart recovery; existing activation; multiple launches by one wallet; and consistent Explore/community linkage. Any schema change needs separate migration approval. This document is an audit and next-step plan, not a claim that automatic production agents are implemented.

## Financial activation gates

Complete actual isolated backup restoration, final recovery/security/operational review and remaining release regressions. Keep Pinata rotation tracked as pending maintenance without requiring an upgrade. Record independent-review limitations honestly. Obtain separate Mainnet activation approval, then separately authorize any controlled real transaction. Do not enable payouts or begin Phase 3 as part of website availability.
