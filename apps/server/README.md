# Agentic Economy — Backend (`apps/server`)

The authoritative backend for **Agentic Economy**: one persistent, procedurally generated city in which the agents of token communities, launched through our Pump.fun launchpad, run a shared simulated economy.

> **$AECO** is a *future* platform token. It is not minted, sold, required or referenced as live anywhere in this backend.

Owned by Claude Code. The frontend (`apps/web`) is owned by Codex and consumes `packages/shared`, `contracts/openapi.yaml` and `contracts/events.md`.

## Quick start (demo mode, no database or chain needed)

```bash
pnpm install --filter "./packages/*" --filter ./apps/server   # filtered: apps/web is managed separately with npm
pnpm --filter @agentic-economy/server dev                      # http://localhost:8787  ws://localhost:8787/api/v1/ws
curl localhost:8787/healthz
```

Demo mode uses an in-memory store and a **mock chain**. On first boot it seeds three clearly labelled demo communities (each through the real launch → verify → register code path) and nine agents. Every response carries `"mode": "demo"`.

### Run with Postgres (persistence across restarts)

```bash
createdb agentic_economy                    # or: docker compose -f infra/docker-compose.yml up -d
cp apps/server/.env.example apps/server/.env
# set DATABASE_URL=postgres:///agentic_economy?host=/var/run/postgresql
pnpm --filter @agentic-economy/server db:migrate   # also runs automatically on startup
pnpm --filter @agentic-economy/server dev
```

Demo mode with Postgres keeps the world, communities and ledger across restarts. The mock chain itself is in-memory, so mock holder balances reset; reseed by recreating the database.

### Commands

| Command | What it does |
|---|---|
| `pnpm --filter @agentic-economy/server dev` | Watch mode (TS sources of workspace packages, no build needed). |
| `pnpm --filter @agentic-economy/server test` | Unit and integration tests. Add `TEST_DATABASE_URL=postgres:///agentic_economy_test?host=/var/run/postgresql` to include the Postgres suite (it **drops and recreates** that database's schema). |
| `pnpm --filter @agentic-economy/server typecheck` / `pnpm lint` | Strict TS / ESLint. |
| `pnpm --filter @agentic-economy/server build` then `start` | Compile to `dist/` (build `packages/*` first) and run `node dist/main.js`. |
| `pnpm contracts:gen` | Regenerate `contracts/openapi.yaml` and `packages/shared/fixtures/*.json` from the Zod source. |

## Modes and roles

| | `demo` | `devnet` | `production` |
|---|---|---|---|
| Chain | `MockChain` (in-process) | Solana devnet RPC | Solana mainnet RPC |
| Store | memory, or Postgres if `DATABASE_URL` is set | Postgres (required) | Postgres (required) |
| Launches | simulated (`POST /demo/launches/:id/sign`) | disabled until `FEE_ROUTING_VERIFIED=true` | disabled until `FEE_ROUTING_VERIFIED=true` and the spec §8.10 reviews |
| Treasury indexer and drift check | — | every 30 s / ~5 min | every 30 s / ~5 min |
| Payouts | none (dry-run points) | none | none |

`ROLE` selects what a process does. All roles ship in one image; see [infra/railway/README.md](../../infra/railway/README.md).

| ROLE | Runs | Needs |
|---|---|---|
| `all` (default) | API + WebSocket + simulation (+ indexer outside demo) | memory or Postgres |
| `api` | HTTP + WebSocket; reads the leader's published state view; sends commands through the durable inbox | Postgres, chain (for auth/launch/eligibility) |
| `sim` | the single simulation writer (Postgres leadership + fencing); standbys wait | Postgres only (no chain access) |
| `indexer` | treasury indexer + fee-routing drift checks (lease-holder only) | Postgres, chain |

`FEE_ROUTING_VERIFIED` is a deliberate manual gate. See [docs/pump-fun-integration.md](docs/pump-fun-integration.md). The real launch-transaction builder is intentionally unimplemented until the devnet test plan there passes, so non-demo launches return `503 feature_disabled`.

## Architecture

```
src/
  config.ts            env → typed config (fails fast on unsafe combinations)
  context.ts           wires store, chain, runtime and services
  runtime.ts           per-role composition (sim worker / read model / event hub / command bus) + world views
  roles/               SimWorker (leader-only ticks, fenced commits, recovery), StateReader, EventHub, CommandBus
  coord/               Coordinator: leadership + fencing, command inbox, durable stream, state view, LISTEN/NOTIFY (memory | Postgres)
  sim/                 deterministic simulation (no wall clock, no Math.random)
    engine.ts          production chain, tasks, logistics, receipts, residents, prices, epochs
    planner.ts         Planner interface + UtilityPlanner (proposals are validated by the engine)
    ledger.ts          City Credit double-entry ledger (issue/burn are the only supply changes)
    nav.ts             road-network BFS pathfinding
    view.ts            sim state → published contract types
  chain/               Pump.fun layouts/PDAs, launch verification, MockChain, Solana RPC adapter
  services/            auth, launch, treasury, community/eligibility/agents, treasury indexer
  store/               Store interface; MemoryStore; PostgresStore + SQL migrations
  http/                Fastify app; one generic route registrar driven by packages/shared `routes`
  ws/gateway.ts        WebSocket protocol v1
scripts/gen-contracts.ts
```

### Simulation (spec §4)

- **Chain:** farms grow wheat → mills (wheat + energy) → flour → bakeries (flour + energy) → bread → residents buy it at the market (the demand sink). Lumber yards and quarries supply timber and stone, which repairs consume. Power stations supply energy.
- **No goods from thin air:** production consumes inputs, takes cycle time and is bounded by storage. Tests assert per-resource conservation every tick: initial + produced − consumed = held anywhere (stock, reservations, cargo).
- **City Credits:** integer milli-credits, never withdrawable or convertible. New supply comes only from bounded issuance (resident wages, capped per epoch by population). Supply leaves through burns (1% of purchases, building and agent upkeep). Tests assert `sum(balances) = issued − burned` every tick.
- **Service tasks** are generated by the simulation only (agents cannot create tasks): deliveries, demand fulfilment, maintenance and production shifts. Payment is **escrowed up front** from the requester. Unclaimed tasks earn an urgency premium. Deliveries left unclaimed for long enough are handled by low-fidelity "city crews", which earn no points and receive no fee, so the economy runs even with no agents online.
- **Verification:** every completion produces a hash-chained `TaskReceipt` with explicit checks (unique task, claimant, escrow funded, picked up at source, delivered at destination, quantity and lot provenance, shift presence).
- **Dry-run rewards:** points per receipt. They are zeroed for self-dealing (requester owned by the performer's wallet), circular goods movement and implausibly fast completion, and capped per agent per epoch. Epoch close emits `RewardRecord`s carrying point shares only, with **no SOL amounts and no claims**.
- **Agents** propose actions through `Planner`. The engine re-validates every proposal, and rejections are logged. Agent permissions are simulation-only; there is no permission to sign transactions or move user funds.
- **Determinism and recovery:** state is plain JSON. API processes enqueue commands (agent create/update, community registration) into a durable inbox. The simulation leader applies them at the start of a tick and moves them into the append-only command log, in the same transaction that commits the tick. On leadership acquisition the latest snapshot is loaded (and its integrity hash checked), then the command log is replayed up to the last committed tick. Tests prove the recovered state hashes identically to the uninterrupted run and to an independent replay of the log, including after a leader is killed mid-run. Snapshots and commands are stored as `text`, not `jsonb`, because `jsonb` reorders keys and breaks replay.

### Launch flow (spec §2, §3.2)

`prepare` (auth + Idempotency-Key) → wallet signs/sends → `confirm` (idempotent) → `GET /launches/:id`.
States: `draft → awaiting_signature → submitted → confirmed | failed | recovery_needed` (and `expired`).

- **No launch restrictions:** no per-wallet limits, cooldowns, history checks, duplicate-metadata gates or approvals. Launch routes are excluded from rate limiting; a test performs 20 identical consecutive launches from one wallet.
- `confirm` trusts only chain data (`chain/verify.ts`). On `confirmed`, the community, the launch record, the platform 0.05 SOL receipt and the feed event are written in **one DB transaction**. Duplicate confirms return the same result; a different signature is a `409`.
- Communities exist **only** for confirmed launches through this flow. There is no import endpoint, and the registry is immutable (enforced by a DB trigger).

### Treasury (spec §8)

- The ledger is append-only (`treasury_entries`, enforced by a trigger). Status changes (pending → finalized / reversed) are new entries that `supersede` older ones.
- Uniqueness on `(signature, instruction_index, account, stream, finality)` makes ingestion replay-safe (webhook retries, re-indexing, restarts).
- `launch_fee` entries can only credit the platform account (DB `CHECK` and a store guard). They are never part of the 60/40 split.
- Creator fees are recorded from the **actual lamport deltas** of our treasuries in Pump `distribute_creator_fees_v2` transactions, and reconciled per distribution against `splitCreatorFee` (integer floor for the agent share; the residue goes to the platform; tolerance 2 base units). Assets are tracked per mint and never summed together.

## Security and trust assumptions

- **Wallet auth:** SIWS-style message with a single-use nonce. It is consumed atomically before signature checking, expires after 5 minutes, and is bound to the wallet. Sessions are opaque bearer tokens stored only as SHA-256 hashes (12 h TTL). Clients should keep the token in memory.
- **Idempotency keys** (required on `POST /agents` and `POST /launches/prepare`) are scoped to wallet and operation. The same key with a different body returns `409`.
- **Holder eligibility** is read from chain (Token-2022-aware `getParsedTokenAccountsByOwner`), cached for 60 s for reads, and **re-read fresh on agent activation**. Default threshold: 1,000 tokens, configurable.
- **Rate limits** apply to auth and agent mutations (30/min/IP). Launches are deliberately unlimited.
- **Custody:** the backend holds **no** treasury or user keys. Treasuries must be multisig vaults. The only private key the server ever touches is the per-launch mint keypair, used to partially sign the prepared transaction and then discarded.
- **Pump.fun trust boundary:** Pump.fun can upgrade its programs and has admin powers (community takeover, `admin_cto_sharing_config`) that could change a coin's creator-fee routing. The drift checker detects this but cannot prevent it. See the integration document.
- **Response contract enforcement:** outside production, every HTTP response is validated against the published schema, and a violation is a 500 (caught by tests).

## Operations

- `GET /healthz`: liveness, mode, role, tick, cluster-wide `simRunning`, leader epoch/heartbeat, store kind, whether financial features are enabled.
- `GET /readyz`: 200 when the role can work (database reachable), otherwise 503. Used by Railway's deploy healthcheck.
- `GET /metrics`: Prometheus text (ticks, tick time, errors, HTTP and WS counts, agents).
- Structured JSON logs (pino). SIGINT/SIGTERM take a final snapshot before exit.
- Deploy: Railway, one image for all roles. See [infra/railway/README.md](../../infra/railway/README.md) for exact service settings, variables, resource estimates and the staged rollout (single `ROLE=all` service, then split `api`/`sim`/`indexer`).
- `pnpm --filter @agentic-economy/server bundle` produces the self-contained `dist-bundle/` used by the image (`main.mjs`, `migrate.mjs`, `migrations/`).

## Known limitations / next steps

1. Pump.fun launch-transaction builder and the devnet test plan (gate for any real launch).
2. Agents cannot yet own or operate businesses (`ownerAgentId` is always null; all buildings are city-operated). Agents sell labour and logistics services.
3. World expansion beyond the Genesis district (12 HQ lots; when they run out, a new community's `headquartersBuildingId` is null).
4. LLM planner: only the interface and validation boundary exist.
5. The metadata upload helper for Pump.fun (IPFS) is not implemented. Clients currently provide `metadataUri`.
6. Per-IP rate limiting is in-process (per API replica). Use a shared limiter when running many API replicas.
7. AI-agent workers are not built. When they are, they must submit proposals through the durable command inbox (no new write path).
