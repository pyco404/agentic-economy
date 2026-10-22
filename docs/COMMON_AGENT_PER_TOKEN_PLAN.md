# One Common Agent per confirmed token — approved product direction

Owner decision, 22 October 2026: **one Common Agent per confirmed token**, including multiple tokens launched by one wallet. This supersedes the former one-agent-per-wallet product rule. It does not authorize a database migration, Mainnet transaction or financial activation.

## Current implementation and compatibility gap

Finalized verified launch confirmation already atomically saves the launch/community/platform-charge evidence, then durably queues community registration and headquarters placement. It does not create a Common Agent. `AgentService.activate` currently requires an explicit launcher-owned request, is demo-only and reserves identity plus a simulation command atomically. Migration 003 enforces unique token mint, agent, display name **and activating wallet**. Wallet lookup APIs/frontend currently assume a single activation.

Reuse that identity/command machinery. Do not create a second agent registry or infer ownership from token holdings. Existing names, agents, launch records, signatures, treasury ledger and databases must be preserved. Unlimited token launches remain unlimited.

## Required schema proposal — NOT APPLIED

Prepare a separately numbered additive migration only after inspecting actual constraint/index names and checking duplicate launch IDs/orphan references. It should remove only wallet uniqueness, retain per-mint/agent/name uniqueness, add a nonunique wallet lookup index, and enforce one activation per launch. The intended operations are:

```sql
-- Review-only sketch. Not a migration-engine input and not approved for execution.
ALTER TABLE agent_activations
  DROP CONSTRAINT agent_activations_activating_wallet_key;
CREATE INDEX agent_activations_wallet_lookup
  ON agent_activations (activating_wallet);
ALTER TABLE agent_activations
  ADD CONSTRAINT agent_activations_launch_id_key UNIQUE (launch_id);
```

Verify actual schema names and existing data first. No row update, delete, truncation or reset is needed. Keep append-only protections. Do not restore the old wallet UNIQUE constraint after multiple activations exist; rollback should disable the new application feature while preserving records, with an explicitly compatible reader.

No candidate SQL has been placed in `apps/server/src/store/migrations`: staging automatically runs pending migrations, and production explicitly permits only 001–004. Publishing migration 005 or changing that production allowlist requires separate approval, a current restorable backup, isolated rehearsal against copied data, conflict checks and coordinated compatibility testing. None of those new migration gates is claimed passed.

## Provisioning and recovery design

1. Accept only a server-verified, finalized platform launch matching its persisted mint, signature, creator wallet, community and network. Pending, failed, expired or recovery-needed launches never create agents.
2. After durable launch confirmation, enqueue a deterministic provisioning operation keyed by launch ID. One immutable activation is associated with that launch/mint, owned by its verified launcher; another launch by the same wallet gets a different agent. Existing activation for the same mint/launch is returned on retry.
3. Reserve unique identity and durable simulation command in the existing transaction boundary. Adjust coordinator wallet-conflict checks without weakening mint/launch/agent/name uniqueness. Use a stable per-token name candidate suffix for multiple launches by one wallet; never rename existing agents or accept client-selected ownership.
4. Reconcile finalized launches missing an activation/command after restart. Concurrent confirmation, response interruption and repeated jobs must converge on the same activation. Validate any preexisting activation belongs to the same launch/mint/owner before reuse.
5. Agent provisioning failure leaves the token launch confirmed, with a separate pending/error presentation and retryable server reconciliation. Never recreate the coin, request a new wallet signature or collect another platform charge to repair an agent.
6. Add wallet activation listing and explicit mint/launch selection. Preserve the old singular response for wallets with one activation; do not arbitrarily return another token's agent once multiple exist. Coordinate shared contracts, Agent Studio and launch-success/community links.
7. Preserve the existing public/manual activation guard. Introduce an explicit, default-off server provisioning rollout gate with tests; changing the product rule does not silently enable other production agent mutations. Agents receive no wallet signer, custody, payout authority or real-money capabilities.

## Acceptance before deployment

Test two finalized tokens by the same wallet produce two distinct durable agents; repeated/concurrent confirmation produces one agent per token; restart resumes unapplied provisioning; failed/unfinalized/foreign-network/unsupported launches produce none; ownership cannot be claimed by a holder or another wallet; display-name collisions preserve identities; old activations remain readable; and agent errors cannot duplicate launches or charges. Rehearse the candidate migration on an isolated staging copy, validate record counts/constraints, then run approved disposable PostgreSQL persistence/concurrency tests and compatible browser flows.

Keep all production financial gates off. Do not create fake confirmed tokens to populate the public site. The eventual separately approved official $AECO launch follows this same per-token provisioning path; this plan does not authorize launching it.
