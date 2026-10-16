import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockChain } from "../src/chain/mock.js";
import { PostgresStore } from "../src/store/postgres.js";
import { idem, launch, login, makeEnv, resetTestSchema } from "./helpers.js";

/**
 * Agent identity against real Postgres: constraints, atomic reservation, concurrency, rollback and restart.
 * Runs only with TEST_DATABASE_URL set to a disposable *_test database (dropped and recreated here).
 */
const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const resetSchema = () => resetTestSchema(url!);

const pgEnv = (chain = new MockChain(), extra: Record<string, string> = {}) =>
  PostgresStore.connect(url!).then((store) => makeEnv({ DATABASE_URL: url!, SNAPSHOT_EVERY_TICKS: "10", ...extra }, { store, chain }));

d("agent identity (postgres)", () => {
  beforeAll(resetSchema);
  afterAll(resetSchema);

  it("enforces one agent per mint and per wallet in the schema, and keeps identity rows append-only", async () => {
    const env = await pgEnv();
    const pool = new pg.Pool({ connectionString: url });
    try {
      const launcher = await login(env.app);
      const { confirm } = await launch(env.app, launcher);
      const communityId = confirm.json().launch.communityId as string;
      const res = await env.app.inject({ method: "POST", url: "/api/v1/agents/activate", headers: { ...launcher.auth, ...idem() }, payload: { communityId, profession: "farmer" } });
      expect(res.statusCode).toBe(201);
      const row = (await pool.query("SELECT * FROM agent_activations")).rows[0];
      expect(row).toMatchObject({ activating_wallet: launcher.wallet, token_mint: confirm.json().launch.mint, display_name: res.json().agent.displayName });

      // A second row for the same mint or wallet is impossible even with direct SQL.
      const inbox = (await pool.query("INSERT INTO sim_command_inbox (command, kind) VALUES ('{}', 'test') RETURNING id")).rows[0].id;
      await pool.query("INSERT INTO agent_names (name, agent_id, kind, inbox_id) VALUES ('Test...Name', 'agt_sqltest001', 'token_linked', $1)", [inbox]);
      const dup = (wallet: string, mint: string) =>
        pool.query(
          `INSERT INTO agent_activations (id, agent_id, community_id, launch_id, token_mint, activating_wallet, display_name, inbox_id)
           VALUES ('act_sqltest001', 'agt_sqltest001', $1, $2, $3, $4, 'Test...Name', $5)`,
          [communityId, row.launch_id, mint, wallet, inbox],
        );
      await expect(dup("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", row.token_mint)).rejects.toThrow(/token_mint/);
      await expect(dup(row.activating_wallet, row.token_mint)).rejects.toThrow(/unique/);

      await expect(pool.query("UPDATE agent_activations SET display_name = 'x'")).rejects.toThrow(/append-only/);
      await expect(pool.query("DELETE FROM agent_activations")).rejects.toThrow(/append-only/);
      await expect(pool.query("DELETE FROM agent_names")).rejects.toThrow(/append-only/);
    } finally {
      await pool.end();
      await env.close();
    }
  });

  it("rolls back the whole reservation when any part fails: no command, no name, no activation", async () => {
    const env = await pgEnv();
    const pool = new pg.Pool({ connectionString: url });
    try {
      const count = async () => (await pool.query("SELECT (SELECT count(*) FROM sim_command_inbox)::int AS i, (SELECT count(*) FROM agent_names)::int AS n, (SELECT count(*) FROM agent_activations)::int AS a")).rows[0];
      const before = await count();
      // The activation references a community that does not exist: the FK fails after the inbox and name inserts.
      await expect(
        env.ctx.runtime.bus.enqueueIdentity(
          "test:rollback",
          {
            kind: "token_linked",
            agentId: "agt_rollback001",
            nameCandidates: ["Roll...back"],
            activation: { id: "act_rollback001", agentId: "agt_rollback001", communityId: "com_missing0001", launchId: "lch_missing0001", tokenMint: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", activatingWallet: "CMYxQ1nC3e7hY1Yt3dF9n7aV2u8kR4pL5sW6xZ9h6Wec" },
          },
          () => ({ type: "agent.update", agentId: "agt_rollback001" }),
        ),
      ).rejects.toThrow(/foreign key/);
      expect(await count()).toEqual(before);

      // The system is still healthy afterwards: a valid activation goes through.
      const launcher = await login(env.app);
      const { confirm } = await launch(env.app, launcher);
      const ok = await env.app.inject({ method: "POST", url: "/api/v1/agents/activate", headers: { ...launcher.auth, ...idem() }, payload: { communityId: confirm.json().launch.communityId, profession: "farmer" } });
      expect(ok.statusCode).toBe(201);
    } finally {
      await pool.end();
      await env.close();
    }
  });

  it("admits exactly one of many concurrent activations across two API processes", async () => {
    // Production topology: one looping simulation process, two API replicas sharing the database.
    const chain = new MockChain();
    const sim = await pgEnv(chain, { ROLE: "sim" });
    sim.ctx.runtime.start();
    const a = await pgEnv(chain, { ROLE: "api" });
    const b = await pgEnv(chain, { ROLE: "api" });
    try {
      const launcher = await login(a.app);
      const { confirm } = await launch(a.app, launcher);
      const communityId = confirm.json().launch.communityId as string;
      const token = launcher.auth; // sessions live in Postgres, so both processes accept it
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          (i % 2 ? a : b).app.inject({ method: "POST", url: "/api/v1/agents/activate", headers: { ...token, ...idem() }, payload: { communityId, profession: "merchant" } }),
        ),
      );
      expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
      for (const r of results.filter((r) => r.statusCode !== 201)) expect(["wallet_already_activated", "activation_in_progress"]).toContain(r.json().error.code);
      const pool = new pg.Pool({ connectionString: url });
      expect((await pool.query("SELECT count(*)::int AS n FROM agent_activations WHERE activating_wallet = $1", [launcher.wallet])).rows[0].n).toBe(1);
      expect((await pool.query("SELECT count(*)::int AS n FROM sim_command_inbox WHERE kind = 'agent.activate' AND wallet = $1", [launcher.wallet])).rows[0].n).toBe(1);
      await pool.end();
    } finally {
      await a.close();
      await b.close();
      await sim.close();
    }
  });

  it("keeps identities, names and the one-per-wallet rule across a restart (snapshot + log replay)", async () => {
    await resetSchema();
    const chain = new MockChain();
    const env1 = await pgEnv(chain);
    const launcher = await login(env1.app);
    const { confirm } = await launch(env1.app, launcher);
    const communityId = confirm.json().launch.communityId as string;
    const token = (await env1.app.inject({ method: "POST", url: "/api/v1/agents/activate", headers: { ...launcher.auth, ...idem() }, payload: { communityId, profession: "merchant" } })).json();
    const houseRes = (await env1.app.inject({ method: "POST", url: "/api/v1/agents/house", headers: { ...launcher.auth, ...idem() }, payload: { communityId, profession: "builder" } })).json();
    // A pre-0.3.0 create still sitting in the queue at upgrade time becomes a legacy agent.
    await env1.ctx.runtime.bus.submit(
      { type: "agent.create", agentId: "agt_legacyq001", ownerWallet: launcher.wallet, communityId, name: "Queued Before Upgrade", profession: "farmer", strategy: token.agent.strategy },
      "test:legacy-queued",
    );
    for (let i = 0; i < 25; i++) await env1.ctx.runtime.sim!.tickOnce();
    const before = Object.fromEntries(env1.ctx.runtime.agentSummaries().map((a) => [a.id, { displayName: a.displayName, identity: a.identity }]));
    await env1.close();

    const env2 = await pgEnv(chain);
    try {
      await env2.ctx.runtime.sim!.tickOnce(); // recovers from the latest snapshot + log
      const after = Object.fromEntries(env2.ctx.runtime.agentSummaries().map((a) => [a.id, { displayName: a.displayName, identity: a.identity }]));
      expect(after).toEqual(before);
      expect(after[token.agent.id]!.identity.kind).toBe("token_linked");
      expect(after[houseRes.agent.id]!.identity.kind).toBe("house");
      expect(after.agt_legacyq001!.identity).toMatchObject({ kind: "legacy", legacyOwnerWallet: launcher.wallet });

      const session = await login(env2.app);
      void session;
      const mine = (await env2.app.inject({ method: "GET", url: "/api/v1/me/activation", headers: launcher.auth })).json();
      expect(mine.activation).toMatchObject({ id: token.activation.id, status: "active" });
      const again = await env2.app.inject({ method: "POST", url: "/api/v1/agents/activate", headers: { ...launcher.auth, ...idem() }, payload: { communityId, profession: "farmer" } });
      expect(again.json().error.code).toBe("wallet_already_activated");
    } finally {
      await env2.close();
    }
  });
});
