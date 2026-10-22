# Token-linked identities and activation — corrected plan

Owner correction, 22 October 2026: **one agent identity per platform-launched token; at most one activated token-linked agent per verified wallet**. Unlimited launches do not grant unlimited activations. An additional token must never inherit the first token's agent, owner or activation.

This replaces the earlier proposal to drop `agent_activations.activating_wallet` uniqueness and automatically activate every launch for its launcher. That proposal was incorrect and is withdrawn. No such migration or first-launch identity-reuse implementation was applied.

## Three separate relationships

| Relationship | Identity / uniqueness | Control |
| --- | --- | --- |
| Token-linked identity | One distinct agent ID per token mint, linked through its canonical community/launch | Identity reservation alone grants none |
| Token-linked activation | One activating wallet per activated identity; at most one activated token-linked agent per wallet | Existing authenticated, verified activation rules |
| Automatic $AECO Common Agent | One ID per network / official mint / qualifying holder wallet; many wallets share the mint | Appearance requires no registration; observation grants no agent-control or signing permission |

A wallet launching TOKEN1, TOKEN2 and TOKEN3 needs three distinct token-linked identities. It may activate only one. Holding official $AECO additionally gives that wallet its own separate Common Agent; repeat purchases do not duplicate it. Four hundred qualifying wallets produce four hundred Common Agents for the same mint. `aeco_observed` is an internal provenance discriminator for these Common Agents, not a new product category.

## Audit of current implementation

Migration 001 permits multiple launches by one launcher wallet: its wallet index is nonunique. Communities are unique per mint and launch. Migration 003's wallet uniqueness belongs only to `agent_activations`, not every simulation agent. Keep this constraint, per-mint/agent/name uniqueness and append-only protections.

`AgentService.activate`, memory/PostgreSQL coordinators and `agent.activate` currently reserve a fresh name/ID and grant control together. Only the authenticated verified launcher can request activation, and this API remains demo-only. A second activation returns a conflict; it does not reuse or relink the first agent. Confirmed launches register their community/HQ but do not independently reserve an unactivated token-agent identity. **That missing identity/activation separation is the actual compatibility gap.** Existing shared `TokenLinkedIdentity` requires activation fields, so it cannot represent an unactivated agent truthfully.

Automatic holder Common Agents already use stable network/mint/wallet IDs and the fenced simulation journal/snapshots. They do not insert activation or name reservations and carry no owner/control permissions. Existing 400-holder and restart/exit/reentry regressions remain applicable. The activation constraint does not block them. Official-mint production acceptance still depends on the separately approved $AECO launch.

## Smallest additive schema candidate — NOT APPLIED

[Review-only SQL](proposals/token-agent-identities.review.sql) adds an append-only `token_agent_identities` registry with unique agent ID and token mint, referencing the existing canonical community. Community/launch linkage is derived through `communities.mint`, avoiding another competing ownership mapping. The registry contains no wallet or activation-right column.

Backfill existing activations using their exact existing IDs/timestamps; reject mismatched mint/community/launch provenance first. Add a composite activation-to-identity foreign key so an activation cannot repoint an ID to another mint. Preserve **every** existing activation constraint, including `UNIQUE(activating_wallet)`. Holder Common Agents remain in their separate durable mapping and never enter this per-token registry.

The candidate is deliberately outside `apps/server/src/store/migrations`. Production still permits only 001–004; no migration allowlist or deployment configuration changes are authorized here. No existing database is to be reset or modified. Before rollout: current restorable backup, isolated copied-data rehearsal, orphan/provenance/count checks, compatible writer rollout and separate migration approval are required. This candidate alone does not implement per-token identity provisioning.

## Coordinated application correction after approval

1. Reserve one stable identity for each independently verified finalized platform launch, deduplicated by its canonical mint/launch. Use an atomic insert/read with a unique mint constraint and existing fenced coordination. Preserve all existing IDs, names, activation records and financial evidence. Reconcile older verified launches without requesting new signatures or charges.
2. Represent an unactivated token identity explicitly in shared contracts/read models, with no fabricated activation ID, activating wallet, owner or permissions. Expose its real launch/community linkage. Do not place an unactivated identity into the existing activated-only contract.
3. Activation selects only that token's reserved agent ID. Keep cryptographically authenticated authority, existing launcher verification, one-activation-per-wallet checks, name reservation and durable command transaction. Launching does not perform activation. No automatic delegation or transfer of agent control is authorized.
4. Preserve singular `/me/activation`: it represents a wallet's activation right, not all token identities or holder Common Agents. Add separate token-identity reads as needed; do not relax ownership checks or silently choose a different token's identity.
5. On duplicate confirmation, concurrency, restart or response interruption, converge on the same ID for that token. A provisioning failure is reconciled independently of the completed coin transaction. Never relaunch or collect another platform charge to repair an agent.
6. Keep the independent official-$AECO holder indexer, stable holder IDs, no-login appearance, basic simulated activities and zero automatic control rights. Do not impose global mint uniqueness on that population.

## Gamine compatibility audit

Inspected Gamine's `src/db/holder-activation.ts`, manual creation in `src/http/server.ts`, `src/db/schema.ts`, `src/agent-id.ts` and `drizzle/0034_multi_token_holders.sql`. Automatic/manual holder creation share a wallet-scoped transaction lock; the active-holder unique index is **wallet plus mint**, and repeat observations reuse that pair's existing identity. Its owner-bound identity hashing pattern is already adapted by our network/mint/wallet Common Agent IDs.

Reuse that atomic deduplication and authoritative holder aggregation pattern. Do not transplant Gamine's multiple-token activation policy, balance thresholds, retirement/replacement, economic autoplay, custody or secrets into our token-linked activation rules. Our existing command journal/coordinators provide the compatible durable boundary; no duplicate launch or ownership system is needed.

## Verification and remaining gates

Regression tests cover distinct launches by one wallet without reassignment, one token-linked activation per wallet, mint uniqueness, cryptographic session ownership, replay/concurrent activation and coexistence with separate holder Common Agents for that same wallet/mint. Existing holder tests cover 400 identities sharing one mint and stable replay/restart. These are in-memory simulation/API checks, not evidence of completed per-token provisioning or a production migration.

Before enabling the new registry writer, test its approved migration/backfill against an isolated data copy, old/new reader compatibility, all existing activation IDs preserved, multiple unactivated token identities for one launcher, concurrent/restarted provisioning, and rejection of cross-token activation. No Mainnet activation, treasury signing, financial transaction or Phase 3 work is authorized by this correction.

Audit verification: 21 identity/Common Agent tests passed, including the 400-holder case and the new same-wallet coexistence regression. Backend typecheck, repository lint and shared/world-spec/backend build passed. The review-only SQL has not been executed or rehearsed against a database; its migration acceptance remains pending. No runtime identity/ownership behavior was changed by this audit.
