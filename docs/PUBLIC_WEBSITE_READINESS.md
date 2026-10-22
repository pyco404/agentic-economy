# Official website readiness — 22 October 2026

**LIVE:** https://useaeco.xyz. The owner approved the scoped official-domain cutover, which is completed. Public browsing is available independently of remaining Mainnet launch readiness. Financial execution, payments, broadcasting and payouts remain disabled.

## Actual deployed applications

| Environment/service | Application SHA | Successful Railway deployment |
| --- | --- | --- |
| Production frontend | `6758f91bd2e8a69c242584133f0e5932b862bf7e` | `ba11a995-8f60-4595-b8b2-010d340e0262` |
| Production API | `6758f91bd2e8a69c242584133f0e5932b862bf7e` | `04365147-839e-44ec-9a47-0c33bf54db04` |
| Staging frontend | `6758f91bd2e8a69c242584133f0e5932b862bf7e` | `1fe31f55-7270-4c81-a32c-8f9b5cd08054` |
| Staging API | `ac7fc18af4ad050489463894abd81fd6569006ab` | `96e853df-bd74-4738-a6d6-58348ef41859` |

Both production applications use compatible contract 0.5.2. One necessary frontend configuration build compiled the official API/WSS URLs; no backend/staging redeployment or migration was requested. Newer documentation commits do not constitute newer deployed application code. Production stays on its explicitly approved application SHA with automatic promotion off. [Current Railway/HTTP evidence](evidence/production-public-release-2026-10-22.json).

## Why the domain returned 404, and what changed

Vercel's automatic apex/wildcard routed to its missing deployment rather than Railway. Previously unverified Railway domain attachments also belonged to public-demo. The approved three attachments now belong to reviewed production. Six scoped records were added: apex custom ALIAS, www/API CNAMEs and three ownership TXT records. The custom ALIAS takes precedence over the preserved Vercel automatic default. All preexisting records, nameservers, staging CNAME/TXT, wildcard and CAA are unchanged. [Exact DNS values, record IDs and rollback](PRODUCTION_DNS_CUTOVER_PROPOSAL.md).

Production uses independent `aeco_production`, not staging or `aeco_public_demo`. Those existing environments/data were not modified. The production API returns health/readiness 200 with PostgreSQL, state view, simulation leadership and indexer lease healthy. MODE is production, with all financial gates explicitly false. Official treasury recipients remain fixed, and no treasury signer/payout worker was introduced.

## Actual public-domain acceptance

- Trusted TLS 1.3 certificates validate for apex, www and API. www returns 308 to apex while preserving path/query. Railway issued certificates automatically after normal propagation; no TLS checks were bypassed.
- All nine clean page routes return 200; missing assets/API remain non-HTML 404. Homepage/city, Launchpad, Explore and roadmap render. Back/Forward preserves the same world canvas; no page errors. Native WSS delivers live frames from `wss://api.useaeco.xyz/api/v1/ws`.
- Browser API requests target only `https://api.useaeco.xyz`. An unfunded disposable automated message signer verifies the actual `useaeco.xyz` challenge, secure host-only/HttpOnly/SameSite=Strict API cookie and session refresh 200. No test routing overrides were used. This is actual public-origin browser integration, **not a new physical Phantom test**.
- Desktop 1440×1000, tablet 820×1180, mobile 390×844, folded 344×882 and unfolded 690×829 viewports show no horizontal overflow. Screenshots were captured locally; physical mobile transaction testing remains deferred.
- Capabilities report `launchEnabled=false`, Developer Buy unavailable. Unauthenticated drafts return 401; environment/Git/admin paths return 404. No blockchain transaction, upload, payment or payout was initiated for this domain acceptance.

[TLS evidence](evidence/public-domain-tls-2026-10-22.json), [actual public browser evidence](evidence/public-domain-browser-2026-10-22.json), [public API boundaries](evidence/public-api-boundaries-2026-10-22.json), [backend/provider isolation](evidence/production-runtime-security-2026-10-22.json).

## Remaining Phase 2 work

Public website availability is complete. Mainnet activation remains separately gated by backup restoration rehearsal, final security/recovery/operations review and explicit owner approval. Pinata rotation remains pending maintenance. Physical mobile on-chain acceptance is DEFERRED; preserve evidence and do not request a new mobile launch. The historical desktop Developer Buy and public-Devnet creator-fee acceptance remain completed.

The [official $AECO and automatic Common Agent plan](PHASE2_NEXT_PRODUCTION_TASKS.md) records the reserved deployer and the existing manual/demo-only agent activation limitation. Automatic production agent creation is not claimed implemented. Production currently has no verified launched token, so no new production launch indexing or creator-fee income is claimed. Do not start Phase 3 or activate transactions as part of website routing.

## Preserved historical checkpoints

The isolated public-demo remains a separate environment at application a2e1847 with independent `aeco_public_demo` storage. Its old DNS proposal is historical and must not be reapplied over production. Earlier [public-demo preflight](evidence/public-demo-preflight-2026-10-22.json), [production preview rehearsal](evidence/production-browser-preflight-2026-10-22.json) and [matched staging 6758f91 browser acceptance](evidence/staging-gamine-release-2026-10-22.json) retain their original scope and limitations. Current public-domain evidence above supersedes the old routing blocker.
