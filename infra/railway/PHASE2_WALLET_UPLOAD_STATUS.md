# Phase 2 — external Launchpad verification

Checkpoint: 18 October 2026. **Real staging Pinata image and metadata uploads are verified.**
Phantom desktop authentication is user-confirmed. The real-service browser audit uses
an automated Wallet Standard message signer; it is not a new actual Phantom test.
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

## Pinata — real image and metadata uploads verified

The user replaced the staging-specific backend JWT with V3 Resources → Files →
Write enabled and Admin disabled. Read-only Railway inspection confirmed the JWT
exists only in the backend; the frontend has no Pinata variable. No secret was
printed, written to evidence or placed in the bundle.

The credential-change API deployment `a80a8800-db74-433b-a682-7fad5679becb` succeeded
at `397f144`. The frontend deployment `a5d29502-f078-4059-bfb7-e812725c0418` succeeded
at `653fb01`. Both source main and have compatible contract 0.3.1. Staging API,
PostgreSQL readiness and demo simulation are healthy. Financial features and launch
execution remain disabled.

Using the existing staging Launchpad and an ephemeral automated message signer:

- Previewed the real public AECO logo, authenticated against the actual backend,
  and created a wallet-owned PostgreSQL draft.
- Logo and metadata preparation endpoints both returned HTTP 200, persisting actual
  Pinata receipts. Review Token reported ready for the preparation milestone only.
- Retrieved the image from the public gateway and compared decoded pixels with the
  selected file. Retrieved metadata JSON and verified name, symbol, description,
  image reference, showName and staging createdOn origin.
- Replayed both exact original requests with their idempotency keys: HTTP 200,
  unchanged draft version and identical saved CIDs.
- Invalid SVG content was rejected with HTTP 400 before pinning; an unauthenticated
  upload was rejected with HTTP 401.
- Refresh restored the session without signing again. Reopened the persisted draft
  and reviewed it without another logo or metadata POST.
- Verified real-data review at desktop 1440px, tablet 820px and mobile 390px, with
  screenshots and no horizontal page overflow.
- Deleted only the audit-owned draft and logged out. Public test assets remain
  pinned as evidence. No launch, payment or transaction submission request occurred.

Public evidence:

| Asset | Canonical IPFS URI |
|---|---|
| Image | `ipfs://bafkreibh5duu3ng6jzz7i34gs27lihh7jmiylklhqwdzjtad5v26nwmawi` |
| Metadata | `ipfs://bafkreigck6kpvc45g7cso5kirqjd6ogpfrv5vjpdlsboc5dgs3gr4rgro4` |

Metadata references the matching image at
https://gateway.pinata.cloud/ipfs/bafkreibh5duu3ng6jzz7i34gs27lihh7jmiylklhqwdzjtad5v26nwmawi.
Both artifacts were actually retrieved, not inferred from a successful receipt.

### Endpoint and permission check

Both image bytes and metadata JSON use the same `PinataPinning.pin` method:
POST `https://uploads.pinata.cloud/v3/files`, multipart `network=public`.
Metadata is an application/json file; this path does not call Legacy
`pinJSONToIPFS` or `pinFileToIPFS`. V3 `org:files:write` is sufficient for both
verified requests. No Admin or additional Legacy permission is required for this
flow. Public gateway retrieval does not use the JWT.

The previous key passed the Legacy authentication probe but V3 upload returned
HTTP 401. The replacement key resolved that failure. Current actual uploads succeed;
no account quota/plan restriction was observed for these controlled files. This is
not a promise about future quotas or service availability.

| Variable | Configuration |
|---|---|
| PINATA_JWT | Backend secret with V3 upload/write permission; no frontend/VITE_* copy. |
| IPFS_GATEWAY | Optional HTTPS public gateway origin; default https://gateway.pinata.cloud. |
| LOGO_MAX_BYTES | Optional, defaults to 5000000; supported maximum 5 MB. |
| LOGO_MAX_PIXELS | Optional, defaults to 16000000. |

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
initially remained at `bdeb505`; the later documentation-only release `397f144`
introduced no backend/shared-contract/schema changes.

## Tests and limits

- Real staging UI/API/PostgreSQL/Pinata/public-gateway browser audit: passed in
  1.4 minutes, including exact-byte retry, refresh/reopen and responsive review.
  An initial audit retry assertion failed because Chromium request-body capture
  changed binary bytes; replaying the original selected file passed. No application
  change or retry-policy relaxation was needed.

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
