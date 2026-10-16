# Staging rollout of contract 0.3.0 (migration 003): backup, rehearsal, recovery

Owner: Claude. Approved by the user on 2026-10-16, gated on successful integration testing. Production is not part of this plan.

## Current safeguards (2026-10-16)

- **Production:** the GitHub deployment trigger of `heartfelt-wisdom` (`b504651c-07d0-4eac-bb48-3bcce80eb8e3`) was removed (trigger `abe67c5b-…`, branch `main`, `checkSuites: false`). The service and its source link still exist; nothing deploys it automatically. Restore only on explicit approval via `deploymentTriggerCreate` with the same values.
- **Staging frontend:** its trigger (`75fbfdc5-…`, branch `codex/frontend`) was removed for the duration of the 0.3.0 work, so Codex can push 0.3.0 frontend commits without breaking https://staging.useaeco.xyz. The site keeps serving the last 0.2.0-compatible build (`a077ad9`). **Do not run `railway config apply` until the rollout's last step**: `.railway/railway.ts` declares the source branch and would recreate the trigger.
- **Staging backend:** still deploys branch `staging` (`26d8659`, contract 0.2.0). That branch only moves in step 4 below.

## Backup (taken 2026-10-16T09:04:19Z)

- `pg_dump -Fc` (PostgreSQL 18.6) run inside the staging Postgres container, streamed back and checked: SHA-256 `2da0c62c23b1bf333439a0c1b6012126176e769fb944870ebead7f8b9e25ba78`, 6,722,799 bytes, identical on both ends.
- Stored outside Git at `~/agentic-economy-backups/staging/staging-20261016T090419Z.dump` (mode 600, with `.sha256`). A fresh backup is taken again immediately before the migration (step 3).

## Restore test (isolated)

Local PostgreSQL 18.6 (official PGDG packages, checksums verified against the repository index), socket-only, separate data directory:

- `pg_restore --exit-on-error` succeeded: migrations 001/002, 5 snapshots (latest tick 243960), 12 commands, 0 pending inbox rows, 3 communities/launches, 41,423 events, 12,330 receipts, 15 treasury entries.
- All 5 snapshots pass the server's `hashState` integrity check, 9 agents each.
- Live staging at check time was slightly ahead (41,459 events, last tick 244,322): the backup is consistent and recent.

## Migration rehearsal on a copy of staging data

On a second restored copy, with the 0.3.0 code from `main`/`claude/backend` (`65b83c7`):

1. `src/store/migrate.ts` applied **only** `003_agent_identity.sql`; a second run reported "schema up to date". Checksums recorded.
2. The 0.3.0 server (ROLE=all, MODE=demo, staging settings) recovered from the v1 snapshot at tick 243,960, replayed to 244,077 and kept simulating. `/healthz`: contract 0.3.0, financial features disabled.
3. **Agent audit, all nine staging agents:** every one is `legacy`, IDs and free-text names unchanged, `ownerWallet === identity.legacyOwnerWallet` (the recorded owner), unique names exactly as predicted by `identity:audit`:

   | Agent ID | Name (historical) | Legacy name |
   |---|---|---|
   | `agt_femrFfDVkx919C` | Juniper Cart | `Hare_7953` |
   | `agt_nziJuaA2S78D18` | Rye Runner | `Copper_9818` |
   | `agt_FxbjpJCY0RWfx9` | Ovenkeeper | `Yarrow_9544` |
   | `agt_E9u6VUJCP4iH5z` | Millrace | `Birch_7168` |
   | `agt_N0q3BUZ22CfeGL` | Golden Furrow | `Swift_2136` |
   | `agt_o8xY9Swsx0PZZ4` | Quay Trader | `Willow_7168` |
   | `agt_6AmPt2BvDayC8W` | Mortar & Pestle | `Lark_9538` |
   | `agt_Sg75KbBQCz76sq` | Lintel | `Moss_9220` |
   | `agt_LHxu2Ecrddc3Sw` | Gridline Haul | `Bow_8976` |

4. Over HTTP, using a demo community's launcher wallet (public demo seed): `POST /agents` → 410; a stranger → `not_token_launcher`; the launcher activates (201, `token_linked`, `active`, display name = short wallet); the same key replays the same agent; `/me/activation` returns it; a house agent is created with `ownerWallet: null`; 11 agents, all names unique.
5. After an abrupt kill and restart, all 11 identities were identical and the simulation resumed; v1 and new v2 snapshots all pass the integrity hash.

## Recovery plan (migration 003 is not reversible)

- 003 only adds two append-only tables, so a failed migration rolls back in its own transaction and leaves the database as it was; the 0.2.0 deployment keeps serving (Railway does not switch traffic when the pre-deploy step fails).
- **After 003 is applied, the 0.2.0 build refuses to start** (its migration check rejects a schema newer than the build), and 0.3.0 snapshots carry v2 state. Downgrading code is therefore not a recovery path.
- If 0.3.0 fails to start or misbehaves after 003: keep the database untouched, keep the previous deployment if it is still serving, and **fix forward** on `claude/backend` → `staging`.
- If the data itself were damaged (not observed in rehearsal): restore the verified backup into a **new, separate** Postgres service and point a 0.2.0 deployment at it, with the user's approval. The original database is never reset or recreated. Only demo simulation progress since the backup would differ.

## Rollout sequence (each step gated on the previous)

1. Codex's 0.3.0 frontend passes typecheck, lint, unit and browser tests against a local 0.3.0 backend, and is merged with `main` (see `contracts/frontend-0.3.0-handoff.md`).
2. Claude validates the integrated commit (backend and frontend checks on the same contract), then merges the PRs into `main` (normal merge). Production stays without a trigger.
3. Fresh staging backup with checksum, as above.
4. Fast-forward branch `staging` to the integrated backend commit. Railway's pre-deploy step applies 003 once; the new process waits for the simulation lock, upgrades the latest snapshot and takes over. No maintenance window is needed: the 0.2.0 process keeps serving until the switch (overlap 15 s).
5. Verify `/readyz`, `/healthz` (contract 0.3.0), the nine legacy identities as tabled above, ticks advancing, snapshots v2.
6. Deploy the frontend from the integrated commit (recreate the frontend trigger on the agreed branch, or deploy that commit once), then verify on https://staging.useaeco.xyz: CORS, sign-in domain, WSS, identities, house creation and activation, existing community pages.
7. Restore automatic deployments for staging only after verification; production stays disabled.
