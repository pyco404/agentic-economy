# Railway frontend staging configuration and Claude handoff

Prepared 2026-10-16 (Africa/Lagos). The official domain is `useaeco.xyz`. All application hosting stays on Railway; Vercel handles registration/DNS only. Production configuration and financial operations remain review-only.

## Prepared frontend files

- `Dockerfile`: Node `24.13.0-slim`, pnpm `11.5.1`, frozen frontend/shared install, validated public build arguments, Vite production build, Caddy `2.11.7-alpine` runtime as UID/GID 65532.
- `Dockerfile.dockerignore`: allowlists frontend/shared inputs; excludes backend, programs, infrastructure, credentials, local environment files, dependencies, generated artifacts and screenshots.
- `Caddyfile`: listens on `PORT` (8080 fallback), `/healthz`, SPA fallback, asset caching, explicit API-path isolation, and the production `www` redirect. Railway terminates HTTPS.
- `scripts/validate-hosting-env.mjs` and `scripts/hosting.test.mjs`: reject offline fixture mode, insecure/private endpoints, embedded credentials and incorrect API/WSS pairing.
- `scripts/check-static-host.mjs`: tests a real static server's health, routes, cache behavior, missing resources and applicable redirect behavior.
- `scripts/check-hosting-browser.mjs`: validates a compiled app through an actual browser; public checks require demo API data, WSS, persistent rendering and no write calls. Explicit local fixtures cannot certify public staging.
- `DNS_INSTRUCTIONS.md`: exact ownership map, record specifications and staging-first DNS sequence.

The prior proposal is now implemented as local frontend configuration. No Railway service/domain/variable or Vercel DNS mutation was made while preparing these files. No Vercel frontend deployment is part of this plan.

## Claude-owned service settings

The inspected staging inventory has API and PostgreSQL but no frontend service. The user confirmed that it has not been provisioned and instructed Codex to prepare this handoff for Claude. Claude owns Railway infrastructure. Provision a dedicated `agentic-economy-web` instance **only in staging**; provide its service ID and generated domain to Codex for frontend deployment/verification. Do not reuse the existing failed production service or change backend IaC ownership through a broad apply.

| Setting | Required staging value |
| --- | --- |
| Project | `agentic-economy`, ID `c0003363-55ab-497b-a994-a1d07002b87d` |
| Environment | `staging`, ID `120cbd41-56b8-446d-b9d5-9db71cfc580a` |
| Service | New frontend service; proposed `agentic-economy-web` |
| Source branch | Approved `codex/frontend` commit; no direct push to `main` |
| Build context / root | Repository root, not `apps/web` alone |
| Builder / Dockerfile | Dockerfile, `apps/web/Dockerfile` |
| Watch paths | `apps/web/**`, `packages/shared/**`, `pnpm-lock.yaml`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` |
| Runtime command | Docker image default Caddy command; no backend migration or Node server command |
| Health / timeout | `/healthz`, 120 seconds |
| Runtime port | 8080, or Railway-injected `PORT`; domain target must match |
| Replicas / storage | One frontend replica initially; no volume |
| Planned custom domain | `staging.useaeco.xyz` |
| Public networking | Railway generated domain for initial checks; assigned hostname must be recorded, never guessed |

Do not use the root `build` script: it currently builds backend/shared packages. The Dockerfile uses `pnpm --filter @agentic-economy/web build`. Existing workspace lock/manifests stay unchanged. The shared schemas are copied as build inputs because the frontend imports their source. No backend code executes in the frontend runtime.

Docker is not installed locally. The matching pinned Caddy binary was verified against both official release checksums and its SHA-256 asset digest, and its actual configuration was tested locally. A separate clean directory passed the frozen install and production build with only frontend/shared inputs and the planned custom API/WSS URLs. The produced bundle contains both expected public URLs; local Caddy health/route/cache/redirect checks passed. Hosting-environment tests (3), typecheck, lint and 93 frontend unit tests passed. A real browser also passed local compiled-bundle deep-link refresh and persistent-scene checks behind Caddy using explicit fixtures; this local fixture check is not public API/CORS certification. This does not claim a Docker image or Railway deployment has already passed.

## Frontend public build variables

| Variable | Final staging target | Temporary bootstrap alternative |
| --- | --- | --- |
| `VITE_DATA_MODE` | `api` | `api` |
| `VITE_API_URL` | `https://api-staging.useaeco.xyz` | `https://agentic-economy-staging.up.railway.app` |
| `VITE_WS_URL` | `wss://api-staging.useaeco.xyz/api/v1/ws` | `wss://agentic-economy-staging.up.railway.app/api/v1/ws` |

Use the bootstrap pair only while custom API DNS/certificates are pending, then rebuild with the final pair. API base must have no `/api/v1` suffix. These `VITE_*` values must reach Docker build arguments before Vite runs; changing only runtime variables does not update a built bundle. The Dockerfile fixes `VITE_DATA_MODE=api` and rejects missing/bad public URLs instead of shipping localhost defaults.

`api` means authoritative HTTP/WebSocket data, not production financial mode. Backend `MODE=demo` controls labelled simulation/mock-chain records. The current wallet/signing/real launch/payment/payout controls remain disabled. No browser token, database URL, Pinata JWT, signing material or RPC secret belongs in frontend variables or image layers.

## Backend/CORS/auth handshake — Claude

| Backend setting | Proposed staging value |
| --- | --- |
| `MODE` | `demo` |
| `FEE_ROUTING_VERIFIED` | `false` |
| `CORS_ORIGINS` | `https://staging.useaeco.xyz`, plus the actual generated frontend origin temporarily if needed for initial verification |
| `AUTH_URI` | `https://staging.useaeco.xyz` |
| `AUTH_DOMAIN` | Proposed `staging.useaeco.xyz` for the user-facing sign-in domain; Claude must confirm the intended challenge-domain binding before changing it |

The server currently interpolates configured `AUTH_DOMAIN`/`AUTH_URI` into the signed challenge; the frontend does not implement signing. Earlier backend notes used the generated API hostname for `AUTH_DOMAIN`. The new planned frontend hostname is a proposal for Claude to review, not an unannounced contract change. Preserve bearer-session authentication on writes and the public read-stream WebSocket protocol. Do not enable wallet activation/signing to validate hosting.

Current CORS methods are GET/POST/PATCH/OPTIONS; allowed headers are Authorization, Content-Type, Idempotency-Key. Exact frontend origin must pass preflight before end-to-end sign-off. Localhost is a development origin, not the public staging origin. No broad `*` origin is proposed.

Claude should register `api-staging.useaeco.xyz` on the staging API, provide its Railway DNS target/TXT verification, confirm backend release and readiness, and keep PostgreSQL persistent. Follow the existing topology: demo currently runs ROLE=all; split API/simulation/indexer services are Claude's infrastructure decision. Do not create a second simulation leader or enable the chain indexer in demo. Production uses a separate environment/database and remains unmodified.

## Existing public-backend checks

The user-reported generated backend returned HTTP 200 for readiness, health, bootstrap and world stats. Health reported demo mode, PostgreSQL, a running simulation and financial features disabled. Public WSS returned a version-1 join snapshot.

A full-dashboard Node adapter probe timed out connecting to port 443, including an environment-proxy retry; the separate successful HTTPS checks used Python. The cause is not established. Repeat the entire browser data journey after the actual staging frontend is deployed and its exact origin is authorized. Endpoint health alone is not full staging validation.

## Staging deployment and acceptance sequence

1. Claude provisions the dedicated staging frontend service and confirms frontend/API custom-domain records and backend CORS/auth configuration. Codex owns the frontend build files; no backend source/config changes are made by Codex.
2. Deploy the approved frontend commit to that exact service/environment. Use the generated API URL pair initially if custom API DNS is not ready. Record the build/deployment IDs and actual generated frontend domain. A pending DNS record must not be disguised as a completed custom-domain deployment.
3. Apply reviewed staging-only DNS records in Vercel after login, then wait for Railway verification and HTTPS certificates. Keep apex, www and production API records untouched. See `DNS_INSTRUCTIONS.md`.
4. Once custom API is healthy, rebuild with the final API/WSS pair and verify `https://staging.useaeco.xyz`.
5. Run `node scripts/check-static-host.mjs https://staging.useaeco.xyz` and `node scripts/check-hosting-browser.mjs https://staging.useaeco.xyz`; inspect route refreshes, cache headers, demo mode and disabled wallet controls.
6. Verify browser CORS, real bootstrap/chunks/communities/agents, live WSS events, disconnect/replay, one persistent scene/socket through routes, desktop/mobile layout, and the complete railway cycle. Coordinate any API restart with Claude.
7. Confirm demo labels, disabled financial controls, backend financial features disabled, and rejection of unauthenticated write calls. No real launch, payment, mainnet or treasury-signing test is permitted.
8. Report staging results and exact DNS changes for production review. Do not deploy production or modify its DNS/financial configuration without separate approval.

## Pending coordination/access

At inspection time the frontend service ID and assigned Railway custom-domain record values were unavailable. Vercel CLI reported that a fresh `vercel login` is required; DNS delegation itself was confirmed. The existing failed production service remains untouched. These conditions are recorded rather than bypassing the ownership boundary or claiming a deployment succeeded.

## Sources

- https://docs.railway.com/guides/react
- https://docs.railway.com/guides/deploying-a-monorepo
- https://docs.railway.com/networking/domains/working-with-domains
- https://vercel.com/docs/domains/managing-dns-records
