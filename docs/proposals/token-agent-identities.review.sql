-- REVIEW ONLY. Not authorized for deployment; intentionally outside the automatic migration directory.
-- Candidate additive identity/activation separation. Execute transactionally only after approved
-- backup restoration, copied-data rehearsal, compatibility rollout and explicit migration approval.
-- Existing activated agents retain their IDs; no launch, wallet, name or financial row is changed.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM agent_activations a
    JOIN communities c ON c.id = a.community_id
    JOIN launches l ON l.id = a.launch_id
    WHERE c.mint <> a.token_mint OR c.launch_id <> a.launch_id OR l.mint <> a.token_mint
  ) THEN
    RAISE EXCEPTION 'Activation provenance mismatch: stop for investigation';
  END IF;
END $$;

-- No wallet column: token identity is not a wallet permission or an activation.
-- Community and launch are resolved through the existing unique communities.mint relationship.
-- This registry deliberately excludes automatic AECO holder identities.
CREATE TABLE token_agent_identities (
  agent_id text PRIMARY KEY,
  token_mint text UNIQUE NOT NULL REFERENCES communities (mint),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, token_mint)
);

INSERT INTO token_agent_identities (agent_id, token_mint, created_at)
SELECT agent_id, token_mint, requested_at FROM agent_activations;

-- Prevent activation from pointing an existing identity at a different token.
ALTER TABLE agent_activations
  ADD CONSTRAINT agent_activations_token_identity_fk
  FOREIGN KEY (agent_id, token_mint)
  REFERENCES token_agent_identities (agent_id, token_mint);

CREATE TRIGGER token_agent_identities_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON token_agent_identities
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- KEEP agent_activations.activating_wallet UNIQUE, all existing constraints and append-only triggers.
-- Other verified launches require a separately coordinated, idempotent application backfill; do not
-- infer finality or activating authority from generic launch/community existence in this SQL.
