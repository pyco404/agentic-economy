# Phase 2 wallet, logo and token draft verification

Status: implementation audited and local mocked verification performed on 18 October 2026. **Not complete on staging.** The Task 1 migration/backup gate remains open; real Phantom approval and real Pinata upload have not been verified.

## Existing implementation retained

- `apps/server/src/services/auth.ts`: server-generated expiring, single-use challenges; exact allowlisted browser origin including port; Ed25519 verification; hashed opaque sessions. Demo is not emitted as a Solana chain identifier.
- `apps/server/src/http/launchpad.ts`: authenticated cookie sessions, owner-derived draft CRUD, version conflicts, request idempotency, mutation rate limits and bounded concurrent uploads. HTTPS cookies are HttpOnly/Secure/SameSite=Strict; browser responses do not expose session tokens.
- `apps/server/src/services/launchpad.ts`: signature sniffing plus actual PNG/JPEG/WebP decode/re-encode, pixel/byte limits, server-only Pinata public uploads, metadata preparation, persisted asset references and review. Edits invalidate old metadata.
- `apps/web/src/api/walletSession.tsx`: Wallet Standard and injected Phantom/Solflare/Backpack message signing. A pending approval now also observes account changes/disconnects, preventing authentication of a stale account.
- Existing LaunchWorkspace/prepareLaunchDraft orchestrate save → logo → metadata → review through **Review token**. Anonymous visitors see the form and **Connect wallet**. Technical draft management remains optional. Upload progress/cancellation and retry keep completed stages and idempotency keys.

No duplicate wallet adapter, upload service or draft store was introduced. No launch, payment, fee collection or treasury-signing call is added.

## Pinata configuration blocker and secure setup

The staging API variable audit found **no nonempty `PINATA_JWT`**. Capabilities therefore report `uploads: false`. A JWT's presence alone does not prove it is valid, scoped correctly, within quota or capable of uploading.

Use the existing Pinata account's API Keys page to create or select a staging-specific key scoped to the public Files upload endpoint. Do not grant administrative access unnecessarily. Confirm public/IPFS uploads are enabled for the account. Pinata documents scoped keys at <https://docs.pinata.cloud/account-management/api-keys> and public upload behavior at <https://github.com/PinataCloud/pinata/blob/main/ai-instructions>.

**After the migration safety gate is cleared**, configure Railway project `agentic-economy`, environment **staging**, service **API** → Variables, using Railway's secret-entry UI:

| Variable | Value / purpose |
| --- | --- |
| `PINATA_JWT` | Secret JWT from the existing account; required for image and metadata pinning. Never put the value in chat, source, shell arguments or logs. |
| `IPFS_GATEWAY` | Optional HTTPS gateway origin; default `https://gateway.pinata.cloud`. A dedicated Pinata gateway may be used if it allows public retrieval without exposing a token. |
| `LOGO_MAX_BYTES` | Optional; default `5000000`, maximum supported 5 MB. |
| `LOGO_MAX_PIXELS` | Optional; default `16000000`, maximum configurable `32000000`. |

Keep `MODE=demo` and `FEE_ROUTING_VERIFIED=false`. Do not add Pinata credentials to the frontend service or any `VITE_*` variable. API key/secret pairs are not read by this implementation; it requires the JWT. Saving/applying variables can trigger a Railway deployment: do not apply or redeploy while migration 003's prerequisites are unsatisfied.

Public images and metadata are publicly retrievable; upload only intended token branding. Browser requests go to the authenticated API, which re-encodes images and calls `https://uploads.pinata.cloud/v3/files` with `network=public`. Confirm actual returned CIDs and retrieve the resulting image and JSON before calling a real upload verified.

## Metadata and quote assets

Metadata includes name, symbol, description, verified image HTTPS gateway URL, showName, actual configured site origin, and optional website/twitter/telegram links. Canonical image and metadata `ipfs://` URIs remain in the owned draft. The HTTPS image follows the current [Pump.fun metadata recommendation](https://github.com/pump-fun/pump-fun-skills/blob/main/create-coin/references/METADATA.md). This is schema/preparation compatibility, not evidence of a successful protocol launch or transaction.

SOL remains the draft default. USDC remains planned pending protocol verification; AECO remains future. Review displays a planned 0.05 SOL charge and `launchEnabled=false`. Preparing a token does not launch it or charge anything.

## Staging release gate

Current staging remains the compatible recovered 0.2 frontend/API pair described in `MAIN_TRANSITION.md`. Main contains the 0.3 identity contract and migration 003. Migration 004 already exists on staging because its deployed source tree contained 001, 002 and 004, without 003.

A read-only recheck found **zero Railway staging PostgreSQL backups** and **zero production deployment triggers**. No current restorable backup has been verified; migration 003 has not been rehearsed on an isolated staging copy or applied. No new migration is requested by these code changes.

Do not switch staging sources to main or redeploy the main API until a current backup is established and verified, an isolated copy is restored, identities/activation uniqueness and preserved records are audited, and approved 003 succeeds in rehearsal. Backend pre-deploy/startup runs pending migrations automatically. Preserve the working staging deployments until this gate passes. Production remains unchanged.

## Verification classification

- **Real Phantom:** not verified. Automated signers exercise injected-provider and Wallet Standard paths with actual Ed25519 signatures, but are not the Phantom extension. Physical Chrome/Brave extension approval and Phantom mobile in-app approval require separate actual-wallet checks. External mobile-wallet universal-link handoff is not implemented; the supported current mobile path is a wallet in-app browser exposing a compatible provider.
- **Real Pinata:** blocked by absent staging JWT. No actual image or metadata was pinned in this audit; credential scope, account quota and real gateway retrieval remain unverified.
- **Mocked:** full preparation flow with real backend auth/ownership handlers, in-memory persistence and a mocked Pinata transport; desktop/mobile/tablet widths; refresh/reopen/edit, failure/retry, unavailable uploads, rejected signatures and wallet change during pending approval. Unit tests exercise malformed receipts, timeout/provider failures, server-only Authorization, public network selection and genuine image decoding.
- **Database persistence:** PostgreSQL migration/restart/concurrency suites are not rerun against staging or a database in this task. Local browser refresh tests verify the existing isolated memory API persists across browser reload; they do not prove database restart durability.

After the release gate passes and the secret is securely configured, verify API/DB/WebSocket health and exact release SHAs, approve a real Phantom challenge, create a uniquely named test draft, upload a non-sensitive logo, fetch both real CIDs, edit/regenerate metadata, refresh/reopen, test a second wallet cannot access it, and delete only the owned test draft through the API. Verify disconnect/expiry/reconnect, desktop and mobile in-app flows. Report each real result separately; keep all financial execution disabled.

## Test results for this change

- Workspace unit/integration suite: **295 passed, 18 skipped** (database-dependent suites; no database credentials or migration approval were supplied).
- Launch workspace Chromium browser tests: **6 passed**, widths 390, 820, 1024 and 1440; injected/Wallet Standard test signers and mocked Pinata.
- Actual staging Chromium smoke: **2 passed**, desktop 1440 and mobile 390; actual API challenge verification, cookie session/logout, world and WebSocket traffic. Wallet signer is automated, not real Phantom; no upload is claimed.
- Workspace typecheck, root lint, web lint, backend/packages build, web production build and generated contract check: passed. Vite retains existing large-bundle and dependency annotation warnings.
- Unrelated preserved source files in the original workspace were checked against their recorded hashes and left intact.

These results do not satisfy real-wallet/real-Pinata acceptance or the blocked staging-main release prerequisite.
