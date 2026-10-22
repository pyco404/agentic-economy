# Production readiness acceptance — 22 October 2026

Website deployment and the owner's future $AECO transaction are separate. Production is the only permanent Railway environment. This acceptance introduces no new environment, wizard, schema migration, financial activation or wallet funding requirement.

## Completed infrastructure and signing checks

- **Actual production backup restoration:** fresh private PostgreSQL custom archive, SHA-256 `a3a4bc0caf3b18886d593284bf2b2c2835242d21865a41168ca8cfe9a4762459`. Both saved drafts, approved migrations 001–004, business fingerprints and constraints match the source and survive restart in a fresh PostgreSQL 18.6 local database with TCP disabled. No live restore or migration. [Evidence](evidence/production-backup-restoration-2026-10-22.json). The archive is outside the active worktree, Git-ignored and 0600; this does not establish scheduled/offsite backup coverage.
- **Persistent recovery:** a separate explicitly synthetic fixture in the restored copy preserves renewed review/history and exactly one signed-payload receipt across another restart. Stale compare-and-swap writes and duplicate changed receipts are rejected. [Evidence](evidence/mint-review-persistence-2026-10-22.json). Production has no confirmed launch/treasury rows, so these nonempty recovery checks are not represented as real Mainnet launch records.
- **Vanity-mint expiry:** explicit renewal preserves the original attempt and mint; it requires finalized expiry, matching genesis, absent mint, empty transaction history and no saved signed payload. Concurrent renewals collapse to one durable successor. Any uncertainty blocks renewal. Immutable initial local reservation plus append-only predecessor journal prevents stale/forked signatures and automatic mint replacement.
- **Signing handoff:** existing Create Coin review downloads only a public artifact. Owner-operated local CLI verifies the approved hash and fixed public policy before reading a private file outside Git; only the public mint signature returns to the website. Phantom separately signs the unchanged message. Renewal requires explicit new-hash and predecessor approval; old signatures cannot be reused. The official private key was never accessed and no official signature was generated. [Exact workflow](AECO_LOCAL_MINT_SIGNING.md).
- **Preparation versus execution:** only the authenticated official deployer and operator-bound draft may obtain the official unsigned review while financial gates remain off. No live binding was installed during infrastructure work. Signature import, wallet approval, submit and resume retain independent financial/network/access checks. Ordinary wallets remain blocked server-side.
- **Developer Buy:** default 0%, user-selected 0–3.5% inclusive in 0.01% increments, exact integer quote/allocation/cap validation. The vanity mint does not preselect or restrict the percentage. Preserve one atomic creation/purchase and separate 0.05 SOL platform charge, plus eligible creator fees 60% Rewards / 40% Platform.
- **Live read-only protocol check:** planned official mint remains unused; all four reviewed program identities match; existing 42-entry lookup table remains active and frozen. Platform/Rewards are static transaction accounts rather than table entries. No wallet balance query or transaction. [Evidence](evidence/mainnet-program-readiness-2026-10-22.json).

## Security scope and residual maintenance

Automated/source review covers cryptographic session ownership, origin/CSRF and replay checks, public-artifact validation, exact-message/signers/treasury checks, mint uniqueness, compare-and-swap, persisted pre-broadcast receipts, idempotent recovery, disabled financial gates and secret isolation. This is not an independent third-party audit or a real Mainnet launch acceptance.

The read-only production dependency audit reports **6 high / 4 moderate advisories**, involving four transitive packages. The current bundle has no stream-json; bigint native bindings are disabled/absent and fall back to JavaScript; affected UUID functions and Anchor TOML workspace parsing have no application input path. No demonstrated exposed affected function was found, but the raw audit is not clean and these warnings remain tracked. No broad SDK/dependency upgrade was slipped into this release. Reassess before financial activation or dependency/build changes. [Detailed assessment and advisory links](evidence/production-dependency-review-2026-10-22.json).

Pinata uploads were previously verified; credential rotation remains pending maintenance without requiring a subscription upgrade. The verified Helius replacement remains backend-only. Production auto-deploy triggers stay absent; explicit tested-commit deployments and prior release IDs provide rollback. Staging/public-demo remain preserved, their automatic builds disabled, with no deletion authorization or assumed legacy backup coverage.

## Verification and release

- Backend full suite: **291 passed, 23 skipped**. After the final renewal race check, the affected execution suite: **37 passed**. Skipped database-specific suites are not claimed as passes; the separate real PostgreSQL restoration/recovery fixture above supplies actual persistence evidence.
- Frontend: **252 passed**; shared contracts: **34 passed**.
- Production builds, typecheck, lint and whitespace checks passed.
- Local browser normal mint flow passed at full resolution; the reserved-mint handoff passed after correcting its test to expand Technical details before checking status (lower framebuffer cost, same CSS viewport). Both use mocked RPC/media with real disposable cryptographic signatures, not real Phantom or Mainnet broadcasts. Renewal while execution is locked, local artifact checks, rejection, refresh, interrupted submission/recovery and final Explore navigation pass.
- Actual public-domain verification and deployed SHA are appended below after the pinned release.

## Remaining launch-time gates

The owner personally connects the official deployer, enters metadata/artwork, chooses Developer Buy and reviews costs in the existing website. Bind only that selected wallet-owned draft to the reserved mint, refresh actual network/program/lookup checks and simulation, then obtain explicit approval of the exact transaction/debit before enabling execution. Check/fund the wallet only at that owner-initiated stage. No separate Mainnet test token is required. No transaction is scheduled or automatically submitted by a website release.

The official $AECO launch/finalization, actual mint/metadata/fees/Explore verification and subsequent verified-holder Common Agent indexing remain future acceptance. Public launching requires another explicit approval and never unlocks automatically. Physical mobile on-chain acceptance remains DEFERRED. Phase 2 is not fully accepted and Phase 3 has not begun.


## Actual production release and public verification

Both application services are **SUCCESS** at **`384d54ab093217586a1b95618c54cd0ba96ba912`** (22 October 2026). Thirty granular single-file Conventional Commits were pushed directly to main; production auto-deploy triggers remain absent. Each service received one explicit pinned deployment; a transient preflight API failure occurred before any mutation and did not create a duplicate deployment.

| Service | Deployment | Result |
| --- | --- | --- |
| Production API (`c2b39851-a41b-4eab-9223-d2f6394b007f`) | `dbf421f8-91a7-4684-bd74-d85251aaefda` | SUCCESS at the release SHA |
| Production frontend (`b14eb48d-b9b6-4b25-990c-9229d378c2a2`) | `c4821c80-74fe-40d4-8d2e-6e5a0fffa781` | SUCCESS at the release SHA |
| Isolated production PostgreSQL | Existing `691c3d26-ab6d-43d4-b8f3-86fef0a05a17` | Unchanged, healthy `aeco_production`; no pending migration |

https://useaeco.xyz serves `/assets/index-CIL1WArZ.js`, SHA-256 `feacbd8791466ddc0f0f527f168eb5e463500cd1d24a0deded37ad8c995c8c38`, containing the new renewal/locked-review UI. Root/www/API TLS certificates validate through 20 January 2027. www returns 308 to the apex while preserving path/query. All nine public direct routes return HTML200; missing asset/API paths stay404. All nine rendered routes omit public debug labels.

Fresh actual-domain browser checks use no route overrides and only a disposable authentication-message signer: correct production challenge origin, secure host-only HttpOnly Strict cookie and session refresh200; Back/Forward retains the exact world canvas; native WebSocket receives32frames using only the official API origin; zero page errors; zero registered service workers/cache entries. Desktop1440, tablet820, mobile390, folded344 and unfolded690 viewports show no horizontal overflow. Screenshots were inspected and preserved in ignored `apps/web/artifacts/production-readiness-20261022/`. This is automated browser verification, not a new physical Phantom test.

Authenticated ordinary-wallet probes return403 before legacy preparation, owned launch/media preparation, mint-review renewal, signature import, submit and resume. New API capabilities report `launchEnabled=false` and `preparationEnabled=false`; no live operator draft binding was installed. Production Mainnet financial flags remainfalse, live AECO discovery/mint remainunset, official treasuries are unchanged, and no transaction was broadcast. Helius Mainnet and Devnet genesis checks returnHTTP200; running backend provider values match configured values and neither key appears in frontend variables/served entry assets. Pinata credential rotation is still pending.

Staging/public-demo deployment IDs are unchanged from the pre-release snapshot. No legacy resources, database data, volumes, provider secrets or DNS records were deleted or changed. Rollback preserves API `5fa0507167695df96d57cecd332a45e9422209b2` / deployment `4a7f0533-98db-4e93-a47d-f0bcad9b237d`, and frontend `16e4bea3a4c55c8764b58e712a3bbc9526255cf8` / deployment `18f11a0e-cf24-4469-be7e-aa564df8e042`; rollback would be an explicit pinned code deployment with financial gates unchanged.

[Sanitized release/browser/API/schema/provider/TLS evidence](evidence/production-readiness-release-2026-10-22.json). Application deployment is complete; following documentation-only commits do not require another build.

**Readiness conclusion:** restoration, expiry/recovery implementation, regression checks and the production website release are complete. The secure owner-operated vanity-mint handoff is implemented/tested; its official private key remains untouched. Remaining launch-time gates are binding the owner's selected draft, refreshed exact transaction/cost review and explicit financial activation/transaction approval. Security remains qualified by the documented transitive-dependency advisories and lack of independent audit, rather than an unconditional Mainnet clearance. Local backup restoration does not establish scheduled/offsite coverage. Pinata rotation remains maintenance; physical mobile on-chain acceptance remains deferred. Neither launch nor Phase2 completion is claimed.
