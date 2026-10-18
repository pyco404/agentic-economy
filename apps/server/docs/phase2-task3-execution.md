# Phase 2 Task 3 — guarded Pump.fun launch execution

## Status

Implemented behind default-off safe-network gates. The actual atomic SOL launch passed on an **isolated localhost validator with cloned devnet programs**. Mocked API/browser tests additionally cover ownership, rejection, retries and confirmation recovery. This is **not** a real Phantom acceptance test, a real Pinata upload, a public devnet launch, or a staging deployment. Mainnet execution is hard-disabled.

The Task 1 verified-backup/migration gate and Task 2 Pinata credential gate remain open. Do not enable this flow on Railway before those prerequisites and actual-wallet acceptance pass.

## Protocol verification

Official docs/IDL snapshot: [`pump-fun/pump-public-docs` at `639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22`](https://github.com/pump-fun/pump-public-docs/tree/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22). Official SDK pinned to `@pump-fun/pump-sdk@4.1.0`; optional native bigint compilation is disabled and its JavaScript fallback is used. The small CommonJS shim selects the SDK's published CommonJS entry because its ESM dependency chain fails to import Anchor's BN on Node. No dependency source is patched.

| Item | Verified finding |
| --- | --- |
| Pump program | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| Pump Fees | `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` |
| Pump AMM | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` |
| SOL creation | `create_v2`, Token-2022 mint; no extra quote accounts for native SOL. Creator and mint sign; the wallet is fee payer. |
| USDC protocol support | Official [coin-creation instructions](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/COIN_CREATION.md) document non-native quotes; [buy instructions](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/BUY.md) explicitly document USDC. It exists at protocol level, but remains disabled here pending safe-network quote/ATA/denomination tests. |
| AECO | Future; not enabled or assumed eligible. |
| Metadata/creator | Exact draft name, symbol, pinned metadata URI and authenticated creator are encoded and reverified on-chain. UTF-8 byte limits are enforced. Mayhem, cashback and holder rewards remain false. |
| Creator fees | [Fee sharing](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/CREATOR_FEE_SHARING.md) configures recipients; [sweeps](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/instructions/SWEEP_FEES.md) can be needed before collection. Only actually received assets qualify for accounting. This task verifies initial routing, not trading, graduation, collection or payout execution. |

Read-only RPC checks found executable Pump, Pump Fees, Pump AMM and mayhem dependency programs on devnet. The public devnet faucet returned an internal error for a newly generated isolated test wallet. Testing therefore used cloned **devnet** programs locally, without submitting any mainnet transaction or using an existing wallet.

## Atomic fees and signatures

One v0 transaction contains compute budget, the exact `50_000_000` lamport platform transfer, `create_v2`, `create_fee_sharing_config`, and `update_fee_shares_v2` with 6000/4000 basis points. There is no initial buy. No treasury private key signs. The backend partially signs only with a fresh mint key; that secret is not persisted or returned. The creator signs the exact saved message.

A lookup table is necessary to keep the atomic route within Solana's 1232-byte packet limit. The backend reads and checks its owner/active status, compiles the actual message and fails before wallet signing if it cannot fit. The configured table must cover the stable program/configuration addresses for the intended environment; do not assume a random table will suffice. Local tests create a separate table with valueless local SOL. Table setup costs are separate from the platform charge; the application does not silently create/fund a table or split the charge into a second transaction.

The platform charge is exact. Network fees are estimated using RPC `getFeeForMessage`; account rent remains a disclosed estimate. Protocol trading fees are not a platform charge or creator-fee split; this route includes no purchase. If any instruction fails on-chain, Solana rolls back creation, sharing and platform transfer together, but network fees can still be incurred.

## Application and persistence

- The authenticated cookie API accepts only an owned, latest-version saved draft with backend-pinned image and metadata. User-supplied mint, metadata references, creator or origin labels cannot replace those records.
- Preparation uses an idempotency operation and stable attempt ID. An interrupted response can recover the same persisted preparation instead of creating another mint/attempt. Existing JSON launch documents store the partially signed transaction, expiry, genesis, draft version, network and provenance; **no new database migration** is needed for these fields.
- The browser presents fee destination, network fees and estimated rent before requesting a launch signature. Signing rejection sends no submission. It stores only a public attempt ID/request-key hint for restoration; sessions remain HttpOnly.
- The backend checks the signed bytes against its saved message and verifies every required Ed25519 signature. It persists the signature before RPC broadcast. A timeout remains submitted/uncertain, with retries of the same transaction, not an invented failure or a second charge.
- Expiry uses finalized block height. Concurrent expiry cannot overwrite submission. Missing history after broadcast remains uncertain. A previously expired preparation can recover if matching authoritative transaction evidence later appears.
- Confirmation checks exact creation data/creator/mint, signatures, one exact platform transfer, program-owned routing accounts, active 60/40 shares, revoked admin and bonding-curve creator. The original stored fee destinations remain authoritative if configuration changes.
- Only verified confirmation registers the community and launch-fee receipt atomically through the existing store. Explore uses matching launch/community records, displays the real logo, mint, signature, network and quote, and does not invent price/volume/liquidity. Legacy records retain unavailable/unverified labels.
- Provenance has two dimensions: `platformOrigin=PLATFORM` means the verified Agentic Economy route; `initiator=HUMAN` means a wallet-initiated launch. They are not competing origin labels. SUPER-AGENT creation is not implemented/enabled.
- One wallet can launch multiple tokens. No creator-history, duplicate-metadata or activation-based launch gate was added. Launch idempotency operations have no daily launch quota. Existing authentication/draft/image throttling remains in place. Launch preparation/submission use a shared in-flight work bound rather than a per-wallet count or cooldown; retries do not grant new ownership.

New cookie endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/launchpad/drafts/:id/launch` | `{version}`, required `Idempotency-Key`; returns owned preparation |
| POST | `/api/v1/launchpad/launches/:launchId/submit` | `{transaction}`; exact signed preparation only |
| GET | `/api/v1/launchpad/launches/:launchId` | owner-only restore/status/reconciliation |

States use the existing contract: draft → awaiting_signature → submitted → confirmed / failed / recovery_needed / expired. Awaiting signature includes successful preparation; submitted includes confirmation polling. A prepared draft is never described as a launched token.

## Local protocol evidence and reproduction

[Recorded evidence](evidence/pump-local-2026-10-18.json) includes the actual normalized RPC transaction, public keys, slot, program-owned routing state and duplicate-broadcast outcome. No private keys are included.

- Network: isolated localnet, cloned devnet programs.
- Genesis: `3mvebRoZp3o6m9akLYK2vP8rcWZ7Nj5mzGNDkRdW4Rf5`.
- Mint: `69LzLxDqdvYZje52ScnXAKTNVvgMaGg8nHMM6ds521nr`.
- Signature: `3VuW1UMGMM3CExxAettG4fYFbgPkagn9udfnoJ6f1t31Wn1vxZZtiFSxdDCiKHaPgfxwJzjRupxyMRDu1pLvWrte`.
- Result: verified confirmed, Token-2022 owner, exact 50,000,000 local lamports, active 6000/4000 routing, admin revoked; identical broadcast rejected as already processed.
- Tested atomic route: 730 bytes with its local lookup table; simulation consumed 249459 compute units.
- Metadata was an explicitly test-only HTTPS placeholder. This evidence does not prove Pinata availability or commercial token launch readiness.

The local validator was stopped after evidence capture; its ledger was preserved. These signatures cannot be looked up on a public block explorer. The first earlier test submission expired before landing; it is not counted as a successful launch. Local ledgers can prune transaction history, which is why normalized evidence was captured immediately after confirmation.

To reproduce after starting a separately isolated validator with the required official program/config accounts cloned from devnet:

```bash
AECO_LOCAL_TEST_RPC=http://127.0.0.1:18999 \
PUMP_LOCAL_GENESIS_HASH=<that-local-validator-genesis> \
AECO_LOCAL_TEST_EVIDENCE=/tmp/aeco-local-evidence.json \
pnpm --filter @agentic-economy/server exec tsx \
  --conditions=@agentic-economy/source scripts/test-pump-local.ts
```

The harness accepts only a loopback RPC and exact explicitly supplied local genesis, rejects public mainnet/devnet genesis, generates fresh test keys in memory and uses the local faucet. It verifies state and duplicates; it never opens an existing wallet.

## Configuration and release gates

Defaults stay disabled. Future safe-network configuration, only after the existing staging gates and validation pass:

- `PUMP_LAUNCH_ENABLED=false` by default.
- `FEE_ROUTING_VERIFIED=false` stays unchanged on staging.
- `PUMP_LAUNCH_LOOKUP_TABLE`: environment-specific, verified active table with sufficient compression.
- `PUMP_LOCAL_GENESIS_HASH`: required only for a loopback localnet; never a public-chain hash.
- Non-demo operation requires the existing PostgreSQL, treasury and RPC configuration. Both `MODE=devnet` and explicit launch/fee gates are necessary. The adapter checks full genesis, not hostname/cluster labels alone. The full mainnet genesis is rejected even behind a loopback proxy.

Do not enable financial execution on the current demo staging deployment. Stage the compatible main frontend/API release only after the current verified backup, isolated restore/rehearsal, identity audit and approved migration 003 requirements pass. Migration 004 already exists on staging; no migration is applied by this task. Pinata needs a securely configured server-only JWT before real asset preparation can be verified.

Remaining acceptance: real Phantom extension/mobile signing, real Pinata receipts, PostgreSQL-backed attempt/reconnect tests on an approved isolated database copy, public devnet RPC/faucet reliability and environment-specific lookup-table readiness, creator-fee trading/sweep/graduation tests and actual staging deployment/browser checks. Mainnet authorization, production deployment, treasury signing and fee payouts are separate and remain disabled.

Granular one-file commits preserve history. Manifest/lockfile/schema/service dependencies mean intermediate one-file revisions are not claimed to build independently; validation applies to the complete series.

## Staging recheck (18 October 2026)

Read-only Railway checks found zero staging PostgreSQL backups, no nonempty API `PINATA_JWT`, `MODE=demo`, `FEE_ROUTING_VERIFIED=false`, and no `PUMP_LAUNCH_ENABLED` setting. Production has zero deployment triggers. No migration, environment variable, source trigger or deployment was changed.

Staging frontend remains deployment `782235db-f44c-4208-912d-fb00c2290dad` at source SHA `74085709342074c8366f8021bfcbec4ded2cb627`. API remains deployment `5925f299-12f7-41ed-96c3-0f4bcd4e054a`; its manually uploaded artifact has no native Git commit SHA, so no independent SHA attestation is claimed. Both report SUCCESS, but that alone is not new-release acceptance. Sources still point to codex/frontend (web) and staging (API); the main transition remains gated. These Task 3 changes have not been deployed.

## Validation results

- Unit/integration coverage: **316 passed** (web 161, shared 26, world spec 7, server 122); **18 PostgreSQL-dependent tests skipped**. Latest backend run includes preparation-outage retries, private attempts, expiry/submission races and recovery, and stable treasury destinations.
- Browser coverage: **8 passed** — seven Launchpad/auth/signing checks at desktop, tablet and mobile widths, plus legacy Explore quote regression. The signing test uses real Ed25519 transaction signatures from an injected test wallet and mocked RPC; it is not real Phantom or public-chain evidence.
- Real local validator: confirmed creation, exact message binding, metadata, Token-2022 mint owner, fee destination/amount, locked 60/40 routing and duplicate-broadcast protection. Actual signature/state evidence is linked above.
- Workspace typecheck, root/web lint, backend/packages build, frontend build, server image bundle and generated OpenAPI check passed. The optional bigint native binding uses its JavaScript fallback; Vite retains existing bundle-size/dependency-annotation warnings. An isolated SDK bundle also constructed a signed preparation without a node_modules directory.
- All 101 preserved files in the original unfinished workspace matched their recorded hashes. No city geometry, camera, navigation or agent identity source was changed by this task.

The public launch endpoint now withholds unconfirmed execution preparations; the owner-only workspace endpoint restores them. Confirmation additionally compares the complete original compiled message, preserving quote accounts and extra-instruction integrity. These protections are covered separately from the older mock-chain flow.

The no-launch-quota policy is covered by 26 distinct preparations from one authenticated wallet and one saved draft; existing auth/draft/media throttles are retained, while execution uses a shared four-operation bound.
