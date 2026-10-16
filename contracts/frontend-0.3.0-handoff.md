# Contract 0.3.0 — frontend integration handoff (Claude → Codex)

Written 2026-10-16. Design record: `contracts/agent-identity.md`. Schemas: `packages/shared/src/identity.ts`, `agents.ts`, `api.ts`. OpenAPI: `contracts/openapi.yaml` (0.3.0). Events: `contracts/events.md`.

## Update 2026-10-16 (approved plan)

- **Staging frontend auto-deploy is suspended** (its Railway trigger on `codex/frontend` was removed). You can push 0.3.0 frontend commits to `codex/frontend` without breaking https://staging.useaeco.xyz, which keeps serving `a077ad9`. Staging is redeployed deliberately during the rollout (`infra/railway/staging-0.3.0-rollout.md`).
- **Production no longer auto-deploys from `main`.**
- **Incident (resolved, my mistake):** at about 10:08 local, a pattern-based process stop meant for my migration-rehearsal server also stopped your local integration backend on :8787. I restarted it with your `apps/web/scripts/serve-integration-backend.mjs`; it is healthy (contract 0.2.0, 15 agents, simulation running from its saved state). Your uncommitted files were not touched. I now stop processes by PID only.
- The user's acceptance list for your side: fix all 11 type errors, use the shared identity types (`house` / `legacy` / `token_linked`), show `displayName`, handle nullable `ownerWallet`, integrate `/agents/activate`, `/agents/house`, `/me/activation`, surface the new activation and rate-limit codes, verify wallet sign-in and agent management, and pass build, typecheck, lint, unit and relevant browser tests against a local 0.3.0 backend.

## Where things stand

- **`main` (`9bfac7b`, PR #4) contains the complete, tested 0.3.0 backend**, not only the contract: migration 003, the v1→v2 simulation-state upgrade, the activation/house/my-activation routes and 410 for `POST /agents`. No further backend API or schema change is planned for this integration.
- **`main`'s frontend does not typecheck against 0.3.0 (11 errors).** A trial merge of `codex/frontend` (`a077ad9`) into `main` is conflict-free and has the same 11 errors. Nothing on the backend needs to change to fix them; they are the frontend updates below.
- **Staging is unaffected**: the API deploys branch `staging` (`26d8659`, contract 0.2.0) and the frontend deploys `codex/frontend`. Do not point staging at `main` until both sides are on 0.3.0 and migration 003 is approved.

## The 11 typecheck errors: one root cause

`apps/web/src/api/agentIdentity.ts` declares its own `identity?: AuthoritativeIdentity` (`token_linked` | `house`). The API's `AgentSummary.identity` is now required and has a third kind, `legacy`, so `AgentSummary` is no longer assignable to `IdentityAgent` (10 errors in `App.tsx:648`, `Communities.tsx:50/52`, `Explore.tsx:56/57`, `Pages.tsx:403/745/760×2/761`). The 11th (`App.tsx:314`) is `ownerWallet: string | null` flowing into `AgentVisual.ownerWallet?: string`.

## Required frontend changes

1. **Identity:** replace `AuthoritativeIdentity` with the shared `AgentIdentity` (`house` | `token_linked` | `legacy`). Field names already match your type (`syntheticName`, `activationId`, `tokenMint`, `activatingWallet`); token-linked also has `launchId` and `communityId`, legacy has `legacyOwnerWallet`.
2. **Names:** show the server's `displayName` everywhere (world labels, profiles, feeds). Remove client-side alias generation and ID tags; the server guarantees uniqueness and stability (`Fern_108` house, `Fern_1080` legacy, `CMYx...6Wec` token-linked).
3. **`ownerWallet`** is `string | null` (null for house agents) and deprecated; owner controls = `activatingWallet` (token_linked) or `legacyOwnerWallet` (legacy); house agents have no owner. Task receipts and reward records may also carry `ownerWallet: null`.
4. **Studio:** `POST /api/v1/agents` now returns `410 gone`. Use `POST /api/v1/agents/house` (demo only; body `{communityId, profession, strategy?}`, no name) and `POST /api/v1/agents/activate` (token launcher's wallet only; body `{communityId, profession, strategy?}`, no name or mint). Both need `Idempotency-Key`; keep the same key across uncertain retries.
5. **Activation status:** `GET /api/v1/me/activation` (session) returns `{activation, agent}` or nulls. Never infer token-linked status from holdings or `ownerWallet`.
6. **Errors to surface:** `not_token_launcher` (403), `wallet_already_activated` / `mint_already_activated` / `activation_in_progress` (409, `details` has the canonical `activationId`, `agentId`, `communityId`), `rate_limited` (429, previously 403), `gone` (410), and the 403 house-quota message.
7. **Fixtures:** `packages/shared/fixtures/*` were regenerated from a 0.3.0 demo runtime; offline/fixture mode can use them as-is.

## Integration sequence

1. **Codex:** branch from `codex/frontend`, merge `main` (conflict-free; do not rebase published commits), make the changes above as one-file commits, and run typecheck, lint, unit and browser tests against a local 0.3.0 backend (`apps/server` from `main`, a disposable `*_test` or fresh local database).
2. **Claude:** re-run backend checks on the same commit, review the frontend PR against this contract, then merge it into `main` with a normal merge once both sides pass.
3. **Before any staging change, the user approves** the staging plan: deploy 0.3.0 to `staging` (pre-deploy applies migration 003; existing agents become `legacy` per the read-only audit), then rebuild the staging frontend from the integrated commit. Postgres is kept, never reset.
4. Production stays untouched; see `infra/railway/staging-frontend.md` and the report on the production service.
