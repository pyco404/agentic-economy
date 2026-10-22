# Railway deployment — one production environment

The current owner-approved architecture is **one permanent Railway environment, `production`**, with three services:

| Service | Responsibility | Public endpoint |
| --- | --- | --- |
| `agentic-economy-web` | Existing Vite frontend, served by Caddy | https://useaeco.xyz; www redirects to apex |
| `agentic-economy` | `ROLE=all`: API, WebSocket, simulation and read-only indexers | https://api.useaeco.xyz |
| `Postgres` | Independent `aeco_production`, private connection and persistent volume | No public application endpoint |

There is no runtime need for staging, public-demo, Redis, separate simulation/indexer services or a reverse proxy. Production already operates independently. Existing PostgreSQL leadership locks coordinate simulation/indexer work inside the backend. Do not change the world seed, treasury addresses or database target during ordinary releases.

## Routine release

1. Inspect `main` and preserve unrelated changes. Select the complete compatible change.
2. Run relevant local tests, typecheck/lint, and the backend/frontend production builds as applicable. Use isolated local/Devnet tests for transaction behavior; no Mainnet transaction is part of deployment verification.
3. Check production database identity, approved migration checksums and pending schema changes before a backend release. The current approved schema is 001–004. A migration requires its own explicit approval; it is never bundled into an ordinary release.
4. Commit granular Conventional Commits and push normally to `origin main`. Production repository auto-deploy remains disabled; a push alone does not release unreviewed code.
5. Deploy the exact tested Git commit to the affected production service(s), using Railway's existing pinned-commit deployment operation. Build from repository root: `infra/railway/Dockerfile` for backend, `apps/web/Dockerfile` for frontend. Do not use a dirty directory upload or silently deploy a different HEAD. Deploy both at a compatible SHA when their contract changes.
6. Verify the actual deployed SHA, service identity and served bundle, then https://useaeco.xyz routes, API/database readiness, WSS, origin-bound sessions and responsive navigation. Confirm financial execution remains off. Record the new deployment IDs and preceding known-good release.

**No staging build or promotion is required.** No duplicate build should be requested while the target commit is already queued/running/healthy. Documentation-only commits do not need deployment. Existing CLI/dashboard access is sufficient; no new release infrastructure is required.

Frontend configuration remains `VITE_API_URL=https://api.useaeco.xyz` and `VITE_WS_URL=wss://api.useaeco.xyz/api/v1/ws`. Provider keys belong only to the backend. Changing provider keys, auth origins, treasury addresses or financial flags is separate from a code release.

## Rollback

Record the prior successful frontend/API commit SHA and deployment IDs before release. If public verification fails, explicitly redeploy that known-good commit to the affected service(s) through the existing Railway deployment operation, then repeat live checks. Keep the same database, volumes, secrets and financial-off flags. Do not restore a database or run down migrations as an application rollback. If a separately approved schema change makes the previous code incompatible, stop for the reviewed recovery plan rather than forcing an older build.

Current known-good application release and IDs are in [public website readiness](../../docs/PUBLIC_WEBSITE_READINESS.md). Git history, Railway deployment metadata and immutable served asset hashes identify releases; a documentation HEAD can be newer than the deployed application SHA.

## Financial and migration boundaries

Production currently uses `MODE=production` for validation and Mainnet **read-only** connectivity. `PUMP_LAUNCH_ENABLED`, `MAINNET_LAUNCH_APPROVED` and `FEE_ROUTING_VERIFIED` remain false; automatic native holder indexing remains off until the official launch is accepted. No treasury signing/payout worker is installed. The initial official-deployer backend gate remains independent of those financial gates.

The existing production pre-deploy command freezes migration filenames/checksums to approved 001–004 before the existing migration validator runs. Startup currently calls the same migration routine. No pending SQL is approved: an additional/changed migration must stop the release, not be applied automatically. Do not loosen the frozen guard or enable migrations as part of simplifying deployment.

The old `.railway/railway.ts` is a **historical staging/split-topology template, not the current production configuration**. Do not apply it: it contains obsolete branches/origins and automatic migration instructions. Historical staging/split guides do not override this workflow. Keep existing production settings; do not reprovision working services.

## Legacy environment retirement

Staging and public-demo remain intact until the dependency inventory, retained evidence/drafts, external backup and isolated restore requirements are satisfied and the owner explicitly approves exact deletions. Stop treating either as a release prerequisite. Do not copy their demo records into production or revoke Pinata/Helius keys shared with production.

[Dependency, data, domain and backup inventory; scoped retirement plan](../../docs/RAILWAY_SINGLE_PRODUCTION.md). [Current Phase 2 scope](../../docs/PHASE2_NEXT_PRODUCTION_TASKS.md). [Owner-local vanity-mint handoff](../../docs/AECO_LOCAL_MINT_SIGNING.md).
