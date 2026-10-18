# Local development and staging cinematic reveal parity

Investigated 18 October 2026. The shared animation was already correct on main.
The local frontend process was running from the preserved codex/frontend worktree,
not from main. No animation redesign or scene-generation change was necessary.

## Actual cause

The process listening on localhost:5173 had working directory
`/home/pikoo/Desktop/agentic-economy/apps/web`. Its served
`/src/world/reveal.ts` contained the old implementation: duration 0.45 seconds,
all static entries made visible together on readiness, a no-op `begin`, and a
slow-render `accelerate()` path. That interval activated ambient objects; it did
not animate static city chunks. The old City also called that acceleration path
when an initial render exceeded 80 ms.

Main's shared `CityReveal` instead uses a 2.6-second world-space shader mask.
It compiles the completed static scene behind the loader and starts its
presentation clock after that first render. It includes instanced and merged
outer geometry. It has no slow-frame shortcut that completes the reveal.

Both checkouts enable React StrictMode. Running main under Vite development
produced the expected animation with StrictMode enabled; production preview and
staging did too. Reduced motion was explicitly disabled for normal recordings.
The verified cause was different source/runtime checkouts, not a new Vite,
StrictMode, saved-camera, cache or network-speed defect.

## Local runtime correction

Only the stale frontend process was replaced. Main is checked out at
`/home/pikoo/Desktop/agentic-economy/.backups/cinematic-main`; new development
and commits remain on main. The 101 modified/untracked files in the original
worktree were fingerprinted and preserved unchanged.

A separate compatibility problem was then identified: the existing local API at
8787 reports contract 0.2.0 and omits required 0.3.x agent displayName/identity
fields. The new frontend could prepare its world, but dashboard schema validation
correctly failed. Identities were not fabricated and validation was not weakened.

With the user's explicit selection, a separate main API now runs at port 8795
using **memory storage**, demo mode, an explicitly empty DATABASE_URL, and disabled
financial execution. The main frontend's ignored `.env.local` selects that API
and its WebSocket endpoint. The old PostgreSQL API at 8787 remains running with
its original persisted state. No database or migration was changed.

To restart the current local setup, use two terminals in the main checkout:

```bash
MODE=demo ROLE=all DATABASE_URL= PORT=8795 FEE_ROUTING_VERIFIED=false \
PUMP_LAUNCH_ENABLED=false AUTH_URI=http://localhost:5173 \
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 pnpm dev:server
```

```bash
VITE_API_URL=http://localhost:8795 VITE_WS_URL=ws://localhost:8795/api/v1/ws \
pnpm --filter @agentic-economy/web dev
```

Open http://localhost:5173/. The isolated demo resets when its memory API stops;
this does not reset either persisted local or staging world.

## Readiness and verification

Browser-only diagnostics sampled requestAnimationFrame and existing scene dataset
signals. They recorded coreReady, outerTerrainReady, railwaysReady, waterwaysReady,
STATIC_WORLD_READY, revealStarted and revealFinished. No production logging or
arbitrary loading delay was introduced. The three screenshot checkpoints are
observations of the running shared mask, not separate geometry generation stages.

For every normal sequence checked:

- All five preparation milestones preceded revealStarted.
- Intermediate reveal progress was observed across multiple animation frames.
- Geometry-build counts stayed constant throughout presentation, and sceneryReady
  was true before and throughout it. No delayed structural jobs were introduced.
- The final irregular landmass and both railway diagnostics were retained.
- Closing a page overlay retained the completed canvas and did not replay reveal.
- Reduced motion retained full structural readiness and skipped cinematic movement.

The existing shader uses a shared spatial mask: low ground finishes by progress
0.20 and raised infrastructure, buildings and scenery by 0.99. There are no new
independent layer timers. Preparation timestamps and real screenshots/video are
the evidence; mesh visible counts alone are not claimed as pixel coverage.

Recordings, matching-view screenshots, per-frame observations, source comparison,
world-data comparison and validation logs are preserved locally in
`.backups/reveal-parity-20261018/`. Browser capture instrumentation lives only in
that ignored evidence directory, outside shipped code.

## World data is separate from animation

Read-only snapshots confirmed both persisted environments use the same seed and
world ID, but separate running APIs/state:

| Source at inspection | Contract | Agents | Buildings | Communities | Storage |
|---|---|---:|---:|---:|---|
| Existing local API 8787 | 0.2.0 | 15 | 410 | 9 | PostgreSQL |
| Railway staging API | 0.3.1 | 9 | 404 | 3 | PostgreSQL |

Those existing counts were not synchronized or overwritten. The user-approved
main API at 8795 has its own temporary seeded demo state. Its counters are not a
copy of either database. Neither world counts nor backend ticks control reveal
progress.

No world rendering, geometry, camera control, production configuration, economic
rules or database migrations were modified for this correction.

## Final measured results

All recordings use fresh browser contexts and the same native-GPU setup/DPR 0.5.
Desktop comparisons use a 1440 × 1000 viewport; mobile is 390 × 844 and tablet
820 × 1180. These are browser viewports, not physical-device performance claims.

| Runtime | Measured reveal interval |
|---|---:|
| Main Vite development, desktop | 2.700 s |
| Main Vite development, mobile | 2.701 s |
| Main Vite development, tablet | 2.711 s |
| Local production preview, desktop | 2.728 s |
| Railway staging, desktop | 2.809 s |

Preparation time is separate from that interval. Normal desktop refresh replayed
on a fresh initialization; page-overlay navigation did not. Reduced-motion refresh
also completed behind the same readiness barrier without intermediate animation.
One desktop screenshot attempt was interrupted by Playwright waiting for external
fonts; the rerun bypassed only that screenshot font-wait. Page loading, shaders,
readiness, animation timing and rendering were unchanged.

Validation passed: workspace typecheck, workspace lint, frontend production build,
11 reveal/readiness/worker-fallback unit tests, and the real browser captures with
readiness-order, progress, geometry-stability and navigation assertions. Browser
instrumentation remains outside the shipped application. No rendering fix was
pushed because main already contained the correct implementation; repository
changes document the runtime correction and repeatable local commands.
