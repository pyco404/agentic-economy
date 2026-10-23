-- PROPOSAL ONLY. Outside the startup migration directory intentionally.
-- Requires separate approval before applying to production. No existing table changes.
CREATE TABLE token_market_trades (
 network text NOT NULL, mint text NOT NULL, signature text NOT NULL, event_index integer NOT NULL CHECK(event_index>=0),
 slot bigint NOT NULL, block_time timestamptz NOT NULL, side text NOT NULL CHECK(side IN ('buy','sell')),
 quote_raw numeric(40,0) NOT NULL CHECK(quote_raw>=0), doc jsonb NOT NULL,
 PRIMARY KEY(network,mint,signature,event_index)
);
CREATE INDEX token_market_trades_window ON token_market_trades(network,mint,block_time);
CREATE TABLE token_market_cursors (
 network text NOT NULL, mint text NOT NULL, address text NOT NULL, doc jsonb NOT NULL,
 PRIMARY KEY(network,mint,address)
);
