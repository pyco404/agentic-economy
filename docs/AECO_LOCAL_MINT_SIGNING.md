# Prepared $AECO mint — operator-local co-signing workflow

Preparation only. Mainnet execution is OFF. Do not run the signing command until the owner approves the official parameters and exact transaction. The owner's existing mint keypair has not been opened, copied, uploaded, displayed or tested. It is never used for disposable Devnet tests.

## Implementation and trust boundary

The fixed public mint is `ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco`; deployer `3pF1MM1PCg2tekM5KeWEDyT8LVKbVd7ia668NRAnYpAR`. The existing 0.05 SOL platform recipient and 60/40 creator-fee recipients are unchanged.

Inspected Gamine's `web/lib/launchpad-server.ts` (`mintFor`, prepare/recovery) and `web/lib/pump-transaction.ts` (`compileLaunch`). Reuse its mint-first / Phantom-second partial-signature model and exact-message recovery, not its server-side vanity secret environment variable, different fee shares or automatic reservation release. Agentic Economy keeps signing material local to the owner's machine.

`buildUnsignedPumpLaunch` now constructs the same atomic instructions from public keys alone. Existing `buildPumpLaunch` retains key/public-key validation and produces the same partially signed bytes. It does not enable a new launch route. `offline-mint.ts` rebuilds the supplied public review with the existing SDK, verifies fixed mint/deployer/recipients and two signers, checks message bytes/hash and rejects already-signed inputs. Co-signing supplies only the mint signature; Phantom remains the fee payer and must separately sign.

The operator CLI `apps/server/scripts/offline-mint-sign.ts` has no RPC or broadcast operations. Inspection needs only a public review artifact. Explicit `--sign` is required before it opens a private, owner-readable keypair outside Git repositories. Secret bytes are never written to its output or error messages. Temporary byte buffers are cleared best-effort; JavaScript/OS memory erasure is not guaranteed. Use a trusted operator machine and disconnect its network during signing.

A private local journal pins mint, launch ID and message hash before signing. Its original reservation stays immutable; an append-only renewal chain accepts only an explicitly approved successor of the current hash on the same attempt/mint. Exact retries are idempotent; forks, stale predecessors, another attempt and concurrent signers are blocked. A crash lock or failed signing never silently frees the mint. The tool never regenerates a mint and cannot replace a blockhash or prepare a second attempt. Do not delete the journal to bypass recovery.

## Public review artifact

The strict version-1 `MintSigningReview` schema is in `src/chain/offline-mint.ts`. It includes canonical mint/deployer/treasury public keys, metadata strings, SOL transaction bytes, recent blockhash, last-valid height, independently reviewed message SHA-256, maximum-debit claim and public lookup snapshots. Optional Developer Buy uses exact bigint amount/cap plus the reviewed public Global account bytes, keeping the existing 3.5% validation. Never include a private key or RPC credential.

Offline checks do **not** prove the supplied network, simulation/debit claim, lookup snapshot or blockhash freshness. Solana messages do not contain a chain ID. At the owner-initiated launch stage, the online production workflow must independently attest Mainnet genesis/programs, real lookup-table contents, mint absence, actual transaction simulation, supply/decimals and costs before approval; repeat those checks before Phantom signing/submission. A displayed maximum-debit claim is not a substitute for actual simulation and approved instruction effects.

## Owner-operated procedure after approval

1. Reserve the exact official mint and a single server-owned draft/attempt for the verified deployer. Independently review parameters, artwork/metadata, Mainnet genesis/programs, lookup table, simulation and full debit ceiling. Approve the exact message hash outside the supplied artifact.
2. Export only the public, server-persisted unsigned review. On the trusted local machine, inspect it without a key:

   ```bash
   cd /home/pikoo/Desktop/agentic-economy/.backups/cinematic-main/apps/server
   node --import tsx --conditions=@agentic-economy/source scripts/offline-mint-sign.ts \
     --review /path/to/approved-public-review.json
   ```

3. Only the owner runs the following **after the specific official-launch approval**, with their local file path and approved message hash. No private bytes are pasted into the command or website:

   ```bash
   node --import tsx --conditions=@agentic-economy/source scripts/offline-mint-sign.ts \
     --review /path/to/approved-public-review.json \
     --sign --keypair /private/outside-git/aeco-mint.json \
     --state-dir /private/outside-git/aeco-signing-state \
     --approved-message-sha256 APPROVED_MESSAGE_SHA256 \
     --out /private/outside-git/aeco-mint-signature.json
   ```

4. Return only the public mint-signed transaction artifact to the same authenticated production attempt. Verify its message exactly matches the server-persisted unsigned transaction and its mint signature is valid; do not mutate the message to add the signature. Recheck network/blockhash/costs. Phantom separately signs the unchanged message as deployer on useaeco.xyz.
5. Persist both signatures and the transaction **before** broadcast. Existing execution then verifies both signatures, exact bytes, authenticated deployer and all independent financial gates. Reconcile finalized mint, fee, supply, metadata, Developer Buy if approved, Explore and creator-fee configuration. Uncertain status means read-only reconciliation, never another mint, signature request or payment.

## Deployed integration and remaining execution gates

The integration deployed at application `5fa0507` uses the existing wallet-owned Create Coin draft and review screen. There is no separate $AECO wizard. The owner enters all content and chooses any Developer Buy from 0% to 3.5%, inclusive, in 0.01% increments. All drafts, including $AECO, default to 0% and restore only user-entered data. No special mint policy restricts or preselects an allocation.

`PUMP_PREPARED_MINT_DRAFT_ID` is an optional backend-only operator binding to the owner's existing draft UUID, not a private key and not a field ordinary requests can choose. No live value has been set. Initial Mainnet preparation fails closed without that binding. With it, only the official deployer and bound draft can prepare the exact official mint; the unsigned builder receives no secret and generates no replacement keypair. Other Devnet/non-Mainnet launches retain their normal mint generation.

The original public review is persisted in the existing launch JSON document, protected by the existing unique mint constraint. Cookie-authenticated `GET /api/v1/launchpad/launches/:launchId/mint-review` exports it. `POST .../mint-signature` accepts only a small public signature artifact, checks the exact persisted message/hash, valid mint signature, absent payer signature, owner/network/height/mint absence and current reservation. Duplicate imports do not create attempts or transactions. The original unsigned template stays unchanged. The browser rejects keypair-shaped files before any request; Phantom receives only the validated mint-signed message and signs separately.

Developer Buy reviews pin only Global-allowed protocol fee/buyback recipients. This avoids the SDK's random recipient selection changing the rebuilt message; amounts and 60/40 human fee shares are unchanged. Ordinary launch construction retains its existing selection behavior.

Normal and cached draft preparation, legacy preparation, submit and resume cannot bypass the current reservation. No alternate body field substitutes a mint. Configuration changes block further signing/broadcast while read-only reconciliation remains available. Expired official attempts have no automatic new-attempt CTA or mint release. The unique mint record and local journal preserve the original reservation even after failure/restart.

**Execution remains locked.** Review preparation and expiry renewal are independent of signature import, Phantom approval and broadcast authority. Only the authenticated official deployer and operator-bound draft can build the reserved unsigned review while financial gates remain off. No live binding is installed during infrastructure preparation. No official artifact was signed or imported; the official key remains untouched.

When an unsigned review expires, use **Refresh signing review** on the existing attempt. The backend requires matching genesis, finalized height beyond the previous window, finalized mint absence, empty mint transaction history and no saved signed payload or unresolved signature. RPC uncertainty blocks renewal. It preserves the attempt, mint, previous review and history, and uses compare-and-swap to collapse concurrent renewals. It re-quotes/simulates the same draft and user-selected allocation; changed costs require a fresh review. It never broadcasts or silently releases a mint.

Download the new public review. After reviewing and approving its new message hash, the owner uses the same signing command with the additional explicit `--renew-from-message-sha256 PREVIOUS_MESSAGE_SHA256` shown in the review. The tool verifies that predecessor and the new approved hash before opening the key. Old mint-signature artifacts cannot sign the replacement message. Do not delete a journal or a crash lock to force a retry: stop the signer, inspect the intact journal and reconcile the saved attempt and finalized on-chain state before any operator lock recovery. A partial journal stays blocked for manual investigation.

[Backup restoration](evidence/production-backup-restoration-2026-10-22.json) and [review/signed-receipt persistence across PostgreSQL restart](evidence/mint-review-persistence-2026-10-22.json) passed against isolated copies. These are infrastructure/recovery checks, not official Mainnet transaction acceptance. The owner initiates the eventual launch using their own metadata and selected allocation; refresh simulation, exact costs and wallet balance only then. The intentionally unfunded wallet is not an infrastructure blocker. Mainnet financial flags and live holder discovery stay off.

The owner removed the intermediate Mainnet test-token requirement. After the disposable Devnet signing rehearsal, production handoff and security checks pass, propose the direct official $AECO launch for explicit final approval. The owner supplies artwork/metadata and chooses the allocation in the existing form. Supply, decimals, tokenomics and the specific Mainnet debit still require final review; an allocation selection is not transaction approval. Launching and indexer activation are separate: keep `AECO_MINT_VERIFIED=false` and Common Agent discovery off until finalized official launch/provenance is independently accepted. Then observe this same mint, creating one Common Agent per qualifying wallet without login; do not confuse that mapping with token-linked activation rights.
