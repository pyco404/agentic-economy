# Phase 2 — external Launchpad verification

Checkpoint: 18 October 2026. **The real-service milestone is not complete.**
Actual Phantom approvals and actual Pinata image/metadata uploads remain unverified.
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

## Real Phantom — manual approval required

Open <https://staging.useaeco.xyz/#launchpad> in Chrome/Brave with the actual Phantom
extension, connect and approve only the domain-matched authentication message,
then refresh to check restoration. Connection and signature rejection, disconnect,
wallet switching and supported Phantom mobile in-app browsing still require real
wallet interaction. Automated signers and responsive viewport tests do not establish
Phantom compatibility. Never share recovery phrases, private keys or session cookies.

The configured AUTH_DOMAIN, AUTH_URI and CORS allowlist match staging.useaeco.xyz.
Mobile external-wallet handoff is not implemented; the current mobile path requires
a compatible injected/Wallet Standard provider in the wallet's in-app browser.

## Pinata — confirmed missing credential

The staging backend has no nonempty PINATA_JWT and reports uploads=false. No real
image or metadata CID was obtained in this checkpoint. Credential presence alone
will not prove authorization, account quota or gateway retrieval.

In the existing Pinata account, API Keys → New Key: create a staging-specific key,
leave Admin disabled, and grant Files upload/write (`org:files:write`). Copy its JWT
directly into Railway → agentic-economy → staging → backend API → Variables:

| Variable | Configuration |
|---|---|
| PINATA_JWT | Required server-side secret; never put the value in chat, logs, source or VITE_* variables. |
| IPFS_GATEWAY | Optional HTTPS public gateway origin; default https://gateway.pinata.cloud. |
| LOGO_MAX_BYTES | Optional, defaults to 5000000; supported maximum 5 MB. |
| LOGO_MAX_PIXELS | Optional, defaults to 16000000. |

The existing service calls https://uploads.pinata.cloud/v3/files with network=public
for both validated images and metadata JSON. Upload-only permission is sufficient
for this path; public gateway retrieval must not require a frontend secret.
Keep MODE=demo, FEE_ROUTING_VERIFIED=false and launch execution disabled.
Do not apply any additional migration when configuring the variable.

Official references: [API keys](https://docs.pinata.cloud/account-management/api-keys)
and [upload endpoint / scope](https://docs.pinata.cloud/api-reference/endpoint/upload-a-file).
After configuration, use the existing UI to prepare controlled, non-sensitive token
branding, retrieve the actual image and metadata through the gateway, validate their
contents, refresh/reopen the wallet-owned draft and review the saved information.
Do not label mocked receipts as real Pinata evidence.

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
