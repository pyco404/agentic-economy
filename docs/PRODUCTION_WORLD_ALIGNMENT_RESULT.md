# Production world alignment — verified 22 October 2026

https://useaeco.xyz now reproduces the approved staging geography. Production frontend and API both run `a9dc15584ea3ff4d83c4a2bb608e44809b67c99e`.

The cause was the persisted production seed `aeco-production-genesis`, rather than staging’s `agentic-economy-genesis`. World, camera and scenery code were identical between the previous deployments. The different seed changed parcels, terrain and the warehouse anchor: the lake connector was absent and both railways correctly refused an unsupported layout. Browser caching was not the cause.

After explicit owner approval, a guarded transaction installed the approved deterministic world and initialized nine ownerless house agents in three clearly labeled synthetic groups. It updated only the approved seven simulation/world tables and backend WORLD_SEED. No staging database or financial records were copied. Production remains isolated in `aeco_production`, with unchanged migrations 001–004. The two original wallet drafts and all protected-table fingerprints matched immediately after the transition; a final read-only check also confirmed the drafts remained unchanged after browser verification.

Production deployments:

- Frontend `323069f4-0509-4672-a345-b4197d20c0dc`.
- Backend `70a4ec19-b292-4810-9aee-aef5d46d58e0`.
- Served JavaScript `/assets/index-C_M-9HiF.js`, SHA256 `d65fed6c4feaf486e81793424f9e54b4d905969804fd64a6e9ce7752453fe07a`.

Actual-domain verification:

- All 16 canonical static chunks exactly match the staging reference, including terrain, elevations, props and building geometry.
- Lake connector and all three crossings, Riverside railway, mirrored railway, 442-tile irregular landmass, outer districts and scenery reports match between fresh production/staging browser contexts.
- Screenshots use identical 1440×1000 viewport, DPR1, rendering settings, Reset camera and five Zoom out actions. Default and unobstructed whole-world screenshots were captured on both domains.
- All nine production agents moved, observed across 110 agent-movement WebSocket frames. Actual new simulated services accrued. Old staging service history was not imported.
- Complete static-world readiness, including outer terrain, waterways and railways, precedes reveal start on both domains. Rendering timings are software-WebGL measurements, not a hardware performance guarantee.
- Public routes/direct loading, correct www redirect, Back/Forward without canvas remount, origin-bound authentication, secure HttpOnly/Strict host-only session cookie, refresh restoration and native production WSS passed. Authentication used an automated disposable message signer; no new physical Phantom acceptance is claimed.
- Desktop, tablet, mobile, folded344px and unfolded690px layouts passed without horizontal overflow. Folded/unfolded hamburger navigation passed. No JavaScript runtime errors or public debug/status labels were found.
- API/database readiness passed. Ordinary authenticated wallets receive403 at all seven tested launch/recovery/signature endpoints. Mainnet execution remains disabled.

Relevant validation: backend full suite295passed/23environment-dependent skips; frontend255passed; shared34passed; final backend simulation/recovery subset20passed/5skipped, including the additional old-worker/new-seed guard. Build, typecheck and lint passed. The isolated PostgreSQL rehearsal verified restart persistence, idempotent second application, active-writer rejection, protected data preservation and rollback on checkpoint failure.

Intentional differences: production has three synthetic simulation groups, zero real token communities/launches, and its own newly accrued simulated services. Staging’s mock tokens, historical counts, agents’ exact names/positions, credits and financial records remain separate. No fictional AECO holders are created. Official mint, deployer, treasury recipients, vanity signing, Developer Buy policy and launch permissions are unchanged. No Mainnet transaction or payout was signed or broadcast.

A fresh private backup (`aeco_production_pre_world_20261022T211242Z.dump`, SHA256 `9d70da38cea4c392375ee13fc72b08bcb050eb9bb66d728b3e892fe7d64905c9`) and old-world checkpoint are retained outside Git. The PostgreSQL18 backup/restore path was independently rehearsed; this new archive also passed format/list and protected-row consistency checks. A rollback must preserve the new world seed/snapshot compatibility; do not restore production blindly or restart an old worker against different geometry.

Screenshots are retained locally under `apps/web/artifacts/world-consistency-20261022/`: `production-after-*` and `staging-after-*`. Artifacts/private backups are deliberately excluded from Git. Machine-readable verification is in [production evidence](evidence/world-consistency-production-2026-10-22.json). Staging remains on5fa0507; public-demo was not changed or deleted. Production repository auto-deploy triggers remain absent. Documentation-only evidence commits do not require another application build.

No remaining blocker was found for this world-consistency correction. Broader Phase2 financial activation and deferred physical mobile on-chain acceptance are not completed by this release.
