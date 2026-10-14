# Agentic Economy — WebSocket Event Contract (protocol v1)

**Owner:** backend (Claude Code). **Contract version:** 0.2.0 (protocol `v` unchanged: 1).
**Schemas:** `packages/shared/src/events.ts` (Zod) and the `*Event` components in `contracts/openapi.yaml`.
**Samples:** `packages/shared/fixtures/ws-events.json` (one real message of each streamed type).

## Endpoint

```
GET ws(s)://<host>/api/v1/ws        (same origin/port as the HTTP API, default http://localhost:8787)
```

No authentication: the stream carries public city data only. Client messages are limited to 16 KiB.

## Envelope (server → client)

Every server message:

```jsonc
{ "v": 1, "type": "agent.moved", "seq": 1042, "tick": 377, "ts": "2026-10-14T12:00:00.000Z", "data": { /* per type */ } }
```

| Field | Meaning |
|---|---|
| `v` | Protocol version. Breaking changes bump it; clients should ignore unknown `type`s. |
| `seq` | Global, strictly increasing sequence of the **durable** event stream (stored in Postgres, shared by all API replicas, survives restarts). **Gaps are normal**: your chunk subscription filters messages out, and aborted writes can skip numbers. They are not data loss. |
| `tick` | Simulation tick the message describes. `TICK_MS` (default 500 ms) per tick; `ticksPerDay` in `/world/bootstrap`. |
| `ts` | Server wall-clock time of emission. |

`world.snapshot`, `system.heartbeat` and `system.notice` sent to one client do **not** consume a seq. They carry the current `seq`, meaning "state as of this seq".

## Server events

| type | When | `data` |
|---|---|---|
| `world.snapshot` | On connect (`reason: "join"`), after `subscribe` (`"subscription_changed"`), on `resume` when the gap is no longer retained (`"resume_gap"`) or the client is ahead of the stream (`"server_restart"`). If no simulation state exists yet, a `system.notice` `state_unavailable` is sent instead; retry shortly. | `mode`, `worldId`, `seed`, `reason`, `subscribedChunks` (null = all), `agents` (AgentSummary[] in view), `quotes`, `chunkVersions[{coord, version}]` |
| `world.chunk.updated` | Buildings in the chunk changed (stock, condition, status, HQ placed). Batched, at most once per chunk every 10 ticks. Filtered by subscription. | `chunk` (full WorldChunk) |
| `agent.moved` | Agents whose cell or activity changed this tick. One batched message per tick, filtered by subscription. | `moves[{id, pos, state, target, speed}]` |
| `agent.action` | Every validated (or rejected) agent action, including the planner's reason and utility. Not filtered. | `action` (AgentAction) |
| `activity.created` | Every persisted public economic event (feed/ticker). | `event` (EconomicEvent) |
| `economy.price_updated` | Any simulated price changed (evaluated every 10 ticks). | `quotes` (MarketQuote[]) |
| `community.updated` | A community's HQ, agents or verified work changed. Produced by the simulation, at most once per community per tick. | `community` (with live stats) |
| `treasury.updated` | A real (or, in demo mode, mock-chain) treasury receipt was appended: launch fee, creator-fee distribution, finalization or reversal. **Never estimates.** | `entry` (TreasuryEntry) |
| `system.notice` | Incidents, maintenance, or `bad_message` replies to malformed client messages. | `level`, `code`, `message` |
| `system.heartbeat` | Every 15 s. | `simRunning`: some simulation leader committed a tick in the last 10 s (cluster-wide) |

### Positions and interpolation

- `pos` is in terrain-cell units, at the cell centre (`x + 0.5`, `y + 0.5`). +x is east, +y is south.
- Agents move along road, bridge and plaza cells at `speed` cells per tick (2). Interpolate between consecutive `agent.moved` positions over `tickMs`. An agent missing from a tick's batch did not move.
- `target` is the agent's current destination cell, or null.

## Client → server messages

```jsonc
{ "v": 1, "type": "subscribe", "chunks": [{ "cx": 1, "cy": 2 }] }   // ≤ 64 chunks; null = everything
{ "v": 1, "type": "resume", "lastSeq": 1042 }                        // after reconnect
{ "v": 1, "type": "ping", "nonce": "abc" }                           // → { v:1, type:"pong", nonce, ts }
```

## Recommended client lifecycle

1. `GET /api/v1/world/bootstrap`, then `GET /api/v1/world/chunks?x=&y=&radius=` for visible chunks (the Genesis district is 4×4 chunks of 32 cells).
2. Connect, then wait for the `world.snapshot` (`join`). Seed agent positions from `data.agents`.
3. Send `subscribe` with the visible chunks whenever the camera's chunk set changes. Each change triggers a fresh snapshot.
4. Track the highest `seq` received. On disconnect, reconnect with exponential backoff (1 s → 30 s), to any API replica, then send `resume { lastSeq }`:
   - events still retained (`STREAM_RETENTION_MINUTES`, default 60 min, and at most 2,000 behind): missed events are replayed in order from the durable stream;
   - otherwise: a `world.snapshot` with `resume_gap`. `server_restart` means you hold a seq the server has never issued (e.g. a database reset). Replace local agent state, and re-fetch chunks whose `chunkVersions` changed.
5. Treat 45 s without any message (heartbeats arrive every 15 s) as a dead connection.
6. Close code **1013** means you fell behind (more than 2 MiB buffered). Reconnect and resume.

## Versioning

- Additive fields or new event types: minor contract bump, no `v` change. Clients must ignore unknown fields and types.
- Renames, removals or semantic changes: `v` bump and a new path (`/api/v2/ws`), with the old version served during migration.
- Every change is recorded in `contracts/integration-notes.md`.

## Changelog
- **0.2.0:** the stream is durable (Postgres-backed). `seq` is global across API replicas and restarts; `resume` replays from storage for the retention window. `community.updated` is emitted. Heartbeat `simRunning` is cluster-wide. New `system.notice` code `state_unavailable`.
- **0.1.0:** initial protocol.
