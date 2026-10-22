# Helius rotation verification — 22 October 2026

## Current result

**The replacement Helius key is active and verified on the running Railway staging backend.** The owner installed it directly; no staging script was needed or rerun, and no key was overwritten by this audit.

The deployment `0d2694c5-007d-4119-a404-489b842d7e0d`, source commit `5c07f3a8baccbeac4f589ab668cdea63f2601eed`, completed after the earlier queued status. A private runtime/configuration comparison confirmed the running Helius value matches Railway's saved value. Pinata and PostgreSQL values also match and were not rotated.

Read-only verification with the configured replacement:

- Correct Mainnet and Devnet genesis and finalized slot reads.
- Both official Mainnet treasury balance reads succeeded, matching the live read-only Treasury API.
- The exact Explore transport retrieved the existing controlled Devnet token's curve and TOKEN/SOL pairing without another provider masking failure.
- Helius DAS returned the token's name/symbol and an indexed token-account scan. Coverage was incomplete, so an exact holder count remains unavailable; two scanned accounts are not presented as two verified holders.
- No Helius credential is configured in frontend variables; no separate Helius URL was found in either audited staging service. Exact installed provider/database credentials were absent from both the normal and temporary mobile frontend bundles.
- Live API/database readiness, demo simulation and WebSocket snapshot/heartbeat passed. Mainnet execution and payouts remain disabled.

[Public provider evidence](evidence/helius-readonly-2026-10-22.json) contains only public addresses, slots, observed values and source attribution. No key, credential URL or fingerprint is published. [Read-only backend verification source](../../tools/security/verify-helius-readonly.mts) performs no wallet signing, transaction submission, database write or configuration mutation.

The previous key can now be revoked for these audited staging consumers. This is not an inventory of unknown external applications using the same provider account; no provider key was revoked automatically.

## Separate release and maintenance status

The newer application release `365ab4124b8a3fb2c904b59598029f9252b0f791` was pushed normally to main and automatically queued for both services. Its queue is separate from the already completed key-install deployment. No duplicate manual deployment was triggered.

Pinata remains on its existing V3 integration and backend-only `PINATA_JWT`, on the user's Free account. Actual staging image/metadata uploads and HTTP 200 retrieval passed; rotation remains pending maintenance. No subscription upgrade was requested. PostgreSQL credentials were not changed; a backup is listed but isolated restoration has not been rehearsed. Migrations 001–004 match and none is pending.

Physical Phantom mobile acceptance remains pending. The owner has now nominated the dedicated Samsung Galaxy Z Fold6 Devnet wallet; restricted setup and later explicit transaction approval are tracked in the [current Phase 2 checklist](../PHASE2_STATUS.md). Desktop ZAP Developer Buy and actual Devnet earned SOL fee collection remain verified. See the [Phase 2 review](../../apps/server/docs/phase2-review-2026-10-22.md) for the earlier checkpoint and other evidence; its pending-Helius row predates this successful deployment.

## Future rotations

Use Railway's staging backend Variables panel to replace only `HELIUS_API_KEY`. Keep it out of frontend variables, Git, terminal command arguments, logs and chat. Inspect any separately configured RPC URLs for embedded credentials privately. Retain the previous key until a successful deployment, private runtime-value comparison, direct provider reads and live API/monitor checks pass. Do not modify financial settings, database credentials or production as part of a provider-key replacement.
