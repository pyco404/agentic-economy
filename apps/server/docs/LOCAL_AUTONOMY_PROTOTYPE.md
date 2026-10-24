# Phase 3 milestone 1: local five-resident prototype

This is a **mock inference architecture demonstration**, not an LLM intelligence claim.
It does not connect to production, Solana RPC, Pinata, paid models, or treasury services.
No production migration or deployment is needed or authorized.

## Run locally

From the main worktree, use two terminals:

```sh
pnpm --filter @agentic-economy/server exec tsx --conditions=@agentic-economy/source scripts/local-autonomy.ts /tmp/aeco-autonomy-m1
```

```sh
VITE_DATA_MODE=api VITE_API_URL=http://127.0.0.1:8831 VITE_WS_URL=ws://127.0.0.1:8831/api/v1/ws pnpm --filter @agentic-economy/web exec vite --host 127.0.0.1 --port 5186 --strictPort
```

The current review session uses `/tmp/aeco-autonomy-m1-review`; use that same directory when restarting it.

Open <http://127.0.0.1:5186/>. Both servers bind to loopback. Do not expose this demo through a tunnel.
The runner constructs its configuration from explicit literals; it never loads `.env` or production configuration.

The cohort replays five **existing canonical resident identities** from the approved world-alignment commands:

| ID | Name |
| --- | --- |
| agt_synthetic1 | Juniper_101 |
| agt_synthetic2 | Rye_102 |
| agt_synthetic3 | Ember_103 |
| agt_synthetic4 | Reed_104 |
| agt_synthetic5 | Clover_105 |

These are local reproductions of existing identities, not connections to production agent records.
The other four canonical residents continue their existing rule-based work. Common Agent indexing and
production records are untouched. `SOCIAL_SIMULATION_ENABLED` remains false.

Watch the **City activity** feed; click a story to focus the camera. Click an agent or a speech bubble
(or focus its button and press Enter) to inspect preferences, current goal, recent moments and relationships.
Speech and gestures are projections of server events. Plans, acceptance, physical arrival and completed
meetings are recorded separately. A shared goal remains active until both participants arrive and stay through the bounded conversation; arrival alone does not complete it. No payment or reward follows a social arrangement.

## Persistence and recovery

The dedicated directory holds a private `checkpoint.json` and a process lock. Atomic file replacement,
file/directory fsync and snapshot hashes protect the local checkpoint. It stores the existing snapshot +
command replay data, the latest 300 activity events and latest 1,000 agent actions. Each profile retains
12 memories and 12 relationships; social history retains 96 moments and invitations are capped at 24.

Stop with Ctrl+C and rerun using the **same directory** to restore the same world, IDs, goals and memories.
After an abrupt exit, the runner removes a stale lock only after its recorded PID no longer exists.
A corrupt checkpoint causes startup to fail; it is never silently replaced with a new world.
`/tmp` can be cleared by the operating system, so this is local rehearsal storage, not a production backup.

The memory adapter publishes within the current process and checkpoints after a tick. A process failure
can roll back an uncheckpointed local tick; clients must reload on restart. This is not a substitute for
production PostgreSQL's fenced atomic tick/stream commit.

## Lifecycle and limits

`AutonomousWorker` takes a cloned, deeply frozen observation and calls only `MockModelProvider`.
One request is in flight at a time; a pending per-agent sequence prevents repeated inference before its
command applies. Deadlines abort cooperative providers and late results after shutdown are discarded.
Accepted and rejected proposals become durable replay inputs. Replay never invokes inference.

The engine independently validates schema, cohort, sequence/revision, observation age, current availability,
recipient identity, reachable approved venue and conversation proximity. Model output cannot supply commands,
SQL, HTTP tools, wallet permissions or financial actions. Unknown fields are rejected and displayed speech is
bounded plain text. Accepted invitations complete only after both agents actually arrive.

`LOCAL_AUTONOMY_ENABLED` defaults OFF and fails closed outside loopback demo/localnet, memory storage,
with the global social switch and financial execution OFF. The prototype does not start from ordinary main.ts;
only this explicit runner instantiates the worker. Do not enable it in Railway.

The mock grammar is deliberately predictable. Goals/preferences are bounded and persisted, not learned.
Only confirmed server events enter memory; model claims cannot establish outcomes. This milestone does not
provide semantic retrieval, production inference accounting, comprehensive LLM content moderation or OS-level
sandboxing. A future provider receives data only; an interface alone cannot sandbox malicious provider code.

## Verification

```sh
pnpm --filter @agentic-economy/server exec vitest run test/autonomy.test.ts test/autonomy-persistence.test.ts
pnpm --filter @agentic-economy/web exec playwright test --config playwright.autonomy.config.ts
```

The browser checks expect the two local servers above. They block non-loopback page requests.
Restart tests use separate Node processes and dedicated disposable `/tmp` checkpoints.

Before real inference: approve a provider/model and budget; measure action quality and billable token usage;
add durable cost reservations/accounting; validate provider output caps, refusal/rate-limit behavior, content
safety and prompt injection; repeat recovery/performance tests. Any production schema change or activation
requires separate approval. No paid API fallback is present in milestone 1.

## Milestone 1 verification (24 October 2026)

- Backend regression run: 407 passed, 28 existing conditional/deferred skips.
- Final focused autonomy/restart run: 24 passed; legacy society/Common Agent compatibility run: 44 passed before the final memory-follow-up test was added. Counts overlap and should not be added together.
- Relevant frontend identity, speech and activity tests: 21 passed.
- Browser: 3 passed at 1440, 390 and 690 CSS pixels, including real mouse/touch hit testing, keyboard activation, shared events, participant isolation, profile memories and no horizontal overflow.
- Workspace typecheck, lint, frontend/backend production builds and guarded server bundle passed. Existing Zod annotation/chunk-size warnings remain.
- Pure local 300-tick sample: mean 1.90 ms, p95 8.84 ms, maximum 24.27 ms. This measures engine work under local load, not provider latency, browser FPS or a hardware acceptance guarantee.
- Snapshot + command replay and separate-process restart reproduced the exact state hash; malformed checkpoints fail closed.
- No production deployment, production data/schema changes, secret access, paid inference or blockchain transactions.

Browser validation uncovered a decorative district label intercepting speech clicks. Its pointer interception was removed; speech bubbles share the label layer and remain below primary city controls.
