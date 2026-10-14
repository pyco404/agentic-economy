-- Multi-process coordination (ROLE=api|sim|indexer|all).
--
-- * Exactly one simulation writer: the holder of a session-level advisory lock, fenced by sim_leader.epoch.
--   Every tick commits in one transaction ON THE LOCK-HOLDING CONNECTION and asserts the epoch, so a
--   process that lost its lock (connection gone) or was superseded cannot write.
-- * API processes never touch the engine: commands go into sim_command_inbox; the leader moves them into
--   the append-only sim_commands log inside the tick transaction that applies them.
-- * stream_events is the durable, sequenced WebSocket stream (pg_notify only carries "new seq" hints).
-- * sim_view is the latest published state for API read replicas (UNLOGGED: a cache, rebuilt by the leader).

CREATE TABLE sim_leader (
  id           int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  epoch        bigint NOT NULL DEFAULT 0,
  holder       text,
  acquired_at  timestamptz,
  heartbeat_at timestamptz,
  last_tick    bigint NOT NULL DEFAULT 0
);
INSERT INTO sim_leader (id) VALUES (1);

CREATE TABLE sim_command_inbox (
  id           bigserial PRIMARY KEY,
  dedupe_key   text UNIQUE,
  command      text NOT NULL,
  -- denormalised for cheap pending-agent counts (per-wallet caps)
  wallet       text,
  community_id text,
  kind         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  applied_seq  bigint,
  applied_tick bigint
);
CREATE INDEX sim_command_inbox_pending ON sim_command_inbox (id) WHERE applied_seq IS NULL;

CREATE TABLE stream_events (
  seq        bigserial PRIMARY KEY,
  -- deterministic per producer (e.g. "sim:<tick>:<n>") so re-running a tick after failover inserts nothing
  key        text UNIQUE NOT NULL,
  type       text NOT NULL,
  tick       bigint NOT NULL,
  payload    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stream_events_created ON stream_events (created_at);

CREATE UNLOGGED TABLE sim_view (
  id         int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tick       bigint NOT NULL,
  epoch      bigint NOT NULL,
  state_gz   bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Lease bookkeeping for non-sim singletons (indexer); the advisory lock is authoritative, this row is for observability/fencing.
CREATE TABLE service_leases (
  name         text PRIMARY KEY,
  epoch        bigint NOT NULL DEFAULT 0,
  holder       text,
  acquired_at  timestamptz,
  heartbeat_at timestamptz
);
