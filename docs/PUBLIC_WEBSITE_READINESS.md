# Official website readiness — 22 October 2026

## Current result

Staging runs the latest relevant application changes and passes actual browser, API, database and WebSocket checks. The separate public-demo database is running and verified isolated. Its first frontend/backend releases are **SUCCESS** at a2e1847, with API/database and approved schema verified. useaeco.xyz is **not yet ready for production DNS cutover**: the latest brief requires a separate production database and release, not the public-demo database. No duplicate staging redeployment was requested.

Physical mobile on-chain acceptance is **DEFERRED at the owner's request**. Its API/gateway/tunnel are stopped and prior test approval revoked. All seven physical connection/authentication/layout/refresh checks and phone-image preview remain completed. Do not request mobile signatures, invitations or retries. Phase 2 is not fully accepted; Phase 3 and Mainnet financial execution remain disabled.

## Verified staging release

| Service | Actual deployed main SHA | Railway deployment |
| --- | --- | --- |
| Frontend | 9f1d3bcfb7483431a23fe48cd10f920a244d1ea1 | dda4ab34-a7a0-4368-a79e-3731d0fdcf22 |
| Backend | a2e1847455a4f4154d97b0e64dcf61cb36b94737 | 51a03a50-5526-47bf-9ede-ae34f25b76cc |

The frontend correctly skipped server-only a2e1847; both implement compatible contract 0.5.1. Root documentation commits are outside application build watches. Health/readiness return 200 with PostgreSQL healthy, MODE=demo and financialFeaturesEnabled=false. Capabilities report launchEnabled=false and Developer Buy unavailable. A real browser reached complete-world startup READY and rendered Explore and the latest Launchpad without page errors; WSS delivered world.snapshot.

The older backend 365ab41 attempt failed before compilation with repeated `failed to fetch snapshot`. The newer queued release subsequently succeeded without a manual redeploy. [Railway status](https://status.railway.com/) continues to report delayed queues and build errors.

## Official domain diagnosis

Root and www return Vercel DEPLOYMENT_NOT_FOUND (404), over working HTTPS. Vercel DNS still routes apex/wildcard to `cname.vercel-dns-017.com.` instead of an Agentic Economy Railway frontend. Staging CNAME/TXT and existing CAA records remain intact. No nameserver or DNS changes have been made.

Changing Mainnet flags cannot solve this routing issue and is not authorized. Do not point public visitors at the staging database as a shortcut.

## Isolated public-demo

The owner's earlier approval covers separate frontend/API/PostgreSQL and existing migrations 001–004 only on its fresh database. Environment: `57d15012-9025-449b-809d-44d3176494af`.

- Separate instances of the existing three project services; no staging data or credentials cloned. Public application auto-deployment is disabled; reviewed releases require deliberate promotion. Production still has zero service instances/triggers. Staging remains main-driven.
- Fresh database `aeco_public_demo`, independent generated credential, private Postgres URL and new volume `fa6bc734-284f-4de7-883c-88b5eb6c03ee` at `/var/lib/postgresql/data`.
- Successful database deployment: `7638dd7c-bf24-4618-9a36-c0a2203ba179`. Read-only identity check returned aeco_public_demo and zero public tables before application deployment.
- The initial volume attachment automatically started a deployment; the explicit initial start overlapped it. Both failed during MIGRATE_VOLUMES before PostgreSQL ran. After confirming no active deployment and volume READY, one controlled retry succeeded. No existing database was moved or reset.
- Backend: MODE=demo, ROLE=all, PUMP_LAUNCH_ENABLED=false, FEE_ROUTING_VERIFIED=false, USDC_LAUNCH_ENABLED=false. No Pinata JWT, Helius key, signer, Devnet approval flag or test-wallet file copied to this environment.
- Auth origin https://useaeco.xyz; CORS limited to apex/www. Frontend API/WSS target api.useaeco.xyz. Public uploads initially remain unavailable.

One reviewed application release at `a2e1847455a4f4154d97b0e64dcf61cb36b94737` was requested per service:

| Service | Deployment | Last observed |
| --- | --- | --- |
| API | 4f59ca17-cb44-4896-9b44-b0b54d748a12 | SUCCESS |
| Frontend | a1cf31be-1a7b-4036-84c1-cde189d5e0bd | SUCCESS |

Review HTTPS health/readiness and direct Launchpad now return 200. The approved 001–004 migrations were applied to aeco_public_demo only; read-only queries verify all checksums match main and staging. Capabilities report uploads=false, launchEnabled=false, Developer Buy unavailable; MODE=demo and financialFeaturesEnabled=false. This does not establish production/Mainnet readiness. [Sanitized provisioning audit](evidence/public-demo-provisioning-2026-10-22.json).

## Concrete DNS proposal — NOT APPLIED

Railway custom domains are attached only to public-demo; their certificates await DNS ownership validation. [Exact Railway-issued DNS and TXT records](evidence/public-demo-dns-proposal-2026-10-22.json).

| DNS name | Proposed type | Exact Railway target |
| --- | --- | --- |
| useaeco.xyz | ALIAS (apex flattening) | 7mgmz1yl.up.railway.app. |
| www.useaeco.xyz | CNAME | zgs8grk6.up.railway.app. |
| api.useaeco.xyz | CNAME | mkevv1kk.up.railway.app. |

Preserve staging/api-staging CNAME/TXT, CAA and unrelated wildcard records. Existing apex ALIAS `cname.vercel-dns-017.com.` is the rollback target. No nameserver change is needed.

**Do not apply this public-demo proposal.** The latest brief requires a separate production database for the public production website. Prepare/validate that environment, obtain approval for its fresh schema, move custom-domain attachments with explicit approval and obtain the exact new Railway targets before DNS cutover. Never reuse these public-demo targets as if they referred to production. Public domain availability, valid public-origin certificates and real-origin wallet authentication remain unverified until those gates pass. Do not expose this preparation as a completed public beta.

## Production release gate

[Prepared production configuration](../infra/railway/env/production-readonly.env.example) and [Gamine integration/security findings](GAMINE_LAUNCHPAD_INTEGRATION.md). Fresh aeco_production schema approval has been requested; production remains empty and no migration or trigger change has been made. Official treasury addresses are fixed in the prepared configuration, all financial activation flags false. Public-demo is retained as an isolated reviewed demo, not promoted as real launch storage. Root/www remain Vercel 404 until the separately reviewed production cutover.

Public-demo [pre-DNS browser/API evidence](evidence/public-demo-preflight-2026-10-22.json): desktop 1440×1000, folded 344×882 and unfolded 690×829 reach complete-world READY, display Launchpad, receive WebSocket updates, and have no page errors or horizontal overflow. All nine clean routes return 200; nonexistent assets/API remain 404. An automated disposable signer verifies exact useaeco.xyz challenge, secure host-only session, refresh/session read, replay rejection and logout. Browser requests were explicitly routed to Railway review hosts for this test; official DNS/certificates and physical Phantom on the official domain are still unverified. No user transaction was requested.
