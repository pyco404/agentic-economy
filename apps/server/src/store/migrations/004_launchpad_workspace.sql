-- Additive workspace only. Requires explicit migration approval before deployment.
-- No changes to persisted city, agents, launches, balances or treasury.
CREATE TABLE launchpad_drafts (
 id uuid PRIMARY KEY, wallet text NOT NULL, version integer NOT NULL DEFAULT 0,
 doc jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz
);
CREATE INDEX launchpad_drafts_owner ON launchpad_drafts(wallet, created_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE launchpad_operations (
 wallet text NOT NULL, key text NOT NULL, kind text NOT NULL, hash text NOT NULL,
 status text NOT NULL CHECK (status IN ('running','done','failed')), result jsonb,
 attempts integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz NOT NULL,
 PRIMARY KEY(wallet,key,kind)
);
CREATE INDEX launchpad_operations_quota ON launchpad_operations(wallet,created_at);
