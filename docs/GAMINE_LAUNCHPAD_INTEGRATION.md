# Gamine reuse and Phase 2 release readiness — 22 October 2026

Mainnet activation is **NO-GO** pending the production gates below. No Mainnet transaction was submitted, no funds moved, and Gamine was not modified. Mobile on-chain acceptance stays deferred. Mainnet public launching belongs to Phase 2; do not start Phase 3.

## What the reference actually proves

The previous [AgenticPad comparison](../apps/server/docs/agenticpad-launch-audit-2026-10-20.md) inspected the `Oxude` directory/package, not the current `~/Desktop/gamine` implementation. That report already motivated recovery work; it did not establish compatibility with current Gamine. This audit inspected Gamine’s actual launch builder, service, wallet, fee routing, persistence, validation, tests and public launch cache. No environment files, credentials, private keys or session databases were copied.

A real Gamine Mainnet creation was independently fetched and finalized without error: mint `Aa9GDB626D198N1oHsBs6tbySvYS7nJXZKrC9cA1TRE3`, signature `4Ha1jrUjwE6UKszDUfwPgRMRqnPY2eZD9UzsuGwAvvDVqoEjxYZqpSnujTXXsnS9FcoahfJRMhS7yPEv2gwuzMza`, slot 456264589. It contains create_v2, fee-sharing setup and Gamine’s 0.1 SOL charge. Its current source enforces Mainnet genesis; this audit did not find or verify the claimed Devnet implementation. Historical success is not an independent security audit.

## Practical comparison and integration

| Component | Gamine | Agentic Economy decision |
| --- | --- | --- |
| Creation | SDK 2.0.0 create_v2 / Token-2022 | Retain tested SDK 4.1.0 atomic builder; same proven architecture, no duplicate builder or SDK downgrade |
| Lookup table | Frozen public Mainnet table with 42 entries | Reuse `33wnSGm8hPBd9omoa252NAY8JX5PWJngkTNJgzdvdEZr`; it holds public account addresses, not payment instructions; confirm frozen/active and packet coverage |
| Platform charge | 0.1 SOL | Preserve exactly 0.05 SOL once, in the atomic launch transaction |
| Creator fees | Locked 15/50/35 configuration | Preserve locked official 60/40 rewards/platform, 0% human launcher; never import reference recipients |
| Developer Buy | SOL-budget purchase | Preserve exact supply percentage with BigInt arithmetic, default 0%, hard maximum 3.5%, simulated exact token output and bounded SOL cost |
| Wallet | Mint co-signature plus exact message/signature checks | Retain existing validation; add Wallet Standard `solana:mainnet` mapping and network-bound recovery support |
| Submission / recovery | SQLite/WAL and saved signed bytes | Retain stronger PostgreSQL operation leases, durable signed submissions, identical-signature recovery, finalized proof before Explore/receipt |
| Artwork | Legacy Pinata integration | Retain verified backend-only V3 integration; no reference keys copied |
| Authentication | Session/CSRF helpers, forwarded-host handling | Retain exact configured origins, single-use challenges and secure host-only cookies; never trust arbitrary forwarded hosts |
| Launch policy | Timed preparation quota | Do not import; owner-approved eight simultaneous authenticated preparations per API process replaces existing daily caps/cooldowns; auth and resource protections remain |
| Mainnet enablement | Fixed Mainnet implementation | Add explicit default-false owner activation gate plus live genesis and program-deployment checks; no deployed activation |

## Actual Mainnet evidence, without broadcasting

[Program identities, upgrade authorities, binary hashes, table and unsigned simulations](evidence/gamine-mainnet-readonly-2026-10-22.json). [Historical creation evidence](evidence/gamine-reference-creation-mainnet-2026-10-22.json). Reproduce reads with `pnpm --filter @agentic-economy/server exec tsx --conditions=@agentic-economy/source scripts/audit-gamine-mainnet-readonly.ts`. It uses the public RPC, ephemeral mint keys and an unsigned public simulation payer; it never loads a launcher/provider/treasury key or calls transaction submission.

The maximum 32-byte name and 13-byte ticker passed all three simulations:

| Developer allocation | Packet bytes | Exact tokens | Simulated platform credit | Sharing |
| --- | --- | --- | --- | --- |
| 0% | 1073 | none | 50,000,000 lamports | official 6000/4000, admin revoked |
| 2% | 1221 | 20,000,000 | 50,000,000 lamports | official 6000/4000, admin revoked |
| 3.5% | 1220 | 35,000,000 | 50,000,000 lamports | official 6000/4000, admin revoked |

Mainnet quotes differ substantially from Devnet: at this snapshot the 2% purchase estimates 0.576923078 SOL including protocol/creator fees, with a 0.582692309 SOL buy ceiling; platform charge, network fee and account rent are separate. The 3.5% estimate is 1.024205204 SOL, ceiling 1.034447257 SOL. These are changing quotes, not an approved debit or collected receipt. Production preparation must re-quote and simulate the actual authenticated wallet and final metadata before signing.

All four external upgradeable programs’ owners, ProgramData pointers, deployment slots and upgrade authority are checked at preparation and before submission. An unrecognized upgrade fails closed for a new review. An external upgrade between checks remains an external protocol risk; a successful simulation or historical launch does not eliminate it.

## Production configuration and remaining gates

The [prepared read-only production configuration](../infra/railway/env/production-readonly.env.example) names the official Platform and Agent Rewards addresses, excludes the AECO deployer, uses SOL only and finalized registration, and leaves `MAINNET_LAUNCH_APPROVED`, `PUMP_LAUNCH_ENABLED` and `FEE_ROUTING_VERIFIED` false. No signer or payout worker is provided. A separate owner approval is required before setting the Mainnet activation gate.

1. **Production database:** the owner separately approved fresh `aeco_production` and schema 001–004; database identity/initial emptiness, atomic application and all checksums are now verified. Production application deployment and backend-only provider reuse were subsequently approved and completed at the exact approved 6758f91 release. API/database health pass; no repository deployment triggers exist. No staging/demo database was promoted as real launch storage. Backup availability and an isolated restoration rehearsal must be verified before real execution; a listed backup is insufficient.
2. **Public routing:** existing public-demo releases now run at a2e1847, independently isolated, with approved schema, healthy API/database and execution off. This reviewed demo is not a production-launch database. The owner subsequently approved production cutover: root/www/API now route to reviewed production, valid HTTPS and actual public-origin browser auth/WSS pass. Existing staging records/nameservers and public-demo data remain unchanged. [Public website acceptance](PUBLIC_WEBSITE_READINESS.md).
3. **Production providers:** existing backend-only Pinata/Helius credential reuse was approved and verified in production. Actual V3 image/metadata uploads, production-network gateway retrieval, Mainnet/Devnet RPC and official treasury monitoring pass. Zero production launch records exist, so no new token indexing acceptance is claimed. Pinata rotation remains pending maintenance.
4. **Security / operations:** actual public-origin sessions/CORS/WSS, direct routes, TLS and responsive browser checks now pass; sampled logs and fetched bundles expose no provider credentials. Database restoration and final independent release/security review remain open. Source review and this agent’s simulations are not an independent audit; external review of Mainnet transaction/fee/recovery paths remains outstanding.
5. **Acceptance and activation:** no Mainnet transaction or charge is authorized. Mobile authentication/layout passed; mobile on-chain acceptance remains deferred and prevents claiming full Phase 2 acceptance. Present a fresh go/no-go and request activation only when production prerequisites are satisfied.

## Validation classification

Previously accepted: desktop real Phantom 2%, controlled public-Devnet 3%/3.5%, real earned SOL fee distribution, staging Helius/Pinata, and seven physical mobile checks. No repeat wallet transaction was requested.

This change adds unsigned real-Mainnet simulation evidence and mocked Mainnet lifecycle/signature-isolation tests. New tests cover upgrade/genesis/table refusal, default-off configuration, network-bound wallet/recovery, finalized provenance, one receipt/no second submission, unlimited sequential preparation, and bounded global preparation concurrency. The disposable PostgreSQL tests preserve existing mobile drafts and clean up only their generated test wallet. No migration file changed.

Final local checks: backend 242 passed (23 explicit integration skips); shared 34 passed; frontend 247 passed; approved disposable PostgreSQL 3 passed; isolated browser 7 passed across 1440/820/390/344/690px and signing/recovery. Typecheck, lint, backend/frontend builds and generated-contract check pass. Existing web bundle-size warning remains. [Public-demo pre-DNS review](evidence/public-demo-preflight-2026-10-22.json) passed all direct routes, missing-asset/API 404 behavior, exact-origin automated auth/replay rejection, WSS and complete-world rendering on desktop/folded/unfolded viewports; it uses test routing to Railway review domains and is not real public-domain/Phantom acceptance.

The candidate was deployed and browser-verified on staging at **6758f91** for both frontend and backend, contract 0.5.2. The subsequent capacity backend release ac7fc18 is now SUCCESS; its new capacity/header live check remains pending. [Actual staging checks](evidence/staging-gamine-release-2026-10-22.json). The fresh production database is separately [verified through 004](evidence/production-database-2026-10-22.json); both approved production applications are SUCCESS at 6758f91 with verified API/database health and execution off. [Actual production evidence and review-host limitations](PRODUCTION_PREPARATION.md).
