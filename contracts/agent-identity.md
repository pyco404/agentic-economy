# Agent identity and activation — design record (contract 0.3.0)

Status: **design approved by the owner on 2026-10-16**; contract 0.3.0 and the demo-safe backend are implemented on `claude/backend`. Migration 003 is **not applied** to any shared environment yet. Inputs: `apps/web/AGENT_IDENTITY_BACKEND_HANDOFF.md`, backend at `60a2d83`.

## 1. What exists today

- Agents live only in the simulation state (snapshot + replayed `sim_commands`), not in a table. Creation is an `agent.create` command queued in `sim_command_inbox` and applied by the leader.
- `POST /agents` = holder-gated creation: fresh balance check, then up to `MAX_AGENTS_PER_WALLET_PER_COMMUNITY` (3) agents per wallet per community, enforced by an advisory lock + pending count. No uniqueness by mint or by wallet across communities.
- `AgentSummary.ownerWallet` is required; there is no notion of house agents, activation, or identity kind. Names are free text and not unique.
- Sim state is `version: 1` with no upgrade path.

### Live data (2026-10-16)

| Database | Agents | Communities | Max per community (mint) | Max per wallet | Duplicate names |
|---|---|---|---|---|---|
| Railway staging | 9 | 3 | 3 | 1 | none |
| Codex local integration | 15 | 9 | 3 | 7 | `Integration Courier` |

Every existing agent was created by the old holder path, and every mint already has up to 3 agents. **None of them can be classified as a token activation** without arbitrarily choosing a winner. The seed wallets are deterministic demo keypairs.

## 2. Identity model

```ts
AgentIdentity =
  | { kind: "house";        syntheticName: string }                       // Fern_108; no wallet, ever
  | { kind: "token_linked"; activationId; tokenMint; activatingWallet; launchId; communityId }
  | { kind: "legacy";       syntheticName: string; legacyOwnerWallet }    // pre-0.3.0 agents; keep owner controls
```

Field names follow the frontend's existing internal type (`apps/web/src/api/agentIdentity.ts`).

- `Agent`/`AgentSummary` gain `identity: AgentIdentity` and `displayName` (persisted, unique, stable).
- `ownerWallet` becomes **nullable and deprecated** for one version (null for house agents), then removed in 0.4.0. Breaking for strict clients → contracts bump to **0.3.0**.
- House names: `<Word>_<NNN>` from a fixed word list, persisted once, globally unique (DB constraint), never derived from wallets, never reused.

### Invariants (enforced by Postgres, not by application checks)

`agent_activations`: `UNIQUE(token_mint)`, `UNIQUE(activating_wallet)`, `UNIQUE(agent_id)`, and immutable rows (trigger). The mint is resolved from the confirmed platform launch/community record, never taken from the client.

## 3. Activation flow (atomic)

One transaction on `POST /agents/activate`:

1. Authenticated session wallet only. Resolve community → confirmed launch → mint. The session wallet must equal the launch's `launcherWallet`, otherwise `403 not_token_launcher`.
2. Run the eligibility check (fresh chain read; mock chain in demo).
3. `INSERT agent_activations (...)` and `INSERT sim_command_inbox (agent.activate ...)` in **the same transaction**. Unique violations become explicit `409`s:
   - `wallet_already_activated`, `mint_already_activated` (both return the canonical agent/activation IDs),
   - `activation_in_progress` (reserved, command not yet applied).
4. Idempotency: same key + same body returns the original result; a different key for the same wallet/mint hits the unique constraint (no duplicate agent).
5. `GET /me/activation` returns the caller's activation from the session, not from a public wallet lookup.

Transfer, deactivation and re-activation: **rejected** (`unsupported_lifecycle`). Rows are never freed.

## 4. Migration and upgrade (forward-only)

- **SQL `003_agent_identity.sql`** (additive; no existing table or row changes):
  - `agent_names`: every display name the API reserves (house and token-linked), one uniqueness domain; `requested_by` only for house agents (quota/audit, never ownership).
  - `agent_activations`: `UNIQUE(token_mint)`, `UNIQUE(activating_wallet)`, `UNIQUE(agent_id)`, `UNIQUE(display_name)`, foreign keys to the community, launch and the create command's inbox row. Status (`pending`/`active`) is derived from that inbox row, so rows never change.
  - Both tables are append-only (trigger). Rows are reserved in the same transaction as the create command, under a cluster-wide transaction lock.
- **Sim state v1 → v2** (`apps/server/src/sim/identity.ts`): when a v1 snapshot is loaded (after its integrity hash is checked) or a v1 view is read, every agent becomes `legacy` with a name derived from its ID, in agent order. Nothing else changes: no RNG, ledger, counter or simulation field. Old `agent.create` commands (from the log, or still queued at deploy) produce legacy agents the same way, so replaying from a v1 snapshot reaches exactly the uninterrupted state (tested).
- **Name formats are disjoint**, so the two allocators can never collide: legacy `Word_NNNN` (simulation, deterministic), house `Word_NNN` (API, reserved in `agent_names`), token-linked `CMYx...6Wec` (API, reserved in `agent_names`, extended on collision).
- **Audit before applying:** `pnpm --filter @agentic-economy/server identity:audit -- --api <url>` (or `--database <url>`, read-only transaction) lists every existing agent with its future legacy name and the duplicate wallets, tokens and names. Nothing is reassigned or deleted; duplicates stay `legacy` with their recorded owners.
- **House agents** have no owner: task receipts and dry-run reward records carry `ownerWallet: null` for them (their points have no beneficiary). Quotas: `HOUSE_AGENTS_PER_WALLET` (default 5) per signed-in requester and `HOUSE_AGENTS_MAX` (default 60) city-wide, plus the per-IP rate limit (`429 rate_limited`).
- **Eligible mint** = the community's confirmed Agentic Economy launch in the current mode; balances are not consulted. Activation is demo-only (`feature_disabled` elsewhere).
- Historical events keep their original names and text. Deploying runs pending migrations in Railway's pre-deploy step, so **deploying this branch applies 003**.

## 5. Approved decisions

1. **Activation:** only the verified wallet that launched the token through Agentic Economy may activate that token's agent. Holding or buying a token never qualifies. Wallets may still launch any number of tokens (no launch limit), but because each wallet may activate only one agent, **a wallet that launches several tokens can activate an agent for only one of them.** No delegation or transfer without separate approval.
2. **Existing agents** become `legacy`: kept with their IDs, history and owner controls, given persisted unique synthetic names, never converted, no fabricated wallets.
3. **Token-linked display name:** the shortened activating wallet (`CMYx...6Wec`), full address stored separately. On collision the shown address is extended (`CMYxQ...h6Wec`, then longer) until unique. No ID suffixes under floating names.
4. **Demo house creation:** `POST /agents/house`, `MODE=demo` only, authenticated, rate-limited; the caller does not become an owner.
5. **`POST /agents`** answers `410 gone` naming the replacement routes. The 3-per-wallet-per-community policy is removed. Retire it on staging only after the frontend has switched.

## 6. Implementation sequence

1. Shared schemas, OpenAPI 0.3.0, `events.md` (review with Codex before backend code depends on it).
2. Migration 003 + store methods + immutability tests.
3. Sim state v2 upgrade, new commands, replay tests against v1 snapshots.
4. Activation service + coordinator transaction, house names, routes.
5. Tests: concurrent/retried requests, cross-token wallet reuse, cross-wallet mint reuse, restart/replay, session impersonation, legacy migration on a copy of real data.

Real signing, live launches, treasury settlement and non-demo activation stay disabled throughout.
