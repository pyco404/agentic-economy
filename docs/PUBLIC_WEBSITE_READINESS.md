# Official website readiness — 22 October 2026

**LIVE, reverified 22 October 2026 after frontend `16e4bea` (API `5fa0507`):** https://useaeco.xyz. The owner approved the scoped official-domain cutover, which is completed. Public browsing is available independently of remaining Mainnet launch readiness. Financial execution, payments, broadcasting and payouts remain disabled.

## Actual deployed applications

| Environment/service | Application SHA | Successful Railway deployment |
| --- | --- | --- |
| Production frontend | `16e4bea3a4c55c8764b58e712a3bbc9526255cf8` | `18f11a0e-cf24-4469-be7e-aa564df8e042` |
| Production API | `5fa0507167695df96d57cecd332a45e9422209b2` | `4a7f0533-98db-4e93-a47d-f0bcad9b237d` |
| Staging frontend | `5fa0507167695df96d57cecd332a45e9422209b2` | `ca2e25bc-91b4-41c5-8485-3feed4e8b0b5` |
| Staging API | `5fa0507167695df96d57cecd332a45e9422209b2` | `d044cfd5-c491-4dc8-b2a6-5f541e5c3213` |

Production frontend is `16e4bea`; API and preserved legacy staging releases remain `5fa0507`, contract 0.6.0. Backend runtime is unchanged and compatible. This correction deployed only the tested frontend directly to production, once, with no staging promotion, backend build, DNS/financial/secret change or migration. Production repository triggers remain absent. Root documentation commits may follow the application SHA without another deployment.

The public domain now serves `/assets/index-Ckyn_yA3.js` (SHA-256 `44515ec865ae6893aa4087a642a223efec61fb528b5ec02fcbb4c1af90e31e97`), rather than the prior production bundle. Fresh actual public-origin checks verify routes, secure message-authenticated sessions, official API/WSS, responsive layouts and retained world with execution off. The deployed backend denies ordinary authenticated launch preparation, submission, resume and mint-signature import with 403. [Current allocation correction, release and fresh public browser evidence](evidence/developer-buy-selection-2026-10-22.json). [Existing isolated database and permission-gate evidence](evidence/direct-aeco-preparation-2026-10-22.json).

## Why the domain returned 404, and what changed

The current apex returns HTTP 200 and www redirects with HTTP 308. The earlier 404 is no longer reproducible. Historically, Vercel's automatic apex/wildcard routed to its missing deployment rather than Railway. Previously unverified Railway domain attachments also belonged to public-demo. The approved three attachments now belong to reviewed production. Six scoped records were added: apex custom ALIAS, www/API CNAMEs and three ownership TXT records. The custom ALIAS takes precedence over the preserved Vercel automatic default. All preexisting records, nameservers, staging CNAME/TXT, wildcard and CAA are unchanged. [Exact DNS values, record IDs and rollback](PRODUCTION_DNS_CUTOVER_PROPOSAL.md).

Production uses independent `aeco_production`, not staging or `aeco_public_demo`. Their database targets and existing data were preserved. The production API returns health/readiness 200 with PostgreSQL, state view, simulation leadership and indexer lease healthy. MODE is production, with all financial gates explicitly false. Official treasury recipients remain fixed, and no treasury signer/payout worker was introduced.

## Actual public-domain acceptance

- Trusted TLS 1.3 certificates validate for apex, www and API. www returns 308 to apex while preserving path/query. Railway issued certificates automatically after normal propagation; no TLS checks were bypassed.
- All nine clean page routes return 200; missing assets/API remain non-HTML 404. Homepage/city, Launchpad, Explore and roadmap render. Back/Forward preserves the same world canvas; no page errors. Native WSS delivers live frames from `wss://api.useaeco.xyz/api/v1/ws`.
- Browser API requests target only `https://api.useaeco.xyz`. An unfunded disposable automated message signer verifies the actual `useaeco.xyz` challenge, secure host-only/HttpOnly/SameSite=Strict API cookie and session refresh 200. No test routing overrides were used. This is actual public-origin browser integration, **not a new physical Phantom test**.
- Desktop 1440×1000, tablet 820×1180, mobile 390×844, folded 344×882 and unfolded 690×829 viewports show no horizontal overflow. Screenshots were captured locally; physical mobile transaction testing remains deferred.
- Capabilities report `launchEnabled=false`, Developer Buy unavailable. Unauthenticated drafts return 401; environment/Git/admin paths return 404. No blockchain transaction, upload, payment or payout was initiated for this domain acceptance.

[TLS evidence](evidence/public-domain-tls-2026-10-22.json), [actual public browser evidence](evidence/public-domain-browser-2026-10-22.json), [public API boundaries](evidence/public-api-boundaries-2026-10-22.json), [backend/provider isolation](evidence/production-runtime-security-2026-10-22.json).

## Mandatory official native-token milestone

The updated release plan requires an owner-initiated official $AECO TOKEN/SOL launch on Solana Mainnet through useaeco.xyz, as the first official Mainnet launch, after native-token readiness, disposable Devnet signing rehearsal and separate activation, parameter and exact transaction-cost approvals. A separate Mainnet test token is no longer required. Independent mint/supply/metadata/fee-routing/finality/Explore verification is mandatory before Phase 2 closes or Phase 3 starts. No $AECO transaction has been authorized or submitted. [Release checklist](PRODUCTION_RELEASE_CHECKLIST.md), [actual native-roadmap release and browser checks](evidence/native-aeco-roadmap-release-2026-10-22.json).

Public launching stays closed through native-token readiness, the direct native-token launch and holder-agent verification. It requires a later explicit owner approval and reviewed removal of the initial backend deployer-only policy. The permission gate is deployed at `5fa0507`; live authenticated denial checks pass and execution remains disabled. [Restricted release sequence](PRODUCTION_RELEASE_CHECKLIST.md).

## Remaining Phase 2 work

Public website availability is complete. The owner intentionally has not funded the deployer; funding and balance checks are not infrastructure prerequisites. Check balance only when the owner prepares to authorize the actual launch. No launch is scheduled, signed or broadcast by this release. Mainnet activation remains separately gated by backup restoration rehearsal, final security/recovery/operations review and explicit owner approval. Pinata rotation remains pending maintenance. Physical mobile on-chain acceptance is DEFERRED; preserve evidence and do not request a new mobile launch. The historical desktop Developer Buy and public-Devnet creator-fee acceptance remain completed.

The [official $AECO plan](PHASE2_NEXT_PRODUCTION_TASKS.md) records the reserved deployer. [Automatic Common Agent implementation](AECO_COMMON_AGENTS.md) is tested and deployed to staging and production with indexing disabled. Real holder indexing remains gated on a separately approved and independently verified official mint. Production currently has no verified launched token, so no new production launch indexing or creator-fee income is claimed. Do not start Phase 3 or activate transactions as part of website routing.

## Preserved historical checkpoints

The isolated public-demo remains a separate environment at application a2e1847 with independent `aeco_public_demo` storage. Its old DNS proposal is historical and must not be reapplied over production. Earlier [public-demo preflight](evidence/public-demo-preflight-2026-10-22.json), [production preview rehearsal](evidence/production-browser-preflight-2026-10-22.json) and [matched staging 6758f91 browser acceptance](evidence/staging-gamine-release-2026-10-22.json) retain their original scope and limitations. Current public-domain evidence above supersedes the old routing blocker.
