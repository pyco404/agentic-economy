# Frontend demo staging proposal — not applied

Prepared 2026-10-16 (Africa/Lagos). No Railway service, deployment, domain, variable, Dockerfile, Caddyfile or backend configuration has been created or changed. This is the reviewable handoff for Claude and the project owner.

## Recommended topology

Add a separate static frontend service, provisionally `agentic-economy-web`, in the existing project's **staging** environment. Keep Claude's API/simulation/Postgres topology unchanged. Source the frontend from the approved `codex/frontend` commit. The backend deploy branch/revision remains Claude's decision; confirm both releases use compatible shared contracts before connecting them.

Use a Node 24 build stage and a Caddy runtime serving only `apps/web/dist`. Railway's React guide recommends Caddy for built React assets and its monorepo guide describes separate frontend/backend services:

- https://docs.railway.com/guides/react
- https://docs.railway.com/guides/deploying-a-monorepo
- https://docs.railway.com/guides/spa-routing-configuration

This is an application-specific proposal based on those guides, not a claim that a deployment has been tested. Runtime image tags/digests should be pinned when the concrete Dockerfile is reviewed.

## Build and runtime settings to review

| Setting | Proposal |
| --- | --- |
| Environment | `staging`; keep production untouched |
| Source | This repository, `codex/frontend`, approved commit |
| Build context / root | Repository root, because frontend imports `packages/shared/src` |
| Proposed Dockerfile path | `apps/web/Dockerfile`; does not exist yet |
| Node | 24 in build stage |
| Package manager | `pnpm@11.5.1`, matching the current root `packageManager` |
| Install | `pnpm install --frozen-lockfile` at repository root |
| Build | `pnpm --filter @agentic-economy/web build` |
| Output | `apps/web/dist` |
| Runtime | Caddy, listening on Railway's injected `PORT`, all interfaces |
| TLS | Railway public edge terminates TLS; Caddy serves internal HTTP |
| SPA routing | Existing file first, then `index.html`; direct secondary-route refresh must work |
| Frontend health check | Proposed `/healthz` response from Caddy; not backend readiness |
| Assets | Hashed bundles may be cached immutably; HTML must revalidate |
| Watch paths | `apps/web/**`, `packages/shared/**`, `pnpm-lock.yaml`, `package.json`, `pnpm-workspace.yaml` |
| Persistent volume | None for the static frontend |

The root `pnpm-lock.yaml` already includes the web importer. The root `build` script currently targets backend/shared packages, so use the explicit web build command. Do not set the Railway root directory to only `apps/web`: the shared-source import would be outside the uploaded build context. Do not change package managers or lockfiles as part of this proposal. A clean, frozen container build still needs validation after the deployment files are approved.

The future Dockerfile must pass public `VITE_*` values into the **build** stage before Vite runs. Setting them only on the final Caddy container will not change an existing JavaScript bundle. Runtime should receive compiled assets, not source dependencies, browser-test artifacts, `.env` files or credentials. Do not serve through Vite's development or preview server.

## Exact domain handshake with Claude — pending

The user supplied the reported backend domain `agentic-economy-staging.up.railway.app`. Read-only checks on 2026-10-16 returned HTTP 200 for `/readyz`, `/healthz`, `/api/v1/world/bootstrap` and `/api/v1/world/stats`. Health reported `MODE=demo`, PostgreSQL persistence, a running simulation and `financialFeaturesEnabled=false`. The public WSS endpoint also returned a version-1 `world.snapshot` with reason `join`. These checks establish present connectivity, not frontend-origin CORS approval. No frontend public domain has been confirmed; that placeholder is deliberately not a deployable value.

An additional full-dashboard probe using the frontend's `HttpAdapter.load()` from Node timed out connecting to port 443, including a retry with Node's supported environment-proxy option. The separate HTTPS checks used Python; WSS used Node's native client. The differing transport results do not establish the cause. Full staging dashboard access and schema compatibility remain unverified by that probe. Repeat the complete HTTP/WSS journey from the actual frontend browser origin before deployment sign-off; do not treat endpoint health alone as end-to-end validation.

| Owner | Variable | Required value |
| --- | --- | --- |
| Frontend build | `VITE_DATA_MODE` | `api` |
| Frontend build | `VITE_API_URL` | `https://agentic-economy-staging.up.railway.app`; no `/api/v1` suffix |
| Frontend build | `VITE_WS_URL` | `wss://agentic-economy-staging.up.railway.app/api/v1/ws` |
| Backend / Claude | `MODE` | `demo` |
| Backend / Claude | `FEE_ROUTING_VERIFIED` | `false` |
| Backend / Claude | `CORS_ORIGINS` | Exact `https://<confirmed-frontend-host>` origin, without a trailing slash; retain other origins only if deliberately needed |
| Backend / Claude | `AUTH_URI` | Confirmed frontend URI, per existing backend handoff |
| Backend / Claude | `AUTH_DOMAIN` | `agentic-economy-staging.up.railway.app` per existing backend handoff; Claude must confirm the challenge-domain binding |

`api` selects the authoritative HTTP/WebSocket adapter; it does **not** enable production financial mode. Backend `MODE=demo` supplies labelled simulation/mock-chain records. `VITE_DATA_MODE=demo` instead selects offline frontend fixtures and would fail the intended live staging integration.

The browser must reach public HTTPS/WSS endpoints, not `localhost`, a Railway private hostname or an HTTP endpoint embedded in an HTTPS page. The API base excludes `/api/v1` because canonical route paths already include it. The WebSocket URL includes the full `/api/v1/ws` path. If `VITE_WS_URL` is omitted, the current adapter derives that path and upgrades HTTPS to WSS; explicitly setting it makes staging review clearer.

Claude owns backend CORS/auth configuration. Current CORS permits `GET`, `POST`, `PATCH`, `OPTIONS` and headers `Authorization`, `Content-Type`, `Idempotency-Key`. Confirm browser preflight succeeds for the exact frontend origin. Preserve authentication on write endpoints. The current WebSocket contract is a public read stream; do not add session tokens to its URL or introduce a conflicting authentication protocol.

## Authentication and demo restrictions

Keep wallet connection/signing, token-linked activation, live token launches, payments and payouts disabled. Current frontend HTTP requests support an optional bearer-token provider, but the application has no connected wallet/session UI. Do not inject a shared session or admin token into `VITE_*`, JavaScript, local storage or a public config response. No frontend session secret is required for public read-only demo staging.

Existing backend challenge/verify endpoints remain authoritative if authentication is implemented later. That is separate reviewed work; it must not bypass verified ownership or the one-token/one-agent/one-activating-wallet contract. Do not change fees, reward splits or economic rules for deployment. Pinata JWT, database URL, signing material and RPC secrets remain backend-only and are not needed by the static frontend.

Offline fixtures remain available only through the existing explicit, clearly labelled fallback. A staging backend outage must remain an error rather than silently showing fixture economic activity.

## Coordination message for Claude

Please confirm, before applying frontend staging:

1. Actual staging API HTTPS host, `/api/v1/ws` public upgrade support, backend release commit and readiness URL.
2. Chosen frontend public origin; add that exact origin to `CORS_ORIGINS` and confirm `AUTH_URI`/`AUTH_DOMAIN` against the existing challenge contract.
3. Backend remains `MODE=demo`, `FEE_ROUTING_VERIFIED=false`, with PostgreSQL persistence and a working simulation leader. Real launches/payments remain unavailable.
4. Public world/chunk/community/agent endpoints remain readable without wallet authentication. Authenticated write endpoints still reject missing sessions.
5. A coordinated API restart window for staging replay testing; frontend work must not interrupt Claude's process or change its source/configuration.

This file is the prepared handoff. No message has been sent to a separate Claude session, and no backend changes are claimed. Await the frontend domain decision, Claude confirmation and owner review before adding deployment files or applying Railway settings. The frontend domain must be obtained from the proposed Railway frontend service, then supplied to Claude; do not invent it or use localhost as its public origin.

## Acceptance after deployment is approved

- Clean build from the chosen commit with the frozen workspace lockfile; inspect the resulting bundle for correct public API/WSS values and absence of credentials/localhost defaults.
- Load `/`, refresh every secondary direct URL, close/reopen overlays, and verify one persistent canvas and socket through route changes.
- Confirm CORS preflight, bootstrap/chunks/communities/agents and real demo events over WSS. Confirm no mixed-content errors.
- Force a browser disconnect/reconnect and, with Claude's coordination, restart the API; confirm durable replay and unchanged persisted world identities.
- Verify desktop/mobile camera, UI scrolling, naming and full underground train cycle. Development-only review hooks must not be enabled in the production bundle.
- Verify demo labelling and disabled financial controls. Unauthenticated write calls must remain rejected by the backend.
- Frontend `/healthz` and backend `/readyz` must both pass; they test different services. Confirm backend health reports demo mode and financial features disabled.

Once this proposal is accepted, prepare separate one-file commits for the concrete Dockerfile, Caddyfile, build-context exclusions and deployment smoke tests. No Railway changes are authorized by this document itself.
