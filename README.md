# Agentic Economy ($AECO)

**A World That Works.**

[Official website](https://useaeco.xyz) · [Verify $AECO on Solscan](https://solscan.io/token/ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco) · [Follow @useaeco on X](https://x.com/useaeco) · [View on GitHub](https://github.com/pyco404/agentic-economy)

## Official $AECO token — Solana Mainnet

**Contract address (CA):**

```text
ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco
```

**Security notice:** Verify this exact Solana Mainnet mint before trading. A matching name, ticker or logo does not establish authenticity. Never share a private key or recovery phrase.

The official launch is [finalized on Mainnet](https://solscan.io/tx/3SBuLgV5Dk2cEMr12rLiyz5b7qi1wiDLxaZYKJDaEqgGUpcg7fPPuzNSkdeZ1DduQGLPuP3RzdrarXxPRo5W569H). [Explore $AECO](https://useaeco.xyz/explore/ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco) on Agentic Economy.

Agentic Economy is a Solana-based ecosystem combining token creation and discovery with a persistent procedural 3D city, an authoritative simulated economy, and rule-based agents that perform useful work. The application uses a persistent Three.js world beneath floating interfaces for Explore, Communities, Agent Studio, Economy, Treasury, Launch, and About.

![Agentic Economy World view with its isometric city, waterways, railways, and navigation](apps/web/public/gitbut-website-image.png)

**Live production:** [useaeco.xyz](https://useaeco.xyz) supports public Solana Mainnet TOKEN/SOL launches with personal wallet approval, verified token discovery and automatic $AECO holder Common Agents. Optional Developer Buy uses a SOL amount, defaults to off and is capped at 3.5% of supply. Each successful launch includes a separate 0.05 SOL Platform Treasury charge; eligible creator fees are configured as 60% Agent Rewards / 40% Platform / 0% launcher.

**Simulation and limitations:** The shared city and basic agent activities are simulated. City Credits are non-withdrawable; treasury payouts remain disabled. Local demos cannot execute real launches. Physical Phantom mobile authentication and layouts passed, but mobile on-chain acceptance remains deferred. Six high and four moderate dependency advisories remain subject to documented mitigations; no independent penetration test is claimed. Phase 2 public-release acceptance is complete; Phase 3 has not started.

Historical Devnet evidence remains in the [blockchain audit](apps/server/docs/phase2-final-blockchain-audit.md) and [Create Coin workflow](apps/web/docs/create-coin-workflow.md). Those records describe their dated verification scope, not current production activation status.

## About the project

Agentic Economy brings token communities into one shared, explorable city. Communities have a presence in the world, agents perform useful work, and the economy records what happens. The goal is to make community activity understandable through a living place: workplaces, neighborhoods, resources, and a public record of services.

The city is the permanent foundation of the website. Opening Explore, Agent Studio, or Treasury places an interface above the same world rather than replacing it with a separate scene. Visitors can look around without connecting a wallet.

Navigation uses clean paths: `/launchpad`, `/explore`, `/communities`,
`/agent-studio`, `/economy`, `/treasury`, `/roadmap` and `/about`. World remains `/`.
Token details use `/explore/<mint>`. Legacy `/#launchpad`, `/#studio` and similar
links normalize automatically, preserving query parameters. Direct visits and
refreshes use the frontend SPA fallback; API and missing asset paths retain their
real responses.

### What you can do

| Page | Purpose |
| --- | --- |
| World (`/`) | Explore the isometric city, inspect buildings and agents, and follow city activity |
| Launch | Enter your token details and logo, authenticate your wallet, review costs, and personally sign a TOKEN/SOL launch |
| Explore | Browse confirmed platform listings through New launches, agent rankings, search, and token details |
| Communities | Discover the communities represented in the city and their associated agents |
| Agent Studio | Inspect agent identities, current assignments, work progress, and supported controls |
| Economy | Inspect resource markets, production, and the useful-work queue |
| Treasury | Review accounting, receipts, and reconciliation information |
| About | Learn about the project, mission, and ecosystem |
| Roadmap | Eight development phases with verified milestones and planned scope (`/roadmap`) |

Explore includes market discovery and token details. Verified Solana RPC data supports bonding-curve and graduated pool metrics; external providers supplement available statistics. Historical trade indexing reconciles finalized events without double-counting. Incomplete coverage and unavailable metrics are labelled rather than invented; agent activity is never trading performance.

### How the living economy works

1. The backend maintains the authoritative world, community records, agents, inventory, and accounting state.
2. A deterministic simulation assigns work and advances travel, production, delivery, and maintenance tasks.
3. The frontend reads API snapshots and WebSocket updates, then displays the resulting activity in the persistent Three.js city.
4. Environmental motion such as ambient transport adds life to the scene. Decorative movement does not create financial receipts or imply economic transactions.

The agents use a deterministic planner, not an LLM making live decisions. Each qualifying unique $AECO holder wallet automatically receives one persistent Common Agent without login, registration or manual activation. Basic simulated activity is live; advanced economic capabilities, rentable Super Agents and funded rewards remain future features. TOKEN/AECO pairing remains reserved for Phase 4.

### Technology

- **Frontend:** React, TypeScript, Vite, Three.js, and responsive floating page interfaces.
- **Backend:** Node.js, Fastify, WebSocket updates, and separate API/simulation/indexer roles where configured.
- **Data:** PostgreSQL for persistence, an in-memory local demo option, and shared Zod contracts.
- **Token preparation:** Solana wallet message authentication and server-side Pinata/IPFS uploads when configured.
- **Hosting:** Railway for application services and PostgreSQL; Vercel manages domain registration and DNS.

The official $AECO launch and Phase 2 public-launch activation have completed. Future roadmap items are not implied by token ownership or by simulated city activity. See the [public roadmap](https://useaeco.xyz/roadmap).

## What works on main

| Area | Implemented | Limits |
| --- | --- | --- |
| World | Procedural architecture, roads, animated water, railways, ambient transport, agent labels, inspection, camera controls, and a lake–river connector with bridges | Complete static-world readiness precedes the 2.6-second presentation reveal; ambient vehicles do not generate economic events |
| Agents and economy | Authoritative assignments, travel, workplace activity, production, deliveries, maintenance, receipts, and observable work progress | Agents currently use a deterministic utility planner, not a live LLM service |
| Communities and Explore | Grouped discovery sections, confirmed launch/community listings, search, agent rankings, and token details | Demo records are labelled; unavailable market statistics and charts are not invented |
| Launch workspace | Publicly visible form and logo picker; wallet message authentication; owned drafts; verified image upload and IPFS metadata when configured | Disconnected primary action is **Connect wallet**; **Create Coin** starts validation, deferred uploads, metadata and fee review on enabled networks; wallet signing remains explicit; demo staging does not execute launches |
| Trading pairs | TOKEN/SOL only; optional SOL-budget Developer Buy, capped at 3.5% of supply | USDC launch code is retained but disabled and outside Phase 2; TOKEN/AECO is reserved for Phase 4 |
| Treasury | Receipt/accounting views and reconciliation information | City Credits are simulation accounting units; reward points are not withdrawable tokens or promised payouts |

Historical [Phase 2 verification, 22 October](apps/server/docs/phase2-review-2026-10-22.md): actual public-Devnet SOL creator-fee collection and staging Pinata uploads were verified at that checkpoint. The replacement Helius key has been verified active on staging. Physical Phantom mobile authentication, image preview, folded/unfolded layouts and session restoration passed; mobile on-chain acceptance is deferred at the owner’s request.

Code on main is **not necessarily deployed to production**. Verify the deployed release separately.

## Repository layout

```text
apps/web/              React, TypeScript, Vite, Three.js frontend
apps/server/           Fastify HTTP API, WebSocket, simulation, auth, IPFS services
packages/shared/       Canonical Zod contracts, API definitions, fixtures
packages/world-spec/   Deterministic world generation and parcel geometry
contracts/             OpenAPI, event, identity, and agent-work documentation
infra/                 Local PostgreSQL and Railway deployment configuration
video/                 Explainer-video source and asset licence information
AGENTS.md              Current development and release rules
```

Codex maintains both frontend and backend. Use the root pnpm workspace and committed lockfile. Older component guides may contain historical npm, branch, ownership, or deployment instructions; use this README and [AGENTS.md](AGENTS.md) for the current workflow.

API references: [HTTP/OpenAPI contract](contracts/openapi.yaml) and [WebSocket event protocol](contracts/events.md). Treat backend state and the shared contracts as authoritative; frontend scenery must not invent economic activity or alter persisted parcels.

## Run locally — safe in-memory demo

Requirements: **Node.js 22 or newer** and **pnpm 11.5.1**. Docker builds currently pin Node 24.13.0. A database, Solana RPC, wallet, and Pinata account are not required to view the demo city.

Run these commands from the **main checkout**, not a preserved legacy worktree.
Vite serves files from the checkout that started it; fetching/pushing main or deploying
Railway does not update a running dev server in another checkout. Check before starting:

```bash
git branch --show-current  # must be main
git worktree list          # locate main when older worktrees are preserved
```

Keep unfinished files in their existing worktrees. Stop only the stale frontend dev
server, then start the frontend from main. Both Vite development and the production
build use the same complete-world readiness barrier and 2.6-second cinematic reveal;
reduced-motion settings intentionally skip the presentation animation.

The frontend and API must also use compatible contracts. An older 0.2.0 local API
lacks the 0.3.x agent identity fields and can render the terrain while the dashboard
reports unavailable. Do not fix that by fabricating identities or automatically
migrating an existing database. The isolated in-memory demo below provides a safe
main-version API without altering persisted worlds.

From that main repository root:

```bash
pnpm install --frozen-lockfile
```

Start the backend in terminal 1:

```bash
MODE=demo ROLE=all DATABASE_URL= PORT=8787 FEE_ROUTING_VERIFIED=false \
AUTH_URI=http://localhost:5173 \
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 \
pnpm dev:server
```

The explicit empty `DATABASE_URL` selects memory storage and avoids database startup migrations, even if a local environment file contains a database URL. Demo data resets when this process restarts. Existing environment variables override values loaded from `apps/server/.env`.

Start the frontend in terminal 2:

```bash
pnpm --filter @agentic-economy/web dev
```

Open **http://localhost:5173/**. The World home is `/`; other pages open as overlays. A disconnected visitor can open Launch and prepare fields or preview a logo. **Connect wallet** opens wallet selection; authentication signs a message, not a payment or launch transaction.

If an older API already occupies port 8787, leave it and its database alone. Start
the isolated main demo with `PORT=8795` in the backend command above, and start the
frontend with matching public addresses:

```bash
VITE_API_URL=http://localhost:8795 VITE_WS_URL=ws://localhost:8795/api/v1/ws \
pnpm --filter @agentic-economy/web dev
```

These two public addresses may also go in the main checkout's ignored
`apps/web/.env.local` for subsequent local starts. Use the same addresses when
building a local production preview. Local env files are not a Railway deployment
configuration; staging retains its existing API and WebSocket addresses.

After authentication, **Create Coin** validates and automatically persists wallet-owned details, uploads the selected logo, pins metadata, and prepares a review on enabled networks. The user reviews fees and explicitly approves wallet signing. Images stay local until that action. The local demo keeps creation disabled while previews remain available. No separate Save draft or My Drafts step is required. Recovery preserves the existing launch intent and reconciles uncertain submissions before a replacement transaction can be approved.

The frontend defaults to the local API. If custom configuration is needed, create `apps/web/.env.local` using [apps/web/.env.example](apps/web/.env.example), without overwriting existing settings:

```dotenv
VITE_DATA_MODE=api
VITE_API_URL=http://localhost:8787
VITE_WS_URL=ws://localhost:8787/api/v1/ws
```

Restart Vite after changing these values. `/?source=backend` explicitly selects the API; `/?source=fixtures` explicitly selects recorded offline demo fixtures. API failures never silently switch to fixtures.

Check backend connectivity:

```bash
curl http://localhost:8787/healthz
curl http://localhost:8787/readyz
```

## Configuration and secrets

| Setting | Purpose |
| --- | --- |
| `MODE=demo`, `FEE_ROUTING_VERIFIED=false` | Required development/staging financial restrictions |
| `ROLE=all` | Combined API, WebSocket, and simulation for a simple demo |
| `DATABASE_URL` | Server-only PostgreSQL connection; leave empty for memory demo |
| `WORLD_SEED` | Persistent world seed; do not change for an existing database |
| `AUTH_URI`, `CORS_ORIGINS` | Exact allowed website origins, including scheme and local port |
| `PINATA_JWT` | Server-only Pinata credential; never a `VITE_` variable |
| `IPFS_GATEWAY` | Public HTTPS gateway for pinned assets |
| `LOGO_MAX_BYTES`, `LOGO_MAX_PIXELS` | Backend image limits; defaults are 5,000,000 bytes and 16,000,000 pixels |
| `VITE_API_URL`, `VITE_WS_URL` | Public frontend API/WebSocket addresses; compiled at build time |

See [apps/server/.env.example](apps/server/.env.example) for the full server template. Never commit environment files, credentials, private keys, database dumps, or real wallet secrets. Pinata is optional: without its credential, upload/pinning is unavailable while authenticated draft saving remains supported. Supported logo formats are PNG, JPEG, and WebP; the backend decodes and validates content before pinning. Public IPFS assets may remain accessible after draft deletion.

Wallet challenges must match the requesting site's exact origin. For example, `http://localhost:5173` and `http://localhost:5174` are different origins. Do not fix a wallet-origin error by weakening message verification or allowing arbitrary origins.

## Identity and financial rules

- One eligible platform token mint → one token-linked agent → one verified activating wallet. A wallet cannot activate another token-linked agent for a different token. Retries are idempotent; backend persistence enforces uniqueness.
- Ordinary fungible holdings do not establish exclusive agent ownership. Legacy agents remain distinct from verified token activations.
- House agents have stable readable names such as `Fern_108`, without invented wallet addresses. Wallet-activated names use the shortened verified activating wallet.
- The launch charge is **0.05 SOL**, entirely allocated to Platform Treasury. Saving drafts or uploading images does not charge it.
- Eligible verified human-launch creator-fee receipts follow **60% Agent Rewards / 40% Platform / 0% launcher**. Account for the actual received asset; do not assume every receipt is SOL.
- Super-Agent rentals, their proposed fee policies, funded rewards, and treasury payouts require separate implementation and approval. Roadmap copy is not proof of available functionality.

See [identity contracts](contracts/agent-identity.md), [agent work](contracts/agent-work.md), and the [ecosystem implementation notes](apps/web/ECOSYSTEM_CONTENT_HANDOFF.md).

## Validation

Run from the repository root:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm --filter @agentic-economy/web build
pnpm --filter @agentic-economy/server exec node \
  --conditions=@agentic-economy/source --import tsx scripts/gen-contracts.ts --check
```

Root `pnpm build` builds the shared packages and backend; the separate web build produces the frontend. PostgreSQL-dependent tests are skipped without their explicit test configuration. Only use independently named disposable test databases: some database tests reset their schemas. Never use development, staging, or production database credentials for tests.

The isolated wallet/upload browser suite uses a memory backend, test signatures, and mocked Pinata:

```bash
pnpm build
pnpm --filter @agentic-economy/web exec playwright test \
  --config=playwright.launchpad.config.ts
```

It requires Chromium/Chrome (default `/usr/bin/google-chrome`, configurable with `CHROME_PATH`) and free ports 5186/8796. `PLAYWRIGHT_NATIVE_GPU=1` optionally enables local hardware rendering. The default general Playwright configuration instead starts a database-backed integration helper: review its database target and migration implications before running it.

## Hosting and release workflow

**Application hosting is on Railway; Vercel manages domain registration and DNS only.** Production uses one environment with frontend, combined backend/API/simulation/indexer (`ROLE=all`) and isolated `aeco_production` PostgreSQL. Frontend build context is the repository root with `apps/web/Dockerfile`; backend uses `infra/railway/Dockerfile`. Single-writer leadership protects simulation persistence.

| Domain | Service |
| --- | --- |
| `useaeco.xyz` | Live production frontend |
| `www.useaeco.xyz` | Redirect to the primary domain |
| `api.useaeco.xyz` | Production API; WebSocket path `/api/v1/ws` |

Staging is preserved but inactive and is not a release dependency. The obsolete public-demo environment has been retired. No staging or demo data is copied into production.

Workflow: local tests → isolated local/Devnet verification where relevant → production build → pinned Railway production release → actual public-domain verification. Record deployed commits and retain rollback information. Repository auto-deploy triggers remain absent; pushing Git does not deploy the application. Financial activation, secret changes and database migrations are separate decisions.

**PostgreSQL-backed startup and Railway pre-deploy commands can run migrations.** The approved production boundary is migrations 001–005; further migrations require separate approval and a verified backup/restore. Never point database tests at production or automatically restore another environment's records.

Historical checkpoint: the 18 October release at `dd17c4f` retained existing agents and draft records after the approved staging identity and backup/restore rehearsal. Earlier migration and staging gates describe that checkpoint, not current production status.

Historical release context: [main transition](infra/railway/MAIN_TRANSITION.md), [earlier frontend staging proposal](apps/web/STAGING_PROPOSAL.md), [DNS instructions](apps/web/DNS_INSTRUCTIONS.md), and [backend role architecture](infra/railway/README.md). Dated staging gates in these records preserve project history; the current workflow is production-only.

## Git workflow

**One active development branch: `main`.** Maintain frontend and backend together; inspect changes, test, then make granular one-file Conventional Commits wherever feasible. Preserve existing published commit history and unfinished local work. Do not create routine development branches/PRs, force-push, squash old history, or reset away work.

Stage an explicit file and verify its commit:

```bash
git add -- path/to/reviewed-file
git diff --cached --stat
git commit -m "fix(scope): describe the actual change"
git diff-tree --no-commit-id --name-only -r HEAD
```

After verifying production remains isolated and the complete series passes validation, use a normal `git push origin main`. A successful push is not proof of deployment. Confirm actual deployed SHAs and live website/API/WebSocket behavior. See [AGENTS.md](AGENTS.md) for the permanent rules.

## Troubleshooting

- **“Couldn't load the city / Failed to fetch”:** start both development servers, check `/healthz` and `/readyz`, then verify HTTP/WebSocket URLs and CORS. Offline fixtures are an explicit preview, not an automatic recovery path.
- **Wallet domain mismatch:** compare the full address-bar origin with the challenge domain/URI and allowed CORS origins, including the port. Never share a seed phrase or private key to debug authentication.
- **Upload unavailable:** check backend Pinata configuration; connecting a wallet alone cannot enable an unconfigured upload service.
- **Changes missing online:** compare GitHub main with actual Railway deployment SHAs and the release gate. Local changes or a successful Git push do not mean production is serving them.
- **Port already in use:** identify the existing process before replacing it; if using different ports, update frontend API/WebSocket addresses and backend authentication/CORS origins together.

Read-only Explore market data and creator-fee accounting: [Task 4 implementation, evidence and release gates](apps/server/docs/phase2-task4-market-accounting.md). Market availability and verified receipts are never simulated as live data. Configured creator-fee shares are distinct from actual collected or distributed receipts; treasury payouts remain disabled.

Physical Phantom mobile on-chain acceptance is deferred; authentication/layout checks passed. Desktop Developer Buy and public-Devnet SOL creator-fee collection are complete.
