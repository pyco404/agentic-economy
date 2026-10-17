# Integrate the reviewed frontend checkpoint into main

The published frontend checkpoint adds one-finger orbit controls, an explicit touch pan mode, approved brand artwork, and isolated video-sample tooling. Integrating it with `main` exposed frontend incompatibilities with the existing `0.3.0` identity contract. This PR fixes nullable wallet handling, preserves authoritative house/legacy/wallet display names through World and profiles, and makes offline demo fixtures satisfy the newer schemas.

The branch remains compatible with its current `0.2.0` shared contracts and staging API. This does **not** mean a frontend built from `main` can consume the old API: its canonical response schemas are `0.3.0`. A coordinated backend/frontend staging upgrade is required before changing deployment branches.

## Reviewed scope

- Preserve the 30 existing one-file commits unique to `codex/frontend`: touch controls and tests; brand artwork and presentation; source-only 15-second video sample pipeline and provenance; root build-filter quoting; and Docker brand-image inclusion.
- Add focused identity compatibility and regression-test commits listed below. Existing backend, contracts, SQL migrations, and authoritative simulation behavior on `main` are unchanged by the PR.
- The 120-second film is not complete or approved; its isolated tooling and 15-second sample source are the reviewed deliverable. Generated media, models, recordings, screenshots, and local snapshots stay ignored.
- Exclude all 25 pending navigation/boats/terrain files' uncommitted changes, the unrelated integration-note append, unused `aeco-cbg.png`, and the uncommitted staging audit. The already committed version of `FRONTEND_COMMIT_PLAN.md` is included; its pending navigation-plan append is not.
- In `City.tsx`, stage only two identity wiring hunks. Its navigation and terrain implementation remains uncommitted.

## Compatibility commits

| Commit | Single file | Change |
| --- | --- | --- |
| `9130564` | `apps/web/src/api/agentIdentity.ts` | Accept persisted legacy identities and collision-expanded wallet names; never infer activation from historical ownership. |
| `c521401` | `apps/web/src/api/adapter.ts` | Supply unique unowned house identities for offline fixtures under the current schema; preserve old-schema compatibility. |
| `82ecdaa` | `apps/web/src/world/agentLabels.ts` | Retain authoritative display-name data. |
| `36363cf` | `apps/web/src/world/City.tsx` | Forward authoritative identity/name data to labels, without committing navigation/terrain edits. |
| `2306b6c` | `apps/web/src/App.tsx` | Normalize nullable wallets and forward identity fields. |
| `8f01518` | `apps/web/src/api/agentIdentity.test.ts` | Cover legacy names, null owners, stable persisted identities, and expanded wallet aliases. |
| `bf85f8c` | `apps/web/src/api/adapter.test.ts` | Validate unique house fixtures without verified wallet ownership. |
| `d653e11` | `apps/web/src/world/agentLabels.test.ts` | Match authoritative names in world labels and profiles. |
| `a4ccfe0` | `apps/web/tests/agent-identity.spec.ts` | Compare lists, refreshed views, profiles, canonical IDs, and verified wallets with actual API records. |

The report itself is a separate documentation-only commit. Intermediate one-file revisions are not all independently buildable; the completed integration tree is the validation target. No published history has been rewritten.

## Validation

Base inspected: `origin/main` at `07cac6303ee9c475476566ee5ccbf3a3197b8b9d`. An isolated clone performed an uncommitted trial merge; there were no conflicts. An independent `git merge-tree` calculation confirmed every tracked file in the tested checkout matches the actual combined tree. The active working tree never switched branches.

- Complete frontend typecheck and 127 unit tests across 33 files pass against both `0.2.0` and combined `0.3.0` shared contracts.
- Combined root build, frontend production build, repository lint, and all workspace typechecks pass. The existing large frontend chunk advisory remains.
- Combined backend tests: 67 pass; 15 database-dependent tests skipped. Database URLs were removed. No database migration was applied.
- Shared contract tests: 24 pass; world-spec tests: 7 pass.
- Actual desktop/mobile browser smoke checks against an isolated `0.3.0` in-memory demo API pass: HTTP bootstrap, WebSocket, procedural rendering, backend-consistent floating names, agent inspection, all six page overlays, one persistent canvas, logos, and mobile touch movement. No uncaught page errors or API writes occurred; wallet connection remains disabled.
- All six targeted browser cases are covered by passing results: five passed in the initial batch (phone/tablet navigation, short-screen menu accessibility, phone/tablet orbit/pan); the identity case initially hit a test-only StrictMode response-body race, was corrected, and passed its isolated rerun. This is a batch plus rerun result, not a clean initial six-case run.
- Credential-pattern review found no private keys, literal GitHub/AWS keys, or JWTs in the reviewed 26-path original branch diff. No generated video/audio/model files are included.
- Staging readiness remains healthy with PostgreSQL, state view, and simulation leadership checks passing. Staging has not been redeployed by this integration review.

## Railway branch transition gate

Current observed configuration:

| Environment/service | Deployment source | Status |
| --- | --- | --- |
| Staging frontend | `codex/frontend` | Autodeploy enabled; deployed `ce6ab78993c08cf17fd838bbfbf89cad0d59beb7` in successful deployment `7c536b03-98a1-45b9-a0b1-d74b45fdcf7d` at audit time. |
| Staging API and simulation | `staging` | `ROLE=all` in demo (no live chain indexer), contract `0.2.0`, deployed `26d8659fd6d0cdb4bf84796c669c823ed947664f`; healthy. |
| Production | No deployment trigger | Unchanged; not activated. |

No Railway settings, domains, financial flags, or databases were changed in this review. `MODE=demo` and `FEE_ROUTING_VERIFIED=false` remain in effect. Merging into `main` does not itself change these deployment sources.

After this PR is reviewed and merged, use `main` as the primary integration branch. Keep the active local branch and pending work intact until a separate safe working-tree transition is coordinated. Do not switch the staging frontend alone to `main` while its API still serves `0.2.0`.

Before a coordinated staging switch: review migration 003 and state-format upgrade; obtain explicit migration approval; take and verify a database backup; validate the upgrade on a disposable copy; stage the compatible API/frontend release; verify HTTP/WebSocket/auth/CORS and identity behavior; then approve staging branch-source changes. Production configuration and financial enablement require separate approval. No migration, environment switch, or production release is authorized by this PR.

## Manual publication and review

Codex commits; the project owner pushes and approves merges. From the existing repository, without changing branches or stashing work:

```bash
git -C /home/pikoo/Desktop/agentic-economy push origin codex/frontend
```

Then, from `/home/pikoo/Desktop/agentic-economy`, using an authenticated GitHub CLI:

```bash
gh pr create --repo pyco404/agentic-economy --base main --head codex/frontend \
  --title "fix(web): integrate touch branding and identity compatibility" \
  --body-file infra/railway/MAIN_INTEGRATION_REVIEW.md
```

If a PR already exists for this branch, update its title/body with `gh pr edit <number> --repo pyco404/agentic-economy --title "fix(web): integrate touch branding and identity compatibility" --body-file infra/railway/MAIN_INTEGRATION_REVIEW.md` instead. The CLI was unauthenticated in this workspace, so no live GitHub PR or private checks were inspected or changed. Browser alternative: `https://github.com/pyco404/agentic-economy/compare/main...codex/frontend?expand=1`.

Review GitHub checks and approve the PR manually. Use **Create a merge commit** to preserve the individual-file history; do not squash, rebase, enable auto-merge, or force-push. If the normal push is rejected because the remote advanced, stop and coordinate; never force it.
