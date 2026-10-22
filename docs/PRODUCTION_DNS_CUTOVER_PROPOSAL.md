# Official-domain cutover — APPLIED 22 October 2026

The owner explicitly approved this scoped cutover. Public browsing is enabled; Mainnet execution, payments, broadcasting and payouts remain disabled. No nameserver, staging service, database schema or unrelated DNS change was made.

## Applied Railway routing

The three previously unverified public-demo attachments were moved to reviewed production environment `5c4b546b-638f-487c-ad35-845f3d2074d4`. Public-demo instances, database and review endpoints remain intact. Railway issued the exact targets below; old public-demo targets were not reused.

| Vercel DNS name | Type | Exact applied value |
| --- | --- | --- |
| @ | ALIAS | `xaj0luvv.up.railway.app.` |
| www | CNAME | `9h8vju8f.up.railway.app.` |
| _railway-verify.www | TXT | `railway-verify=dec19dba69f2b720d111e35a786ff3c20b8695a9e219b28dcfbedf2a264d3ed4` |
| _railway-verify | TXT | `railway-verify=532758c7cbcceb482591c4ed8c95bf0cf14f33d3226c9054832ea9cde6e8de75` |
| api | CNAME | `53yjusbd.up.railway.app.` |
| _railway-verify.api | TXT | `railway-verify=40ede38f8ed68570be05c53976e950eef5fcff504b9ef6a4f2bad4aa0b5e6c40` |

All six new records use TTL 60. The custom apex ALIAS overrides Vercel's preserved automatic default. Vercel's value-only/type-change PATCH attempts on the automatic record were rejected without changing it; adding the explicit custom ALIAS succeeded. Every preexisting record (including staging, wildcard and CAA) was compared before/after and remained unchanged. [Exact record IDs and rollback evidence](evidence/production-dns-cutover-2026-10-22.json).

## Deployment and HTTPS

One necessary frontend configuration release, `ba11a995-8f60-4595-b8b2-010d340e0262`, runs the approved application SHA `6758f91bd2e8a69c242584133f0e5932b862bf7e` and compiles `https://api.useaeco.xyz` plus `wss://api.useaeco.xyz/api/v1/ws`. No backend deployment was needed; API deployment `04365147-839e-44ec-9a47-0c33bf54db04` remains unchanged. Financial gates and automatic production promotion remain off.

Railway automatically issued trusted certificates for apex, www and API after DNS propagation; normal hostname/trust validation passes with TLS 1.3. [Certificate evidence](evidence/public-domain-tls-2026-10-22.json). Railway’s literal-CNAME check may intermittently flag the flattened apex as requiring an update because an ALIAS resolves directly to A records. Independent authoritative/1.1.1.1/8.8.8.8 lookups all returned the same address as the issued Railway target; valid certificates and real public browser acceptance establish the actual route. Do not replace the functioning ALIAS with an invented fixed IP.

www redirects to apex with status 308, preserving paths and query parameters. Canonical/OG origins use https://useaeco.xyz. [Public release checks](evidence/production-public-release-2026-10-22.json).

## Rollback

Remove only the six newly added record IDs in the evidence to restore the preserved Vercel defaults. The original apex automatic record `rec_dac928a8f5c0464ef0160908` still points to `cname.vercel-dns-017.com.`; no reconstruction is necessary. That original route returned Vercel 404, so rollback restores the prior state rather than another working website. Preserve staging/api-staging, CAA, wildcard, nameservers, databases and all financial gates. The former frontend API/WSS targets were its Railway review API host; a deliberately pinned configuration release would be required to restore those compiled values. No automatic rollback or extra deployment has been triggered.

Production Mainnet activation remains a separate approval after remaining readiness gates pass.
