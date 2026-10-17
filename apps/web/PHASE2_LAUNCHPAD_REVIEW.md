# Phase 2 Launchpad implementation and release review

## Scope and audit

This milestone implements authentication and editable launch assets, not financial execution. Existing backend authentication already uses single-use expiring Solana message challenges, Ed25519 verification and hashed opaque sessions. The old frontend wallet control was disabled; the logo component only previewed files and exposed an unavailable integration port. Browser draft fields were retained in session storage, and persisted launch records existed only after transaction preparation. There was no editable draft or trusted upload store.

The existing challenge verifier and financial launch lifecycle remain intact. The new workspace uses an additive API independent of agent identity versions; it does not merge the unfinished main-branch 0.3.0 identity implementation or change one-token/agent/wallet policy.

## Functional flow

- Wallet Standard discovery, plus installed Phantom/Solflare/Backpack providers that expose connect and signMessage. Mobile support is through compatible wallet in-app browsers/Wallet Standard; no unverified deep-link scheme is introduced.
- Fresh challenge signing, verified browser session, restore, expiry, account-change invalidation and server logout revocation. Only authentication messages are signed. No transaction-signing API is called.
- HttpOnly, SameSite=Strict cookie; HTTPS uses a Secure `__Host-` cookie. Session tokens are never saved in JavaScript storage or returned from browser verification. Legacy bearer clients remain supported.
- Cookie mutations require an explicitly allowed Origin. Credentialed CORS permits exact configured origins. Backend and frontend should use the planned same-site custom domains, not unrelated railway.app and useaeco.xyz domains.
- Wallet-owned create/list/get/update/delete drafts, optimistic version checks, bounded idempotent retries and persistent per-wallet upload/pinning quotas. Current list shows the latest 100 drafts; older drafts remain retrievable by canonical ID. Pagination is a later convenience improvement.
- Binary image uploads authenticated before buffering, maximum 5 MB (configurable downward), PNG/JPEG/WebP, decoded pixel limit, rejection of animated/corrupt/active-content files, and decode/re-encode before Pinata. Two concurrent upload bodies/decoder tasks per process bound memory/CPU pressure. Frontend progress stops short of success until the backend confirms pinning and persistence.
- Public Pinata V3 multipart uploads use only server credentials. Verified image CID/URI is attached to the owned draft. The browser cannot supply a trusted image/metadata reference. Replacement/removal invalidates metadata.
- Explicit metadata generation uses the latest saved name, symbol, description, verified image IPFS URI, and optional HTTPS website/X/Telegram links. JSON includes `showName` and attributes `createdOn` to the configured application origin; pinning does not claim the draft was created on Pump.fun. Later field/image edits invalidate metadata. Pinning is not proof of an on-chain launch or protocol acceptance.
- Backend review returns the saved fields, image/metadata IPFS references, verified wallet, SOL quote, planned 0.05 SOL charge, issues and `launchEnabled:false`.
- Import is explicit: browser-saved text is copied into the form and saved only after user action. Untrusted old image/metadata URLs are not imported. Old browser data is retained.

SOL is draft-only. USDC remains a rollout target pending this application's verified quote-aware integration; AECO remains a future phase. No price, transaction, deduction, launch, creator-fee receipt or economic event is fabricated by this workflow.

## Additive API

Shared Zod contracts: `packages/shared/src/launchpad.ts`. Existing `/auth/challenge` issues the signed message.

| Method | Path | Request / response |
| --- | --- | --- |
| GET | `/api/v1/launchpad/capabilities` | Version 1; configured upload limits, storage kind, quote/financial restrictions |
| POST | `/api/v1/auth/browser/verify` | Existing VerifyRequest; WalletIdentity and HttpOnly cookie |
| GET | `/api/v1/auth/browser/session` | WalletIdentity; no-store |
| POST | `/api/v1/auth/browser/logout` | Revoke hashed session and clear cookie |
| GET / POST | `/api/v1/launchpad/drafts` | Owned recent items / DraftFields → SavedLaunchDraft |
| GET / PATCH / DELETE | `/api/v1/launchpad/drafts/:id` | Read / `{version,fields}` / `{version}` |
| POST | `/api/v1/launchpad/drafts/:id/logo?version=N` | application/octet-stream bytes → SavedLaunchDraft |
| DELETE | `/api/v1/launchpad/drafts/:id/logo` | `{version}` clears image and metadata |
| POST | `/api/v1/launchpad/drafts/:id/metadata` | `{version}` → SavedLaunchDraft |
| GET | `/api/v1/launchpad/drafts/:id/review` | DraftReview; never a transaction |

Create, upload and metadata requests require an `Idempotency-Key` of 8–128 safe characters. Reusing a key for different content is rejected. Concurrent/stale edits return 409. Missing/foreign drafts return 404. Failed authentication returns 401; unapproved Origin and quotas/rate limits are rejected explicitly. Pinata failure is a sanitized 503; provider credentials/response bodies are never exposed. Invalid binary inputs are rejected before any Pinata request. Rejected operations consume bounded quota; retries cannot bypass it.

All draft mutations enforce wallet ownership on the server. A completed pin may remain public if a later concurrency conflict prevents attaching it; automatic unpinning is intentionally absent because IPFS is public and content may be shared.

## Migration approval boundary

`apps/server/src/store/migrations/004_launchpad_workspace.sql` adds only draft and operation tables/indexes. Number 003 is reserved for main's separately reviewed agent-identity migration; the static migration test checks unique increasing numbers without requiring that unrelated migration here.

**No database migration has been applied.** Existing PostgreSQL startup and Railway pre-deploy run pending migrations automatically: do not deploy this backend until this SQL and the target database are approved. Do not copy or apply identity migration 003 to make numbering consecutive. Existing world, ledger, launch, agent and ownership tables are untouched (session revocation uses the already existing revoked_at column).

The gated Postgres integration test requires both a disposable `*_test` TEST_DATABASE_URL and `LAUNCHPAD_TEST_MIGRATIONS_APPROVED=true`. It must not target Railway staging or production. Without that explicit authorization, persistence across actual Postgres reconnects remains unverified; memory/API tests are not represented as durable database proof.

## Current Railway findings (read-only inspection)

- Branch checked out: `codex/frontend`, checkpoint `eb00cb8` before this milestone. All pending city/navigation/boat/readiness work was backed up and preserved.
- Staging API: branch `staging`, commit `26d8659`, contract 0.2.0, PostgreSQL, healthy demo mode, financial features false.
- Staging frontend: branch `codex/frontend`, commit `eb00cb8`, https://staging.useaeco.xyz.
- API: https://api-staging.useaeco.xyz; WebSocket: wss://api-staging.useaeco.xyz/api/v1/ws.
- Production contains an existing failed main-branch service; it was not altered or activated.
- Auth domain and URI already match https://staging.useaeco.xyz; its origin is already in CORS_ORIGINS. PINATA_JWT is currently unset (presence checked without displaying any credential). Preserve the other approved staging origins when coordinating deployment.
- No deployment trigger, CORS setting, environment variable, database, branch or remote reference was changed by the inspection.

The frontend probes capabilities; older backends keep the local draft experience and report authentication unavailable instead of calling nonexistent upload endpoints. This compatibility fallback does not constitute a deployed Phase 2 backend.

## Required staging configuration for review

Backend (API/all role only):

```dotenv
MODE=demo
FEE_ROUTING_VERIFIED=false
AUTH_DOMAIN=staging.useaeco.xyz
AUTH_URI=https://staging.useaeco.xyz
CORS_ORIGINS=https://staging.useaeco.xyz
PINATA_JWT=<server-only scoped public-upload credential supplied securely>
IPFS_GATEWAY=https://gateway.pinata.cloud
LOGO_MAX_BYTES=5000000
LOGO_MAX_PIXELS=16000000
```

Retain the existing approved DATABASE_URL privately. Never set a VITE_PINATA_JWT or pass server credentials into frontend build arguments. Session/challenge TTL settings retain their existing defaults. Use the application's frontend origin for authentication messages; the generated backend Railway domain is not the website authentication origin.

Frontend: `VITE_API_URL=https://api-staging.useaeco.xyz`, `VITE_WS_URL=wss://api-staging.useaeco.xyz/api/v1/ws`. No production financial changes. Backend native image libraries are packaged by `scripts/bundle.mjs`; the existing Dockerfile copies that self-contained output.

Release order after approval: test the migration on an approved disposable database; approve/apply it to staging through the existing deployment process; deploy a reviewed compatible backend branch; verify capabilities, exact-origin credentialed CORS and message domain; then deploy the frontend and perform an explicitly authorized real-wallet/Pinata smoke test. No live uploads have been performed during development.

## Evidence and limitations

Deterministic tests use real Ed25519 signatures and the real authenticated API. Browser tests use a clearly isolated test wallet provider and mocked Pinata transport/gateway, never a production mock toggle. Screenshots are ignored artifacts:

- `artifacts/launch-workspace-review-1440.png`
- `artifacts/launch-workspace-review-390.png`

A physical wallet/mobile device, actual Pinata credentials, and approved Postgres migrations remain external validation gates. The functional local demo backend is in memory; the UI explicitly warns that its drafts survive refresh but not backend restarts. Production persistence uses the Postgres repository once the migration is approved.

## Commit and push boundary

Use one file per Conventional Commit, including dependency manifests and lockfile as separate commits. Only Phase 2 hunks of App.tsx and server config.ts may be staged; earlier readiness/layout work in those files must remain uncommitted. Intermediate commits depend on later files and are not independently buildable. Validate the completed series, not each partial dependency graph.

No push, merge, deployment or database migration is authorized by this report. The user handles pushes. A normal `git push origin codex/frontend` is the eventual command after review; it may trigger frontend staging autodeploy, so coordinate the migration/backend rollout first.

### Reviewed individual-file commit plan

| Commit | File | Conventional Commit |
| --- | --- | --- |
| `be0d404` | `packages/shared/src/launchpad.ts` | `feat(contracts): define authenticated launch workspace schemas` |
| `7d78d78` | `packages/shared/src/index.ts` | `feat(contracts): export launch workspace contracts` |
| `237d52e` | `packages/shared/test/launchpad.test.ts` | `test(contracts): reject untrusted draft assets and unsupported quotes` |
| `0015cf6` | `apps/server/package.json` | `build(server): add native image validation dependency` |
| `7dbdc06` | `apps/web/package.json` | `build(web): add wallet discovery and signature test dependencies` |
| `142d85a` | `pnpm-lock.yaml` | `build(deps): lock wallet and image validation packages` |
| `47a17c0` | `apps/server/src/store/types.ts` | `feat(auth): define session revocation persistence` |
| `d16cc3d` | `apps/server/src/store/memory.ts` | `feat(auth): revoke in-memory wallet sessions` |
| `82979b4` | `apps/server/src/store/postgres.ts` | `feat(auth): persist wallet session revocation` |
| `de3c40d` | `apps/server/src/store/migrations/004_launchpad_workspace.sql` | `feat(storage): prepare owned launch draft and operation tables` |
| `b035783` | `apps/server/src/store/launchpad.ts` | `feat(storage): persist owned drafts with versioned operations and quotas` |
| `5b54db6` | `apps/server/src/config.ts` | `feat(config): configure server-only Pinata credentials and image limits` |
| `59160f0` | `apps/server/.env.example` | `docs(config): document private Pinata and image settings` |
| `6db9757` | `apps/server/src/services/launchpad.ts` | `feat(launchpad): validate and pin draft logos and metadata` |
| `d82a026` | `apps/server/src/http/launchpad.ts` | `feat(api): expose cookie-authenticated launch workspace routes` |
| `a263179` | `apps/server/src/http/app.ts` | `feat(api): register launch workspace with credentialed CORS` |
| `782849b` | `apps/server/scripts/bundle.mjs` | `fix(build): package native image decoder with backend bundle` |
| `43b24ed` | `apps/server/test/migrations.test.ts` | `test(storage): allow reserved migration numbers without duplicates` |
| `2f79d5e` | `apps/server/test/launchpad.test.ts` | `test(launchpad): cover authenticated drafts uploads and metadata` |
| `9bf16c2` | `apps/server/test/launchpad-postgres.test.ts` | `test(storage): gate durable launch workspace checks on database approval` |
| `23ceee3` | `apps/web/src/api/walletSession.tsx` | `feat(auth): authenticate Solana wallets with secure browser sessions` |
| `3594c94` | `apps/web/src/api/walletSession.test.ts` | `test(auth): verify wallet discovery and expired session handling` |
| `cd2a72f` | `apps/web/src/components/WalletButton.tsx` | `feat(auth): connect and sign out through the navigation wallet control` |
| `97e5506` | `apps/web/src/wallet-session.css` | `style(launchpad): fit wallet dialogs and draft review to mobile screens` |
| `f5dedbd` | `apps/web/src/main.tsx` | `feat(web): provide a persistent wallet session context` |
| `21ed68a` | `apps/web/src/api/launchMedia.ts` | `docs(launchpad): clarify authenticated upload adapter ownership` |
| `758a385` | `apps/web/src/api/launchQuotes.ts` | `docs(launchpad): distinguish draft quotes from financial capabilities` |
| `978aae6` | `apps/web/src/components/LaunchLogoUpload.tsx` | `feat(launchpad): bind scoped logos to trusted backend upload state` |
| `ea37099` | `apps/web/src/components/LaunchWorkspace.tsx` | `feat(launchpad): save owned drafts upload logos and review pinned metadata` |
| `d7098da` | `apps/web/src/components/Pages.tsx` | `feat(launchpad): open the authenticated workspace when supported` |
| `4226ab9` | `apps/web/src/App.tsx` | `feat(auth): enable the existing navigation wallet control` |
| `d6fe452` | `apps/web/tests/launch-logo.spec.ts` | `test(launchpad): assert backend upload rejection details` |
| `0308ec0` | `apps/web/tests/launch-workspace.spec.ts` | `test(launchpad): exercise authenticated desktop and mobile draft journeys` |
| `596bd31` | `apps/web/PHASE2_LAUNCHPAD_REVIEW.md` | `docs(launchpad): record implementation validation and staging approval gates` |
| `f143720` | `apps/web/scripts/serve-launch-workspace-test.mjs` | `test(launchpad): serve an isolated authenticated Pinata fixture` |
| `ee53f1a` | `apps/web/playwright.launchpad.config.ts` | `test(launchpad): make the authenticated browser suite reproducible` |
| `3d4f97c` | `apps/server/src/services/launchpad.ts` | `fix(launchpad): attribute draft metadata to the application origin` |
| `1e63133` | `apps/web/src/components/LaunchWorkspace.tsx` | `fix(launchpad): disclose memory-backed demo draft persistence` |

### Validation results

- Frontend unit suite: 171 passed (45 files).
- Shared contract suite: 22 passed.
- Backend suite: 66 passed; database-dependent tests remain gated (11 existing, plus the new explicit-approval Postgres workspace test).
- Desktop/mobile authenticated workflow and wallet error scenarios: 3 passed, real local API/signature verification with test wallet and mocked Pinata/gateway.
- Legacy API regression: desktop/tablet/mobile logo preview and SOL/unsupported-quote behavior passed. Upload fixture asserts actual backend rejection details while preserving retry/cancellation tests.
- Workspace typecheck, root/frontend lint, root backend/shared build, frontend build and isolated production-bundle startup passed. Existing frontend large-bundle warning remains.

No actual installed wallet, physical mobile device, live Pinata upload, PostgreSQL migration or staging deployment was exercised. Those are separate approval/configuration gates, not silently simulated successes.

Protocol references: [Pinata V3 public uploads](https://github.com/PinataCloud/pinata/blob/main/ai-instructions), [Phantom integration](https://docs.phantom.com/solana/integrating-phantom), [Pump program interfaces](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md). Protocol support for quote assets does not imply this application's transaction adapter has verified support.

### Reproducible browser validation

```sh
pnpm build
PLAYWRIGHT_NATIVE_GPU=1 pnpm --filter @agentic-economy/web exec playwright test --config=playwright.launchpad.config.ts
```

Omit PLAYWRIGHT_NATIVE_GPU for software-rendered CI. This explicit configuration starts a memory-only API on 8796 and frontend on 5186, uses a test-only wallet provider with real Ed25519 signatures, and intercepts only Pinata/gateway responses. The fixture never reads a database URL or live Pinata credentials. It is not imported by the production application or server entrypoint. All three scenarios pass.

### Committed snapshot validation

A separate `git archive` of the completed series in `/tmp/aeco-phase2-committed-review` was installed from the frozen lockfile using cached dependencies. It excludes all unrelated pending world/navigation/boat/readiness work. That snapshot passes root build, frontend build, workspace typecheck, root/frontend lint, and all **229 available package tests**: 137 frontend, 63 backend, 22 shared contracts and 7 world-spec tests. Twelve database tests remain skipped. The dedicated authenticated browser suite passes all three scenarios from that archive. The working tree additionally passes its earlier preview-specific tests (171 frontend / 66 backend); these are not misrepresented as part of the committed checkpoint.

The final metadata-origin correction was separately exercised against the ten authenticated workspace API tests. Every implementation commit contains exactly one file. The report itself is updated after validation; commit hashes above refer to the implementation history preceding this report update. No published history was changed.

Final follow-up validation rechecked the committed metadata attribution and memory-storage notice in the isolated snapshot: builds, typecheck, lint, all ten workspace API tests and all three browser scenarios pass. The local disposable-database migration approval request remains pending, so no SQL migration or Postgres durability test was run. Current functional preview: http://127.0.0.1:5176/launchpad?source=backend, using the actual memory-only demo API with Pinata disabled until configured; the earlier city preview is preserved.
