# Phase 2 — external Launchpad verification

Checkpoint: 18 October 2026. **The real-service milestone is not complete.**
Phantom desktop authentication is user-confirmed. Real Pinata uploads remain blocked
by HTTP 401 from the provider upload endpoint; no image or metadata CID is claimed.
No city appearance work is included.

## Existing systems retained and current release baseline

The audit started with frontend `355a978` and backend `dab1484`, both successful
Railway staging deployments sourced from main. The backend contract is 0.3.1.
The earlier migration-003 integration gate was subsequently completed in Task 1;
its previous pending status in this document was historical, not the current gate.
No backend/shared-contract/migration files differ between those releases.

Existing authentication, wallet adapters, owned draft CRUD, upload validation,
Pinata transport, metadata preparation and review orchestration were reused.
Review still automatically saves details, uploads the selected image and prepares
metadata; users do not need separate upload/generate buttons.

This change exposes the backend-saved image and metadata IPFS references and
preparation-check result inside an expandable **Verified token assets** section in
Review Token. Trading-pair text uses the saved draft's quote asset. It does not
create another upload system, activate another quote, or enable transactions.

## Verified against the actual staging API

Using two ephemeral automated Ed25519 signers, **not Phantom**:

- Exact staging-origin challenge domain and URI; server signature verification.
- Unknown browser origin rejected; credentialed CORS preflight matches staging.
- Secure, HttpOnly, host-only, SameSite=Strict cookie; no session token in JSON.
- Session restoration, single-use challenge replay rejection, logout revocation.
- PostgreSQL-backed capabilities; draft creation replay is idempotent.
- A second wallet cannot read, edit or delete the first wallet's draft.
- Optimistic-version conflicts and unsupported USDC draft requests are rejected.
- Review reports incomplete assets, disabled execution and a planned 0.05 SOL fee.
- Saved/edited draft survives logout, new authentication and independent reads.

Only the audit-owned temporary draft was deleted, and both sessions were logged
out. This verifies API persistence across sessions; no database restart or migration
was performed. Intermittent connection/DNS timeouts interrupted earlier probes;
the completed pooled HTTP-client audit passed all checks.

## Real Phantom — evidence boundary

The user confirmed real Phantom desktop authentication succeeded. This checkpoint
independently verified the staging authentication API with automated message signers,
not an actual extension approval. Real Phantom mobile, wallet switching, rejection
and physical-device gestures remain separate manual checks. No private key or
recovery phrase is requested. Authenticated sessions restore without signing again
in the automated checks.

The configured AUTH_DOMAIN, AUTH_URI and CORS allowlist match staging.useaeco.xyz.
Mobile external-wallet handoff is not implemented; the current mobile path requires
a compatible injected/Wallet Standard provider in the wallet's in-app browser.

## Pinata — credential present, upload authorization blocked

Read-only Railway configuration inspection confirmed a nonempty PINATA_JWT in the
staging backend and no Pinata variable in the frontend. Secret values were neither
printed nor written to evidence. Staging backend deployment
`dd073642-bbec-479e-807c-19adef7cef96` succeeded at `bdeb505`; health reports demo,
PostgreSQL and contract 0.3.1, with financial features and launch execution disabled.

Actual external checks, not mocks:

- Pinata GET `https://api.pinata.cloud/data/testAuthentication`: HTTP 200.
- POST `https://uploads.pinata.cloud/v3/files`, using the configured credential,
  multipart public network and public AECO logo: HTTP 401. No CID was returned.
- Existing staging UI authenticated an ephemeral automated Wallet Standard signer,
  previewed that logo and created its owned PostgreSQL draft (HTTP 200).
- The backend logo endpoint returned sanitized HTTP 503 for the provider failure;
  Review Token did not report readiness or fabricate assets.
- Only each audit-owned test draft was deleted and its session logged out. No
  token-launch, payment, transaction-signing or submission request was made.

The successful authentication probe establishes connectivity and credential
recognition for that endpoint; it does not establish upload authorization. HTTP 401
from the v3 upload endpoint needs key-permission/account investigation. Pinata's
current endpoint requires `org:files:write`. JWT payload scope guesses are not
accepted as authoritative permission evidence.

In Pinata API Keys, create a staging-specific key with Files upload/write permission
for the v3 endpoint. Replace its JWT directly in Railway staging backend Variables
and deploy the variable change. Do not paste the secret in chat or add frontend
variables. If that exact permission already exists, investigate account access with
Pinata rather than assuming a successful upload or silently changing providers.

| Variable | Configuration |
|---|---|
| PINATA_JWT | Backend secret with upload/write permission. No frontend/VITE_* copy. |
| IPFS_GATEWAY | Optional HTTPS public gateway origin; default https://gateway.pinata.cloud. |
| LOGO_MAX_BYTES | Optional, defaults to 5000000; supported maximum 5 MB. |
| LOGO_MAX_PIXELS | Optional, defaults to 16000000. |

After replacement, retry the existing authenticated UI flow and verify both returned
CIDs by retrieving the actual bytes/JSON, checking artwork identity and metadata
references, then refresh/reopen/review the saved draft. Actual image upload, metadata
pinning, gateway retrieval and review using real Pinata data are **not yet verified**.
Provider-backed duplicate/retry checks also remain pending; mocked retry checks pass.

Official references: [API keys](https://docs.pinata.cloud/account-management/api-keys)
and [upload endpoint / scope](https://docs.pinata.cloud/api-reference/endpoint/upload-a-file).

## Readiness fix deployed during the audit

A real UI attempt exposed Review Token becoming available before authenticated
capabilities finished loading. The button now waits for that response, while the
anonymous Connect wallet action remains usable. There is no fixed delay or new
upload system. Regression coverage deliberately holds the capabilities response and
checks that no draft/upload mutation starts early.

One-file commits: `8b99eeb` (component), `653fb01` (browser regression). Staging web
deployment `a5d29502-f078-4059-bfb7-e812725c0418` succeeded at `653fb01`. The backend
remained at `bdeb505`; no backend/shared-contract/schema changes were required.

## Tests and limits

- Backend auth/draft/Pinata transport: 32 tests passed. Pinata responses mocked.
- Existing market, creator-fee and launch-execution guards: 29 tests passed; provider
  and transaction fixtures do not establish real market/fee/launch activity.
- Frontend wallet/media/preparation: 22 tests passed.
- Isolated Launchpad browser suite: all 6 cases passed using automated wallets and
  mocked Pinata, including 1440/390/820/1024px layouts, refresh/reopen, image preview,
  IPFS references, failure/retry, rejected signatures and account changes while signing.
- A cold software-rendered desktop run exceeded its UI-readiness timeout; the final
  complete suite passed with native GPU and DPR 0.5. No physical-phone test is claimed.
- Workspace typecheck, lint, backend build and frontend production build passed.

## Remaining protocol, market and accounting evidence

SOL is the sole draft quote. USDC is planned; AECO is future. The separate planned
0.05 SOL launch charge goes to Platform Treasury; preparation does not collect it.

Public-network Pump.fun launch execution must be checked only after actual wallet
and Pinata prerequisites. Existing isolated local-chain tests are not evidence of
an actual public Pump.fun launch. Do not fall back to mainnet if public testing
support is absent. Mainnet signing, submission and financial routing remain disabled.

Market code validates launch provenance and supported pool accounts before using
DexScreener SOL/USDC metrics and optional GeckoTerminal history. Demo/test launches
are explicitly unavailable to those public providers. Holder count, graduation
percentage and unsupported fields remain null; fetch timestamps are not proof of
the provider's last trade time. No live token market statistics were verified here.

Creator-fee parsing/accounting tests cover eligible instruction/event evidence,
SOL/USDC denominations, 60% Agent Rewards / 40% Platform allocations, retained dust,
idempotency and separation from launch charges. Protocol/LP fees are not assumed to
belong to the platform. Real fee collection, reconciliation against an actual chain
receipt, and payouts remain unverified; no signing or disbursement was enabled.

## Next safe-network Solana launch verification task — prepared, not started

Start only after the real wallet/artwork/metadata milestone is verified:

1. Inspect the existing launch execution guards and pinned Pump program/IDL/SDK.
   Establish current official public devnet support using primary sources and
   read-only RPC checks of the expected genesis, executable program, global accounts,
   supported instructions and fee-sharing configuration. Do not infer support from
   an isolated local clone or fall back to mainnet.
2. If public testing support is absent or incompatible, report the exact gap; retain
   disabled execution. An explicitly isolated local-validator rehearsal may validate
   builder behavior, but must be labeled local, not public Pump.fun verification.
3. Propose an isolated non-production test configuration and test-only wallets,
   treasury addresses, RPC and spend limits for review before changing execution
   flags. Keep existing demo staging operational; no production changes, real
   treasury signing, payments or database migrations are included in this task.
4. Once separately authorized for a supported safe network, reuse an owned verified
   draft. Inspect the decoded transaction and simulate it before any signature:
   SOL quote only, exact approved programs/accounts, atomic planned launch charge,
   authorized creator-fee recipients and no unexpected instructions.
5. Test actual wallet rejection, expired blockhash, RPC failure, duplicate prepare/
   confirm, ownership and version conflicts. Verify any authorized test submission
   against finalized on-chain mint/provenance evidence and verify Explore labels.
   Separate provider mocks, local-chain results and public-network results.

Current milestone does not enable that task or Phase 3. MODE=demo,
FEE_ROUTING_VERIFIED=false and PUMP_LAUNCH_ENABLED=false/default-disabled remain
in effect; no mainnet launch or disbursement has been performed.
