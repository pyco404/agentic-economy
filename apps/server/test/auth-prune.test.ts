import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AuthPruner } from "../src/services/auth-pruner.js";
import { hashToken } from "../src/services/auth.js";
import { PostgresStore } from "../src/store/postgres.js";
import type { Store } from "../src/store/types.js";
import { login, makeEnv, newWallet, resetTestSchema, type TestEnv } from "./helpers.js";

const url = process.env.TEST_DATABASE_URL;
const HOUR = 3_600_000;
const config = { enabled: true, graceSeconds: 86_400, batch: 3, maxBatches: 2, intervalSeconds: 900 };
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

/** Seeds challenges/sessions around the grace boundary; returns the keys that must survive and those that must go. */
async function seed(store: Store) {
  const wallet = newWallet().wallet;
  const keep = { challenges: [] as string[], sessions: [] as string[] }, drop = { challenges: [] as string[], sessions: [] as string[] };
  const challenge = async (nonce: string, expiresAt: string, list: string[]) => { await store.createChallenge({ nonce, wallet, message: "m", expiresAt }); list.push(nonce); };
  const session = async (tokenHash: string, expiresAt: string, list: string[]) => { await store.createSession({ tokenHash, wallet, expiresAt }); list.push(tokenHash); };
  for (let i = 0; i < 4; i++) await challenge(`old-${i}`, at(-48 * HOUR - i), drop.challenges);
  await challenge("recently-expired", at(-1 * HOUR), keep.challenges); // within the grace period
  await challenge("active", at(5 * 60_000), keep.challenges);
  for (let i = 0; i < 3; i++) await session(`old-session-${i}`, at(-30 * HOUR - i), drop.sessions);
  await session("recently-expired-session", at(-2 * HOUR), keep.sessions);
  await session("active-session", at(12 * HOUR), keep.sessions);
  return { wallet, keep, drop };
}

function suite(name: string, open: () => Promise<TestEnv>, reset?: () => Promise<void>) {
  describe(name, () => {
    let env: TestEnv | undefined;
    beforeAll(async () => { await reset?.(); });
    afterEach(async () => { await env?.close(); env = undefined; await reset?.(); });
    afterAll(async () => { await reset?.(); });

    it("removes only rows expired beyond the grace period, in bounded batches, idempotently", async () => {
      env = await open();
      const store = env.ctx.store, { wallet, keep } = await seed(store);
      const live = await login(env.app);
      const pruner = new AuthPruner(store, config);
      // 4 old challenges + 3 old sessions, batch 3, at most 2 batches: 4 challenges and 3 sessions.
      const first = await pruner.runOnce();
      expect(first).toMatchObject({ challenges: 4, sessions: 3 });
      expect(await pruner.runOnce()).toEqual({ challenges: 0, sessions: 0, batches: 1, complete: true });
      // The grace window and active rows are untouched; the real session still authenticates.
      expect(await store.consumeChallenge("active", wallet, new Date())).not.toBeNull();
      expect(await store.getSession("active-session", new Date())).not.toBeNull();
      expect(await store.getSession(hashToken(live.token), new Date())).not.toBeNull();
      // A pruned challenge cannot be replayed.
      expect(await store.consumeChallenge("old-0", wallet, new Date())).toBeNull();
      // Exactly the kept rows remain (plus the live sign-in's consumed challenge and session): count them by
      // pruning with a cutoff far in the future, which is safe now that the assertions above are done.
      expect(await store.pruneExpiredAuth(new Date(Date.now() + 365 * 24 * HOUR), 1000)).toEqual({ challenges: keep.challenges.length + 1, sessions: keep.sessions.length + 1 });
    });

    it("caps a run at maxBatches and finishes on the next run", async () => {
      env = await open();
      const store = env.ctx.store, wallet = newWallet().wallet;
      for (let i = 0; i < 8; i++) await store.createChallenge({ nonce: `bulk-${i}`, wallet, message: "m", expiresAt: at(-72 * HOUR) });
      const pruner = new AuthPruner(store, config);
      expect(await pruner.runOnce()).toEqual({ challenges: 6, sessions: 0, batches: 2, complete: false });
      expect(await pruner.runOnce()).toEqual({ challenges: 2, sessions: 0, batches: 1, complete: true });
    });

    it("is safe under concurrent pruners and concurrent sign-ins", async () => {
      env = await open();
      const store = env.ctx.store, wallet = newWallet().wallet;
      for (let i = 0; i < 40; i++) await store.createChallenge({ nonce: `race-${i}`, wallet, message: "m", expiresAt: at(-30 * HOUR) });
      for (let i = 0; i < 40; i++) await store.createSession({ tokenHash: `race-session-${i}`, wallet, expiresAt: at(-30 * HOUR) });
      const wide = { ...config, batch: 5, maxBatches: 100 };
      const pruners = Array.from({ length: 4 }, () => new AuthPruner(store, wide));
      const [runs, logins] = await Promise.all([
        Promise.all(pruners.map((p) => p.runOnce())),
        Promise.all(Array.from({ length: 5 }, () => login(env!.app))),
      ]);
      // Every expired row is deleted exactly once across pruners; no sign-in is disturbed.
      expect(runs.reduce((n, r) => n + r.challenges, 0)).toBe(40);
      expect(runs.reduce((n, r) => n + r.sessions, 0)).toBe(40);
      for (const l of logins) expect(await store.getSession(hashToken(l.token), new Date())).not.toBeNull();
      expect((await new AuthPruner(store, wide).runOnce()).challenges).toBe(0);
    });
  });
}

describe("auth pruning configuration", () => {
  it("is off unless explicitly enabled, and never prunes inside an hour of expiry", async () => {
    const off = await makeEnv();
    try { expect(off.ctx.authPruner).toBeNull(); } finally { await off.close(); }
    const on = await makeEnv({ AUTH_PRUNE_ENABLED: "true" });
    try { expect(on.ctx.authPruner).toBeInstanceOf(AuthPruner); } finally { await on.close(); }
    await expect(makeEnv({ AUTH_PRUNE_GRACE_SECONDS: "60" })).rejects.toThrow();
  });
});

suite("auth pruning (memory store)", () => makeEnv());

if (url) {
  const reset = () => resetTestSchema(url);
  suite("auth pruning (postgres)", async () => makeEnv({ DATABASE_URL: url }, { store: await PostgresStore.connect(url) }), reset);

  describe("auth pruning (postgres) leaves every other table alone", () => {
    beforeAll(reset);
    afterAll(reset);
    it("changes no row outside auth_challenges and sessions", async () => {
      const env = await makeEnv({ DATABASE_URL: url }, { store: await PostgresStore.connect(url) });
      const pool = new pg.Pool({ connectionString: url });
      try {
        await seed(env.ctx.store);
        await login(env.app);
        const tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('auth_challenges','sessions') ORDER BY 1")).rows.map((r) => r.tablename as string);
        const counts = async () => Object.fromEntries(await Promise.all(tables.map(async (t) => [t, Number((await pool.query(`SELECT count(*) FROM "${t}"`)).rows[0].count)])));
        const before = await counts();
        await new AuthPruner(env.ctx.store, { ...config, maxBatches: 100 }).runOnce();
        expect(await counts()).toEqual(before);
        expect(tables.length).toBeGreaterThan(10);
      } finally {
        await pool.end();
        await env.close();
      }
    });
  });
}
