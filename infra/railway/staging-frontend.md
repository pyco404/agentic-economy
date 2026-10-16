# Staging frontend on Railway — provisioning record and Codex handoff

Provisioned 2026-10-16 by Claude in Railway project `agentic-economy` (`c0003363-55ab-497b-a994-a1d07002b87d`), environment **`staging`** (`120cbd41-56b8-446d-b9d5-9db71cfc580a`) only. The production environment was not modified. Hosting is Railway; Vercel is DNS only.

## Services

| | Frontend | Backend (existing) |
|---|---|---|
| Service | `agentic-economy-web` | `agentic-economy` |
| Service ID | `b14eb48d-b9b6-4b25-990c-9229d378c2a2` | `c2b39851-a41b-4eab-9223-d2f6394b007f` |
| Source | `pyco404/agentic-economy`, branch **`codex/frontend`** (every push redeploys staging) | branch `staging` |
| Build | `apps/web/Dockerfile`, repository root context; watch: `apps/web/**`, `packages/shared/**`, `pnpm-lock.yaml`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` | `infra/railway/Dockerfile` |
| Runtime | Caddy, `PORT=8080`, health `/healthz` (120 s), 1 replica, no volume | `ROLE=all`, `MODE=demo`, `FEE_ROUTING_VERIFIED=false` |
| Railway URL | https://agentic-economy-web-staging.up.railway.app | https://agentic-economy-staging.up.railway.app |
| Custom domain | `staging.useaeco.xyz` (verified, Let's Encrypt certificate) | `api-staging.useaeco.xyz` (verified, Let's Encrypt certificate) |

Configuration lives in `.railway/railway.ts` (frontend service, build variables, backend CORS/auth). Domains were attached with `railway domain` so an IaC apply never touches existing domains.

## Frontend build variables (set on the service; Docker build arguments)

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://api-staging.useaeco.xyz` |
| `VITE_WS_URL` | `wss://api-staging.useaeco.xyz/api/v1/ws` |
| `VITE_DATA_MODE` | `api` (fixed in the Dockerfile) |

Set from `API_PUBLIC_URL` in `.railway/railway.ts`; changing it and applying rebuilds the frontend. The generated API domain keeps working.

## Backend CORS and wallet sign-in

- `CORS_ORIGINS`: `https://staging.useaeco.xyz`, `https://agentic-economy-web-staging.up.railway.app`, `http://localhost:5173`, `http://127.0.0.1:5173`. No wildcard.
- `AUTH_DOMAIN=staging.useaeco.xyz`, `AUTH_URI=https://staging.useaeco.xyz`. Sign-In With Solana names the site the user signs in to (the frontend), which wallets compare with the requesting page. Consequence: signing in from the generated Railway frontend URL or localhost shows a domain mismatch in wallets; use `staging.useaeco.xyz` for any wallet test. Wallet signing stays disabled in the frontend for now.
- Staging stays `MODE=demo`; no chain, treasury or signing variables are set; financial features are disabled.

## DNS records in Vercel (zone `useaeco.xyz`) — created 2026-10-16 via the Vercel CLI

| Type | Name (host) | Value | Purpose |
|---|---|---|---|
| CNAME | `staging` | `9j45u3uc.up.railway.app` | frontend traffic |
| TXT | `_railway-verify.staging` | `railway-verify=a1d9b9c02cfe34ad5a13f3d2b8d44786c7bd38a93ebb37ec747600eb6cac8fa4` | Railway domain ownership |
| CNAME | `api-staging` | `45mhwwbf.up.railway.app` | API + WebSocket traffic |
| TXT | `_railway-verify.api-staging` | `railway-verify=0838f3860c8b6f496c1604f2bbcc7df2779a6412186132bf357e861cf5516271` | Railway domain ownership |

Vercel record IDs: `rec_9df50a050a70358ee06b5653`, `rec_b711e57f30d287693e6382c5`, `rec_ef1948c70369049036603d9a`, `rec_6dcda577e9a9d17077e0139e`. The apex, `www`/wildcard and CAA defaults were not changed. Check with `railway domain status <domain> --service <service> --environment staging`.

## Verified 2026-10-16 (after DNS)

- `https://staging.useaeco.xyz/healthz` and `https://api-staging.useaeco.xyz/readyz` return 200 with valid certificates.
- The frontend bundle targets `https://api-staging.useaeco.xyz` and `wss://api-staging.useaeco.xyz/api/v1/ws`.
- API: contract 0.2.0, demo mode, simulation running, financial features disabled, 9 agents preserved.
- CORS allows `https://staging.useaeco.xyz` (and the generated frontend origin, localhost); unknown origins get no CORS headers. Unauthenticated writes return 401.
- Sign-in challenge reads `staging.useaeco.xyz wants you to sign in with your Solana account:`.
- WSS from the staging origin delivers a `join` snapshot (demo, 9 agents) and live events.

## Remaining steps

1. **Codex:** run `scripts/check-static-host.mjs` and `scripts/check-hosting-browser.mjs` against `https://staging.useaeco.xyz` and report the results.
2. Contract 0.3.0 is **not** deployed to staging (it runs 0.2.0 from branch `staging`). Deploying 0.3.0 applies migration 003 and needs the user's approval, after the frontend is updated (see `contracts/frontend-0.3.0-handoff.md`).

## Production service (not changed)

`heartfelt-wisdom` (`b504651c-07d0-4eac-bb48-3bcce80eb8e3`) in environment `production` deploys `pyco404/agentic-economy` branch `main` automatically on every push. All five builds so far failed at Railpack planning (no Dockerfile or start command configured; no database, no app variables), most recently for `9bfac7b`. Disconnecting its GitHub trigger is proposed and needs the user's approval.
