# Production preparation — 22 October 2026

## Completed under the explicit database-only approval

Created `aeco_production` in the existing Railway production environment, on a new independent volume `7d78e336-4efc-4935-9a54-04caa6f7afeb`, with its own generated private database credential. Read-only checks confirmed the exact database name and zero public tables before migration. Reviewed and applied only existing 001–004, atomically; all four published checksums match. Launches and treasury entries remain empty. A 52,616-byte private local baseline archive is stored outside the active worktree in a Git-ignored backup directory (0700/0600 permissions). Its table-of-contents was validated with matching PostgreSQL 18 tools; no actual restoration is claimed. Staging and public-demo databases were not modified.

[Sanitized database evidence](evidence/production-database-2026-10-22.json). Database deployment `691c3d26-ab6d-43d4-b8f3-86fef0a05a17` is SUCCESS. Production application/API health cannot yet be checked because no application instance has been deployed.

## Concrete application action awaiting direct approval

Automatic approval review rejected deploying the production applications, creating temporary Railway review endpoints, and copying staging provider variables as outside the database-only approval. No rejected action was applied. This is an approval boundary, not an application build failure.

The prepared action is:

- Deploy the already tested frontend/API from main application commit `6758f91bd2e8a69c242584133f0e5932b862bf7e`, one pinned release per service, using the existing Dockerfiles. Automatic production promotion remains off.
- Connect the backend only to the new private `aeco_production` database. Enforce an exact 001–004 filename/checksum allowlist before the normal migration command, so future migrations require a new approval.
- Use the [reviewed production configuration](../infra/railway/env/production-readonly.env.example): official treasury addresses; SOL only; finalized registration; `MAINNET_LAUNCH_APPROVED=false`, `PUMP_LAUNCH_ENABLED=false`, `FEE_ROUTING_VERIFIED=false`. No treasury signer or payout worker.
- Create temporary Railway-generated HTTPS service endpoints for API/browser review. Do not move existing custom-domain attachments or change DNS.
- Provider options: with explicit approval, privately reuse the existing Agentic Economy backend-only `PINATA_JWT` and replacement `HELIUS_API_KEY` in the new production backend, never the frontend. This expands the existing credentials to another backend environment; Pinata rotation remains pending. Alternatively deploy without these keys, then install dedicated production values securely. No Gamine credential is used and no value is printed or committed.
- Verify exact deployed SHAs, database identity/health, all financial gates, origins/cookies, clean routes, API/WSS and responsive rendering before presenting a DNS cutover proposal. Mainnet activation remains separately blocked.

## Recurring infrastructure costs

No subscription upgrade was made. The new database adds measured RAM/CPU and persistent-volume usage to the existing Railway workspace. The proposed additional frontend/API add their own measured compute and outbound traffic. Current container rates: RAM $10/GB/month, CPU $20/vCPU/month, volume $0.15/GB/month and egress $0.05/GB. These are usage rates, not a fixed monthly quote; no reliable steady-state total exists before observing the services. Existing Pro subscription/included usage is workspace-wide, not a new Pro subscription per environment. [Railway pricing](https://docs.railway.com/pricing/plans).

Production restore rehearsal, provider credential maintenance, real-origin DNS/certificate acceptance and external Mainnet security review remain open. The public-demo database will never be used as real production launch storage. Physical mobile on-chain acceptance remains deferred; do not request another mobile signature.
