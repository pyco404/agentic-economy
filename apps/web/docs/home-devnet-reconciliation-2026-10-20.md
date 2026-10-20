# HOME Devnet reconciliation — 20 October 2026

This investigation was read-only against the existing disposable local database and public Solana Devnet. No launch, signature request, transaction submission, payment, database migration, production or Railway configuration change was performed.

## Existing records

Wallet: `3pF1MM1PCg2tekM5KeWEDyT8LVKbVd7ia668NRAnYpAR`.
Draft: `dcb1bbfc-a1ce-40a5-a1c1-3572375209db`, version 5, Homecoin / HOME, SOL quote, 300 basis points Developer Buy. The draft and its pinned artwork/metadata are preserved.

| Attempt | Prepared mint | Saved status | Signature |
| --- | --- | --- | --- |
| `lch_31963308e0804ebe2d4903a6` | `5sUhXHUUcvLWtiUYVhCXbANKjYaRHvyysCpZpj33jUoN` | expired | null |
| `lch_d4a0ff36249a0f998aed8891` | `97XnP56RqF925TgrQTr7pxpixZgYFeADcvb6RTHFi3Gv` | expired | null |

Each history contains draft → awaiting_signature → expired, with no submitted or confirmed transition. The two preparation idempotency operations are done, with one attempt each and different keys. This records successful preparation, not blockchain execution. Neither result contains a submitted transaction signature.

## Authoritative network evidence

Read from `https://api.devnet.solana.com`, finalized commitment. Genesis: `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`.

At 11:24 UTC / 12:24 Lagos, finalized block height was 500354187, beyond both last-valid block heights (500350565 and 500351917). Both mint account lookups returned null; both mint transaction-history queries returned empty. The creator's latest finalized transaction remained the previous DCOIN launch on 19 October. Queries of both SPL Token and Token-2022 accounts found no account for either HOME mint.

Consequently there is no observed successful HOME creation, Developer Buy, HOME receipt, platform charge or failed on-chain transaction/network fee for these attempts. This is an expired/unobserved submission, not evidence of an executed transaction failing. There is no confirmed HOME to recover into Explore. The platform market reader intentionally requires a confirmed launch plus matching community/mint/signature provenance.

The public RPC capture is in ignored local artifact `apps/web/artifacts/home-reconciliation-2026-10-20.json`. No private keys, session cookies or signed transaction payloads are included.

## Failure diagnosis and fixes

The old frontend caught every submission error and replaced it with “Submission response was interrupted.” That hid actual HTTP rejection details. It also cleared submission uncertainty on any successful status GET, even an awaiting-signature result with no saved signature, allowing Approve in wallet to reappear. It did not persist the public wallet signature or uncertainty across refresh.

The fix preserves HTTP status and server error text, records the public returned wallet signature before POST, persists the unresolved-submission marker, and keeps a signed unresolved attempt blocked across polling and refresh. An unsigned server-side expiry alone cannot unblock a locally unresolved signed submission. Status checks remain read-only; no automatic resubmission is introduced. Existing exact-message validation, wallet ownership, fee rules and financial gates remain unchanged.

The original browser's signed bytes and exact failed HTTP response were not retained, so the historical root rejection cannot be recovered from these records. The isolated server's broadcast approval flag also remains false; this is a separate blocker, not proof of the historical failure. Submission persistence precedes the broadcast adapter, and these attempts never recorded that transition.

Do not request another signature as part of this reconciliation. A future acceptance attempt needs explicit authorization for the isolated Devnet broadcaster and a fresh valid blockhash, after reviewing this evidence. Mainnet, payouts and Railway financial settings remain unchanged.

## Validation

Frontend production build and typecheck passed. ESLint passed with two pre-existing ref-cleanup warnings in LaunchWorkspace. Seventeen relevant wallet/autosave unit tests passed. The isolated launch-execution browser regression passed, including rejection details, lost submission response, repeated read-only status checks, refresh persistence, expiry remaining blocked, and recovery of the same mock signature into confirmed state with exactly one submission. These regression tests use mocked chain/Pinata services; they are not a new real Phantom or on-chain acceptance test.

Changes are granular local main commits; no push, deployment or financial-configuration change is part of this reconciliation. Intermediate UI/test revisions are not independently certified; validation applies to the complete change set.
