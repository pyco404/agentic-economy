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
| Custom domain | `staging.useaeco.xyz` (pending DNS) | `api-staging.useaeco.xyz` (pending DNS) |

Configuration lives in `.railway/railway.ts` (frontend service, build variables, backend CORS/auth). Domains were attached with `railway domain` so an IaC apply never touches existing domains.

## Frontend build variables (set on the service; Docker build arguments)

| Variable | Value now | After `api-staging` DNS is live |
|---|---|---|
| `VITE_API_URL` | `https://agentic-economy-staging.up.railway.app` | `https://api-staging.useaeco.xyz` |
| `VITE_WS_URL` | `wss://agentic-economy-staging.up.railway.app/api/v1/ws` | `wss://api-staging.useaeco.xyz/api/v1/ws` |
| `VITE_DATA_MODE` | `api` (fixed in the Dockerfile) | same |

To switch, change `API_PUBLIC_URL` in `.railway/railway.ts` and apply; the frontend rebuilds with the new values.

## Backend CORS and wallet sign-in

- `CORS_ORIGINS`: `https://staging.useaeco.xyz`, `https://agentic-economy-web-staging.up.railway.app`, `http://localhost:5173`, `http://127.0.0.1:5173`. No wildcard.
- `AUTH_DOMAIN=staging.useaeco.xyz`, `AUTH_URI=https://staging.useaeco.xyz`. Sign-In With Solana names the site the user signs in to (the frontend), which wallets compare with the requesting page. Consequence: signing in from the generated Railway frontend URL or localhost shows a domain mismatch in wallets; use `staging.useaeco.xyz` for any wallet test. Wallet signing stays disabled in the frontend for now.
- Staging stays `MODE=demo`; no chain, treasury or signing variables are set; financial features are disabled.

## DNS records to add in Vercel (zone `useaeco.xyz`)

| Type | Name (host) | Value | Purpose |
|---|---|---|---|
| CNAME | `staging` | `9j45u3uc.up.railway.app` | frontend traffic |
| TXT | `_railway-verify.staging` | `railway-verify=a1d9b9c02cfe34ad5a13f3d2b8d44786c7bd38a93ebb37ec747600eb6cac8fa4` | Railway domain ownership |
| CNAME | `api-staging` | `45mhwwbf.up.railway.app` | API + WebSocket traffic |
| TXT | `_railway-verify.api-staging` | `railway-verify=0838f3860c8b6f496c1604f2bbcc7df2779a6412186132bf357e861cf5516271` | Railway domain ownership |

Do not change the apex (`useaeco.xyz`), `www` or any production record. After the records propagate, Railway verifies ownership and issues certificates; check with `railway domain status <domain> --service <service> --environment staging`.

## Remaining steps

1. **User:** add the four DNS records in Vercel.
2. **Claude:** once `api-staging.useaeco.xyz` serves `/readyz` over HTTPS, switch `API_PUBLIC_URL`, apply, and re-verify CORS and WSS from `https://staging.useaeco.xyz`.
3. **Codex:** run `scripts/check-static-host.mjs` and `scripts/check-hosting-browser.mjs` against the Railway URL now and `https://staging.useaeco.xyz` after DNS; report results here or in the PR.
4. Backend contract 0.3.0 (agent identity) is **not** deployed to staging. Staging runs 0.2.0 from branch `staging`. Deploying 0.3.0 applies migration 003 and needs the user's approval, and the frontend must be updated for 0.3.0 first.
