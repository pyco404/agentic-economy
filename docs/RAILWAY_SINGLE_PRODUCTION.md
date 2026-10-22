# One production environment — dependency audit and release decision

Owner decision, 22 October 2026: production is the only permanent Railway environment. Use local tests and isolated local/Devnet verification, production builds, explicit pinned-commit production releases and actual public website checks. Staging promotion is no longer required. This document does not authorize environment/volume/database deletion or financial activation.

## Current environment purposes and dependencies

| Environment | Original reason | Current use and retirement status |
| --- | --- | --- |
| production | Official website/API and isolated real application storage | Keep frontend, `ROLE=all` backend and `aeco_production` PostgreSQL. Root/www/API domains attach here. Runs independently. |
| staging | Earlier integration, demo simulation and provider acceptance | Not required for production. Preserve two saved drafts, three test launches/communities, 15 treasury test/demo ledger rows and simulation history pending backup/restore verification and deletion approval. |
| public-demo | Isolated public preview before production was provisioned | Superseded. No custom domains remain. Preserve three demo launches/communities, three activations/nine name records, 15 demo ledger rows and simulation history pending backup/restore verification and deletion approval. |

Counts are point-in-time read-only aggregates, not cryptocurrency receipts or new launch evidence. Production currently has zero drafts, launches, communities and treasury entries, plus its own simulation snapshots. No records were copied between databases.

Each backend references its own environment's `Postgres.DATABASE_URL`. The actual resolved URLs match their own Postgres service; databases and volumes are separate. Production frontend calls only `https://api.useaeco.xyz` and `wss://api.useaeco.xyz/api/v1/ws`. Production has no dependency on the other environments. Public-demo's legacy frontend itself points to the production API; that is the reverse direction and does not make production depend on public-demo.

Production and staging share the approved backend-only Pinata and Helius provider credentials. Public-demo has neither provider key. Never revoke those provider keys as part of staging retirement: production still uses them. Deleting an approved old environment's variable copies is distinct from revoking the external provider credential. No secret value is recorded in this audit or changed by it.

## Domains and resources to preserve until retirement approval

- Production: `useaeco.xyz`, `www.useaeco.xyz` and `api.useaeco.xyz`, with valid verified Railway certificates. Keep official DNS and production volume `7d78e336-4efc-4935-9a54-04caa6f7afeb` unchanged.
- Staging: `staging.useaeco.xyz`, `api-staging.useaeco.xyz`, their generated Railway domains, database `railway` and volume `df824d81-eeeb-40c6-a7e8-605ec1a29e5f`. DNS records still exist and must be included in a separately approved retirement plan.
- Public-demo: generated Railway app domains only, database `aeco_public_demo` and volume `fa6bc734-284f-4de7-883c-88b5eb6c03ee`. Its old API is already crashed; no restart or duplicate release is needed to retire it. Its database is still readable and must be preserved.

Each environment has instances of the same three project services. **Project-level service IDs are shared across environments. Do not use project-wide service deletion to retire staging/public-demo.** Any future approved removal must target only the nominated environment instances, environment and distinct legacy volumes. Deleting a shared project service could affect production.

## Backup gate — no deletion is currently authorized

Read-only Railway backup inventory on 22 October 2026:

| Environment | Listed volume backups | Listed schedules | Verified restore in this audit |
| --- | --- | --- | --- |
| production | 0 | 0 | No |
| staging | 2, dated 18 and 22 October | 0 | No |
| public-demo | 0 | 0 | No |

Production also has a previously recorded local baseline dump; its archive listing was validated, but it is not proof of a current backup or successful restoration. Do not treat any listed volume backup as a verified restorable export. Environment/volume deletion may also destroy attached backups.

Before requesting scoped legacy deletions:

1. Preserve the useful drafts/test records, simulation history, existing acceptance evidence, domain/configuration inventory and rollback references in access-restricted storage outside the environments being removed. Archive secret configuration securely; do not put values in Git/chat.
2. Create current database exports and verify checksums/archive readability. Rehearse restoration against an isolated disposable database with specific authorization; compare counts, owned drafts, launches and financial-record integrity. Never restore into production or the original local world.
3. Confirm no active users, local tools, webhooks or external integrations still depend on staging/generated preview hosts. This audit verifies Railway configuration and production runtime references, not all unknown external consumers.
4. Present exact environment IDs, old volume IDs, staging-only DNS removals and retained archive locations for explicit owner deletion approval. Preserve root/www/API and nameservers. Production resources are excluded.
5. Only after those gates and approval, remove old environment instances/volumes using environment-scoped operations; verify official website/API/WSS and database health afterward. Do not migrate demo records into production or revoke shared keys.

The two old environments, six service instances and two database volumes are retirement candidates, not deleted resources. They may continue incurring usage costs until retired; no fixed savings estimate is claimed.

## Simpler releases and rollback

Automatic staging application builds are disabled as part of the owner-approved workflow change; running releases and data remain. Production/public-demo repository triggers remain absent. No new environment, release service, CI pipeline, gateway or deployment was introduced.

The current accepted application SHA is `5fa0507167695df96d57cecd332a45e9422209b2`: frontend deployment `2de54da5-8ac0-472e-85b0-db56533be625`, backend deployment `4a7f0533-98db-4e93-a47d-f0bcad9b237d`. Before this release the independently browser-verified public pair was frontend `d5d3d7cb56db6e0baff4a5fa4605a1a9caa6522b` (`aa08fe70-8248-4d9b-b5f9-f70b7d780b10`) and API `6758f91bd2e8a69c242584133f0e5932b862bf7e` (`04365147-839e-44ec-9a47-0c33bf54db04`). Those are historical **financial-off website recovery references**, not approved financial releases; the older API lacks the new deployer/mint gates and must never be used for Mainnet activation. No rollback was performed.

[Current release procedure and rollback](../infra/railway/README.md) replaces historical staging/split instructions. Record exact frontend/API commit SHAs and deployment IDs. Roll back faulty code by explicitly deploying the previous schema-compatible tested commit to the affected production service, preserving the same database and financial-off settings. No database rollback or migration is automatic.

## Gamine reuse and genuine launch-readiness remainder

Re-inspected Gamine's `web/lib/launchpad-server.ts`, `web/lib/pump-transaction.ts` and client recovery paths. Agentic Economy already uses the compatible patterns: one atomic create/sharing/optional-buy/platform-charge transaction; mint-first and Phantom-second signatures; exact-message validation; durable signed payload before broadcast; same-signature reconciliation/recovery. Keep the existing working Pinata V3 uploads: Gamine's Legacy pinning endpoints would conflict with the current scoped credential. Keep Agentic Economy's exact 0.05 SOL charge, 60/40 allocation, percentage-based 0–3.5% Developer Buy and durable PostgreSQL records rather than Gamine's differing settings/storage.

Gamine keeps its special vanity key in a server secret and automatically releases expired reservations. Those pieces cannot be copied: the owner forbids uploading/accessing the official key and Agentic Economy must preserve ambiguous attempts. The existing local mint-signature handoff is deployed and disposable Devnet signing/simulation plus mocked browser recovery passed. The official private key has not been opened.

Production backend/frontend `5fa0507` are already live; no further backend deployment is waiting. Mainnet transaction preparation still shares the execution-disabled capability gate, and reserved-mint short-blockhash renewal remains fail-closed. Finish that existing preparation/recovery path and final security acceptance before execution. Verify a current production backup and isolated restore before financial activation. These are launch-readiness work, not reasons to retain staging or request wallet funding.

When the owner decides to launch, they enter their own details/artwork, select 1%, review refreshed actual costs, decide when to fund and personally approve/sign. Bind only their existing approved draft to the exact official mint. Balance checks happen at that launch-time authorization stage. No intermediate Mainnet test token, automatic native launch, public launch unlock or Phase 3 is authorized.

[Sanitized audit evidence](evidence/railway-single-production-2026-10-22.json), [current public release](PUBLIC_WEBSITE_READINESS.md), [mint handoff and existing expiry limits](AECO_LOCAL_MINT_SIGNING.md), [Phase 2 checklist](PRODUCTION_RELEASE_CHECKLIST.md).
