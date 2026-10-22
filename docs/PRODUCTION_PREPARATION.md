# Production preparation — 22 October 2026

## Approved application release deployed

The owner approved production applications and reuse of the existing Agentic Economy backend-only Pinata and replacement Helius credentials. The earlier database-only approval boundary is resolved. The original applications were released at approved commit `6758f91bd2e8a69c242584133f0e5932b862bf7e`. The owner-requested official roadmap update is now published as frontend-only commit `aa1f53a113dc0438094fddb5b306f382fe98b2fd`; the production API remains unchanged at 6758f91. Automatic production promotion remains off, with no repository deployment triggers.

| Service | Successful deployment | Official HTTPS endpoint |
| --- | --- | --- |
| Frontend | `164d4580-ceb1-42a1-981d-dd4580635fe9` | https://useaeco.xyz |
| API | `04365147-839e-44ec-9a47-0c33bf54db04` | https://api.useaeco.xyz |

Health/readiness return 200, PostgreSQL and simulation are healthy, and contract 0.5.2 is compatible across both services. MODE is production for configuration validation, **financial execution is disabled**: `MAINNET_LAUNCH_APPROVED=false`, `PUMP_LAUNCH_ENABLED=false`, `FEE_ROUTING_VERIFIED=false`. Payouts remain disabled. Official treasury addresses are unchanged; no treasury signer was installed. No blockchain transaction was signed or broadcast.

## Mandatory Phase 2 completion gate

[Production release checklist](PRODUCTION_RELEASE_CHECKLIST.md): public readiness → security/readiness acceptance → separate owner approval and deployer-only activation → owner-initiated official $AECO launch through useaeco.xyz on Mainnet → independent mint, approved supply/decimals, metadata, fee routing, finalized transaction and Explore verification → Phase 2 completion → Phase 3. The dedicated deployer is `3pF1MM1PCg2tekM5KeWEDyT8LVKbVd7ia668NRAnYpAR`, not either treasury. Supply, decimals, tokenomics, metadata, launch configuration, Developer Buy and transaction costs require separate final approval. No official $AECO transaction is authorized or submitted. TOKEN/AECO pairing remains a later feature.

## Database and migration boundary

`aeco_production` uses independent volume `7d78e336-4efc-4935-9a54-04caa6f7afeb` and its own generated private credential. Zero public tables were verified before applying approved 001–004 atomically. The deployed pre-start guard requires exactly those four filenames and published checksums before running migration validation; no additional migration was applied. Read-only post-release checks find zero launches and zero treasury entries. Staging and public-demo data remain untouched.

A 52,616-byte private baseline archive is outside the active worktree in a Git-ignored backup directory (0700/0600). PostgreSQL 18 tools validated its table of contents. A fresh PostgreSQL 18.6 archive containing both saved drafts was restored into a private, initially empty local PostgreSQL 18.6 database and verified again after restart. Source/restore fingerprints, constraints and migrations 001–004 match. No production writes/migrations occurred. This is a verified local recovery copy, not a claim of scheduled/offsite backups. [Restoration evidence](evidence/production-backup-restoration-2026-10-22.json). [Database baseline](evidence/production-database-2026-10-22.json), [deployed release/schema evidence](evidence/production-release-2026-10-22.json).

## Actual external verification

- Existing backend credentials were reused privately, not rotated or exposed. Running values match the approved configuration; neither key appears in frontend variables or the fetched entry bundle. Helius Mainnet and Devnet RPC genesis checks pass. Official Platform and Agent Rewards finalized balance monitoring responds successfully; no income is invented from balances.
- Actual Pinata V3 image and metadata uploads succeeded. The production backend retrieved both through the configured gateway with HTTP 200 and verified the metadata references the correct artwork. A local gateway client received Cloudflare 403/code 1010; no redundant uploads were made to diagnose it. Two uploaded artifacts may remain pinned. Pinata credential rotation remains **PENDING**.
- Authenticated disposable test drafts saved/reloaded successfully and were soft-deleted after checks. Automated signing challenges were single-use, invalid origins rejected, and cookies retained Secure/HttpOnly/host-only/SameSite=Strict. This was an automated message signer, not a new physical Phantom test.
- Launch preparation, signed submission, recovery resume and legacy preparation returned `503 feature_disabled`. USDC and Developer Buy above 3.5% were rejected. No token launch, platform charge or payout occurred. Review returned 200 with execution disabled; the separate review check had no artwork and was incomplete, not a successful prepared launch.
- Nine clean routes return HTML 200; missing assets/API return non-HTML 404. The real review site reaches complete-world readiness and receives WebSocket frames. Desktop and folded/unfolded viewport rehearsals have no overflow or page errors; navigation retains the world canvas.

[API/uploads](evidence/production-api-preflight-2026-10-22.json), [execution guards](evidence/production-execution-guards-2026-10-22.json), [browser checks](evidence/production-browser-preflight-2026-10-22.json), [runtime/provider checks](evidence/production-runtime-security-2026-10-22.json), [bounded log sample](evidence/production-log-sample-2026-10-22.json).

## Official-domain cutover and remaining gates

The separately approved [official-domain cutover](PRODUCTION_DNS_CUTOVER_PROPOSAL.md) is applied. All three real public certificates validate, root loads Agentic Economy, www redirects to root, and the frontend uses the official API/WSS targets. [Actual public release](evidence/production-public-release-2026-10-22.json), [TLS](evidence/public-domain-tls-2026-10-22.json), [public API boundaries](evidence/public-api-boundaries-2026-10-22.json). Six scoped records were added, all previous records preserved, no nameserver change. One frontend configuration build was necessary; no duplicate/backend deployment or migration was requested.

The earlier two-host Railway preview had a Strict-cookie cross-site limitation. The official frontend/API are now same-site; [Actual public-domain browser acceptance](evidence/public-domain-browser-2026-10-22.json) now passes with an automated unfunded message signer and no test routing overrides: exact-origin challenge, secure cookie, refresh session 200, official API/WSS, persistent world and five responsive viewports. It is not a new physical Phantom test. Cookie/origin protection was not weakened.

Production restoration/restart is complete. Pinata credential rotation remains maintenance; final live Mainnet transaction simulation, costs and owner authorization remain launch-time gates. Automated/source security acceptance does not claim an independent third-party audit. Physical mobile on-chain acceptance is **DEFERRED**; do not request another mobile signature. Phase 2 is not fully accepted and Phase 3 has not begun. [Official $AECO and automatic Common Agent next steps](PHASE2_NEXT_PRODUCTION_TASKS.md) distinguish preparation from authorized execution.

## Recurring infrastructure costs

No subscription upgrade was made. The additional frontend/API/database consume measured compute, volume and outbound traffic on the existing workspace. Current usage rates: RAM $10/GB/month, CPU $20/vCPU/month, volume $0.15/GB/month, egress $0.05/GB. These are not a fixed monthly quote; actual cost depends on usage. The existing Pro subscription is workspace-wide. [Railway pricing](https://docs.railway.com/pricing/plans).

## Native roadmap publication

[Verified release](evidence/native-aeco-roadmap-release-2026-10-22.json): frontend aa1f53a on staging and production, actual responsive roadmap/retained-world/WSS checks pass with Phase 3 blocked and launchEnabled=false. Eleven content tests and six local responsive browser tests, typecheck, lint and build pass; existing effect-cleanup/bundle warnings remain. No backend deployment, financial activation, token launch, migration, DNS or treasury change was part of this editorial release.
