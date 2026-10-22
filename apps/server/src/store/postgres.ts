import {nextTreasuryEntry} from './treasury-entry.js';
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { AgentAction, Community, EconomicEvent, RewardRecord, TaskReceipt, TokenLaunch, TreasuryEntry } from "@agentic-economy/shared";
import {
  ConflictError,
  decodeCursor,
  encodeCursor,
  type ChallengeRecord,
  type IdempotencyRecord,
  type LaunchRecord,
  type NewEvent,
  type PageResult,
  type SessionRecord,
  type Store,
  type WorldMeta,
} from "./types.js";

const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations/", import.meta.url));

/** Advisory lock keys (one database per world). */
export const LOCK_KEYS = { migrate: 4_242_000, sim: 4_242_001, indexer: 4_242_002, "aeco-common-agents": 4_242_003 } as const;

export class MigrationIntegrityError extends Error {}

/**
 * Apply pending SQL migrations in filename order, each in its own transaction, serialized across processes.
 *
 * Safety properties (tested in test/migrations.test.ts):
 * - forward-only and additive: migration files may not contain DROP/TRUNCATE/DELETE (static check);
 * - repeatable: applied files are recorded in schema_migrations and never re-run;
 * - tamper-evident: each applied file's SHA-256 is recorded; if an applied file changes, startup is refused
 *   instead of silently diverging from the deployed schema;
 * - never resets data: there is no "reset"/"down" path in production code.
 */
export async function migrate(pool: pg.Pool): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEYS.migrate]);
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    await client.query("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text");
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const sums = new Map<string, string>();
    for (const f of files) sums.set(f, createHash("sha256").update(await readFile(MIGRATIONS_DIR + f, "utf8")).digest("hex"));
    const applied = new Map((await client.query<{ name: string; checksum: string | null }>("SELECT name, checksum FROM schema_migrations")).rows.map((r) => [r.name, r.checksum]));
    for (const [name, checksum] of applied) {
      const current = sums.get(name);
      if (current === undefined) throw new MigrationIntegrityError(`migration ${name} is applied in the database but missing from this build (refusing to start an older build against a newer schema)`);
      if (checksum === null) await client.query("UPDATE schema_migrations SET checksum = $2 WHERE name = $1", [name, current]); // adopt pre-checksum rows
      else if (checksum !== current) throw new MigrationIntegrityError(`migration ${name} was modified after it was applied (checksum mismatch); add a new migration instead`);
    }
    const ran: string[] = [];
    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = await readFile(MIGRATIONS_DIR + f, "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [f, sums.get(f)]);
        await client.query("COMMIT");
        ran.push(f);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
    return ran;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEYS.migrate]).catch(() => undefined);
    client.release();
  }
}

/** Directory holding the SQL migrations (exported for tests/tools). */
export const MIGRATIONS_PATH = MIGRATIONS_DIR;

export async function insertEvents(q: Queryable, events: NewEvent[]): Promise<EconomicEvent[]> {
  const out: EconomicEvent[] = [];
  for (const e of events) {
    const r = await q.query(
      `INSERT INTO events (id, tick, type, summary, agent_id, building_id, community_id, data, at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING RETURNING seq`,
      [e.id, e.tick, e.type, e.summary, e.agentId, e.buildingId, e.communityId, JSON.stringify(e.data), e.at],
    );
    if (r.rows[0]) out.push({ ...e, seq: Number(r.rows[0].seq) });
  }
  return out;
}

/** Insert one tick's outputs; rows whose deterministic id already exists are skipped (replay-safe). */
export async function insertSimOutputs(q: Queryable, o: { events: NewEvent[]; actions: AgentAction[]; receipts: TaskReceipt[]; rewards: RewardRecord[] }): Promise<EconomicEvent[]> {
  const inserted = await insertEvents(q, o.events);
  for (const a of o.actions)
    await q.query("INSERT INTO agent_actions (id, agent_id, tick, doc) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING", [a.id, a.agentId, a.tick, JSON.stringify(a)]);
  for (const r of o.receipts)
    await q.query("INSERT INTO task_receipts (id, task_id, agent_id, hash, prev_hash, doc) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING", [
      r.id,
      r.taskId,
      r.agentId,
      r.hash,
      r.prevHash,
      JSON.stringify(r),
    ]);
  for (const r of o.rewards)
    await q.query("INSERT INTO reward_records (id, epoch, agent_id, doc) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING", [r.id, r.epoch, r.agentId, JSON.stringify(r)]);
  return inserted;
}

const isUniqueViolation = (e: unknown) => (e as { code?: string }).code === "23505";

export type Queryable = Pick<pg.Pool, "query"> | pg.PoolClient | pg.Client;

function page<T>(rows: Array<{ seq: string | number; doc: T }>, limit: number): PageResult<T> {
  const more = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items: items.map((r) => r.doc), nextCursor: more && items.length ? encodeCursor(Number(items[items.length - 1]!.seq)) : null };
}

export class PostgresStore implements Store {
  readonly kind = "postgres" as const;

  private constructor(readonly pool: pg.Pool) {}

  static async connect(databaseUrl: string): Promise<PostgresStore> {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
    await migrate(pool);
    return new PostgresStore(pool);
  }

  async close() {
    await this.pool.end();
  }

  private async tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const out = await fn(c);
      await c.query("COMMIT");
      return out;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }

  /* ---------------- world & sim ---------------- */

  async getWorldMeta(): Promise<WorldMeta | null> {
    const r = await this.pool.query("SELECT world_id, seed, generator_version, created_at FROM world_meta WHERE id = 1");
    const row = r.rows[0];
    return row ? { worldId: row.world_id, seed: row.seed, generatorVersion: row.generator_version, createdAt: new Date(row.created_at).toISOString() } : null;
  }

  async initWorldMeta(meta: WorldMeta): Promise<WorldMeta> {
    await this.pool.query("INSERT INTO world_meta (id, world_id, seed, generator_version, created_at) VALUES (1, $1, $2, $3, $4) ON CONFLICT (id) DO NOTHING", [
      meta.worldId,
      meta.seed,
      meta.generatorVersion,
      meta.createdAt,
    ]);
    return (await this.getWorldMeta())!;
  }

  appendSimOutputs(o: { events: NewEvent[]; actions: AgentAction[]; receipts: TaskReceipt[]; rewards: RewardRecord[] }) {
    return this.tx((c) => insertSimOutputs(c, o));
  }

  async listEvents(cursor: string | null, limit: number): Promise<PageResult<EconomicEvent>> {
    const before = decodeCursor(cursor);
    const r = await this.pool.query(
      `SELECT seq, id, tick, type, summary, agent_id, building_id, community_id, data, at FROM events
       WHERE ($1::bigint IS NULL OR seq < $1) ORDER BY seq DESC LIMIT $2`,
      [before, limit + 1],
    );
    return page(
      r.rows.map((row) => ({
        seq: row.seq,
        doc: {
          id: row.id,
          seq: Number(row.seq),
          tick: Number(row.tick),
          at: new Date(row.at).toISOString(),
          type: row.type,
          summary: row.summary,
          agentId: row.agent_id,
          buildingId: row.building_id,
          communityId: row.community_id,
          data: row.data,
        } as EconomicEvent,
      })),
      limit,
    );
  }

  private async listDocs<T>(table: string, where: string, params: unknown[], cursor: string | null, limit: number): Promise<PageResult<T>> {
    const before = decodeCursor(cursor);
    const n = params.length;
    const r = await this.pool.query(`SELECT seq, doc FROM ${table} WHERE ${where} AND ($${n + 1}::bigint IS NULL OR seq < $${n + 1}) ORDER BY seq DESC LIMIT $${n + 2}`, [
      ...params,
      before,
      limit + 1,
    ]);
    return page(r.rows as Array<{ seq: string; doc: T }>, limit);
  }

  listAgentActions(agentId: string, cursor: string | null, limit: number) {
    return this.listDocs<AgentAction>("agent_actions", "agent_id = $1", [agentId], cursor, limit);
  }
  listReceipts(cursor: string | null, limit: number) {
    return this.listDocs<TaskReceipt>("task_receipts", "TRUE", [], cursor, limit);
  }
  listRewards(cursor: string | null, limit: number) {
    return this.listDocs<RewardRecord>("reward_records", "TRUE", [], cursor, limit);
  }

  /* ---------------- auth ---------------- */

  async createChallenge(c: ChallengeRecord) {
    await this.pool.query("INSERT INTO auth_challenges (nonce, wallet, message, expires_at) VALUES ($1,$2,$3,$4)", [c.nonce, c.wallet, c.message, c.expiresAt]);
  }

  async consumeChallenge(nonce: string, wallet: string, now: Date) {
    // Single atomic statement: concurrent verifies of the same nonce cannot both succeed.
    const r = await this.pool.query(
      `UPDATE auth_challenges SET used_at = $3 WHERE nonce = $1 AND wallet = $2 AND used_at IS NULL AND expires_at > $3
       RETURNING nonce, wallet, message, expires_at`,
      [nonce, wallet, now.toISOString()],
    );
    const row = r.rows[0];
    return row ? { nonce: row.nonce, wallet: row.wallet, message: row.message, expiresAt: new Date(row.expires_at).toISOString() } : null;
  }

  async createSession(s: SessionRecord) {
    await this.pool.query("INSERT INTO sessions (token_hash, wallet, expires_at) VALUES ($1,$2,$3)", [s.tokenHash, s.wallet, s.expiresAt]);
  }

  async pruneExpiredAuth(cutoff: Date, limit: number) {
    // SKIP LOCKED: rows a concurrent sign-in or pruner holds are left for a later batch, never waited on.
    const challenges = await this.pool.query(
      `WITH doomed AS (SELECT nonce FROM auth_challenges WHERE expires_at < $1 ORDER BY expires_at LIMIT $2 FOR UPDATE SKIP LOCKED)
       DELETE FROM auth_challenges a USING doomed d WHERE a.nonce = d.nonce`, [cutoff.toISOString(), limit]);
    const sessions = await this.pool.query(
      `WITH doomed AS (SELECT token_hash FROM sessions WHERE expires_at < $1 OR revoked_at < $1 ORDER BY expires_at LIMIT $2 FOR UPDATE SKIP LOCKED)
       DELETE FROM sessions s USING doomed d WHERE s.token_hash = d.token_hash`, [cutoff.toISOString(), limit]);
    return { challenges: challenges.rowCount ?? 0, sessions: sessions.rowCount ?? 0 };
  }

  async revokeSession(tokenHash:string) { await this.pool.query("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1",[tokenHash]); }
  async getSession(tokenHash: string, now: Date) {
    const r = await this.pool.query("SELECT token_hash, wallet, expires_at FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2", [tokenHash, now.toISOString()]);
    const row = r.rows[0];
    return row ? { tokenHash: row.token_hash, wallet: row.wallet, expiresAt: new Date(row.expires_at).toISOString() } : null;
  }

  async getIdempotent(key: string, wallet: string, route: string) {
    const r = await this.pool.query("SELECT request_hash, status, body FROM idempotency_keys WHERE key = $1 AND wallet = $2 AND route = $3", [key, wallet, route]);
    const row = r.rows[0];
    return row ? { requestHash: row.request_hash, status: row.status, body: row.body } : null;
  }

  async saveIdempotent(key: string, wallet: string, route: string, rec: IdempotencyRecord) {
    await this.pool.query(
      "INSERT INTO idempotency_keys (key, wallet, route, request_hash, status, body) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
      [key, wallet, route, rec.requestHash, rec.status, JSON.stringify(rec.body)],
    );
  }

  /* ---------------- launches & communities ---------------- */

  async createLaunch(l: TokenLaunch) {
    try {
      await this.pool.query("INSERT INTO launches (id, status, launcher_wallet, mint, signature, doc) VALUES ($1,$2,$3,$4,$5,$6)", [
        l.id,
        l.status,
        l.launcherWallet,
        l.mint,
        l.signature,
        JSON.stringify(l),
      ]);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError("launch exists");
      throw e;
    }
  }

  async getLaunch(id: string): Promise<LaunchRecord | null> {
    const r = await this.pool.query("SELECT doc, version FROM launches WHERE id = $1", [id]);
    return r.rows[0] ? { launch: r.rows[0].doc, version: r.rows[0].version } : null;
  }

  async findLaunchBySignature(signature: string) {
    const r = await this.pool.query("SELECT doc FROM launches WHERE signature = $1", [signature]);
    return r.rows[0]?.doc ?? null;
  }

  private async updateLaunchWith(q: Queryable, l: TokenLaunch, expectedVersion: number) {
    try {
      const r = await q.query("UPDATE launches SET status = $2, signature = $3, doc = $4, version = version + 1, updated_at = now() WHERE id = $1 AND version = $5", [
        l.id,
        l.status,
        l.signature,
        JSON.stringify(l),
        expectedVersion,
      ]);
      if (r.rowCount !== 1) throw new ConflictError("stale launch version");
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError("signature bound to another launch");
      throw e;
    }
  }

  updateLaunch(l: TokenLaunch, expectedVersion: number) {
    return this.updateLaunchWith(this.pool, l, expectedVersion);
  }

  async confirmLaunch(l: TokenLaunch, expectedVersion: number, community: Community, entries: TreasuryEntry[], event: NewEvent) {
    try {
      await this.tx(async (c) => {
        await this.updateLaunchWith(c, l, expectedVersion);
        await c.query("INSERT INTO communities (id, mint, launch_id, doc, registered_at) VALUES ($1,$2,$3,$4,$5)", [
          community.id,
          community.mint,
          community.launchId,
          JSON.stringify(community),
          community.registeredAt,
        ]);
        await this.insertTreasury(c, entries);
        await insertEvents(c, [event]);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError("community already registered");
      throw e;
    }
  }

  async getCommunity(id: string) {
    const r = await this.pool.query("SELECT doc FROM communities WHERE id = $1", [id]);
    return r.rows[0]?.doc ?? null;
  }
  async getCommunityByMint(mint: string) {
    const r = await this.pool.query("SELECT doc FROM communities WHERE mint = $1", [mint]);
    return r.rows[0]?.doc ?? null;
  }
  listCommunities(cursor: string | null, limit: number) {
    return this.listDocs<Community>("communities", "TRUE", [], cursor, limit);
  }
  async allCommunities() {
    return (await this.pool.query("SELECT doc FROM communities ORDER BY seq")).rows.map((r) => r.doc as Community);
  }

  /* ---------------- treasury ---------------- */

  private async insertTreasury(q: Queryable, entries: TreasuryEntry[]): Promise<TreasuryEntry[]> {
    const out: TreasuryEntry[] = [];
    for (const input of [...entries].sort((a,b)=>`${a.signature}:${a.instructionIndex}:${a.account}:${a.stream}`.localeCompare(`${b.signature}:${b.instructionIndex}:${b.account}:${b.stream}`))) {
      const key=`${input.signature}:${input.instructionIndex}:${input.account}:${input.stream}`;
      await q.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
      const existing=await q.query('SELECT doc FROM treasury_entries WHERE signature=$1 AND instruction_index=$2 AND account=$3 AND stream=$4 ORDER BY seq',[input.signature,input.instructionIndex,input.account,input.stream]);
      const e=nextTreasuryEntry(input,existing.rows.map(r=>r.doc as TreasuryEntry));if(!e)continue;
      const r = await q.query(
        `INSERT INTO treasury_entries (id, stream, account, signature, instruction_index, finality, supersedes, doc)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (signature, instruction_index, account, stream, finality) DO NOTHING RETURNING seq`,
        [e.id, e.stream, e.account, e.signature, e.instructionIndex, e.finality, e.supersedes, JSON.stringify(e)],
      );
      if (r.rows[0]) out.push({ ...e, seq: Number(r.rows[0].seq) });
    }
    return out;
  }

  appendTreasuryEntries(entries: TreasuryEntry[]) {
    return this.tx((c) => this.insertTreasury(c, entries));
  }

  async listTreasuryEntries(cursor: string | null, limit: number) {
    const before = decodeCursor(cursor);
    const r = await this.pool.query("SELECT seq, doc FROM treasury_entries WHERE ($1::bigint IS NULL OR seq < $1) ORDER BY seq DESC LIMIT $2", [before, limit + 1]);
    return page(r.rows.map((row) => ({ seq: row.seq, doc: { ...(row.doc as TreasuryEntry), seq: Number(row.seq) } })), limit);
  }

  async allTreasuryEntries() {
    const r = await this.pool.query("SELECT seq, doc FROM treasury_entries ORDER BY seq");
    return r.rows.map((row) => ({ ...(row.doc as TreasuryEntry), seq: Number(row.seq) }));
  }
}
