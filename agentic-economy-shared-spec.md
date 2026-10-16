# Agentic Economy — Shared Build Handoff

**Version:** 0.2  
**Date:** 2026-10-14  
**Official brand:** Agentic Economy  
**Future platform token ticker:** $AECO (not minted or launched during MVP)  
**Suggested repository:** `agentic-economy`  
**Builders:** Codex = frontend and procedural world; Claude Code = backend, agent simulation, economy, persistence and Solana.  
**Status:** Implementation specification. Pump.fun fee routing and lifecycle assumptions must be verified against current official program/SDK behavior before mainnet deployment.

> **Instruction to both coding agents:** Read this entire document before modifying files. Implement in parallel within your assigned boundaries. Do not replace another agent's work, invent completed integrations, or commit secrets. Keep the application runnable incrementally. Favor a playable, testable vertical slice over disconnected screens or contracts.

## 1. Vision

Build Agentic Economy: one persistent, browser-based city that grows as token communities and their autonomous agents join. The platform's token launchpad creates tokens **through Pump.fun**. Only tokens created through our launch flow may become communities in this world; **no external token imports**. Their eligible holders can activate and configure autonomous agents. Agents live in the same world, choose professions, establish businesses, manufacture goods, fulfill contracts, transport inventory, and cooperate or compete in one shared simulated economy.

The city must be visually compelling, understandable without crypto expertise, and fun to observe even when the owner is offline. Buildings, roads, terrain, trees, factories, storefronts, and infrastructure should be generated **in code** using parametric meshes, deterministic seeds, instancing, and chunk streaming. Create an original look influenced by code-generated city-building aesthetics; **do not copy protected source or assets from Inkline Town without confirmed permission/license**.

**Branding:** The public product name is **Agentic Economy**, never just AECO. **$AECO** refers exclusively to the planned future platform token. Do not present $AECO as live, tradable, purchased, or required for MVP participation. Use "Agentic Economy" for app titles, navigation, README, metadata, and community-facing copy.

**Core principle:** Solana settles authorized ownership, token transactions, and service payouts; the server simulates routine city activity. Simulated City Credits are *not* redeemable for SOL or tokens unless an explicit, separately approved future mechanism exists. Avoid promising passive yield or profits from token holding.

## 2. Fixed product rules (do not silently change)

1. **Launchpad:** tokens are launched via official Pump.fun-supported mechanisms. Tokens launched elsewhere cannot be imported as communities.
2. **Launch charge:** a fixed **0.05 SOL** payment per launch goes **100% to the platform treasury**; clearly disclose any Solana network/account costs. An unsuccessful launch must not be presented as successful; make charge/creation semantics atomic where feasible, otherwise define refund/recovery behavior.
3. **Unrestricted launching:** any wallet may launch any number of tokens. **No** platform-imposed per-wallet limits, cooldowns, creator-history screening, duplicate-metadata restrictions, or manual launch approval gates. Validate transaction correctness/security without adding launch eligibility restrictions.
4. **Launcher creator-fee share:** **0%**. No creator-fee allocation to launcher wallet.
5. **Creator-fee allocation:** **60%** of creator fees actually received for the agent rewards treasury, **40%** for the platform treasury. This does **not** mean all trading fees: protocol and liquidity-provider fees remain governed by Pump.fun. Verify whether fee recipients/shares can be configured at creation, whether they can change, and how the arrangement survives graduation to PumpSwap. If a desired route is not supported, document the limitation and implement a safe, transparent supported alternative; do not claim unverified redirection.
6. **Agent rewards:** rewards from the agent treasury are based on **verified, useful economic services** under a bounded budget, **not** passive holding, token price, wash volume, or simple number of transactions. No guaranteed payouts.
7. **Platform treasury:** pays operational expenses and may fund publicly documented token buyback/burn operations only after the future $AECO token exists and the mechanism has been separately designed and reviewed. Do not implement automatic buybacks now.
8. **Economy:** all token communities coexist in **one shared world**. **Professions belong to individual agents**, never assigned exclusively to entire token communities.
9. **Token utility:** defer platform-token mint and trading until the product is working. Future token utility should relate to real services such as agent capacity, planning tools, and platform fees; do not depend on speculative returns.
10. **Authorization:** agents must never get unrestricted access to holder wallets. Any on-chain agent spending needs explicit limits, expiry, revocation, and per-action authorization as applicable.

## 3. User journeys

### 3.1 Visitor
- Opens landing page; sees living 3D city and public activity feed without signing in.
- Explores neighborhoods, buildings, and active community headquarters.
- Views token launch page, project pages, economic dashboard, and transparent treasury ledger.

### 3.2 Launcher
- Connects Solana wallet.
- Enters token name, symbol, description, image, and other Pump.fun-supported metadata.
- Reviews a clear fee breakdown: **0.05 SOL to platform**, external network/account charges, **0% launcher creator-fee share**, and 60/40 of collectible creator fees.
- Signs transactions and follows statuses: draft → wallet approval → submitted → confirmed / failed / recovery needed.
- On confirmed launch through our flow, receives a community page, project identity, and eligibility to build a community presence.
- Can launch again immediately with no platform-enforced frequency limit.

### 3.3 Token holder / agent operator
- Connects wallet and opens a community for a token launched here.
- Backend verifies token mint origin/registration and current token balance using trusted Solana sources; eligibility threshold is configurable, initially modest and clearly displayed. Avoid relying on client claims.
- Activates an agent, selects profession and personality, sets strategy, chooses a simulated operating budget, and starts it.
- Watches the agent move in the world, accept/complete services, manage inventories, negotiate, and maintain a transparent decision log.
- Can pause or adjust an agent. Agent cannot transfer tokens or spend SOL without a separate authorization flow.

### 3.4 Community
- Community page: token identifiers and links, holders/agent counts, headquarters, economic statistics, recent activity.
- Community branding may visually customize its headquarters; all professions remain available to its agents.
- Community prominence reflects sustained activity and useful services, not raw token trading volume.

## 4. Economic simulation

### 4.1 Starter industries and resources
- **Professions:** farmer, manufacturer, merchant, logistics operator, builder, property manager.
- **Starter production chain:** farm produces wheat → mill converts wheat to flour → bakery converts flour to bread → simulated residents consume bread.
- Additional common inputs: timber and stone for construction, energy or maintenance for operations.
- **City Credits:** internal, non-withdrawable ledger for salaries, inventory trades, input costs, and upkeep.
- Goods are server-authoritative: production needs time, capacity, materials, and finite inventory. No production from thin air.

### 4.2 Agent intelligence
- Deterministic ECS/simulation governs movement, jobs, production, logistics, inventory, events and market matching.
- A bounded planning layer selects goals, estimates risk, and proposes actions. Start with rule/utility-based planners; LLM planning can be added behind an explicit interface with budgets, timeouts, logs, and validation.
- Agent traits: profession; cooperative/competitive temperament; risk (low/medium/high); objectives (profitability, reliability, expansion); permissions; strategy.
- Every chosen action is validated by authoritative game rules. An LLM output is never directly trusted as a database or blockchain command.
- Inactivity and congestion must not halt the simulation; background agents can be simulated at lower fidelity.

### 4.3 Verified service rewards
- Define claimable **service tasks** such as delivery, verifiable inventory fulfillment, infrastructure maintenance, and resource delivery to city demand sinks.
- Verify provenance and state transitions: reserved inputs, actual movement or delivery, receipt, timestamps, ownership, budgets, unique task IDs.
- Avoid rewarding simple self-trading, repeated circular transfers, spam actions, or synthetic volume.
- Separate **earned City Credits** from **possible real payouts**. Real payouts require a funded reward budget, explicit eligibility policy, rate limits per task/budget (not launch frequency), risk checks, auditability, and claim/approval mechanism.
- Early MVP: record verified contribution **points and simulated reward estimates** only. Do not pay SOL or make live reward claims until payout contracts and economic/legal review are complete.

### 4.4 Economy stability
- Dynamic demand from population, building capacity, real production costs, deterioration/upkeep, and resource sinks.
- Anti-inflation: limited production, clear price discovery, maintenance, and controlled City Credit issuance.
- Keep the fee income ledger separate from City Credits and never invent a conversion rate between them.

## 5. Procedural world and scalability

- One persistent world, spatially divided into server-known regions and render chunks.
- Start with a compact **Genesis district** (e.g., 128×128 logical terrain cells); expand based on sustained active population, available infrastructure, and capacity—not merely number of launches.
- Generate original meshes in code: roads, paths, terrain edges, trees, rivers, bridges, homes, farms, markets, factories, warehouses, community headquarters, town hall.
- Parameter examples: `width`, `depth`, `height`, `floors`, `roofStyle`, `material`, `windowPattern`, `districtTheme`, `seed`.
- Deterministic building seed and persisted configuration guarantee consistency across clients and reconnects.
- Instanced meshes for repeated geometry; LOD/culling and chunk-based loading; smooth pan/zoom/orbit controls and responsive mobile fallback.
- Visible agents are a representation of authoritative server state; clients interpolate/reconcile position updates. Distant agents need not be individually animated.
- The same region can host multiple communities and professions. No one-community-one-district constraint.

## 6. Architecture and ownership boundaries

```text
apps/
  web/                   # Codex ONLY: frontend, game renderer, UI, API client
  server/                # Claude Code ONLY: API, real-time, economy, agent runtime
packages/
  shared/                # Shared schemas/types; Claude owns definitions, Codex consumes
  world-spec/            # Claude owns persistent world schema; Codex may add renderer-only types in web
programs/               # Claude Code ONLY: optional Solana programs / Anchor
infra/                  # Claude Code owns backend infra; frontend env examples coordinated
contracts/
  openapi.yaml           # Claude owns API contract; Codex reviews/consumes
  events.md              # Claude owns WebSocket event contract
  integration-notes.md   # Both append nonconflicting notes
```

**Visual target:** Use the user-provided Inkline Town screenshot as aesthetic inspiration: orthographic/isometric viewpoint, thin architectural outlines, off-white/light-grey background and ground grids, pastel muted roofs, simple shoreline/water, many compact buildings, airy low-contrast palette and readable road networks. All structures must be generated from code (geometry and edges), not screenshot textures, copied game assets or manually assembled premade city screenshots. Favor readable neighborhoods, variety in heights, roofs and footprints, subtle outlines, and densely populated blocks.

**Suggested stack:**
- Frontend: React + TypeScript + Vite (or Next.js if justified before scaffolding), React Three Fiber / Three.js, Tailwind, Zustand, lightweight API client, wallet adapter.
- Backend: TypeScript / Node.js, PostgreSQL, Redis (only where useful), HTTP API + WebSocket, deterministic simulation ticks, background jobs, Solana RPC/indexer.
- Solana: official Pump.fun API/SDK/program docs and supported launch/fee mechanisms. Rust/Anchor only for **genuinely necessary custom treasury/claim programs**; do not reimplement Pump.fun.
- Toolchain: prefer pnpm workspace, strict TS, Zod shared validation, Vitest, lint/typecheck, Docker Compose for local Postgres.

**Concurrency rule:** Both agents work on separate branches or worktrees. Claude owns any shared contract change, opens/records schema changes, and Codex updates generated/client-side consumers. Neither agent overwrites the other's source tree. Integrate only after API contract review and tests.

## 7. Backend contracts — initial proposal

Backend must publish an OpenAPI document, Zod types, test fixtures, and a stub/mock server (or deterministic fixture adapter) immediately. Agree on all schemas before connecting features. Paths can evolve with versioned contract updates.

### HTTP endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/world/bootstrap` | World seed, region boundaries, building catalog, current simulation time |
| GET | `/api/v1/world/chunks?x=&y=&radius=` | Generated/persisted chunk and building state |
| GET | `/api/v1/world/stats` | Population, economy, active agents, community counts |
| GET | `/api/v1/activities?cursor=` | Paginated public events |
| GET | `/api/v1/communities?cursor=` | Launched-on-platform communities |
| GET | `/api/v1/communities/:id` | Community and token details |
| GET | `/api/v1/communities/:id/agents` | Agent summary list |
| GET | `/api/v1/agents/:id` | Agent profile, location, inventory and performance |
| POST | `/api/v1/agents/activate` | Activate a token's one token-linked agent (token launcher's wallet only); `POST /api/v1/agents` is retired (410) since contract 0.3.0 |
| POST | `/api/v1/agents/house` | Demo only: create an ownerless house agent |
| GET | `/api/v1/me/activation` | Signed-in wallet's activation |
| PATCH | `/api/v1/agents/:id` | Update bounded strategy, pause/resume |
| GET | `/api/v1/agents/:id/activity` | Agent decision/action history |
| GET | `/api/v1/markets` | Simulated market prices and listings |
| GET | `/api/v1/tasks` | Available and verified service tasks |
| GET | `/api/v1/treasury` | Public fee and allocation summary, with reconciliation state |
| POST | `/api/v1/auth/challenge` | Sign-in message for wallet |
| POST | `/api/v1/auth/verify` | Verify signature, establish secure session |
| POST | `/api/v1/launches/prepare` | Validate metadata and prepare supported Pump.fun transactions and 0.05 SOL charge |
| POST | `/api/v1/launches/confirm` | Independently verify landed transaction + registration; idempotent |
| GET | `/api/v1/launches/:id` | Launch progress and errors |

Write schemas for `WalletIdentity`, `WorldChunk`, `Building`, `Agent`, `AgentStrategy`, `Community`, `LaunchDraft`, `LaunchStatus`, `TreasurySummary`, `EconomicEvent`, `Task`, `RewardRecord`, and `ApiError`. Use cursor pagination and idempotency keys on writes. Introduce auth and abuse safeguards for financial mutations, **without** restricting launch frequency or eligibility beyond paying the required fee.

### WebSocket events

- `world.snapshot` — bootstrap/sync on join, sequence number and server timestamp.
- `world.chunk.updated` — terrain/building changes.
- `agent.moved` — location updates sampled/throttled to client-relevant view.
- `agent.action` — validated actions and compact logs.
- `economy.price_updated` — affected resource quotes.
- `community.updated` — community and headquarters changes.
- `treasury.updated` — confirmed/reconciled fee events only.
- `system.notice` — incidents / maintenance / simulation status.

Define message versioning, heartbeats, reconnection, snapshot recovery, client subscription by visible region, and monotonically increasing stream sequence where feasible.

## 8. Fee flows and treasury control

```text
Launch wallet --0.05 SOL platform launch charge--> Platform Treasury (100%)
                \-- official Pump.fun token creation --> Registered Community

Pump.fun trades --> protocol / LP fees (Pump.fun-controlled)
                \--> creator fees actually allocated to our configured recipients
                          |--> Agent Rewards Treasury: 60%
                          \--> Platform Treasury: 40%
```

### Requirements

1. Use **dedicated on-chain treasury accounts** and clearly document their authorities, custody model, multisig and emergency processes.
2. **Never** promise the creator fee configuration is possible until the official Pump.fun implementation has been tested on applicable launch and graduated-pool paths. Prefer native fee splitting if supported; alternatively a provable, restricted allocation process from the actual recipient. No hidden custodian diversion or inaccurate “all fees” claims.
3. Persist an append-only ledger of on-chain transaction signatures, token mint, actual creator fees received, quote asset, chain slot, finality, claimed versus unclaimed balances, transfers, allocation, and reconciliation status.
4. Fee allocation must be computed from **actual realized creator fees**, not trade-volume approximations. Handle multiple assets without pretending all are SOL. Ensure 60/40 arithmetic and rounding residue are deterministic.
5. Any redistribution must be idempotent and replay-safe; no double payment on webhook retries or RPC reorganizations.
6. Keep launch-fee income separate from creator-fee income; **the 0.05 SOL goes entirely to platform**, not into the 60/40 calculation.
7. Agent treasury: reserve funded balance, define payout budget by period, approvals and/or claim mechanism, maximum exposure, emergency pause, recovery procedure, and public accounting. MVP = verified points and dry-run records, **not real payouts**.
8. Platform treasury: operational spending tracked separately from potential discretionary buybacks/burns. No automatic buyback mechanism in MVP.
9. No backend service or autonomous agent may hold unrestricted signing authority over users' personal wallets.
10. Before mainnet rewards and launches: independent contract audit as appropriate, legal review of fee-funded agent compensation and promotional claims, official Pump.fun compatibility and terms review.

## 9. Frontend build — Codex owns

### Screens
1. **Landing / live city:** full-bleed playable camera view of a generated town, world statistics, quick links, activity ticker.
2. **World explorer:** selectable buildings and agents, district markers, camera navigation, economy overlay and community highlights.
3. **Launchpad:** token metadata form, wallet connection, fixed fee breakdown and launcher 0% fee notice, prepared tx / sign / confirm statuses, repeated launches without cooldown.
4. **Token communities:** all registered on-platform tokens, search/filter, community page, HQ location and active agents.
5. **Agent Studio:** activate agent (using eligibility), choose profession/traits, configure strategy, review simulated budgets, agent activity and pause/resume.
6. **Economy:** resource flows, prices, buildings, verified work queue, public historical activity.
7. **Treasury:** clear public receipts and 60/40 split, separate 0.05 SOL launch-fee stream, confirmed vs estimated vs pending status.

### Renderer standards
- Original minimalist architectural city style; code-generated structures, clean silhouettes, outlined edges, subtle materials and lighting.
- No mandatory image-assets for buildings; write generators for at least house, farm, mill, bakery, market, warehouse, factory, tree, road and headquarters.
- Deterministic seeds and per-building parameters; no random visual reshuffle on rerender.
- Start with mock data **explicitly labeled Demo Mode**; frontend must switch to backend endpoint data through adapters without rewriting pages.
- Camera controls; raycast/select building/agent; smooth transitions; performant instancing and chunk culling; no memory leaks.
- Accessible UI, keyboard support, proper loading/empty/error states, responsive desktop/mobile fallback.
- Never construct transactions or infer fee config from unverified assumptions; use backend-prepared transaction flow and official wallet signing.

### Codex deliverables
- Running frontend with a believable generated Genesis district and moving demo agents.
- Clear typed API adapter, WebSocket manager, fake/mock implementation and real implementation.
- Screens listed above, with visible demo/real-data indicators.
- Renderer unit tests and smoke/browser tests for navigation and key UI journeys.
- `apps/web/README.md` with run commands and boundaries.

## 10. Backend build — Claude Code owns

### Core modules
- Wallet challenge/signature authentication with anti-replay sessions.
- Launch preparation, official Pump.fun integration, on-chain receipt verification, community registration; no extra restrictions on number of launches.
- Creator-fee route research + tested integration or documented blocker/alternative.
- Treasury receipt indexing and 60/40 reconciliation accounting; immutable event ledger.
- Community registry restricted to confirmed launches through our route.
- Holder eligibility checking from chain data with caching and clearly specified refresh semantics.
- Agent lifecycle, professions, rules-based planner and server-controlled actions.
- Resource/production/market/contract simulation, tasks and verifiable contribution records.
- Persistent world/chunk generator and backend-authoritative building placement.
- API and WebSocket gateway; fake/devnet modes; structured logging and health metrics.

### Claude deliverables
- Shared schemas plus OpenAPI and WebSocket contract **first**.
- Local DB migrations and seed fixtures matching frontend demo data.
- Deterministic simulation and tests proving production and inventory accounting.
- Idempotent launch confirmation and treasury ledger tests.
- Integration tests covering launch payment, duplicate confirmation, failed tx, unsupported fee routing and holder eligibility.
- `apps/server/README.md` with deployment and trust assumptions.

## 11. Milestones & acceptance gates

| Phase | Coordinated output | Exit criterion |
|---|---|---|
| **0 — Contract** | Workspace skeleton, Zod schemas, OpenAPI, fixtures, responsibility boundaries | Both agents can typecheck against identical contracts |
| **1 — Living City** | Procedural 3D Genesis district, backend persistent world, mock and real adapters | City renders from persistent seed; multiple clients see same layout |
| **2 — Autonomous Economy** | Agent lifecycle, farms/mills/bakeries, logistics, production, markets, activity feed | End-to-end wheat → flour → bread executes server-side and appears in UI |
| **3 — Communities** | Holder-authenticated agents and token community UI | Only verified on-platform launches may create communities; holder eligibility is enforced by server |
| **4 — Pump.fun Launchpad** | Official launch transactions and 0.05 SOL collection; verified registration | Unlimited consecutive wallet launches succeed; fee collection and failures are reconciled |
| **5 — Fee Treasury** | Creator-fee routing where supported, 60/40 ledger, dashboard, dry-run reward allocation | Chain amounts reconcile; post-graduation behavior verified; no double allocation |
| **6 — Production Hardening** | Load/performance, wallet flows, observability, audit/legal/terms checks | Ready for gated deployment; mainnet live payouts only after independent approval |

**Performance design target (not a guarantee):** maintain smooth local camera movement and sensible frame rate on a typical laptop with thousands of static instances by culling/LOD; measure and optimize before raising world scale. Do not treat 10,000 simultaneous visible agent animations as an initial requirement.

## 12. Working instructions for both coding agents

**Codex:** Use **Agentic Economy** as the product brand, and reserve **$AECO** for future-token references. You own only frontend/game rendering. Start with the procedural world, reusable parametric building generators, chunk rendering, camera/selection and polished demo dashboard. Consume `packages/shared`/`contracts` supplied by Claude. Do not implement a fake backend presented as live, Solana treasury code, token minting logic, or independent business rules. When backend work is not ready, use well-labeled fixtures and document blocked connections.

**Claude Code:** Use **Agentic Economy** as the product brand, and reserve **$AECO** for future-token references. You own only backend/shared contracts/on-chain integration. Start with contracts, DB schema, deterministic engine and a mock/seed server so Codex has stable interfaces. Verify official Pump.fun capabilities before promising fee routing, including fee recipient control after graduation. Keep user token spending separate from game simulation. Do not edit frontend components or overwrite Codex changes. Record API updates clearly.

**Both:**
- Preserve the fixed product rules above. No launch rate limits or approvals.
- Prefer small testable commits with meaningful commit messages.
- Run lint, typecheck, unit tests and relevant integration tests before handoff.
- Maintain `contracts/integration-notes.md` with completed work, interface changes, blockers and next-step dependencies.
- Keep real wallet / financial actions disabled in demo mode and labeled as such.
- Avoid any claim that a virtual profit represents redeemable SOL or future guaranteed earnings.
- Do not mint or launch $AECO during MVP.

## 13. First parallel work orders

### Work order A — Codex (frontend)

Read this file. Initialize `apps/web` within the agreed workspace structure. Build a polished, original, code-generated 3D Genesis district with selectable homes, farms, mill, bakery, market, HQ and roads; deterministic seeds; chunk abstractions; simple animated agents; responsive camera and selected-building panels. Build landing/world shell plus demo pages for Launchpad, Communities, Agent Studio, Economy and Treasury using typed fixtures and explicit Demo Mode labels. Use Claude's shared schemas once published, not independently invented incompatible contracts. Implement no real token transactions yet. Add smoke tests and write a precise frontend handoff.

### Work order B — Claude Code (backend)

Read this file. Initialize workspace/contracts first: OpenAPI, Zod models, event schema, seed fixtures, local Postgres setup. Implement durable world/chunk storage and deterministic simulation for wheat → flour → bread, backend agents with bounded decisions, inventory accounting and verified-service event records. Expose the documented HTTP/WebSocket interfaces with fixtures. Independently validate the current official Pump.fun token-creation and creator-fee-routing lifecycle, especially 0% launcher entitlement and 60/40 eligible creator-fee allocations across bonding curve and graduation; document supported/unsupported paths before implementing mainnet financial operations. Keep 0.05 SOL launch proceeds entirely platform-directed. Add end-to-end and failure-path tests and write backend handoff.

## 14. Explicitly deferred

- $AECO token mint and tokenomics publication.
- Live reward distributions and any promise of financial return.
- Automatic buyback or burn transactions.
- Complex governance, city elections, virtual asset tokenization, lending, and debt.
- Player-to-player real-asset settlement outside approved launch/treasury use cases.
- Massive multi-region rollout before simulation and rendering benchmarks.

---

**Integration principle:** First make a single shared city feel alive and economically coherent. Next establish verified launchpad identity and treasury receipts. Only then enable any real-money agent rewards under auditable, budgeted, reviewed rules.
