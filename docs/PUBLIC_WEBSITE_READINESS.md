# Official website readiness — 22 October 2026

## Current priority and safety

Physical mobile on-chain acceptance is **DEFERRED at the owner's request**. Its API/gateway/tunnel are stopped and prior test approval revoked. Do not request mobile signatures, invitations or retries. Physical authentication, both layouts, image selection and refresh/session acceptance remain completed. Phase 2 is not fully accepted; Phase 3 and Mainnet financial execution remain disabled.

## Railway staging audit

- Live frontend: `9f1d3bcfb7483431a23fe48cd10f920a244d1ea1` (deployment `dda4ab34-a7a0-4368-a79e-3731d0fdcf22`).
- Live backend: `a2e1847455a4f4154d97b0e64dcf61cb36b94737` (deployment `51a03a50-5526-47bf-9ede-ae34f25b76cc`), contract 0.5.1, MODE=demo, financialFeaturesEnabled=false.
- Backend attempt at 365ab41 failed before compilation: repeated `failed to fetch snapshot` in Railway builder logs. No application/compiler error or migration failure was reported in that attempt. The newer backend release completed successfully without a manual redeploy.
- Both application services now run their latest relevant application changes from main. The frontend correctly skipped server-only commit a2e1847. Subsequent root documentation commits are outside application build watches.
- HTTPS health and database readiness pass. A real browser reached complete-world startup READY and rendered Explore and the latest Launchpad without page errors; live WSS delivered world.snapshot. Live capabilities report launchEnabled=false and Developer Buy unavailable; health reports financialFeaturesEnabled=false. This is actual browser acceptance, not just a green Railway status.
- Railway's ongoing platform incident reports queued deployments starting slowly and elevated build errors. [Provider status](https://status.railway.com/). No duplicate manual staging deployment was triggered during this audit.

## Why the official domain is still unavailable

`https://useaeco.xyz` and `https://www.useaeco.xyz` return Vercel DEPLOYMENT_NOT_FOUND (404), over working HTTPS. Vercel DNS still sends apex and wildcard names to `cname.vercel-dns-017.com.` rather than an Agentic Economy Railway service. Staging CNAME/TXT records remain intact.

Changing Mainnet flags cannot solve this routing issue and is not authorized. Do not point public visitors at the staging database as a shortcut.

## Isolated public-demo provisioning

The owner previously approved a separate public-demo frontend, API and PostgreSQL, including existing migrations 001–004 only on the fresh isolated database. The earlier provider block has lifted sufficiently to create environment `57d15012-9025-449b-809d-44d3176494af`.

The three existing project service identities now have separate instances in this environment. They were created through an environment-scoped config patch with initial deployments suppressed, without cloning staging data or credentials. Public frontend/backend automatic deployment is disabled: releases require deliberate promotion. Production still has zero service instances.

- Backend: MODE=demo, ROLE=all, PUMP_LAUNCH_ENABLED=false, FEE_ROUTING_VERIFIED=false, USDC_LAUNCH_ENABLED=false.
- New PostgreSQL database name: aeco_public_demo, with a freshly generated independent credential; DATABASE_URL uses only this environment's private Postgres reference.
- No Pinata JWT, Helius key, wallet signer, Devnet broadcast flag or experimental test-wallet file is copied to public-demo.
- Auth canonical origin: https://useaeco.xyz; CORS limited to apex/www; frontend API/WSS intended for api.useaeco.xyz.
- Next: finish private database/volume provisioning; verify identity/isolation, apply only approved schema, and deploy a reviewed main SHA once per service. Obtain exact Railway domain records, validate the environment, then obtain approval for replacing apex DNS/public cutover.

No nameserver, DNS, staging database, production configuration or financial operation was changed. Public-beta availability is not claimed.

## Provisioning progress and release gate

Public-demo now has its own volume `fa6bc734-284f-4de7-883c-88b5eb6c03ee` (mount `/var/lib/postgresql/data`), distinct from staging. The first new PostgreSQL deployment `3e0170d5-be4e-4557-98f8-ef460110c94f` failed; diagnose its actual provider error before retrying. Database identity/emptiness could not be verified through a running instance. Consequently, **no approved SQL migration has been executed and no public API/frontend release has been started**. Do not skip this gate or attach staging's database.

Both public application services have zero automatic deployment triggers. Production still has zero service instances. Custom domains were attached only to public-demo to obtain real target records; Vercel DNS and nameservers remain unchanged.

## Concrete DNS proposal — NOT APPLIED

[Railway-issued domain and verification values](evidence/public-demo-dns-proposal-2026-10-22.json).

| DNS name | Proposed type | Exact Railway target |
| --- | --- | --- |
| useaeco.xyz | ALIAS (apex flattening) | 7mgmz1yl.up.railway.app. |
| www.useaeco.xyz | CNAME | zgs8grk6.up.railway.app. |
| api.useaeco.xyz | CNAME | mkevv1kk.up.railway.app. |

The JSON evidence includes the three exact `_railway-verify` TXT values. Certificates remain pending DNS ownership validation. Preserve existing staging/api-staging CNAME/TXT, CAA and unrelated wildcard records. Existing apex ALIAS remains `cname.vercel-dns-017.com.` and is the rollback target.

**Do not apply this proposal yet.** First validate the isolated database/schema and reviewed application releases. Then obtain the owner's explicit approval to replace the existing apex record and perform public DNS cutover. Public domain availability and real-origin wallet authentication remain unverified until those gates pass.
