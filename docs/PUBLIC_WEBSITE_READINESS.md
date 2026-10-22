# Official website readiness — 22 October 2026

**LIVE, reverified 22 October 2026 at 17:20 UTC:** https://useaeco.xyz. The owner approved the scoped official-domain cutover, which is completed. Public browsing is available independently of remaining Mainnet launch readiness. Financial execution, payments, broadcasting and payouts remain disabled.

## Actual deployed applications

| Environment/service | Application SHA | Successful Railway deployment |
| --- | --- | --- |
| Production frontend | `3b369f602e14ecc36332c806b1c11ae9c59b05a4` | `8afd89e8-a7e6-4f03-89a4-488e69db98a8` |
| Production API | `6758f91bd2e8a69c242584133f0e5932b862bf7e` | `04365147-839e-44ec-9a47-0c33bf54db04` |
| Staging frontend | `3b369f602e14ecc36332c806b1c11ae9c59b05a4` | `403ef016-f05e-4003-850b-ded59fe1a76b` |
| Staging API | `947866d58dff46b52d20d58687cd7d260a3a263e` | `00d7f7d9-6451-45b5-b3ce-3b4d8013f469` |

Production API remains pinned at contract 0.5.2. The current frontend consumes its compatible responses: actual public-origin browser verification covers the complete world, all routes, API/WSS, authenticated sessions and refresh, with execution disabled. Staging API uses contract 0.6.0. Only the frontend was explicitly promoted for the public mobile UI fix; no production backend, database, DNS or financial setting changed. Automatic production promotion remains off. Documentation commits are not application deployments. [Mobile diagnosis, implementation and verification](PUBLIC_MOBILE_NAVIGATION.md), [current public browser/session acceptance](evidence/public-mobile-release-2026-10-22.json).

[Current deployment/API health evidence](evidence/public-mobile-ui-2026-10-22.json), [current public-origin browser/session checks](evidence/public-mobile-release-2026-10-22.json), [earlier database/domain isolation checks](evidence/public-production-recheck-2026-10-22.json), [trusted TLS checks](evidence/public-domain-tls-recheck-2026-10-22.json). The production API remains intentionally pinned; documentation commits are not application deployments.

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

Public launching stays closed through native-token readiness, the direct native-token launch and holder-agent verification. It requires a later explicit owner approval and reviewed removal of the initial backend deployer-only policy. The permission gate is implemented on main for the next reviewed production release; this documentation update does not deploy it or enable execution. [Restricted release sequence](PRODUCTION_RELEASE_CHECKLIST.md).

## Remaining Phase 2 work

Public website availability is complete. Mainnet activation remains separately gated by backup restoration rehearsal, final security/recovery/operations review and explicit owner approval. Pinata rotation remains pending maintenance. Physical mobile on-chain acceptance is DEFERRED; preserve evidence and do not request a new mobile launch. The historical desktop Developer Buy and public-Devnet creator-fee acceptance remain completed.

The [official $AECO plan](PHASE2_NEXT_PRODUCTION_TASKS.md) records the reserved deployer. [Automatic Common Agent implementation](AECO_COMMON_AGENTS.md) is tested and deployed to staging with indexing disabled; it is not enabled in production. Real holder indexing remains gated on a separately approved and independently verified official mint. Production currently has no verified launched token, so no new production launch indexing or creator-fee income is claimed. Do not start Phase 3 or activate transactions as part of website routing.

## Preserved historical checkpoints

The isolated public-demo remains a separate environment at application a2e1847 with independent `aeco_public_demo` storage. Its old DNS proposal is historical and must not be reapplied over production. Earlier [public-demo preflight](evidence/public-demo-preflight-2026-10-22.json), [production preview rehearsal](evidence/production-browser-preflight-2026-10-22.json) and [matched staging 6758f91 browser acceptance](evidence/staging-gamine-release-2026-10-22.json) retain their original scope and limitations. Current public-domain evidence above supersedes the old routing blocker.
