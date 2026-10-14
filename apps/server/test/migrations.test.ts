import { readdirSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS_PATH, PostgresStore, migrate } from "../src/store/postgres.js";
import { assertDisposableTestDb, launch, login, makeEnv, resetTestSchema } from "./helpers.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

describe("migration files (static)", () => {
  const files = readdirSync(MIGRATIONS_PATH).filter((f) => f.endsWith(".sql")).sort();

  it("are numbered, ordered and unique", () => {
    expect(files.length).toBeGreaterThan(0);
    files.forEach((f, i) => expect(f).toMatch(new RegExp(`^${String(i + 1).padStart(3, "0")}_[a-z0-9_]+\\.sql$`)));
  });

  it("contain no destructive statements (forward-only, additive)", () => {
    for (const f of files) {
      // Strip comments and the trigger function body that merely RAISEs on mutation.
      const sql = readFileSync(join(MIGRATIONS_PATH, f), "utf8")
        .replace(/--.*$/gm, "")
        .replace(/\$\$[\s\S]*?\$\$/g, "");
      // Inspect each statement's leading keywords (TRUNCATE inside a trigger definition is fine: it forbids truncation).
      for (const stmt of sql.split(";").map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean)) {
        expect(stmt, f).not.toMatch(/^(DROP|TRUNCATE|DELETE)\b/i);
        expect(stmt, f).not.toMatch(/^ALTER TABLE .* DROP\b/i);
        expect(stmt, f).not.toMatch(/^UPDATE\b/i);
      }
    }
  });

  it("refuses to reset anything that is not a *_test database", () => {
    expect(() => assertDisposableTestDb("postgres://u:p@postgres.railway.internal:5432/railway")).toThrow(/refusing/);
    expect(() => assertDisposableTestDb("postgres:///agentic_economy_stage?host=/tmp")).toThrow(/refusing/);
    expect(() => assertDisposableTestDb("postgres:///agentic_economy_test?host=/tmp")).not.toThrow();
  });
});

d("migrations against a live database", () => {
  beforeAll(() => resetTestSchema(url!));
  afterAll(() => resetTestSchema(url!));

  it("apply once, are no-ops when repeated, and are safe under concurrent startup", async () => {
    const pools = Array.from({ length: 5 }, () => new pg.Pool({ connectionString: url }));
    try {
      const results = await Promise.all(pools.map((p) => migrate(p)));
      const applied = results.flat();
      const files = (await readdir(MIGRATIONS_PATH)).filter((f) => f.endsWith(".sql"));
      expect(applied.sort()).toEqual(files.sort()); // each file applied by exactly one process
      expect(await migrate(pools[0]!)).toEqual([]);
      const rows = (await pools[0]!.query("SELECT name, checksum FROM schema_migrations ORDER BY name")).rows;
      expect(rows.map((r) => r.name)).toEqual(files.sort());
      for (const r of rows) expect(r.checksum).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await Promise.all(pools.map((p) => p.end()));
    }
  });

  it("never touches existing simulation or treasury data when re-run (e.g. every deploy's pre-deploy step)", async () => {
    const env = await makeEnv({ DATABASE_URL: url!, ROLE: "all", WORLD_SEED: "test-world" }, { store: await PostgresStore.connect(url!) });
    try {
      const user = await login(env.app);
      await launch(env.app, user);
      for (let i = 0; i < 25; i++) await env.ctx.runtime.tickOnce();
    } finally {
      await env.close();
    }
    const pool = new pg.Pool({ connectionString: url });
    const fingerprint = async () =>
      (
        await pool.query(`SELECT
          (SELECT count(*) FROM treasury_entries) AS treasury,
          (SELECT count(*) FROM communities) AS communities,
          (SELECT count(*) FROM sim_snapshots) AS snapshots,
          (SELECT count(*) FROM sim_commands) AS commands,
          (SELECT count(*) FROM events) AS events,
          (SELECT count(*) FROM task_receipts) AS receipts,
          (SELECT last_tick FROM sim_leader) AS last_tick,
          (SELECT md5(string_agg(doc::text, '|' ORDER BY seq)) FROM treasury_entries) AS treasury_hash`)
      ).rows[0];
    try {
      const before = await fingerprint();
      expect(Number(before.treasury)).toBeGreaterThan(0);
      expect(Number(before.last_tick)).toBeGreaterThan(0);
      expect(await migrate(pool)).toEqual([]);
      expect(await fingerprint()).toEqual(before);
    } finally {
      await pool.end();
    }
  });

  it("refuses to run when an applied migration file was modified, or when the build is older than the schema", async () => {
    // Simulates tampering via the recorded checksum; the real migration files are never modified.
    const pool = new pg.Pool({ connectionString: url });
    try {
      await pool.query("UPDATE schema_migrations SET checksum = repeat('0', 64) WHERE name = '001_init.sql'");
      await expect(migrate(pool)).rejects.toThrow(/modified after it was applied/);
      await pool.query("UPDATE schema_migrations SET checksum = NULL WHERE name = '001_init.sql'"); // adopt again
      expect(await migrate(pool)).toEqual([]);
      await pool.query("INSERT INTO schema_migrations (name, checksum) VALUES ('999_future.sql', 'x')");
      await expect(migrate(pool)).rejects.toThrow(/missing from this build/);
      await pool.query("DELETE FROM schema_migrations WHERE name = '999_future.sql'");
    } finally {
      await pool.end();
    }
  });
});
