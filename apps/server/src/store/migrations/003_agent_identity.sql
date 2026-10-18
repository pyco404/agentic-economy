-- Agent identity and activation (contract 0.3.0). Additive only: no existing table or row changes.
--
-- * agent_names: every display name reserved by the API (house agents and token-linked agents), one
--   uniqueness domain. Legacy agents (created before 0.3.0) are named by the simulation in a disjoint
--   format (Word_NNNN vs house Word_NNN, wallet-shaped for token-linked) and are not rows here.
-- * agent_activations: one immutable row per token-linked agent. The UNIQUE constraints ARE the product
--   rules: one agent per token mint, one agent per activating wallet, one activation per agent.
-- Rows are reserved in the same transaction as the agent's create command (sim_command_inbox), so the
-- application can never observe one without the other. Both tables are append-only.

CREATE TABLE agent_names (
  name         text PRIMARY KEY,
  agent_id     text UNIQUE NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('house', 'token_linked')),
  -- house agents only: the authenticated caller, kept for quotas and audit. Never an owner.
  requested_by text,
  inbox_id     bigint UNIQUE NOT NULL REFERENCES sim_command_inbox (id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT requested_by_only_for_house CHECK ((kind = 'house') = (requested_by IS NOT NULL))
);
CREATE INDEX agent_names_requested_by ON agent_names (requested_by) WHERE kind = 'house';

CREATE TABLE agent_activations (
  id                text PRIMARY KEY,
  agent_id          text UNIQUE NOT NULL REFERENCES agent_names (agent_id),
  community_id      text NOT NULL REFERENCES communities (id),
  launch_id         text NOT NULL REFERENCES launches (id),
  token_mint        text UNIQUE NOT NULL REFERENCES communities (mint),
  activating_wallet text UNIQUE NOT NULL,
  display_name      text UNIQUE NOT NULL REFERENCES agent_names (name),
  inbox_id          bigint UNIQUE NOT NULL REFERENCES sim_command_inbox (id),
  requested_at      timestamptz NOT NULL DEFAULT now()
);

-- forbid_mutation() is defined in 001_init.sql.
CREATE TRIGGER agent_names_append_only       BEFORE UPDATE OR DELETE OR TRUNCATE ON agent_names       FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER agent_activations_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON agent_activations FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
