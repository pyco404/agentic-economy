# Production preparation — 22 October 2026

## Approved application release deployed

The owner approved production applications and reuse of the existing Agentic Economy backend-only Pinata and replacement Helius credentials. The earlier database-only approval boundary is resolved. Both applications run the exact approved commit `6758f91bd2e8a69c242584133f0e5932b862bf7e`; newer main commits were not silently promoted. Automatic production promotion remains off, with no repository deployment triggers.

| Service | Successful deployment | HTTPS review endpoint |
| --- | --- | --- |
| Frontend | `493dc99c-f3d2-454c-87fb-ff8cf297ce65` | https://agentic-economy-web-production.up.railway.app |
| API | `04365147-839e-44ec-9a47-0c33bf54db04` | https://agentic-economy-production.up.railway.app |

Health/readiness return 200, PostgreSQL and simulation are healthy, and contract 0.5.2 is compatible across both services. MODE is production for configuration validation, **financial execution is disabled**: `MAINNET_LAUNCH_APPROVED=false`, `PUMP_LAUNCH_ENABLED=false`, `FEE_ROUTING_VERIFIED=false`. Payouts remain disabled. Official treasury addresses are unchanged; no treasury signer was installed. No blockchain transaction was signed or broadcast.

## Database and migration boundary

`aeco_production` uses independent volume `7d78e336-4efc-4935-9a54-04caa6f7afeb` and its own generated private credential. Zero public tables were verified before applying approved 001–004 atomically. The deployed pre-start guard requires exactly those four filenames and published checksums before running migration validation; no additional migration was applied. Read-only post-release checks find zero launches and zero treasury entries. Staging and public-demo data remain untouched.

A 52,616-byte private baseline archive is outside the active worktree in a Git-ignored backup directory (0700/0600). PostgreSQL 18 tools validated its table of contents. **An actual restoration rehearsal is still outstanding.** [Database baseline](evidence/production-database-2026-10-22.json), [deployed release/schema evidence](evidence/production-release-2026-10-22.json).

## Actual external verification

- Existing backend credentials were reused privately, not rotated or exposed. Running values match the approved configuration; neither key appears in frontend variables or the fetched entry bundle. Helius Mainnet and Devnet RPC genesis checks pass. Official Platform and Agent Rewards finalized balance monitoring responds successfully; no income is invented from balances.
- Actual Pinata V3 image and metadata uploads succeeded. The production backend retrieved both through the configured gateway with HTTP 200 and verified the metadata references the correct artwork. A local gateway client received Cloudflare 403/code 1010; no redundant uploads were made to diagnose it. Two uploaded artifacts may remain pinned. Pinata credential rotation remains **PENDING**.
- Authenticated disposable test drafts saved/reloaded successfully and were soft-deleted after checks. Automated signing challenges were single-use, invalid origins rejected, and cookies retained Secure/HttpOnly/host-only/SameSite=Strict. This was an automated message signer, not a new physical Phantom test.
- Launch preparation, signed submission, recovery resume and legacy preparation returned `503 feature_disabled`. USDC and Developer Buy above 3.5% were rejected. No token launch, platform charge or payout occurred. Review returned 200 with execution disabled; the separate review check had no artwork and was incomplete, not a successful prepared launch.
- Nine clean routes return HTML 200; missing assets/API return non-HTML 404. The real review site reaches complete-world readiness and receives WebSocket frames. Desktop and folded/unfolded viewport rehearsals have no overflow or page errors; navigation retains the world canvas.

[API/uploads](evidence/production-api-preflight-2026-10-22.json), [execution guards](evidence/production-execution-guards-2026-10-22.json), [browser checks](evidence/production-browser-preflight-2026-10-22.json), [runtime/provider checks](evidence/production-runtime-security-2026-10-22.json), [bounded log sample](evidence/production-log-sample-2026-10-22.json).

## Review-host limitation and remaining gates

The two `up.railway.app` review hosts are separate browser sites. Signature verification succeeds, but the browser correctly withholds the Strict session cookie across them, yielding session 401. Origin validation and cookie security have not been weakened. These review endpoints are suitable for visual/API review, **not completed wallet-browser acceptance**.

A clearly instrumented pre-DNS rehearsal of `useaeco.xyz` plus `api.useaeco.xyz` passed authentication/session refresh, layouts and WebSockets. It overrides test routing/API base and does not establish real DNS, custom certificates or actual Phantom acceptance. The frontend must switch from its temporary API/WSS URLs to the official API origin during the separately approved cutover. [Concrete cutover proposal](PRODUCTION_DNS_CUTOVER_PROPOSAL.md).

Root/www DNS is unchanged. Production restoration rehearsal, real-origin HTTPS/authentication, credential maintenance and external Mainnet transaction/security review remain open. Physical mobile on-chain acceptance is **DEFERRED**; do not request another mobile signature. Phase 2 is not fully accepted and Phase 3 has not begun.

## Recurring infrastructure costs

No subscription upgrade was made. The additional frontend/API/database consume measured compute, volume and outbound traffic on the existing workspace. Current usage rates: RAM $10/GB/month, CPU $20/vCPU/month, volume $0.15/GB/month, egress $0.05/GB. These are not a fixed monthly quote; actual cost depends on usage. The existing Pro subscription is workspace-wide. [Railway pricing](https://docs.railway.com/pricing/plans).
