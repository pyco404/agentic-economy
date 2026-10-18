# Create Coin workflow verification

19 October 2026. The existing Launchpad, authenticated drafts, Pinata adapter and
guarded transaction API are reused. No database migration or contract change.

## User journey

- Name, symbol, description, artwork and actual selected quote update a live card.
  Selected artwork uses revocable browser blob URLs. Editing and saving text drafts
  do not pin images or metadata.
- Create Coin validates details before writes, saves the owned draft, uploads its
  selected image, prepares metadata and opens transaction preparation automatically.
- Progress and upload cancellation remain available. Existing image/metadata
  receipts are reused on retry. The user reviews fees before Approve in wallet.
- Transaction preparation retains its idempotency key across interrupted responses
  and refreshes. An uncertain submission checks the existing attempt; it does not
  automatically make another launch. Authoritative confirmation enables Explore.
- Draft edits are frozen during execution. Editing before signing is explicit.
  A confirmed token offers Create another coin rather than repeating submission.

The atomic 0.05 SOL platform charge, server ownership checks, wallet authorization,
transaction validation and creator-fee policy are unchanged. Images can remain
public if the user cancels after Create Coin; the interface explains this.

## Evidence and limits

Frontend unit tests: 208 passed. Browser fixture suite: eight cases covering
desktop, tablet, mobile, authentication, local preview/no early writes, upload and
metadata failures, wallet rejection, lost preparation/submission responses and
idempotent recovery. Fixture Pinata and RPC are mocked.

[Real public-devnet browser evidence](../../server/docs/evidence/create-coin-devnet-2026-10-19.json)
records actual Pinata image/metadata CIDs, official program execution, PostgreSQL
restart recovery, duplicate submissions, one 50,000,000-lamport test charge and
verified Explore provenance. No asset writes occurred before Create Coin. This
test used an automated Wallet Standard signer, not Phantom.

[Separate genuine desktop Phantom result](../../server/docs/evidence/pump-phantom-devnet-2026-10-19.json)
was user-completed and independently verified finalized. It precedes the new button
sequence; physical-device Phantom acceptance of this UI remains outstanding.

Typecheck, lint and production build pass. Existing bundle-size/native-bigint
warnings remain. Staging retains MODE=demo and disables financial execution and
coin creation; it supports preview and text drafts without uploading artwork.
The dedicated localhost devnet preview supports the complete test flow.

SOL is the supported application quote. USDC protocol harness verification does
not enable its application selector; AECO remains future-phase. No mainnet launch,
real charge, payout, production change or new migration is authorized by this work.
