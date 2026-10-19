# Main-only integration and staging gate — 18 October 2026

> Current status, 19 October 2026: the transition is complete. Both staging services
> deploy compatible contract 0.3.1 releases from main; production has no triggers.
> The 18 October release at dd17c4f applied approved migration 003 only after a
> restorable staging backup (9010bcf9-d81e-4127-a7c1-e180f1248069), isolated rehearsal
> and identity audit. Existing agents and draft records were preserved. The earlier
> blocked checkpoints below are historical, not the current deployment state.
> Later releases retain demo restrictions. See the root README and latest release
> reports; no additional database migration or production change is authorized.


## Current Task 1 status

Staging was recovered to a compatible **0.2.0 frontend/API pair** on 18 October 2026 after live browser checks exposed the previously deployed 0.3 frontend / 0.2 API mismatch. The full upgrade to main remains blocked at the explicitly required backup/restore gate. No migration was applied. See the Task 1 recheck below for exact deployment IDs, evidence and outstanding acceptance criteria.

## Git integration

PR #8 head `ed8ce09208b73bc3e3556bad4bf3b4658568e79c` contains 52 commits relative to remote main `3cdeb793a93202edf662f3dc206bf36d85640ba8`: 51 single-file commits and one historical merge. They cover zoned turf, authenticated Launchpad drafts, verified IPFS assets, wallet sessions, persistence, tests, and release notes. Preserve all original hashes.

Local main also contained 21 reviewed agent-work commits ending at `85a90193`. Merge `3944dc3` joins both histories. Its sole conflict was the import block in `Pages.tsx`; both sets of imports were retained. The merge revision itself had a pre-existing Launchpad registration failure and is not independently validated as a working release. Follow-up single-file fixes restore registration and carry reviewed origin-bound wallet authentication, disconnected draft/logo preparation, and transparent logo styling into main.

The original workspace remains untouched on its historical branch, with 99 modified/untracked files preserved in `/tmp/aeco-main-transition-20261018/unfinished-source.tar.gz` and verified against `preserved-files.json`. These pending city/navigation/terrain changes are not part of the release. New development takes place on main in `/tmp/aeco-agent-work-main`; do not continue developing on the old branch.

GitHub's branch API reports `protected: false`; effective branch rules and repository rulesets are empty. No rule bypass or history rewrite is needed. SSH access permits a normal push; GitHub CLI has no authenticated session. Integration uses an ordinary push to main, with no new PR or development branch.

## Deployment isolation

Read-only Railway API inspection confirms production environment `5c4b546b-638f-487c-ad35-845f3d2074d4` has zero deployment triggers. Its service source still names main; do not reconnect it or alter production settings. Staging alone has the two repository triggers.

Existing staging frontend trigger `b2293cc4-0ebd-4816-b109-14ba105d5600` tracks codex/frontend. Existing staging backend trigger `40bd9471-3981-45ab-a670-a28a11d8b326` tracks staging. Do not change either to main until the schema and coordinated release gate pass. Both staging domains currently return HTTP 200; API health reports demo mode, contract 0.2.0, and financial features disabled. Main uses contract 0.3.0, so deploying only the frontend would not establish a compatible release.

## Conditional migration approval: blocked before execution

Staging contains migrations 001, 002, and 004 with checksums matching their committed SQL. Identity migration 003 is absent. This ordering resulted from the separately approved Launchpad checkpoint deployed from codex/frontend while main's identity migration was explicitly excluded. The migration numbering allows reserved gaps; no migration was lost or silently applied out of order by this integration.

Migration 003 adds agent_names and agent_activations, their uniqueness constraints, references, and append-only triggers. Migration 004 adds separate launchpad_drafts and launchpad_operations tables. Static inspection finds no overlapping table changes, but it is not a substitute for a restore rehearsal and identity-data audit.

The user conditionally approved 003 on staging only, requiring a current restorable backup, duplicate/conflict audit, and successful migration on an isolated staging copy first. Railway `volumeInstanceBackupList` for staging PostgreSQL volume instance `f6b1e054-1d59-4360-adba-3c9efb03f159` returned an empty list. The first prerequisite therefore failed. No staging migration, backup creation, source change, deployment, production modification, or financial operation was performed. An unverified local file or earlier disposable test database is not claimed as a current restorable staging backup.

Before proceeding: establish and verify a current staging backup; restore it into an isolated copy; audit legacy agents, pending commands and activation uniqueness; rehearse only migration 003 and confirm preserved records and 004 assets; recheck main frontend/backend compatibility. Only then apply approved 003, switch both staging sources/triggers to main with environment-scoped changes, deploy backend first and verify it, deploy frontend, and verify actual SHAs, API/WebSocket, wallet origin and demo simulation. No other migration is approved.

## Validation

The integrated follow-up tree passes workspace typecheck, root lint, backend/shared builds, frontend production build, and generated OpenAPI consistency. Suites: 91 backend, 143 frontend, 26 shared-contract, and 7 world-generation tests passed. Eighteen database-dependent tests were skipped because no test database/migration authorization was supplied to these suite runs. Sandbox loopback/subprocess failures in the first run were rerun with the required local execution permissions.

Browser coverage uses an isolated memory-only main API, real Ed25519 test signatures, mocked Pinata, and native touch events: agent assignment/travel/work/receipt, mobile/tablet discovery, two-finger orbit/pinch, desktop camera interactions, and disconnected/connected Launchpad workflows. An old house-name-only assertion failed on a legitimate shortened wallet name; it was corrected to compare labels with canonical API identities. The corrected desktop case passed with explicit native GPU settings and a smaller framebuffer after software-rendered stress runs timed out. All nine scenarios passed across the full run plus that focused rerun, not as a clean initial run. The optional native-GPU test configuration is also preserved; CI retains software rendering. No real wallet extension, live Pinata, production transaction, or staging schema rehearsal is claimed.

Detailed logs and per-commit manifest remain at `/tmp/aeco-main-transition-20261018/`. The existing histories have not been squashed, rebased, or force-pushed. Intermediate one-file dependency revisions are not claimed to build independently; validation covers the final combined tree.


## Task 1 recheck and staging recovery — 18 October 2026

### Git and preserved work

- Reviewed code revision: `eb399b580c2b45197f9df4ff405111fd3b894605`; local main and origin/main matched before this documentation update. No new development branch, PR, force push or history rewrite was used.
- Inventoried 101 modified/untracked files in the older checkout. Nine already match main, 51 differ, and 41 have no main counterpart. File hashes were checked again after recovery; all 101 remain unchanged. The inventory includes local documentation/assets as well as source. Differing city/navigation/terrain experiments remain excluded from the release; prior functional auth fixes already on main were not committed again.

### Actual failure and recovery

The original live browser smoke checks failed on both desktop and mobile. Frontend deployment `2c6786f7-8670-4be2-a1bc-ab03ebb0e6d9` served commit `ed8ce09208b73bc3e3556bad4bf3b4658568e79c`, whose agent parser requires 0.3.0 `identity` and `displayName`. The live API reports 0.2.0 and omits those fields. The result was “Couldn’t load the city”; Launchpad content was also blocked by world initialization. HTTP 200 and Railway SUCCESS had concealed the incompatibility.

A clean archive of published commit `74085709342074c8366f8021bfcbec4ded2cb627` was built without switching branches. Its 0.2 frontend passed desktop/mobile checks against the real API using isolated browser-only asset interception. The previously successful frontend artifact for that same commit was then restored using Railway rollback. The target was explicitly checked to be the staging web service, with no pre-deploy migration command. This is temporary incident recovery, not completion of the main-branch upgrade.

| Service | Current deployment | Source evidence |
| --- | --- | --- |
| Staging frontend | `782235db-f44c-4208-912d-fb00c2290dad` | Native commit metadata: `74085709342074c8366f8021bfcbec4ded2cb627` |
| Staging API | `5925f299-12f7-41ed-96c3-0f4bcd4e054a` — unchanged | Manual-upload label records source `7408570`; the full corresponding Git revision is `74085709342074c8366f8021bfcbec4ded2cb627`. Native backend commit metadata is absent, so the label is not independent image/source attestation. |

The web recovery restored only an existing static frontend artifact. No API deployment, application database migration, agent activation, draft creation, image upload, launch or financial operation was performed. Browser authentication checks used ephemeral test keys, created ordinary auth challenges/sessions, and revoked the sessions from successful smoke flows through logout. The normal demo simulation continued writing its own events and receipts.

### Database and migration gate

A staging PostgreSQL SSH audit used forced read-only transactions and rollback, without starting application code or invoking the migration runner:

- Applied migrations remain `001_init.sql`, `002_coordination.sql`, and `004_launchpad_workspace.sql`. All three SHA-256 checksums match main. `003_agent_identity.sql` is the only pending migration in main.
- `agent_names` and `agent_activations` are absent; both Launchpad tables exist. Migration 003 was not applied or rehearsed on staging data.
- The latest snapshot remains state version 1 with nine agents, no duplicate legacy names/wallets, and no pending inbox commands. The read-only identity upgrade audit produces nine unique proposed legacy names and canonical IDs. No existing agent was converted into a token-linked activation.
- Before/after recovery counts: three communities, three launches, 15 treasury entries, three Launchpad drafts and three Launchpad operations. Agent count remains nine. Task receipts and reward records continued increasing with the running demo economy. Existing API agent IDs remained present after browser checks.
- Migration 004's application timestamp is 17 October 2026, 22:41 UTC. The backend's recorded source `7408570` contains migrations 001, 002 and 004, but no 003; this explains the gap rather than implying a failed migration. The SQL additions for 003 and 004 target separate tables.
- Railway backup inventory was queried again before and after recovery and returned **zero backups**. No other current restorable staging backup was verified. Consequently no restore into an isolated staging copy, staging-data migration rehearsal, or approval to execute 003 can be claimed. Stop at this gate.

### Validation results

- Main: 160 frontend, 91 backend, 26 shared-contract and seven world-spec tests passed (**284 total**). Eighteen database-dependent tests were explicitly skipped; no test was pointed at staging or an existing development database.
- Workspace typecheck, root/frontend lint, backend/shared builds, frontend production build and generated contract consistency pass. The existing large frontend bundle advisory remains.
- Prior-release candidate: two desktop/mobile browser cases passed against live API data with browser-only asset interception; this was predeployment compatibility evidence, not a live deployment claim.
- Main frontend/API 0.3.0 local integration: five Launchpad browser scenarios passed, including desktop/mobile authentication, automatic asset preparation, unavailable uploads, retry idempotency and rejected signatures. These use an isolated memory API and mocked Pinata, not staging uploads.
- Actual recovered staging: two browser cases passed at 1440px and 390px, without frontend asset interception. Verified city rendering, PostgreSQL readiness, simulation leadership, WebSocket snapshot/pong/heartbeat and movement/activity events, one message signature per ephemeral test wallet, authenticated session, Launchpad form access after sign-in, logout and subsequent HTTP 401, retained original agent IDs, and zero page JavaScript errors.
- Anonymous visitors still see the older wallet-gated workspace; the improved public form, one-action preparation, Explore sections and other newer main functionality are not claimed as deployed. Pinata remains unconfigured, uploads unavailable, and launch execution disabled. No installed Phantom extension, physical device or live Pinata upload was tested.

### Outstanding acceptance criteria

Both staging triggers remain on their historical sources: frontend `codex/frontend`, API `staging`. They were deliberately not switched to main while a backend pre-deploy command would automatically apply the conditionally approved but unrehearsed 003. Production was rechecked to have zero deployment triggers and was not modified. Current API mode remains demo with financial features disabled.

Task 1 is **not complete**: establish and verify a current restorable staging backup, restore an isolated copy, audit and rehearse 003 with record-preservation checks, then apply only approved 003, coordinate both services from main, identify their native deployed Git SHAs, and rerun the live acceptance checks. Phase 2 wallet/upload rollout must wait for that complete main release; recovery to the compatible older pair does not satisfy it.

Private local evidence: `/tmp/aeco-staging-integration-20261018/` contains logs, read-only audits, inventories, browser results and screenshots. Credential-variable exports were removed; detailed identity data stays private and is not committed.

## Migration gate resolved — 18 October 2026

The earlier backup blocker is resolved. Railway staging backup `9010bcf9-d81e-4127-a7c1-e180f1248069` was created at 08:37 UTC and remains listed. An independent PostgreSQL 18 custom-format dump was restored successfully into a private, socket-only disposable PostgreSQL 18 instance. The private dump SHA-256 is `ab8633598e0b748ebe4956dfd14c6ffed7b81c2de850bb87b83b204843469145`; backups and credentials are excluded from Git.

The isolated rehearsal applied only `003_agent_identity.sql`, then confirmed a second migration run was a no-op. Fingerprints of all 20 pre-existing data tables remained identical. All nine legacy agents retained their original fields, IDs, ownership and deterministic upgrade identities. Existing migrations 001, 002 and 004 match main's checksums. Migration 004 preceded 003 because the approved older Launchpad release contained 001/002/004 and no 003; the two additions use separate tables.

Main running against the restored database passed desktop 1440px and mobile 390px browser checks: world rendering, anonymous Launchpad access, origin-bound Ed25519 authentication through an injected ephemeral test signer, cookie session, logout, and versioned WebSocket snapshot/pong. This is not a real Phantom extension test or live Pinata verification.

Release validation: 163 backend tests passed with all database-dependent cases enabled against a separate disposable test database; 162 frontend, 26 shared-contract and seven world-generation tests passed. Build, frontend production build, typecheck and lint pass. The existing large frontend bundle advisory remains. An obsolete indexer test fixture was updated to supply complete synthetic RPC evidence and explicitly reject mock-chain receipts outside demo mode; production verification guards were not relaxed.

The original checkout's 101 unfinished files remain preserved. Temporary test infrastructure was reconstructed after session cleanup; the persistent private backup survived and its checksum was verified again. At this checkpoint staging is still on the older release. The next authorized step is a coordinated staging-only release: recheck the live ledger and identity uniqueness, point staging sources at main without auto-deploying, deploy the API with only approved migration 003, then deploy the frontend and verify actual commit metadata and live browser behavior. Production and all additional migrations remain excluded.
