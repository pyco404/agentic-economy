# Phase 2 acceptance status — 22 October 2026

**Current deployment decision:** production is the only permanent Railway environment. Routine tested changes go directly from local/isolated Devnet verification and production builds to explicit production releases and live checks; staging promotion is not required. Legacy data/resources remain pending backup/restore checks and explicit deletion approval. [Dependency audit and retirement plan](RAILWAY_SINGLE_PRODUCTION.md).

This is the current checklist; earlier dated reports remain historical evidence. **Phase 2 cannot close, and Phase 3 cannot begin, until the owner launches the official $AECO token through https://useaeco.xyz on Solana Mainnet, independent on-chain verification passes, ownership indexing creates one persistent Common Agent per qualifying wallet, and the moving city population reconciles.** Production readiness and separate Mainnet activation/transaction approvals come first. The owner-supplied planned mint is `ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco`; keypair preparation does not authorize execution. Other launch parameters and the transaction remain unapproved. [Fixed-mint preparation](OFFICIAL_AECO_LAUNCH_PLAN.md).

[Mandatory sequence, parameter approvals and release evidence checklist](PRODUCTION_RELEASE_CHECKLIST.md).

**Current rollout policy:** Public browsing → production readiness and disposable Devnet signing rehearsal → separately approved direct deployer-only $AECO launch → verified automatic holder Common Agents → separately approved public launching → Phase 3. The fixed deployer is `3pF1MM1PCg2tekM5KeWEDyT8LVKbVd7ia668NRAnYpAR`. Mainnet financial gates remain off; the official $AECO parameters, costs and exact transaction still require final approval. The owner removed the intermediate Mainnet test-token requirement; $AECO must be the first official Mainnet launch. The reviewed backend permission gate is deployed at `5fa0507` and live authenticated denial checks pass; financial activation remains unapproved. No public unlock follows automatically from mint verification.

**Direct native-launch update:** the owner enters all metadata/artwork in the existing Create Coin form and personally selects 1% Developer Buy. Ordinary forms remain 0% by default. The exact planned mint remains fixed. The operator-bound public-review/local-signature handoff is deployed on production/staging at `5fa0507`; no production reservation, Mainnet activation or transaction has occurred. Public-Devnet signing/simulation rehearsal uses disposable mints only. [Deployed integration and separate launch-time gates](DIRECT_AECO_LAUNCH_REVIEW.md).

| Milestone | Status |
| --- | --- |
| Real SOL creator-fee distribution | **VERIFIED ON PUBLIC DEVNET** — 15,532 lamports Agent Rewards, 10,354 Platform, 1 retained dust; funding excluded from income |
| Desktop Phantom Developer Buy | **COMPLETED** — ZAP 2%, 20,000,000 tokens; controlled 3%/3.5% tests separately verified |
| Physical Phantom mobile | **AUTHENTICATION VERIFIED; ON-CHAIN DEFERRED** — seven physical connection/authentication/layout/refresh checks plus phone-image preview passed; owner paused further launches |
| Helius replacement | **ACTIVE AND VERIFIED** in the running staging backend |
| Pinata image and metadata uploads | **VERIFIED** on staging; credential rotation remains pending maintenance |
| Automatic $AECO Common Agents | **IMPLEMENTED / DEPLOYED DISABLED; REAL-MINT ACTIVATION PENDING:** 400/10,000-identity fixtures, isolated PostgreSQL restart/re-entry, Devnet holder reads and subscription reconnection verified. Default-off finalized indexing, durable identities, basic navigation and public population await the separately approved official mint for real AECO acceptance. Phase 3 expands these same identities. See [implementation and acceptance](AECO_COMMON_AGENTS.md) |
| Official $AECO Mainnet launch | **PLANNED MINT RECORDED / NOT LAUNCHED:** `ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco` is reserved for preparation; owner-initiated production TOKEN/SOL launch and independent mint/supply/metadata/fee-routing/finality/Explore verification are mandatory before Phase 2 completion and Phase 3 |
| Public website | **LIVE AND VERIFIED:** https://useaeco.xyz; www redirect, valid apex/www/API TLS, official API/WSS, actual-origin automated auth/session refresh and responsive browser checks pass; transactions remain off |
| Application staging/production release | **DEPLOYED AND PUBLIC BROWSER VERIFIED:** all four application services at **5fa0507**. HTTPS/API/database/authentication/WSS, routes, responsive layouts and persistent-world checks pass. Live ordinary-wallet launch/submit/resume/mint-signature requests return 403. Mainnet execution and native indexing remain disabled. [Current release evidence](evidence/direct-aeco-preparation-2026-10-22.json) |

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

A separate default-false `MAINNET_LAUNCH_APPROVED` gate, live genesis/program deployment checks and Mainnet wallet/recovery bindings are implemented. Neither Railway execution configuration nor treasury custody changed. Mainnet public launching remains Phase 2 scope, pending production readiness and separate activation approval. Public-demo frontend/backend have now completed their existing queued deployments at a2e1847; approved schema 001–004 and health are verified. The owner subsequently approved a fresh production database: aeco_production is provisioned, verified initially empty, and migrated through 004 with exact checksum verification. The owner subsequently approved production applications and existing backend-only provider-key reuse. Both production apps are now SUCCESS at the exact approved 6758f91 commit, with healthy API/database, actual Pinata image/metadata uploads and Helius connectivity verified. Financial execution and automatic promotion remain off. Real-domain DNS/HTTPS, restoration rehearsal and final release acceptance remain open. Temporary review hosts cannot share Strict browser cookies; the official-origin browser rehearsal is instrumented, not real-domain acceptance. See [production release details](PRODUCTION_PREPARATION.md).

The owner explicitly approved replacing per-wallet daily preparation quotas and timed mutation cooldowns with eight concurrent authenticated preparation requests per API process. Ownership, CSRF, authentication throttles, two-upload/four-execution concurrency, operation leases, exact signatures and idempotency remain. There is no per-wallet launch-count gate.

[Exact candidate deployments and final test checkpoint](evidence/phase2-gamine-release-2026-10-22.json). Root documentation commits may follow the application SHA without triggering a new build. No duplicate deployment was requested.

Production [database evidence](evidence/production-database-2026-10-22.json) and [application release verification and costs](PRODUCTION_PREPARATION.md). Actual staging [release browser evidence](evidence/staging-gamine-release-2026-10-22.json). The new staging release is verified, not merely green in Railway.

## Configurable preparation capacity

`LAUNCHPAD_PREPARATION_CONCURRENCY` defaults to **8** and accepts an integer from 1–256. It is shared by every authenticated wallet in each API process, not a per-wallet daily, lifetime or launch-count limit. Additional API replicas have their own configured capacity; this is not a distributed fleet-wide semaphore. Adjust it with measured resource capacity by changing the backend environment variable and redeploying the API; no schema change is needed. Existing two-upload/four-execution limits stay independent and unchanged.

When preparation capacity is exhausted, the request is rejected before its operation starts with HTTP **503**, `Retry-After: 1`, and `error.details = {retryable: true, retryAfterSeconds: 1}`. The message asks the caller to retry the same request. The header is a backoff hint, not an enforced wallet cooldown. Reuse the same idempotency key and payload for a retry; an intentional new launch uses a new key. Signed launches must recover the existing attempt/signature rather than start another coin. Authentication/IP protections, CSRF, ownership, optimistic versions, validation, media safeguards, operation leases and transaction idempotency remain enforced.

Regression coverage includes 105 intentional same-content drafts by one wallet, sequential saves past the former timed limit, default/lower/higher concurrent capacity shared across wallets, explicit retryable overload responses, unauthorized/invalid-origin rejection while busy, slot release after validation errors and successful requests, and same-key retry/replay returning one saved draft. Existing launch/recovery regressions continue to verify one submission and one platform-charge receipt per attempt. No Mainnet execution was enabled.

Capacity follow-up release: application commit `ac7fc18` passed 246 backend tests (23 explicit integration skips), typecheck, lint and production build. Staging backend deployment `96e853df-bd74-4738-a6d6-58348ef41859` is now observed **SUCCESS**; the old evidence file records its earlier queued checkpoint. New live capacity/header verification remains pending, not claimed complete. The staging frontend remains at 6758f91, compatible contract 0.5.2, MODE=demo and execution off. No duplicate release was requested. [Sanitized capacity release checkpoint](evidence/launchpad-capacity-release-2026-10-22.json).

## Historical pre-cutover deployment recheck — 22 October 2026

[Fresh read-only Railway and HTTP evidence](evidence/deployment-readiness-recheck-2026-10-22.json): staging backend ac7fc18, staging frontend 6758f91, production frontend/API 6758f91 and both PostgreSQL services are SUCCESS. Both APIs return health/readiness 200 with PostgreSQL healthy and compatible contract 0.5.2; financial features are disabled. Production targets aeco_production and has no repository deployment triggers. No builds, configuration changes or migrations were requested. Later main commits are documentation; production remains deliberately pinned to its approved application SHA.

At that pre-cutover checkpoint (superseded below), official root/www/API returned Vercel DEPLOYMENT_NOT_FOUND (404). Production then had no official custom-domain attachments, and its frontend targeted the temporary API/WSS host. That was a separate domain-cutover approval gate, not a queued-build blocker; it is now resolved. See the [scoped proposal](PRODUCTION_DNS_CUTOVER_PROPOSAL.md). Remaining production acceptance includes real-domain HTTPS/session/WSS checks, an actual isolated backup restoration rehearsal, final security/recovery review and separately approved financial activation. Pinata rotation remains pending maintenance, and physical mobile on-chain acceptance remains DEFERRED.

## Approved official-domain cutover — complete

https://useaeco.xyz is live. One pinned frontend configuration release at 6758f91 (`ba11a995-8f60-4595-b8b2-010d340e0262`) switches API/WSS to api.useaeco.xyz; backend remains its approved 6758f91 release and aeco_production. The six approved DNS additions preserve all existing records and nameservers. Apex/www/API TLS validates, www redirects correctly, and the real public browser passes nine routes, world readiness/retained canvas, native WSS, exact-origin automated message auth/session refresh and five responsive viewports with zero page errors/overflow. No physical Phantom test or blockchain transaction was repeated. [Public readiness and evidence](PUBLIC_WEBSITE_READINESS.md).

Domain routing is no longer a blocker. Mainnet activation remains separately unapproved; backup restore/security/recovery acceptance, Pinata maintenance and deferred mobile on-chain acceptance retain their distinct statuses. [Official $AECO and automatic Common Agent audit/next steps](PHASE2_NEXT_PRODUCTION_TASKS.md). Automatic Common Agent creation is not currently implemented: confirmed launches register communities/HQs, while token-linked activation is manual and demo-only with one-per-wallet/mint uniqueness. No agent-policy/schema change was made during cutover. Phase 3 has not started.

## Corrected agent identity model

The owner reaffirmed **one agent identity per token and at most one activated token-linked agent per verified wallet**. Unlimited launches remain permitted. Additional launches must not reuse an existing token's agent or grant automatic control. The previous proposal to drop activation-wallet uniqueness is withdrawn. The actual gap is independent unactivated per-token identity provisioning; current activation combines identity creation and control. [Corrected audit and additive review-only candidate](COMMON_AGENT_PER_TOKEN_PLAN.md). No migration beyond 004 or new provisioning behavior has been applied.

Automatic official-$AECO holder Common Agents use their own network/mint/wallet mapping, with 400 qualifying wallets producing 400 distinct Common Agents for the same mint. They do not consume token-linked activation rights or acquire control automatically. This is separate from the missing per-token identity registry and remains subject to official-mint production acceptance.

## Mandatory native-token roadmap — published and verified

The owner requires the official $AECO Mainnet launch through useaeco.xyz before Phase 2 completion or Phase 3. Supply, decimals, tokenomics, metadata, launch configuration, Developer Buy and all transaction costs require separate final approval. The owner must initiate/sign through the production website; a mock, test-network launch or automated owner signer cannot satisfy the gate. Independent verification must establish mint/supply/metadata, fee routing, finalized signature and Explore provenance. [Production release checklist](PRODUCTION_RELEASE_CHECKLIST.md).

Frontend application commit aa1f53a is SUCCESS on staging (`0b72282d-a73d-44e1-8e03-082bb4391cdb`) and production (`164d4580-ceb1-42a1-981d-dd4580635fe9`). Actual staging and public roadmap browsers verify Phase 2's required native milestone and Phase 3's blocked status, four responsive viewports, retained city, native WSS and disabled execution. Backend/database deployments and financial configuration remain unchanged; no token transaction, migration or DNS change was made. [Release evidence](evidence/native-aeco-roadmap-release-2026-10-22.json). The official $AECO token remains NOT LAUNCHED; Phase 2 remains incomplete.

## Current production release and owner-controlled launch boundary

Production frontend and API are both SUCCESS at `5fa0507167695df96d57cecd332a45e9422209b2`, matching staging. Frontend deployment `2de54da5-8ac0-472e-85b0-db56533be625`; API deployment `4a7f0533-98db-4e93-a47d-f0bcad9b237d`. Fresh public-domain browsers verify all nine routes, no old diagnostics, correct API/WSS, session refresh, persistent canvas and five responsive viewports without overflow or JavaScript errors. `aeco_production` is healthy and migrations 001–004 match. Both automatic production deployment triggers remain absent. Earlier image-build failures and older SHA rows above are historical.

The secure existing-review-screen public-artifact handoff is deployed, backed by strict exact-message/mint/owner checks and immutable reservations. Disposable Devnet simulation/local co-signing and mock browser signing/recovery passed. The official private key has never been opened; no official signature import or Mainnet transaction was performed. Backend tests: 282 passed, 23 explicit database-dependent skips; frontend: 251 passed; typecheck, lint, contracts and builds passed. [Signing workflow and remaining expiry limits](AECO_LOCAL_MINT_SIGNING.md).

The deployer is intentionally unfunded. This is **not** a website/infrastructure blocker. Do not request funds, repeat balance checks, schedule or automatically submit a launch. The owner will enter their own content, choose 1%, review actual costs, decide when to fund and personally sign. The final balance check belongs only to that owner-initiated authorization stage. Website release and token deployment are separate operations.

Mainnet execution/payment/broadcast/payout gates remain off. Transaction preparation currently shares the execution-off capability gate; do not activate financial execution just to obtain a review. Final short-blockhash expiry/renewal and security/recovery acceptance remain open before eventual execution. Final live metadata, simulation/debit and explicit transaction approval occur when the owner chooses to launch. Mobile on-chain acceptance stays DEFERRED; Phase 2 is not fully accepted and Phase 3 has not started. [Current evidence and scope](evidence/direct-aeco-preparation-2026-10-22.json).
