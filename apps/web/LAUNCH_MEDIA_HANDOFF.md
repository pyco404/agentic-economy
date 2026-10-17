# Launch logo checkpoint and backend handoff

The frontend offers local logo selection, desktop drop, PNG/JPEG/WebP content-signature and browser-decode checks, a 5,000,000-byte limit, preview, replacement/removal, and a refresh reselection hint. Files remain in memory; only draft text and IPFS references may enter tab storage. An injected `LaunchMediaAdapter` supports progress, cancellation, retry, verified results, and metadata preparation keyed to the current details. The default adapter is deliberately unavailable. There are no guessed upload endpoints or browser Pinata credentials.

No real IPFS upload or metadata generation has been demonstrated. Adapter success/failure tests use an isolated browser fixture, never a publicly listed launch. Live signing, token creation, payments and treasury settlement remain disabled. SOL is the existing reviewable draft; USDC awaits a verified contract and AECO remains a future option. The 0.05 SOL fee and existing fee policies are unchanged.

## Claude-owned integration

Publish typed contracts before binding an HTTP implementation:

- Authenticate the existing verified wallet session, authorize draft ownership, enforce request-origin policy and per-wallet/IP upload limits and durable quotas. An upload must not prepare or submit a transaction.
- Either accept a bounded multipart upload server-side or issue a short-lived Pinata public signed URL restricted to exact MIME types and maximum bytes. Never return `PINATA_JWT`; redact signed URLs and credential-bearing provider errors from logs.
- Check byte signatures, decode safely with pixel/memory/time limits, reject invalid content, and preferably re-encode accepted raster files. Browser validation is only early feedback. Signed-URL MIME restrictions alone are insufficient; independently verify the uploaded content before accepting its CID.
- Persist an owner/draft-bound upload record, actual CID, canonical IPFS URI, approved HTTPS gateway URL, verification status, and an idempotency key. Check that retries cannot cause duplicate accepted records. Return the frontend's required information through the shared API schema; the frontend port is not itself a published HTTP contract.
- Build metadata from the latest validated server draft and verified image record. Include the Pump-compatible name, symbol, description and image URL; handle optional fields only when approved. Return metadata CID, canonical IPFS URI, and compatible HTTPS URI. The existing launch schema limits metadata URI length; retain that validation.
- Bind prepared metadata to an immutable input revision/content digest. Changes to name, symbol, description, logo or selected quote invalidate readiness. Quote selection is validated separately; do not invent a Pump metadata quote field or enable unsupported pairs.
- Define safe cancellation, timeout, expired signed URL, authentication expiry, rejected content and provider-error responses. Use durable idempotency/content deduplication. Define orphan cleanup without unpinning content referenced by confirmed launches or other active drafts.
- Keep upload/metadata functionality independently testable in demo mode, with no launch side effects. Recheck image ownership and metadata freshness at final backend review; browser storage is never proof of authorization.

Required backend secret/config names to coordinate: `PINATA_JWT`, `PINATA_GATEWAY`, `LOGO_UPLOAD_MAX_BYTES`, `LOGO_UPLOAD_TIMEOUT_MS`, `LOGO_UPLOAD_RATE_LIMIT`, `LOGO_UPLOAD_QUOTA`; optionally `PINATA_UPLOAD_GROUP_ID`. These are proposed configuration names, not existing deployed variables. Store server secrets in Railway. No frontend `VITE_*` variable may contain a Pinata credential. Claude owns staging CORS/auth origins and the final API configuration. Keep `MODE=demo` and `FEE_ROUTING_VERIFIED=false`.

## Oxude investigation

Read-only review found the most complete AgenticPad implementation at `/home/pikoo/Desktop/Oxude/web`. No files were copied. Its `app/launch/flow.tsx` and `lib/launchpad-server.ts` demonstrate file preview and server image/JSON pinning, but couple uploading to transaction preparation, accept base64 images with MIME/size checks, use a 2 MB limit and SQLite, and encode different financial rules. Adapt the workflow, not its old 0.1 SOL charge, 15/50/35 split, holder eligibility, credentials, deployment assumptions or signing code. The new frontend does not import Oxude.

## Official references reviewed

- [Pinata public file uploads](https://docs.pinata.cloud/files/uploading-files)
- [Pinata constrained presigned URLs](https://docs.pinata.cloud/files/presigned-urls)
- [Pump.fun metadata reference](https://github.com/pump-fun/pump-fun-skills/blob/main/create-coin/references/METADATA.md)

The 5 MB limit is an initial application policy consistent with that metadata guide's example, not a claim of a universal on-chain image-size limit. Provider and protocol requirements must be revalidated when the backend implementation is finalized.
