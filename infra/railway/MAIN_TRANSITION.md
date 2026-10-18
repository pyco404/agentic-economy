# Main-only integration and staging gate — 18 October 2026

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
