# Official-domain cutover proposal — NOT APPLIED

## Reviewed destination

Production environment `5c4b546b-638f-487c-ad35-845f3d2074d4`, isolated database `aeco_production`, frontend/API approved release `6758f91`. [Successful deployment and limitations](PRODUCTION_PREPARATION.md). All financial gates stay off. This proposal changes public website routing only, not Mainnet authorization.

Root and www currently reach Vercel's missing deployment. Vercel supports apex ALIAS flattening, so the address bar can retain `useaeco.xyz` without changing nameservers or adding a reverse proxy. Existing frontend configuration redirects www to the apex.

## Exact changes requiring owner approval

1. Move only the unused public-demo Railway custom-domain attachments for `useaeco.xyz`, `www.useaeco.xyz` and `api.useaeco.xyz` to the reviewed production frontend/API. Railway may require deleting/recreating those three attachments. Preserve public-demo services, review endpoints and database.
2. Obtain fresh exact production CNAME/ALIAS targets and verification TXT records from Railway after attachment. They cannot be invented or inferred from the service review URLs. The earlier public-demo DNS proposal must not be used for production.
3. Update only the apex ALIAS, add explicit www/API CNAMEs and the Railway-required verification TXT records. Preserve all staging/api-staging CNAME/TXT, CAA, unrelated wildcard records and nameservers.
4. Change production frontend API/WSS configuration to `https://api.useaeco.xyz` and `wss://api.useaeco.xyz/api/v1/ws`, with one deliberately pinned deployment of the approved application commit. Do not enable automatic promotion or financial execution.

Current apex ALIAS record `rec_dac928a8f5c0464ef0160908` points to `cname.vercel-dns-017.com.` (TTL 60); retain this exact rollback value. Preserve wildcard record `rec_643ead9f68b946736d6024fa`, staging record `rec_9df50a050a70358ee06b5653`, and api-staging record `rec_ef1948c70369049036603d9a`.

## Order and acceptance

Publish API ownership/DNS first and verify its real HTTPS certificate. Then deploy the frontend targeting that official API. Verify real-origin secure sessions before pointing apex/www to production. After cutover, check root/www redirects and certificates, all direct routes and refreshes, wallet-message authentication and session restoration, CORS, WebSockets and desktop/mobile rendering. No transaction approval or broadcast is part of this test.

Keep the exact recorded previous DNS values for rollback; remove only newly created records if rollback is required. Record every provider-issued target and verification record after approval, without exposing API credentials. Leave staging intact and verify it remains available.

**Awaiting explicit domain-attachment/DNS cutover approval.** Application deployment and backend-key reuse approval does not authorize this cutover. Production financial activation requires a further separate approval after its remaining gates pass.
