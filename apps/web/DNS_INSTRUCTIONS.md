# useaeco.xyz — Railway hosting and Vercel DNS handoff

Status: prepared for review, 2026-10-16 (Africa/Lagos). Railway hosts all application services. Vercel remains the registrar/DNS manager only. Do not create a Vercel frontend project or Vercel-hosted redirect.

## Domain ownership map

| Public name | Railway target | Environment / owner |
| --- | --- | --- |
| `staging.useaeco.xyz` | Frontend service, port 8080 | Staging; Codex prepares build, Claude owns service infrastructure |
| `api-staging.useaeco.xyz` | Existing API service | Staging; Claude |
| `useaeco.xyz` | Separate production frontend | Production; review/approval first |
| `www.useaeco.xyz` | Same production frontend, HTTP 308 to `https://useaeco.xyz` | Production; review/approval first |
| `api.useaeco.xyz` | Production API | Production; Claude, review/approval first |

Simulation/indexer roles and PostgreSQL stay on Railway under Claude's existing architecture. They do not need public custom domains. Keep staging/production databases and environment-scoped configuration separate. In the current demo topology the backend uses `ROLE=all`; do not introduce a duplicate simulation writer or an unnecessary demo indexer just to satisfy the hosting list.

## Observed state

Read-only inspection found Vercel delegation (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`). The apex currently resolves to existing A records; no staging CNAME was returned for either planned staging hostname. Do not replace the current apex records during staging work.

Railway project `agentic-economy` (`c0003363-55ab-497b-a994-a1d07002b87d`) has staging environment `120cbd41-56b8-446d-b9d5-9db71cfc580a`, an online demo backend and PostgreSQL. No frontend service or custom domains were present in the inspected staging inventory. Backend service ID: `c2b39851-a41b-4eab-9223-d2f6394b007f`. Its existing generated URL is `https://agentic-economy-staging.up.railway.app`.

A separate failed service (`heartfelt-wisdom`) already exists in production. It was not created, changed or removed by this work. Claude should inspect its ownership before any later production plan; it must not accidentally become the frontend deployment target.

## Exact DNS records — obtain values before applying

Add each custom hostname to its intended Railway service first. Railway returns its assigned target and verification record. Copy those exact values into Vercel DNS; do not infer them from the generated service URL. Both routing and ownership verification must pass.

| Vercel record name | Type | Value to copy | Apply stage |
| --- | --- | --- | --- |
| `staging` | CNAME | Target returned for Railway frontend custom domain `staging.useaeco.xyz` | Staging |
| Exact frontend verification owner returned by Railway, relative to `useaeco.xyz` | TXT | Exact frontend verification value | Staging |
| `api-staging` | CNAME | Target returned for Railway API custom domain `api-staging.useaeco.xyz` | Staging / Claude |
| Exact API verification owner returned by Railway, relative to `useaeco.xyz` | TXT | Exact API verification value | Staging / Claude |
| `@` | ALIAS | Target returned for Railway production frontend `useaeco.xyz` | Production review only |
| `www` | CNAME | Target returned for Railway production frontend `www.useaeco.xyz` | Production review only |
| `api` | CNAME | Target returned for Railway production API `api.useaeco.xyz` | Production review only |
| Each exact production verification owner returned by Railway | TXT | Corresponding exact verification value | Production review only |

These are record specifications, not fabricated CNAME/TXT values. No Railway custom-domain registration has been performed yet, so their assigned targets/tokens are pending. Vercel supports ALIAS records; validate the apex ALIAS with the assigned Railway target at the production review. Never pin a guessed Railway IP or use an ordinary apex CNAME. Keep Vercel nameservers.

`www` must also be registered on Railway so its TLS certificate is issued. DNS points it at the frontend; `apps/web/Caddyfile` performs the 308 redirect and preserves path/query. CNAME alone does not perform that HTTP redirect.

## DNS operation sequence

1. Claude provisions the dedicated staging frontend service and registers the staging API domain. Codex supplies the frontend build/runtime files. Retrieve the resulting exact custom-domain records, including verification names and values, for review.
2. Reauthenticate Vercel in an interactive terminal with `vercel login`, or use its Domains dashboard. The inspected CLI login was expired. Do not paste credentials into this repo/chat.
3. Export or record the existing zone. Add only the reviewed staging CNAME/TXT records. In Vercel's Name field use names relative to `useaeco.xyz`; do not accidentally append the zone twice to a verification owner.
4. Preserve all unrelated MX, TXT, SPF/DKIM/DMARC, CAA, nameserver and other service records. Review conflicting records for the exact staging hostname before replacing any. Do not delete the zone or change production/apex records.
5. Wait for both Railway custom-domain verification and HTTPS certificates. Resolve public DNS and check HTTPS directly. Keep the existing generated API URL usable during the transition.
6. Claude applies the reviewed staging CORS/auth origins. Rebuild the frontend with the custom API hostname only after `api-staging.useaeco.xyz` is healthy, then validate the complete public application at `https://staging.useaeco.xyz`.
7. Prepare a separate production record diff and rollback plan after staging passes. Production DNS, production deploys and all financial/mainnet/treasury-signing changes require separate approval.

## DNS/HTTPS acceptance

```bash
dig +short NS useaeco.xyz
dig +short CNAME staging.useaeco.xyz
dig +short CNAME api-staging.useaeco.xyz
# Also query each exact TXT verification owner returned by Railway.
curl --fail https://staging.useaeco.xyz/healthz
curl --fail https://api-staging.useaeco.xyz/readyz
```

Verify WSS at `wss://api-staging.useaeco.xyz/api/v1/ws`, real demo events, browser CORS, deep-link refresh, camera/scene persistence and no mixed content. Frontend `healthz` only checks static serving; backend readiness and actual UI data must also pass. For eventual production, test `www` returns 308 with the expected HTTPS apex destination and preserved path/query.

## Source references

- Railway assigned records, verification and apex requirements: https://docs.railway.com/networking/domains/working-with-domains
- Railway domain API/ALIAS guidance: https://docs.railway.com/integrations/api/manage-domains
- Vercel DNS types and external-service records: https://vercel.com/docs/domains/managing-dns-records

No DNS or production changes were applied while preparing this document.
