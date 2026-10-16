# Riverside underground railway — verification and staging handoff

Verified 2026-10-16 (Africa/Lagos), reusing the published northern bypass, portal geometry, terrain cuts and elapsed-time train state machine. No building, parcel, road, canal, agent identity or backend simulation was moved or changed for this verification.

## Working service

The existing forward loop travels through the northern Riverside corridor, stops at the new northern through-platform, descends west into `(-40.75,-7)`, remains fully covered for 120 seconds, emerges at `(214.75,1)`, and returns along the visible corridor. All three train units use the same continuous arc-length path with fixed spacing. Covered visibility is per carriage; static rails, bridge, cuttings and portals remain visible throughout. The approximately 298.55-second overall period includes surface travel and a station stop.

The original depot scenery is preserved. The loop serves the northern through-platform, not the blocked original depot platform. This is an environmental railway; no passenger, delivery or financial events are invented. Existing terrain and parcel identities remain authoritative. New obstructing parcels/scenery cause route validation to fail closed rather than drawing through them.

Live and fixture validation reports no detected route/works conflicts, maximum grade about 4.17% (limit 4.5%), and minimum cover above the tunnel roof about 0.302 units. Generated building volumes, parcel footprints, paving, scenery, approaches, supports and water/bridge clearance are checked. Current backend contracts do not describe underground foundation/reservation volumes; this is not a claim about unavailable subsurface data.

## Browser proof

The complete 52-case Chrome suite exercised the real local demo backend and PostgreSQL. All railway cases passed:

- Persisted building/entrance dimensions unchanged; existing bridge and water clearances retained.
- Every transition rendered, static infrastructure remained visible, and repeated accelerated forward loops retained the same canvas/socket without backend writes.
- Per-carriage disappearance and emergence followed the covered path, preserving identity, order and spacing.
- An unaccelerated hidden-interval test measured **120.698 seconds**, then automatic emergence and three visible units.
- Mobile navigation retained the active service clock and route rather than recreating the scene.

A separate native-resolution browser capture now demonstrates one uninterrupted journey from visible western approach through entry, fully hidden travel, progressive eastern emergence and continued visible travel. It seeks once before the approach, then uses rate **1** with no subsequent time updates. The observed fully hidden interval was **120.294 seconds**. Production's configured hidden duration remains exactly **120 seconds**, independent of backend ticks; the review clock is development-only.

Reproduce against the local running demo API/frontend:

```bash
cd apps/web
node scripts/capture-underground-rail.mjs --real-cycle
```

Outputs are ignored review material:

- `artifacts/underground-live-cycle.json`: full wall-time/state samples and screenshot ledger.
- `artifacts/underground-live-cycle-*.png`: actual sequential approach, entry, empty portal, emergence and surface frames.
- `artifacts/underground-real-time-cycle.json`: automated unaccelerated interval witness.
- `artifacts/underground-full-city-both-portals.png`: full railway composition.
- `artifacts/underground-visual-review.json`: frozen close-up geometry/visibility inspection.

The capture script's 116–130-second wall-time tolerance accounts for sampled browser frames and screenshot overhead; it does not alter the 120-second service constant. Actual observed values above are narrower. Developer review hooks are not a production API and never write economic data.

## Full validation and checkpoint integrity

Build, strict typecheck, lint and **93 unit tests in 25 files** passed. The complete browser run had **50 passes and two stale UI-test failures**. The failures concerned a building explorer already left open after selection and the intentionally hidden mobile activity controls. Those test setups were corrected, and **both failed cases passed the focused rerun**. This is coverage across the complete run plus reruns, not a claim that the original run was clean.

Remote `codex/frontend` was fetched and independently checked using `git ls-remote`: the published checkpoint was `13a9d8a470ffb61649243ea8af1cf607ebe24735`, identical to local HEAD before the follow-up fixes. All 149 checkpoint commits after `80166de` contain exactly one file. Follow-up test/tooling/documentation changes retain the one-file-per-commit rule.

No reset, clean, stash, branch switch or published-history rewrite was used. Existing `contracts/integration-notes.md` changes were preserved byte-for-byte and remain outside frontend commits. Screenshots, benchmark output, Playwright output, build output, dependencies and `note.txt` remain ignored.

## Staging readiness

See `STAGING_PROPOSAL.md` for the concrete proposal and Claude handoff. Read-only checks of the user-supplied `https://agentic-economy-staging.up.railway.app` backend returned successful readiness/health/bootstrap/stats and a public WSS join snapshot. The backend reported demo mode, PostgreSQL, a running simulation and financial features disabled.

No frontend public domain is invented or configured. No deployment, Railway settings, Dockerfile, Caddyfile, CORS setting, authentication integration or financial feature was changed. Frontend-origin selection and Claude's CORS/auth confirmation remain pending before deployment configuration is implemented.
