-- Agentic Economy backend schema v1.
-- Ledger-like tables are append-only (enforced by trigger). Launch fees are platform-only (CHECK).

CREATE TABLE world_meta (
  id                int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  world_id          text NOT NULL,
  seed              text NOT NULL,
  generator_version int  NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sim_snapshots (
  tick       bigint PRIMARY KEY,
  -- text, not jsonb: jsonb reorders object keys, which would change iteration order and break deterministic replay.
  state      text   NOT NULL,
  state_hash text   NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sim_commands (
  seq        bigint PRIMARY KEY,
  tick       bigint NOT NULL,
  -- text, not jsonb: replay must reproduce the exact object key order (see sim_snapshots).
  command    text   NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sim_commands_tick ON sim_commands (tick);

CREATE TABLE events (
  seq          bigserial PRIMARY KEY,
  id           text UNIQUE NOT NULL,
  tick         bigint NOT NULL,
  type         text NOT NULL,
  summary      text NOT NULL,
  agent_id     text,
  building_id  text,
  community_id text,
  data         jsonb NOT NULL,
  at           timestamptz NOT NULL
);

CREATE TABLE agent_actions (
  seq      bigserial PRIMARY KEY,
  id       text UNIQUE NOT NULL,
  agent_id text NOT NULL,
  tick     bigint NOT NULL,
  doc      jsonb NOT NULL
);
CREATE INDEX agent_actions_agent ON agent_actions (agent_id, seq DESC);

CREATE TABLE task_receipts (
  seq       bigserial PRIMARY KEY,
  id        text UNIQUE NOT NULL,
  task_id   text UNIQUE NOT NULL,
  agent_id  text NOT NULL,
  hash      text UNIQUE NOT NULL,
  prev_hash text NOT NULL,
  doc       jsonb NOT NULL
);

CREATE TABLE reward_records (
  seq      bigserial PRIMARY KEY,
  id       text UNIQUE NOT NULL,
  epoch    int  NOT NULL,
  agent_id text NOT NULL,
  doc      jsonb NOT NULL
);

CREATE TABLE auth_challenges (
  nonce      text PRIMARY KEY,
  wallet     text NOT NULL,
  message    text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  wallet     text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_keys (
  key          text NOT NULL,
  wallet       text NOT NULL,
  route        text NOT NULL,
  request_hash text NOT NULL,
  status       int  NOT NULL,
  body         jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, wallet, route)
);

CREATE TABLE launches (
  id              text PRIMARY KEY,
  status          text NOT NULL,
  launcher_wallet text NOT NULL,
  mint            text UNIQUE NOT NULL,
  signature       text UNIQUE,
  doc             jsonb NOT NULL,
  version         int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX launches_launcher ON launches (launcher_wallet);

CREATE TABLE communities (
  seq           bigserial UNIQUE,
  id            text PRIMARY KEY,
  mint          text UNIQUE NOT NULL,
  launch_id     text UNIQUE NOT NULL REFERENCES launches (id),
  doc           jsonb NOT NULL,
  registered_at timestamptz NOT NULL
);

CREATE TABLE treasury_entries (
  seq               bigserial PRIMARY KEY,
  id                text UNIQUE NOT NULL,
  stream            text NOT NULL CHECK (stream IN ('launch_fee', 'creator_fee')),
  account           text NOT NULL CHECK (account IN ('platform', 'agent_rewards')),
  signature         text NOT NULL,
  instruction_index int  NOT NULL,
  finality          text NOT NULL CHECK (finality IN ('pending', 'finalized', 'reversed')),
  supersedes        text REFERENCES treasury_entries (id),
  doc               jsonb NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (signature, instruction_index, account, stream, finality),
  -- The 0.05 SOL launch charge belongs 100% to the platform; it never enters the 60/40 split.
  CONSTRAINT launch_fee_platform_only CHECK (stream <> 'launch_fee' OR account = 'platform')
);

CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;

-- Statement-level so they also fire on zero-row statements and TRUNCATE.
CREATE TRIGGER treasury_entries_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON treasury_entries FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER task_receipts_append_only    BEFORE UPDATE OR DELETE OR TRUNCATE ON task_receipts    FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER sim_commands_append_only     BEFORE UPDATE OR DELETE OR TRUNCATE ON sim_commands     FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER communities_immutable        BEFORE UPDATE OR DELETE OR TRUNCATE ON communities      FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
