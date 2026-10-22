# Phase 2 acceptance status — 22 October 2026

This is the current checklist; earlier dated reports remain historical evidence. Phase 2 is not yet closed. Do not start Phase 3.

| Milestone | Status |
| --- | --- |
| Real SOL creator-fee distribution | **VERIFIED ON PUBLIC DEVNET** — 15,532 lamports Agent Rewards, 10,354 Platform, 1 retained dust; funding excluded from income |
| Desktop Phantom Developer Buy | **COMPLETED** — ZAP 2%, 20,000,000 tokens; controlled 3%/3.5% tests separately verified |
| Physical Phantom mobile | **AUTHENTICATION VERIFIED; ON-CHAIN DEFERRED** — seven physical connection/authentication/layout/refresh checks plus phone-image preview passed; owner paused further launches |
| Helius replacement | **ACTIVE AND VERIFIED** in the running staging backend |
| Pinata image and metadata uploads | **VERIFIED** on staging; credential rotation remains pending maintenance |
| Application staging release | **DEPLOYED AND VERIFIED:** backend/frontend **6758f91**, contract 0.5.2; actual HTTPS, API/database, WSS, clean routes, persistent world and responsive browser checks pass; financial execution off |

## Historical restricted mobile preparation — stopped

Nominated dedicated Devnet wallet: `Aziw8URxK23irkF6VZQrq28HoyyMagxA66jpotBPiiYe`.

The temporary HTTPS tunnel is operator-owned and forwards only to the invitation gateway on loopback 5190, which forwards API requests to the isolated Devnet backend on loopback 8797. Exact HTTPS host/origin, invitation cookie and backend gateway secret are enforced; other wallets are rejected. Invitation sessions expire after 30 minutes. Access codes and provider credentials are never committed.

Verified externally: anonymous HTTPS returns 401; invitation grants access; health/readiness return 200; the nominated wallet receives a challenge with the exact HTTPS domain/URI and Devnet chain; another wallet and direct API access without the gateway secret return 403. The API reports uploads available and launchEnabled=false. Broadcasting remains blocked pending a separate transaction approval. No mobile transaction has been submitted.

The fixed RPC is public Devnet with genesis verification; Mainnet submission is rejected by the chain adapter. Test treasury recipients are Platform `GcQFWipjZvpuk2sdJAZ4BwyTMdWTDmfjxWSdw4bTVzvp` and Agent Rewards `D8p7CytykA5Q7vSDGGoCJC6mNyLKXVwiEXLboih2ZHJs`. Active test lookup table: `3fzk4ecq4NZ6XtVyayTBo2cYJTcMJMgNYr4cAFcgYLrn`.

Normal development, Railway staging and public demo restrictions are unchanged. No production changes, additional migrations or Mainnet operations are authorized.

## Remaining gates

- Physical mobile **on-chain acceptance DEFERRED**; authentication, refresh, image preview and folded/unfolded layouts are completed. Do not request repeat tests.
- **COMPLETED:** existing Railway releases finished; actual SHAs, website/API/database/WebSocket and demo restrictions verified.
- Pinata credential rotation maintenance, without requiring a subscription upgrade.
- Final security/recovery/regression and staging acceptance. Public post-graduation creator-fee coverage remains distinct from completed pre-graduation collection and local supported-path tests.

Evidence: [desktop Phantom](../apps/server/docs/phantom-desktop-developer-buy-2026-10-22.md), [creator-fee and security review](../apps/server/docs/phase2-review-2026-10-22.md), [Helius activation](security/HELIUS_ROTATION.md), [Pinata evidence](../apps/server/docs/evidence/pinata-staging-2026-10-22.json), [physical mobile procedure](../apps/server/docs/phantom-mobile-acceptance.md).

## Historical mobile proposal — approval subsequently revoked by owner pause

Read-only unsigned simulation at Devnet quote slot 513848789 succeeded for proposed `Fold6 Mobile Test` (`FOLD6`), TOKEN/SOL, 2% Developer Buy: exactly 20,000,000 tokens (6 decimals). The wallet held 10,000,000,000 lamports. An ephemeral mint was used only for simulation; it was not created on-chain and no launch record or wallet signature was generated.

| Component | Devnet SOL |
| --- | --- |
| Separate platform launch charge | 0.050000000 |
| Network fee estimate | 0.000010000 |
| Account rent estimate | 0.015082520 |
| Developer Buy, including protocol/creator fees | 0.005769233 |
| Developer Buy maximum | 0.005826926 |
| Estimated complete debit | 0.070861753 |
| Complete debit with buy ceiling | 0.070919446 |

Developer Buy includes 71,227 lamports in protocol/creator fees combined; they are not added a second time. Quote price impact is 383 basis points. Simulation reused an existing verified test metadata URI only to estimate costs, not as this proposed coin's final metadata. Final artwork/name/metadata, live configuration and network fees must be revalidated before the owner approves an actual launch. No exact final charge is promised before that review. Creation, optional buy and the single platform transfer remain one atomic transaction. The separate fee-sharing policy is 60/40; this launch does not independently authorize a creator-fee collection transaction.

The owner replaced the previously nominated mobile account. The replacement wallet is valid, has 10 Devnet SOL at the read-only check, and receives the exact-origin Devnet challenge; the superseded wallet returns 403. This proves server restrictions, not a physical-phone connection. Device-side Phantom acceptance remains pending. Gateway and wallet-policy regression tests passed (1 Node test and 2 Vitest tests).

## Mobile invitation correction — 22 October

The owner's physical Phantom browser reported `Invalid verification origin` at the invitation gate, before wallet authentication. Reproduced through actual Chrome HTTPS form navigation: the gate's `Referrer-Policy: no-referrer` serialized the POST Origin as `null`. Earlier HTTP-client checks explicitly supplied Origin, so they did not exercise browser serialization.

Changed only the gate response policy to `same-origin`, preserving its strict exact-Origin check and withholding cross-site referrers. Missing/null, HTTP downgrade and lookalike origins still return 403. No CORS wildcard, forwarded-host trust, signature rule or nonce/replay behavior changed. Proxy-forwarded host/protocol headers remain stripped; authentication uses the fixed configured public HTTPS origin.

A native browser-form regression passes at 344×882 and 690×829. The corrected live tunnel returns 401 anonymously, accepts its fresh invitation, and a real browser request receives a 200 challenge for the replacement wallet with the exact public HTTPS URI and Devnet chain. The superseded wallet returns 403, launchEnabled remains false, and no wallet signature or transaction was requested by automation. Physical Phantom sign-in remains pending the owner's retry. The tunnel is still operator-controlled; the invitation was renewed for 30 minutes and the old code/session invalidated.

Underlying browser behavior: [Fetch Standard — append request Origin header](https://fetch.spec.whatwg.org/#append-a-request-origin-header).

## Physical mobile results received

All seven owner-reported physical checks passed on the Samsung Galaxy Z Fold6, plus local phone-image selection/preview. [Physical acceptance and screenshot record](evidence/phantom-fold6-physical-2026-10-22.md). This completes mobile authentication/layout acceptance, not mobile token creation or Developer Buy. Keep broadcasting blocked pending the specific FOLD6 transaction approval.

## Owner pause — 22 October 2026

Remaining physical mobile on-chain acceptance is **DEFERRED**, neither failed nor complete. All seven physical connection/authentication/layout/session checks and phone-image preview remain completed. No further mobile test requests, invitation codes, signing requests, retries or transaction submissions are authorized. Resume only after the official website is ready and the owner separately authorizes a fresh isolated Devnet configuration.

The dedicated mobile API (8797), gateway (5190) and associated ngrok tunnel were stopped. The prior approval journal is revoked while its history is preserved. MobileCoin and FOLD6 drafts remain unchanged with no uploaded image/metadata, saved launch, prepared mint or signed submission. [Read-only Devnet reconciliation](evidence/phantom-fold6-pause-reconciliation-2026-10-22.json) shows 10 Devnet SOL and no new wallet transaction after earlier funding; no FOLD6 charge was found. The exact browser timeout cause is not established and no retry was performed.

Current priority: public website readiness and an isolated production release with Mainnet execution gated. The separate public-demo is a review environment, never the production launch database. Phase 2 is not fully accepted; do not start Phase 3 or enable Mainnet financial execution.

## Gamine integration and Mainnet preparation — 22 October

[Actual-code comparison and release gates](GAMINE_LAUNCHPAD_INTEGRATION.md). Gamine was inspected read-only, including a finalized historical Mainnet creation. Its frozen public lookup table works with Agentic Economy’s existing SDK, official treasuries, 0.05 SOL charge and locked 60/40 sharing in unsigned Mainnet simulations at 0%, 2% and 3.5% Developer Buy. These are simulations, not Agentic Economy Mainnet launches.

A separate default-false `MAINNET_LAUNCH_APPROVED` gate, live genesis/program deployment checks and Mainnet wallet/recovery bindings are implemented. Neither Railway execution configuration nor treasury custody changed. Mainnet public launching remains Phase 2 scope, pending production readiness and separate activation approval. Public-demo frontend/backend have now completed their existing queued deployments at a2e1847; approved schema 001–004 and health are verified. The owner subsequently approved a fresh production database: aeco_production is provisioned, verified initially empty, and migrated through 004 with exact checksum verification. Production API/frontend deployment and provider-key reuse need direct approval after automatic review rejected them as outside the database-only scope. Real-domain routing/HTTPS, production credentials/restore verification and final release acceptance remain open.

The owner explicitly approved replacing per-wallet daily preparation quotas and timed mutation cooldowns with eight concurrent authenticated preparation requests per API process. Ownership, CSRF, authentication throttles, two-upload/four-execution concurrency, operation leases, exact signatures and idempotency remain. There is no per-wallet launch-count gate.

[Exact candidate deployments and final test checkpoint](evidence/phase2-gamine-release-2026-10-22.json). Root documentation commits may follow the application SHA without triggering a new build. No duplicate deployment was requested.

Production [database evidence](evidence/production-database-2026-10-22.json) and [specific deployment approval boundary/costs](PRODUCTION_PREPARATION.md). Actual staging [release browser evidence](evidence/staging-gamine-release-2026-10-22.json). The new staging release is verified, not merely green in Railway.

## Configurable preparation capacity

`LAUNCHPAD_PREPARATION_CONCURRENCY` defaults to **8** and accepts an integer from 1–256. It is shared by every authenticated wallet in each API process, not a per-wallet daily, lifetime or launch-count limit. Additional API replicas have their own configured capacity; this is not a distributed fleet-wide semaphore. Adjust it with measured resource capacity by changing the backend environment variable and redeploying the API; no schema change is needed. Existing two-upload/four-execution limits stay independent and unchanged.

When preparation capacity is exhausted, the request is rejected before its operation starts with HTTP **503**, `Retry-After: 1`, and `error.details = {retryable: true, retryAfterSeconds: 1}`. The message asks the caller to retry the same request. The header is a backoff hint, not an enforced wallet cooldown. Reuse the same idempotency key and payload for a retry; an intentional new launch uses a new key. Signed launches must recover the existing attempt/signature rather than start another coin. Authentication/IP protections, CSRF, ownership, optimistic versions, validation, media safeguards, operation leases and transaction idempotency remain enforced.

Regression coverage includes 105 intentional same-content drafts by one wallet, sequential saves past the former timed limit, default/lower/higher concurrent capacity shared across wallets, explicit retryable overload responses, unauthorized/invalid-origin rejection while busy, slot release after validation errors and successful requests, and same-key retry/replay returning one saved draft. Existing launch/recovery regressions continue to verify one submission and one platform-charge receipt per attempt. No Mainnet execution was enabled.

Capacity follow-up release: application commit `ac7fc18` passed 246 backend tests (23 explicit integration skips), typecheck, lint and production build. Staging backend deployment `96e853df-bd74-4738-a6d6-58348ef41859` remains **QUEUED** at the recorded checkpoint; new live capacity/header verification is pending, not claimed complete. The existing 6758f91 frontend/backend release remains healthy, compatible contract 0.5.2, MODE=demo and execution off. No duplicate release was requested. [Sanitized capacity release checkpoint](evidence/launchpad-capacity-release-2026-10-22.json).
