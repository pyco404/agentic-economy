# Deploying the Agentic Economy backend on Railway

**Scope:** the backend (`apps/server`) and its PostgreSQL. The frontend (`apps/web`) is owned by Codex and deployed separately. Nothing here builds or changes it.

**Safety rails:**
- No production deploy, and no configuration of live funds, without explicit owner approval.
- `FEE_ROUTING_VERIFIED` is pinned to `"false"` in `.railway/railway.ts`, so real Pump.fun launches stay disabled. Changing it needs the devnet verification in `apps/server/docs/pump-fun-integration.md` §5, plus owner approval.
- Launch policy is unchanged:
  - fixed 0.05 SOL charge, paid 100% to the platform treasury;
  - no per-wallet launch limits, cooldowns or approvals;
  - the launcher receives 0% of creator fees;
  - creator fees actually received are split 60/40 (agent rewards / platform).

## 1. What runs where

| Component | Process | Railway |
|---|---|---|
| HTTP API + WebSocket (`/api/v1/*`, `/api/v1/ws`) | `ROLE=api` (or `all`) | public service; scale replicas freely |
| Economic simulation (single writer) | `ROLE=sim` (or `all`) | private service; 1 replica (a 2nd is only a standby) |
| Pump.fun/Solana treasury indexer and fee-routing drift checks | `ROLE=indexer` (or `all` outside demo) | private service; 1 replica (a 2nd is only a standby) |
| AI-agent workers | not built yet (agents use the deterministic rule planner inside the simulation) | none now; see §8 |
| PostgreSQL | Railway Postgres | `postgres("Postgres")` in IaC |
| Redis | **not used** | none |
| Solana RPC | external provider (Helius / Triton / QuickNode …) | `SOLANA_RPC_URL` secret |
| AI model provider | external, once LLM planning exists | API key secret (later) |
| Treasury custody | Squads multisig vaults (on-chain) | only public addresses in env |

All roles ship as **one image** (`infra/railway/Dockerfile`) and differ only by `ROLE`.

## 2. How duplicate work is prevented

- **One simulation writer.**
  - A `sim`/`all` process ticks only while it holds a Postgres session-level advisory lock on a dedicated connection.
  - Each tick (applied commands, outputs, stream events, snapshot, read view) commits in **one transaction on that same connection**, after asserting the fencing epoch in `sim_leader`.
  - If the connection or lock is lost, or any commit fails, the process **discards its in-memory state and stops**. It only resumes after re-acquiring leadership and rebuilding state from the database (latest snapshot plus replay of the append-only command log).
  - Server-side TCP keepalives (about 25 s) release a vanished leader's lock.
- **Commands are durable.**
  - API processes never call the engine. They write to `sim_command_inbox` with a dedupe key (Idempotency-Key based).
  - The leader moves commands into `sim_commands` inside the tick that applies them, so each command is applied exactly once, even across failovers.
- **Blockchain events are counted once.**
  - Treasury ledger rows are unique on `(signature, instruction, account, stream, finality)`.
  - Stream events are keyed by ledger-entry id.
  - The indexer additionally holds a lease (advisory lock) so a second instance stays idle rather than wasting RPC calls.
- **WebSocket events are durable.**
  - The simulation writes them to `stream_events` (global `seq`, retained `STREAM_RETENTION_MINUTES`).
  - `pg_notify` is only a wake-up hint. API replicas read the table, so clients can `resume` across API restarts and between replicas.

> Do **not** put PgBouncer (transaction pooling) between the services and Postgres: session advisory locks and LISTEN/NOTIFY require direct sessions. Railway Postgres is direct by default.

## 3. Stage 0/1: single service (start here)

Railway objects:
- Railway **Postgres** (template image `postgres-ssl:18`).
- Service **`agentic-economy`**, `ROLE=all`, 1 replica.

### Exact service settings (as declared in `.railway/railway.ts`)

| Setting | Value |
|---|---|
| Source | this GitHub repo, branch `main` (set `GITHUB_REPO` in `railway.ts`, or connect in the dashboard) |
| Builder | Dockerfile |
| Dockerfile path | `infra/railway/Dockerfile` (build context: repo root) |
| Watch paths | `apps/server/**`, `packages/**`, `infra/railway/**`, `pnpm-lock.yaml`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` |
| Start command | image default: `node main.mjs` |
| Pre-deploy command | `node migrate.mjs` (idempotent, serialized by an advisory lock) |
| Healthcheck path / timeout | `/readyz` / 120 s |
| Restart policy | `ON_FAILURE`, max 10 retries |
| Replicas | 1 |
| Overlap / draining | 15 s / 30 s (SIGTERM → final snapshot → lock released → new deployment takes over) |
| Networking | generate a public domain for this service. Postgres stays private (`DATABASE_URL` private-network reference) |

### Variables (template: `infra/railway/env/all.env.example`)

| Variable | Stage 0 (demo staging) | Stage 1 (devnet) | Secret? |
|---|---|---|---|
| `ROLE` | `all` | `all` | |
| `MODE` | `demo` (pinned in `.railway/railway.ts`) | `devnet` (a reviewed edit to `railway.ts`) | |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | same | yes (reference) |
| `HOST` | `::` (Railway private networking is IPv6) | same | |
| `PORT` | injected by Railway | same | |
| `WORLD_SEED` | `agentic-economy-genesis`. **Never change** for an existing database: startup refuses. | same | |
| `TICK_MS`, `SNAPSHOT_EVERY_TICKS`, `VIEW_EVERY_TICKS`, `STREAM_RETENTION_MINUTES`, `LEADER_RETRY_MS` | 500, 120, 2, 60, 2000 | same | |
| `SOLANA_RPC_URL` | unset | provider HTTPS URL (devnet) | **yes** |
| `SOLANA_CLUSTER` | unset | `devnet` | |
| `PLATFORM_TREASURY`, `AGENT_REWARDS_TREASURY` | unset (demo uses derived placeholders) | devnet Squads vault addresses | public keys only |
| `FEE_ROUTING_VERIFIED` | `false` | `false` | |
| `AUTH_DOMAIN`, `AUTH_URI`, `CORS_ORIGINS` | API domain, frontend origin(s) | same | |
| `HOLDER_MIN_BALANCE_RAW`, `ELIGIBILITY_CACHE_SECONDS`, `MAX_AGENTS_PER_WALLET_PER_COMMUNITY` | 1000000000, 60, 3 | same | |
| `SESSION_TTL_SECONDS`, `CHALLENGE_TTL_SECONDS` | 43200, 300 | same | |

Stage 0 (`MODE=demo`) needs no secrets. It runs the mock chain and seeds labelled demo communities, so it's the right first deployment for frontend integration. Note: in demo mode with Postgres, the mock chain's holder balances live in process memory and reset on redeploy.

## 4. Stage 2: split services

Switch `TOPOLOGY` to `"split"` in `.railway/railway.ts`. To avoid downtime:

1. Apply with the stage-2 services **added** alongside `agentic-economy` (`sim` will wait as standby).
2. Point the domain at `api`.
3. Remove `agentic-economy`. `plan` shows the deletion, and `apply` requires `--confirm-destructive`.

| Service | ROLE | Public? | Replicas | Overlap / draining | Variables template |
|---|---|---|---|---|---|
| `api` | `api` | yes (domain) | 1 → N | 20 s / 20 s | `env/api.env.example` |
| `sim` | `sim` | no | 1 | 15 s / 30 s | `env/sim.env.example` (no chain secrets) |
| `indexer` | `indexer` | no | 1 | 10 s / 15 s | `env/indexer.env.example` |

All three use the same Dockerfile, pre-deploy migration, `/readyz` healthcheck and restart policy.

- **Deploy order** on first split: `sim` → `indexer` → `api`.
- **API readiness:** `/readyz` passes as soon as the database is reachable. Missing simulation state is reported, but doesn't block an API deploy.

## 5. Migrations

- `node migrate.mjs` (Railway pre-deploy) applies `apps/server/src/store/migrations/*.sql` in order.
  - Each file runs in its own transaction, recorded in `schema_migrations`.
  - Runs are serialized across processes with an advisory lock.
  - It is safe to run on every deploy.
- The server also runs pending migrations on startup (same lock), so local dev needs no extra step.
- **Policy:** migrations must be backward-compatible with the previous release. During a rolling deploy, old and new processes overlap for a few seconds: add columns and tables first, remove them in a later release.
- **Moving an existing local or staging database to Railway:**

  ```bash
  pg_dump --no-owner --format=custom "$LOCAL_URL" -f ae.dump
  pg_restore --no-owner -d "$RAILWAY_DATABASE_PUBLIC_URL" ae.dump
  ```

  Use `DATABASE_PUBLIC_URL` only for this one-off restore. Then deploy. The world resumes from the latest snapshot plus command log.

## 6. Health, readiness and metrics (every role)

| Endpoint | Meaning |
|---|---|
| `GET /healthz` | Liveness, role, readable tick, and `simRunning` (cluster-wide: a leader committed within 10 s). Also `simLeader {localLeader, epoch, lastTick, heartbeatAgeMs}`. Always 200. |
| `GET /readyz` | 200 when this process can do its job (database reachable), otherwise 503. Railway's deploy healthcheck. |
| `GET /metrics` | Prometheus text: ticks, tick time, leader acquisitions/losses, indexer runs and inserts, stream seq, WebSocket connections. |

Railway healthchecks run **only at deploy time**. For continuous alerting, scrape `/metrics` or point an uptime monitor at `/healthz` and alert on `simRunning=false`.

## 7. Estimated resources

Measured locally on 2026-10-14: the compiled bundle and Postgres 16, demo world (404 buildings, 9 agents), 500 ms ticks, 60 s window.

| Process | CPU (avg) | RSS | Notes |
|---|---|---|---|
| sim leader | ~2% of one core | ~170 MB | ~1 ms per tick of simulation, plus the commit |
| sim standby | ~0.2% | ~120 MB | polls for leadership every 2 s |
| api | ~0.9% | ~140 MB | follows a 34 KB gzipped state view about 1×/s; +WebSocket fan-out per client |
| Postgres growth | — | ~11 MB after warm-up | about 545 stream rows/min (pruned after 60 min); events, receipts and actions are append-only |

Suggested Railway sizing:

| Stage | Size |
|---|---|
| Stage 1 | **1 service at 0.5 vCPU / 512 MB**, plus Postgres at **0.5 vCPU / 1 GB**, 5 GB volume |
| Stage 2 | api 0.5 vCPU / 512 MB per replica (add replicas around every ~1–2k concurrent WebSocket clients, measure first); sim 0.5 vCPU / 512 MB; indexer 0.25 vCPU / 256 MB |

These are starting points from one machine. Confirm with `/metrics` after the first staging deploy before raising world scale.

## 8. Scaling path (start small)

1. **Stage 1:** a single `ROLE=all` service.
2. **Stage 2:** split `api` / `sim` / `indexer`. Scale `api` horizontally; `sim` and `indexer` stay single-writer (extra replicas are hot standbys).
3. **Later, only when measured:**
   - Redis for cross-replica WebSocket fan-out at very high client counts, and for a shared rate limiter. The `Coordinator` interface is where a Redis-backed stream would plug in.
   - An `agent-worker` role for LLM planning: workers read the published state view and submit **proposals** through the durable inbox; the simulation validates them. No new trust path.
   - Read replicas for heavy history queries.

## 9. First staging deployment: runbook (each step needs owner approval where marked)

**Already done (2026-10-14):**
- Empty Railway project `agentic-economy` (ID `c0003363-55ab-497b-a994-a1d07002b87d`) with an empty `staging` environment. The default `production` environment is left empty and unused.
- This directory is linked to `staging`. `railway config plan` shows **2 to add, 0 to change, 0 to destroy** (Postgres plus the `agentic-economy` service), all changes classed safe.

**Steps:**

1. **Source (done):** `.railway/railway.ts` points the service at `pyco404/agentic-economy`, branch `staging`. Install the Railway GitHub app with access to this repository before applying, otherwise the source cannot be connected.
2. Re-run the plan and review it:

   ```bash
   cd .railway && npm install && cd ..
   railway config plan --environment staging --verbose
   ```

   If you run the CLI under a wrapper such as `timeout`, prefix `env _=$(command -v railway)`: the SDK's version check executes `$_ --version`.
3. **Apply (approval):** `railway config apply --environment staging`. This creates Postgres and the service. Postgres starts. The service only builds once it has a source.
4. **Variables (declared in `.railway/railway.ts`):**
   - `ROLE=all`, `MODE=demo`, `FEE_ROUTING_VERIFIED=false`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `HOST=::`, `WORLD_SEED`, tick/snapshot/stream settings.
   - `AUTH_DOMAIN=${{RAILWAY_PUBLIC_DOMAIN}}` (the service's own generated domain).
   - `AUTH_URI=http://localhost:5173`, `CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173` (local frontend against staging; add the hosted frontend origin later).
   - `SOLANA_RPC_URL`, `SOLANA_CLUSTER`, `PLATFORM_TREASURY`, `AGENT_REWARDS_TREASURY` are **deliberately unset** in demo staging (no chain access).
5. **Generate a public domain** for `agentic-economy` (Settings → Networking).
6. **First deploy (approval):** connect the source or push the deploy branch. The build runs the Dockerfile, then the pre-deploy step runs `node migrate.mjs`, then the `/readyz` healthcheck must pass.
7. **Verify:**
   - `GET /readyz` returns 200;
   - `GET /healthz` shows `mode=demo`, `simRunning=true` and `financialFeaturesEnabled=false`;
   - `GET /api/v1/world/stats` works;
   - the `wss://<domain>/api/v1/ws` stream is live;
   - `POST /api/v1/launches/prepare` without auth returns 401.
8. **Failover rehearsal:** click Redeploy, then check that `/healthz` `simLeader.epoch` increases and `lastTick` continues (it doesn't restart from 0).
9. **Stop for approval** before:
   - setting `MODE` to `devnet` (a reviewed edit to `.railway/railway.ts`);
   - adding RPC or treasury values;
   - the stage-2 split;
   - any production environment, mainnet RPC, real treasuries, or `FEE_ROUTING_VERIFIED=true`.
