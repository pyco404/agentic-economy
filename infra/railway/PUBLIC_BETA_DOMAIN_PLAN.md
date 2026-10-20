# Official public beta domain: audited rollout plan

Audit date: 2026-10-20. Status: isolated public-demo setup approved; provisioning blocked by Railway. No DNS, environment, database or production changes have been made.

## Verified configuration

- Vercel is registrar and DNS provider; nameservers are ns1.vercel-dns.com and ns2.vercel-dns.com. No nameserver change is needed.
- Apex and wildcard default ALIAS records currently target `cname.vercel-dns-017.com.`. Both https://useaeco.xyz and https://www.useaeco.xyz return Vercel `DEPLOYMENT_NOT_FOUND` (404) over valid HTTPS. This is DNS pointing at Vercel hosting rather than a Railway failure. No Agentic Economy project appeared in the current Vercel team's project listing; individual unrelated project assignments were not exhaustively inspected.
- Keep the existing `staging` CNAME `9j45u3uc.up.railway.app.` and `api-staging` CNAME `45mhwwbf.up.railway.app.`, and their `_railway-verify` TXT records. Railway reports the frontend CNAME propagated.
- Railway project: `c0003363-55ab-497b-a994-a1d07002b87d`. Only staging and production environments currently exist. Both staging GitHub triggers use `main`; production has zero deployment triggers.
- Both active staging releases are `d70d727360305ac1545ad2bfc9ee69bdcb9c6ea8`. Latest local main is `a4e1bee9df624aedb2d224f71afea043929ac10b`.
- Backend staging uses MODE=demo, ROLE=all, FEE_ROUTING_VERIFIED=false. Pinata JWT exists in backend only. Frontend build uses https://api-staging.useaeco.xyz and wss://api-staging.useaeco.xyz/api/v1/ws.
- Staging AUTH_URI is https://staging.useaeco.xyz. CORS allows staging, the generated staging frontend origin, localhost:5173 and 127.0.0.1:5173; it does not yet allow apex/www.
- Server authentication binds challenges to the exact allowed request Origin (host and URI); session cookies with HTTPS AUTH_URI are host-only, Secure, HttpOnly, SameSite=Strict, Path=/, prefixed __Host-. Keep these protections.
- Canonical and social URLs already use https://useaeco.xyz. Caddy already redirects www to apex, preserving path/query, and supports known SPA routes while missing assets/API paths remain 404.
- `.railway/railway.ts` and the original staging provisioning document contain stale branch/domain defaults. Do not apply that historical IaC file to provision the beta or reconcile current staging blindly.

## Recommended isolation and release

Create a separate `public-demo` Railway environment with frontend, API/simulation (ROLE=all, existing supported topology), and a new private PostgreSQL volume. Use an explicit reviewed main SHA and manual release promotion; do not automatically expose every main/staging update to beta visitors. Leave the existing production environment and staging database untouched.

Do not clone staging session rows, drafts, wallet data, credentials or financial records. Initialize the new database using only existing migrations 001–004 **after separate explicit approval**; no new schema migration is proposed. The public demo will start with its own demo city and wallet-owned drafts. It does not display local Devnet test launch records as public launches.

Backend configuration:

- MODE=demo; ROLE=all; FEE_ROUTING_VERIFIED=false; PUMP_LAUNCH_ENABLED=false; USDC_LAUNCH_ENABLED=false.
- AUTH_DOMAIN=useaeco.xyz; AUTH_URI=https://useaeco.xyz.
- CORS_ORIGINS=https://useaeco.xyz,https://www.useaeco.xyz (no localhost or wildcard).
- DATABASE_URL references only the new environment's private Postgres service.
- No Solana RPC, signing keys, devnet broadcaster flag, experimental lookup table or test-wallet files. No treasury signer/payout integration.
- Pinata credential is backend-only and must be independently scoped/configured if public uploads are enabled. Do not copy staging secrets wholesale; review public upload/storage abuse exposure first. Draft saving can remain available with uploads explicitly unavailable.

Frontend build configuration:

- VITE_API_URL=https://api.useaeco.xyz.
- VITE_WS_URL=wss://api.useaeco.xyz/api/v1/ws.
- Existing API data mode, demo status, branding, city, cinematic reveal, routes and UI remain unchanged.

The same registrable domain for website and API preserves same-site Secure session cookies; auth challenge still names the actual requesting frontend origin. A real Phantom approval remains a manual acceptance check, not something automated signers establish.

## DNS cutover proposal (not executed)

Keep Vercel DNS and root as canonical. Vercel supports ALIAS records and Railway supports apex ALIAS/flattening, so no Vercel web deployment, redirect service, reverse proxy or nameserver move is necessary.

1. Attach `useaeco.xyz` and `www.useaeco.xyz` to the isolated Railway frontend, target port 8080. Attach `api.useaeco.xyz` to its API at the actual configured listening port.
2. Retrieve each domain's exact required target and verification record from Railway domain status. These new records have **not been issued** because the isolated environment does not yet exist. Existing staging targets/tokens must not be reused as guessed beta targets.
3. Prepare a before/after DNS manifest for review: apex ALIAS to the exact Railway apex target; explicit www CNAME to its Railway target; explicit api CNAME to its Railway target; exact required TXT records. Retain staging, api-staging, their verification records, existing CAA and unrelated wildcard records.
4. Obtain approval before replacing/deleting existing apex records or exposing the new environment. Do not blindly delete default/wildcard records. Prefer supported explicit overrides if Vercel allows them; review any required record replacement separately.
5. After reviewed environment checks and approval, apply cutover, wait for Railway domain verification/certificates, and verify HTTPS on all three public names. www redirects to root via existing Caddy configuration.

An apex-to-www redirect is an alternative only if apex ALIAS proves unsupported; DNS itself cannot perform HTTP redirects. That alternative would require a separately approved HTTPS redirect service/configuration and canonical direction changes.

## Acceptance gates

- Verify database isolation, approved schema checksums, compatible frontend/backend SHA and demo capabilities before exposure. Confirm no launches, charges, custody or payouts enabled.
- Validate apex/www/API TLS, root and direct routes/refresh, assets, desktop/mobile page load and complete reveal.
- Test exact-origin challenge, real Phantom login, refresh/session restoration, logout, wrong-origin rejection, credentialed CORS and WSS snapshot from apex.
- Confirm staging health, routes, auth and WSS continue working after cutover.
- Record deployed SHAs and all exact DNS changes, including rollback to the captured prior records. Never point public-demo rollback at staging data implicitly.

At audit time Railway reports new builds paused for all workspaces; running services remain unaffected. A new isolated release cannot be validated until builds resume. No public-beta completion is claimed.

References: https://vercel.com/docs/cli/dns ; https://docs.railway.com/networking/domains/working-with-domains ; https://docs.railway.com/integrations/api/manage-domains ; https://status.railway.com/incident/JUA1PC5H

## Execution and verification result

The owner explicitly approved provisioning isolated public-demo frontend/API/PostgreSQL and applying existing migrations 001–004 only to that fresh database. Pinata uploads remain disabled initially. This approval does not authorize a DNS cutover or any changes to staging/production data.

Attempted `environmentCreate` with project ID above, name `public-demo`, `skipInitialDeploys:true`, and no source environment (no staging clone). Railway rejected it with `BAD_USER_INPUT: Deploys have been paused temporarily`, trace ID `2299442895424610641`. No environment ID or new Railway domain targets/tokens were returned. Resume by checking environments first, then creating only the missing isolated environment; do not duplicate resources or retry migrations blindly.

Verified in this audit:

- All nine staging SPA routes return the same entry HTML over HTTPS; missing assets, API paths on the frontend, and unknown routes return 404. Node's direct fetch timed out in this network; equivalent proxy-compatible HTTPS checks passed.
- Staging /healthz and /readyz pass with PostgreSQL healthy, demo simulation running and contract 0.5.0. Capabilities report launchEnabled=false and Developer Buy unavailable.
- A real browser WebSocket received world.snapshot with mode=demo.
- Focused backend auth-message and deployment regression suites: 20 tests passed across two files.
- Real Phantom authentication on the future apex origin, public-demo desktop/mobile UI and TLS/domain cutover remain unverified because that environment has not been provisioned. No claim of public availability is made.
- Only documentation changed. No application/UI/financial code or secrets were modified; no migration executed.
