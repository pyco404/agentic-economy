# Token validation and optional Developer Buy

> Status correction, 22 October 2026: **Phantom desktop Developer Buy VERIFIED** — Zappercoin ($ZAP), 2%, exactly 20,000,000 tokens. Finalized Devnet transaction and database receipt independently checked. Physical mobile remains unverified. Older pending-desktop wording below is historical and superseded; no repeat desktop transaction is requested. [Acceptance evidence](phantom-desktop-developer-buy-2026-10-22.md) · [Current Phase 2 priorities](phase2-sol-only-acceptance.md). USDC is outside current scope.

This release extends contract 0.5.0 without a database migration. Existing JSON drafts default to `devBuyBps: 0`; existing launch responses remain parseable. Frontend and backend must be released together. Individual file commits form one validated release series; intermediate commits are not independently buildable.

## Validation and preparation

Name (32), symbol (13) and metadata URI (200) limits are measured in UTF-8 bytes. Local simulations using the cloned public-devnet Pump program accepted exact limits and rejected overflows with program errors 6043/6044/6045. The symbol character policy remains an application rule (ASCII letters, digits and `$ _ . -`), not a Pump protocol limitation. Description length and whitespace/control/URL restrictions are also application rules. Input is never silently trimmed or truncated.

The browser shows counters and inline errors. The server independently checks fields, authenticated ownership, supported pair and Developer Buy availability before sending artwork or metadata to Pinata. Local previews never upload. Invalid percentage input blocks creation and draft saving rather than silently using the previous valid percentage.

## Developer Buy

Off by default. SOL only, up to 350 basis points (3.5%) of the actual mint supply using integer base units. USDC launches without a buy are retained; USDC Developer Buy and AECO pairing remain disabled. Demo deployments do not enable Developer Buy.

Preparation reads live Pump Global and fee configuration, checks lookup-table coverage, builds an exact-output buy with partial fills disabled, and simulates the complete atomic creation/fee-sharing/platform-charge/buy transaction. The wallet reviews simulated cost, maximum spend and total fees. The form estimate is frozen at Create Coin; any higher prepared maximum requires explicit acceptance. No separate purchase transaction is submitted.

Confirmation independently verifies the exact prepared message, authentic Pump self-CPI trade evidence, buyer token balance, the actual bonding-curve supply against the quoted supply, the supply cap and spending ceiling. Missing or changed supply evidence requires recovery; it is never treated as a verified allocation. Actual token quantity, spending and allocation are stored with the launch. Authenticated inner events also recover Explore trade history when creation exhausts the transaction log budget.

## Actual local-chain evidence

An isolated loopback validator with cloned public-devnet programs and in-memory application storage verified:

- A 350-bps SOL buy received exactly 35,000,000,000,000 base units from a 1,000,000,000,000,000-unit mint supply (six decimals).
- Actual buy cost: 10,242,053 local lamports; maximum: 10,344,474. Account rent: 20,643,360 lamports, matching the preview.
- The single transaction was 1,164 bytes / six instructions. Exactly one 50,000,000-lamport platform receipt was recorded. Repeated submission returned the same launch.
- Locked 60/40 fee routing, creator-fee receipt in the sharing vault, buyer ownership, one Explore trade and confirmed launch provenance were checked.
- Local signature: `36ap5EDHuHCDTFRgN65ZNtMBVNCqhWtwgrh7NzndbCLwn5RAzxGyXTtkueReKEirRGSLHjoTBK3YhRzzFvkCMW5a`.
- Local mint: `UM8cBxxSzV2wryeug1zFyhRgxUo6wGuQbXzYfzA2KR4`.
- Separate SOL and USDC zero-buy launches passed charge/rent/quote/duplicate-submission checks.

These are local-validator transactions, not public explorer transactions. Pinata was mocked and storage was in memory. This does not prove new PostgreSQL persistence, real Pinata uploads or physical Phantom Developer Buy signing. Existing public-devnet/Phantom evidence documents earlier zero-buy launches separately.

## Remaining acceptance

A dedicated real-wallet safe-network Developer Buy test still needs approval and a verified lookup table containing all fixed buy accounts and fee recipients. Mainnet, real payments, treasury signing and payouts remain disabled. No database migration is required or authorized by this release.

The opt-in local harness supports `AECO_LOCAL_TEST_MEMORY=true` to avoid PostgreSQL completely. Its database-reset path separately requires `AECO_LOCAL_TEST_RESET_APPROVED=true`; never point it at an existing development or Railway database.

## Automated validation

Shared contracts: 30 tests passed. Backend: 198 passed, 18 PostgreSQL-dependent tests skipped because no disposable database was configured. Frontend: 220 unit tests passed. Isolated desktop/tablet/mobile browser suite: 12 passed, covering validation, local-only preview, draft/image/metadata preparation, wallet rejection/switching and recoverable launch signing. Browser wallet signing and Pinata are mocked; signatures use real test Ed25519 keys. Build, typecheck, lint and generated-contract consistency checks passed.
