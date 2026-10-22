# Approved staging world → production: scoped data-change proposal

**Status: OWNER APPROVED; EXECUTION PENDING.** The owner’s brief section5 requires showing the precise production data change and obtaining approval before execution. The owner explicitly approved the world-only transition and production release in chat. No Mainnet or schema activation is authorized.

## Verified cause

Production frontend/API run `384d54ab093217586a1b95618c54cd0ba96ba912`; staging runs `5fa0507167695df96d57cecd332a45e9422209b2`. Between those deployed releases, world-generator, camera and scenery code are unchanged. Both report generator1, contract0.6.0, 128×128 cells and sixteen32×32 chunks. Fresh browser contexts exclude saved camera and cache differences.

Production’s environment and `world_meta`/snapshots use `aeco-production-genesis` / `world_nondzj`; staging uses `agentic-economy-genesis` / `world_bp71r8`. The wrong seed changes the lake, occupied parcels, building parameters/IDs, warehouse anchor, districts and landscape. Production’s connector planner returnsnull, and railway readiness reports “Riverside warehouse anchor unavailable”; both railways therefore fail closed. Its irregular footprint has406tiles. Staging has the approved 2.6-cell-wide connector with three road crossings, connected Riverside railway, mirrored railway offset2 and442landmass tiles. This is a persisted seed/initialization issue, not an old frontend bundle or delayed loading.

Production simulation already runs at500ms, but has zero registered agents/communities and never ran the demo-only initializer. That initializer also creates mock launches and treasury receipts, so it must not be enabled in production. MODE remainsproduction.

## Exact requested one-time changes

Use the existing `aeco_production` database. No cloning, migration, new Railway environment, nameserver, secret or financial-policy change.

Change only backend `WORLD_SEED`: `aeco-production-genesis` → `agentic-economy-genesis`. A variable-only change is unsafe because startup checks the persisted seed and the old snapshot references different building IDs. While the production simulation/API writer is stopped, apply one guarded transaction:

| Table | Exact change |
| --- | --- |
| `world_meta` | Update only rowid1 `seed` and `world_id`; preserve generator1 and original creation timestamp. |
| `sim_snapshots` | Append one hash-verified transition snapshot generated with the existing approved generator. Keep existing snapshot rows; normal existing snapshot retention subsequently continues. |
| `sim_leader` | Update only rowid1: increment fencing epoch, advance tick monotonically, clear the stopped holder/heartbeat. |
| `sim_view` | Replace only derived cacherowid1 with the same new snapshot/tick/epoch. |
| `sim_command_inbox` | Append12 deterministic, already-applied commands: three simulation-group registrations and nine house-agent creations. |
| `sim_commands` | Append those same12 actual engine-applied commands at the transition tick; do not modify/delete prior log rows. |
| `agent_names` | Insert nine reserved synthetic house names, each tied to its new inbox command. `requested_by=system:synthetic-city`; ownerWallet remainsnull. No activation rights are granted. |

Profile: `approved-genesis-synthetic-v1`.

Reviewed plan SHA-256: **`59b352e2721486008212811dedc095472c189619e556a5f045c26df8a8c0a0bf`**.

Implementation: [guarded operator operation](../apps/server/src/ops/world-alignment.ts), [operator CLI](../apps/server/scripts/align-approved-world.ts). The CLI defaults to printing the public plan; it does not connect to a database unless explicitly told to check/apply. No application startup or HTTP endpoint calls it. Applying requires the exact plan hash, financial gatesoff, matching database/seed, no active simulation writer and a private durable checkpoint. Any changed protected eligibility state causes a stop for review. No append-only trigger is disabled and no table/history is truncated or deleted.

The synthetic groups are Hearth Bakers, Riverside Guild and Stonewright Co. They reuse the existing engine’s normal headquarters, house-agent professions and work behavior. All nine identities are `house`, ownerless and durably name-reserved; none is `token_linked` or `aeco_observed`. They have no mint, launch signature or blockchain ownership claim. Their group metadata lives in existing simulation JSON, not the immutable token-community registry.

Virtual City Credit inventory/tasks restart on the approved layout; no staging balances/earnings are imported. Tick and ID counters advance, rather than rewind. New simulated services start atzero and grow from new engine work. The frontend labels simulation agents/groups/services explicitly and shows synthetic groups separately from real token communities. Existing zero real production token communities/launches remainzero; staging’s three mock tokens and~65,000 historical receipts are not copied. Historical old-world activity rows are retained, but the current world feed is bounded to the transition tick.

## Preserved data and security

Do not write launches, token communities, treasury entries, activations, drafts, workspace operations, auth challenges/sessions or idempotency records. Preserve the two current wallet-owned drafts. New simulation work naturally appends its own simulated actions/receipts after startup; these are not imported financial records or payouts.

Treasury recipients, exact planned official mint/deployer, vanity signing, backend deployer-only policy, 0–3.5% default0Developer Buy, 0.05SOL launch charge and60/40 eligible creator-fee policy are unchanged. Mainnet launch/broadcast/payment/payout and live AECO-holder discovery stayoff. No wallet balance/funding check, private-key access or transaction is involved.

## Backup, rehearsal and release

The private production archive `aeco_production_20261022T201442Z.dump` (SHA-256 `a3a4bc0caf3b18886d593284bf2b2c2835242d21865a41168ca8cfe9a4762459`) was restored into an additional disposable local PostgreSQL18.6 copy named `aeco_world_alignment_20261022_test`, using a private Unix-socket cluster with TCPdisabled. No migration was applied. The original local world, production and legacy databases were untouched.

In that copy, the operation preserved protected-table fingerprints, rejected an active writer and missing approval, rolled back a failed checkpoint, and made an exact second application a no-op. The actual production-mode application served readiness/world APIs, moved all nine agents and completed46new simulated services. Database/application restart preserved all nine identities, three groups and service count. Treasury/launch/token-community rows remainedzero.

Fresh actual-browser local rehearsal matches live staging exactly for all16canonical static chunks (SHA-256 `f781139d505afb3ad50db38fb780f30b2d03f432e0c71cf0bea23f74d2a4c4b3`), lake connector/crossings, both railway reports, complete landmass and scenery/support-district composition. It observed all nine agents moving in184WebSocket movement frames, with no page errors. Folded344 and unfolded690 navigation and synthetic-group cards passed. Production itself has not yet been corrected.

Backend295tests passed/23environment-dependent skips; frontend255passed; builds/typecheck/lint passed. [Audit](evidence/world-consistency-audit-2026-10-22.json), [rehearsal and exact rendered geometry comparisons](evidence/world-consistency-rehearsal-2026-10-22.json). Full-resolution screenshots are in ignored `apps/web/artifacts/world-consistency-20261022/`; `proposed-local-*` files are explicitly rehearsals, not production screenshots.

After approval: take a fresh private production backup/checkpoint, briefly pause only the production API/simulation writer, stage only the corrected seed with deployments suppressed, apply the reviewed transaction, and explicitly deploy the tested frontend/API commit to production. Preserve staging/public-demo and their disabled automatic builds. Verify actual useaeco.xyz chunks, geography/camera-matched screenshots, moving agents, HTTP/WSS, navigation, auth/drafts, security/financial-off gates and responsive layouts before declaring success. No staging promotion cycle or duplicate build is required.

If a precondition changes or deployment verification fails, stop with the private backup and old-world checkpoint preserved; do not wipe data, disable safeguards or improvise another world. Production release authorization never authorizes a financial transaction.

Final targeted verification: 20 passed / 5 environment-dependent skips, including the old-worker/new-seed recovery rejection. Production-mode browser rehearsal observed all nine agents moving, with no runtime errors or public debug labels.
