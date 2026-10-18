import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashState } from "../src/sim/engine.js";
import { PostgresStore } from "../src/store/postgres.js";
import { MockChain } from "../src/chain/mock.js";
import { launch, login, makeEnv, idem, killSimLeaderBackend } from "./helpers.js";
import { resetTestSchema } from "./helpers.js";

/**
 * Runs only when TEST_DATABASE_URL points at a disposable database, e.g.
 *   TEST_DATABASE_URL=postgres:///agentic_economy_test?host=/var/run/postgresql
 * The schema is dropped and recreated for every run.
 */
const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const resetSchema = () => resetTestSchema(url!);

d("postgres store", () => {
  beforeAll(resetSchema);
  afterAll(resetSchema);

  it("runs the full launch flow transactionally and enforces append-only / platform-only rules", async () => {
    const env = await makeEnv({ DATABASE_URL: url! }, { store: await PostgresStore.connect(url!) });
    try {
      const user = await login(env.app);
      const { confirm, launchId, signature } = await launch(env.app, user);
      expect(confirm.json().launch.status).toBe("confirmed");
      const again = await env.app.inject({ method: "POST", url: "/api/v1/launches/confirm", headers: user.auth, payload: { launchId, signature } });
      expect(again.json().launch.communityId).toBe(confirm.json().launch.communityId);
      expect((await env.ctx.store.allTreasuryEntries()).filter((e) => e.launchId === launchId)).toHaveLength(1);

      const failed = await launch(env.app, user, "tx_failed");
      expect(failed.confirm.json().launch.status).toBe("failed");

      const pool = new pg.Pool({ connectionString: url });
      await expect(pool.query("UPDATE treasury_entries SET doc = '{}'")).rejects.toThrow(/append-only/);
      await expect(pool.query("DELETE FROM task_receipts")).rejects.toThrow(/append-only/);
      await expect(pool.query("UPDATE communities SET doc = '{}'")).rejects.toThrow(/append-only/);
      await expect(
        pool.query("INSERT INTO treasury_entries (id, stream, account, signature, instruction_index, finality, doc) VALUES ('tre_bad', 'launch_fee', 'agent_rewards', 'x', 0, 'finalized', '{}')"),
      ).rejects.toThrow(/launch_fee_platform_only/);
      await pool.end();

      // Idempotency keys survive in Postgres.
      const headers = { ...user.auth, ...idem() };
      const a = await env.app.inject({ method: "POST", url: "/api/v1/launches/prepare", headers, payload: { draft: { name: "PG", symbol: "PG", metadataUri: "https://example.invalid/pg.json" } } });
      const b = await env.app.inject({ method: "POST", url: "/api/v1/launches/prepare", headers, payload: { draft: { name: "PG", symbol: "PG", metadataUri: "https://example.invalid/pg.json" } } });
      expect(b.json().launch.id).toBe(a.json().launch.id);
    } finally {
      await env.close();
    }
  });

  it("recovers the exact simulation state after a crash (snapshot + command-log replay)", async () => {
    await resetSchema();
    const chain = new MockChain();
    const env1 = await makeEnv({ DATABASE_URL: url!, SNAPSHOT_EVERY_TICKS: "20" }, { store: await PostgresStore.connect(url!), chain });
    const user = await login(env1.app);
    const { confirm } = await launch(env1.app, user);
    const communityId = confirm.json().launch.communityId;
    for (let i = 0; i < 25; i++) await env1.ctx.runtime.tickOnce();
    const activated = await env1.app.inject({ method: "POST", url: "/api/v1/agents/activate", headers: { ...user.auth, ...idem() }, payload: { communityId, profession: "logistics_operator" } });
    const crashAgentId = activated.json().agent.id as string;
    for (let i = 0; i < 12; i++) await env1.ctx.runtime.tickOnce();
    const tickAtCrash = env1.ctx.runtime.tick;
    const hashAtCrash = hashState(env1.ctx.runtime.state);
    // Crash: no final snapshot; the leader's database session dies with the process.
    await killSimLeaderBackend(url!);
    await env1.app.close();
    await env1.ctx.store.close();

    const env2 = await makeEnv({ DATABASE_URL: url!, SNAPSHOT_EVERY_TICKS: "20" }, { store: await PostgresStore.connect(url!), chain });
    try {
      const rt = env2.ctx.runtime;
      expect(rt.tick).toBeLessThanOrEqual(tickAtCrash);
      for (let i = 0; rt.tick < tickAtCrash && i < 500; i++) await rt.tickOnce();
      expect(hashState(rt.state)).toBe(hashAtCrash);
      expect(rt.state.agents[crashAgentId]?.identity.kind).toBe("token_linked");
      // Replayed events were de-duplicated, not double-inserted.
      const pool = new pg.Pool({ connectionString: url });
      const dupes = await pool.query("SELECT id FROM events GROUP BY id HAVING count(*) > 1");
      expect(dupes.rowCount).toBe(0);
      await pool.end();
    } finally {
      await env2.close();
    }
  });

  it("refuses to start against a world persisted with a different seed", async () => {
    await expect(makeEnv({ DATABASE_URL: url!, WORLD_SEED: "some-other-seed" }, { store: await PostgresStore.connect(url!) })).rejects.toThrow(/refusing to start/);
  });
});
