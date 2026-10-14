import pg from "pg";
import type { LoggedCommand, SimCommand } from "../sim/types.js";
import { LOCK_KEYS, insertSimOutputs, type Queryable } from "../store/postgres.js";
import {
  LeadershipLost,
  type CoordinationListener,
  type Coordinator,
  type EnqueueGuard,
  type EnqueueResult,
  type Lease,
  type LeaderSession,
  type Recovery,
  type StreamDraft,
  type StreamRecord,
  type TickCommit,
} from "./types.js";

interface Log {
  info(o: unknown, m?: string): void;
  warn(o: unknown, m?: string): void;
  error(o: unknown, m?: string): void;
}

const CHANNELS = { stream: "ae_stream", view: "ae_view", applied: "ae_applied" } as const;
/** Bounds how long a commit on a half-dead connection can hang before the session is treated as lost. */
const STATEMENT_TIMEOUT_MS = 10_000;

/**
 * Connection used for leadership/leases/LISTEN. Besides client-side keepalive, the SERVER-side keepalive
 * settings make Postgres notice a vanished leader (e.g. network partition, frozen VM) within ~25 s and drop
 * its session — which releases the advisory lock so a standby can take over. (Defaults can be hours.)
 */
async function dedicatedClient(url: string): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: url, keepAlive: true, keepAliveInitialDelayMillis: 5_000, application_name: "agentic-economy-coord" });
  await c.connect();
  await c.query(
    `SET statement_timeout = ${STATEMENT_TIMEOUT_MS}; SET idle_in_transaction_session_timeout = 15000; ` +
      `SET tcp_keepalives_idle = 10; SET tcp_keepalives_interval = 5; SET tcp_keepalives_count = 3`,
  );
  return c;
}

async function insertStream(q: Queryable, drafts: StreamDraft[]): Promise<StreamRecord[]> {
  const out: StreamRecord[] = [];
  for (const d of drafts) {
    const r = await q.query("INSERT INTO stream_events (key, type, tick, payload) VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO NOTHING RETURNING seq", [d.key, d.type, d.tick, d.payload]);
    if (r.rows[0]) out.push({ ...d, seq: Number(r.rows[0].seq) });
  }
  return out;
}

/**
 * Postgres coordination. Leadership = session-level advisory lock held on a DEDICATED connection.
 * All leader writes run on that same connection inside one transaction that first asserts the
 * fencing epoch, so if the lock is lost (connection dropped, backend terminated) nothing can be written.
 * Notifications use LISTEN/NOTIFY and only carry hints; consumers always re-read durable tables.
 */
export class PgCoordinator implements Coordinator {
  readonly kind = "postgres" as const;

  constructor(
    private readonly pool: pg.Pool,
    private readonly url: string,
    private readonly log: Log,
  ) {}

  async tryAcquireSimLeadership(holder: string): Promise<LeaderSession | null> {
    const client = await dedicatedClient(this.url);
    try {
      const got = (await client.query("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEYS.sim])).rows[0].ok as boolean;
      if (!got) {
        await client.end();
        return null;
      }
      const epoch = Number(
        (await client.query("UPDATE sim_leader SET epoch = epoch + 1, holder = $1, acquired_at = now(), heartbeat_at = now() WHERE id = 1 RETURNING epoch", [holder])).rows[0].epoch,
      );
      return new PgLeaderSession(client, epoch, this.log);
    } catch (e) {
      await client.end().catch(() => undefined);
      throw e;
    }
  }

  async tryAcquireLease(name: string, holder: string): Promise<Lease | null> {
    const key = LOCK_KEYS[name as keyof typeof LOCK_KEYS];
    if (key === undefined || name === "sim" || name === "migrate") throw new Error(`unknown lease ${name}`);
    const client = await dedicatedClient(this.url);
    try {
      const got = (await client.query("SELECT pg_try_advisory_lock($1) AS ok", [key])).rows[0].ok as boolean;
      if (!got) {
        await client.end();
        return null;
      }
      const epoch = Number(
        (
          await client.query(
            `INSERT INTO service_leases (name, epoch, holder, acquired_at, heartbeat_at) VALUES ($1, 1, $2, now(), now())
             ON CONFLICT (name) DO UPDATE SET epoch = service_leases.epoch + 1, holder = $2, acquired_at = now(), heartbeat_at = now()
             RETURNING epoch`,
            [name, holder],
          )
        ).rows[0].epoch,
      );
      return new PgLease(name, client, epoch, key);
    } catch (e) {
      await client.end().catch(() => undefined);
      throw e;
    }
  }

  async enqueueCommand(command: SimCommand, dedupeKey: string | null, guard?: EnqueueGuard): Promise<EnqueueResult | null> {
    const wallet = command.type === "agent.create" ? command.ownerWallet : null;
    const community = command.type === "agent.create" || command.type === "community.register" ? command.communityId : null;
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      if (dedupeKey) {
        const ex = (await c.query("SELECT id, command, applied_tick FROM sim_command_inbox WHERE dedupe_key = $1", [dedupeKey])).rows[0];
        if (ex) {
          await c.query("COMMIT");
          return { id: Number(ex.id), command: JSON.parse(ex.command), existing: true, appliedTick: ex.applied_tick === null ? null : Number(ex.applied_tick) };
        }
      }
      if (guard) {
        // Serialise admission per wallet+community so concurrent requests cannot both pass the cap.
        await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`agent-cap:${guard.wallet}:${guard.communityId}`]);
        const n = (
          await c.query("SELECT count(*)::int AS n FROM sim_command_inbox WHERE applied_seq IS NULL AND kind = 'agent.create' AND wallet = $1 AND community_id = $2", [guard.wallet, guard.communityId])
        ).rows[0].n as number;
        if (n >= guard.maxPending) {
          await c.query("ROLLBACK");
          return null;
        }
      }
      const ins = await c.query(
        `INSERT INTO sim_command_inbox (dedupe_key, command, wallet, community_id, kind) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
        [dedupeKey, JSON.stringify(command), wallet, community, command.type],
      );
      if (!ins.rows[0]) {
        // Lost a race with the same dedupe key: return the winner.
        const ex = (await c.query("SELECT id, command, applied_tick FROM sim_command_inbox WHERE dedupe_key = $1", [dedupeKey])).rows[0];
        await c.query("COMMIT");
        return { id: Number(ex.id), command: JSON.parse(ex.command), existing: true, appliedTick: ex.applied_tick === null ? null : Number(ex.applied_tick) };
      }
      await c.query("COMMIT");
      return { id: Number(ins.rows[0].id), command, existing: false, appliedTick: null };
    } catch (e) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  async inboxStatus(id: number) {
    const r = (await this.pool.query("SELECT applied_tick FROM sim_command_inbox WHERE id = $1", [id])).rows[0];
    return r ? { appliedTick: r.applied_tick === null ? null : Number(r.applied_tick) } : null;
  }

  async pendingAgentCreates(wallet: string, communityId: string) {
    const r = await this.pool.query("SELECT count(*)::int AS n FROM sim_command_inbox WHERE applied_seq IS NULL AND kind = 'agent.create' AND wallet = $1 AND community_id = $2", [
      wallet,
      communityId,
    ]);
    return r.rows[0].n as number;
  }

  async appendStream(drafts: StreamDraft[]) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const out = await insertStream(c, drafts);
      if (out.length) await c.query("SELECT pg_notify($1, $2)", [CHANNELS.stream, String(out[out.length - 1]!.seq)]);
      await c.query("COMMIT");
      return out;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  async readStream(afterSeq: number, limit: number): Promise<StreamRecord[]> {
    const r = await this.pool.query("SELECT seq, key, type, tick, payload FROM stream_events WHERE seq > $1 ORDER BY seq LIMIT $2", [afterSeq, limit]);
    return r.rows.map((x) => ({ seq: Number(x.seq), key: x.key, type: x.type, tick: Number(x.tick), payload: x.payload }));
  }

  async streamBounds() {
    const r = (await this.pool.query("SELECT min(seq) AS lo, max(seq) AS hi FROM stream_events")).rows[0];
    return { oldest: r.lo === null ? null : Number(r.lo), latest: r.hi === null ? 0 : Number(r.hi) };
  }

  async loadView() {
    const r = (await this.pool.query("SELECT tick, epoch, state_gz FROM sim_view WHERE id = 1")).rows[0];
    return r ? { tick: Number(r.tick), epoch: Number(r.epoch), stateGz: r.state_gz as Buffer } : null;
  }

  async simStatus() {
    const r = (await this.pool.query("SELECT epoch, holder, heartbeat_at, last_tick FROM sim_leader WHERE id = 1")).rows[0];
    return { epoch: Number(r.epoch), holder: r.holder, heartbeatAt: r.heartbeat_at ? new Date(r.heartbeat_at).toISOString() : null, lastTick: Number(r.last_tick) };
  }

  /** LISTEN on a dedicated connection; reconnects with backoff and calls onReconnect so consumers re-read durable state. */
  async listen(l: CoordinationListener): Promise<() => Promise<void>> {
    let client: pg.Client | null = null;
    let stopped = false;
    let backoff = 500;
    const connect = async (isReconnect: boolean): Promise<void> => {
      if (stopped) return;
      try {
        const c = await dedicatedClient(this.url);
        c.on("notification", (n) => {
          if (n.channel === CHANNELS.stream) l.onStream?.(Number(n.payload));
          else if (n.channel === CHANNELS.view) l.onView?.(Number(n.payload));
          else if (n.channel === CHANNELS.applied && n.payload) {
            const { ids, tick } = JSON.parse(n.payload) as { ids: number[]; tick: number };
            l.onApplied?.(ids, tick);
          }
        });
        const onDown = (err?: unknown) => {
          if (client !== c) return;
          client = null;
          this.log.warn({ err: String(err ?? "connection ended") }, "notification listener disconnected; reconnecting");
          setTimeout(() => void connect(true), backoff);
          backoff = Math.min(backoff * 2, 15_000);
        };
        c.on("error", onDown);
        c.on("end", () => onDown());
        await c.query(`LISTEN ${CHANNELS.stream}; LISTEN ${CHANNELS.view}; LISTEN ${CHANNELS.applied}`);
        client = c;
        backoff = 500;
        if (isReconnect) l.onReconnect?.();
      } catch (err) {
        this.log.warn({ err: String(err) }, "notification listener connect failed; retrying");
        setTimeout(() => void connect(true), backoff);
        backoff = Math.min(backoff * 2, 15_000);
      }
    };
    await connect(false);
    return async () => {
      stopped = true;
      const c = client;
      client = null;
      await c?.end().catch(() => undefined);
    };
  }

  async ping() {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  async close() {}
}

class PgLeaderSession implements LeaderSession {
  private _lost = false;
  private callbacks: Array<(r: string) => void> = [];

  constructor(
    private readonly client: pg.Client,
    readonly epoch: number,
    private readonly log: Log,
  ) {
    client.on("error", (err) => this.markLost(`leader connection error: ${String(err)}`));
    client.on("end", () => this.markLost("leader connection ended"));
  }

  get lost() {
    return this._lost;
  }

  private markLost(reason: string) {
    if (this._lost) return;
    this._lost = true;
    if (reason === "released") this.log.info({ epoch: this.epoch }, "simulation leadership released");
    else this.log.warn({ epoch: this.epoch, reason }, "simulation leadership lost");
    for (const cb of this.callbacks) cb(reason);
  }

  onLost(cb: (reason: string) => void) {
    this.callbacks.push(cb);
  }

  private assertLive() {
    if (this._lost) throw new LeadershipLost(`epoch ${this.epoch} lost`);
  }

  private async fence(): Promise<void> {
    const r = await this.client.query("SELECT epoch FROM sim_leader WHERE id = 1 FOR UPDATE");
    if (Number(r.rows[0].epoch) !== this.epoch) {
      this.markLost(`fenced: database epoch ${r.rows[0].epoch} != ${this.epoch}`);
      throw new LeadershipLost("fenced");
    }
  }

  async loadRecovery(): Promise<Recovery> {
    this.assertLive();
    const c = this.client;
    const snap = (await c.query("SELECT tick, state, state_hash FROM sim_snapshots ORDER BY tick DESC LIMIT 1")).rows[0];
    const from = snap ? Number(snap.tick) : 0;
    const log = (await c.query("SELECT seq, tick, command FROM sim_commands WHERE tick >= $1 ORDER BY seq", [from])).rows.map(
      (r): LoggedCommand => ({ seq: Number(r.seq), tick: Number(r.tick), command: JSON.parse(r.command) }),
    );
    const leader = (await c.query("SELECT last_tick FROM sim_leader WHERE id = 1")).rows[0];
    const maxSeq = Number((await c.query("SELECT COALESCE(MAX(seq), -1) AS m FROM sim_commands")).rows[0].m);
    return {
      snapshot: snap ? { tick: Number(snap.tick), state: snap.state as string, hash: snap.state_hash as string } : null,
      log,
      lastTick: Number(leader.last_tick),
      maxSeq,
    };
  }

  async claimInbox(limit: number) {
    this.assertLive();
    const r = await this.client.query("SELECT id, command FROM sim_command_inbox WHERE applied_seq IS NULL ORDER BY id LIMIT $1", [limit]);
    return r.rows.map((x) => ({ id: Number(x.id), command: JSON.parse(x.command) as SimCommand }));
  }

  async commitTick(t: TickCommit): Promise<number | null> {
    this.assertLive();
    const c = this.client;
    try {
      await c.query("BEGIN");
      await this.fence();
      await c.query("UPDATE sim_leader SET heartbeat_at = now(), last_tick = $1 WHERE id = 1", [t.nextTick]);
      for (const a of t.applied) {
        await c.query("INSERT INTO sim_commands (seq, tick, command) VALUES ($1,$2,$3)", [a.logged.seq, a.logged.tick, JSON.stringify(a.logged.command)]);
        const u = await c.query("UPDATE sim_command_inbox SET applied_seq = $2, applied_tick = $3 WHERE id = $1 AND applied_seq IS NULL", [a.inboxId, a.logged.seq, a.logged.tick]);
        if (u.rowCount !== 1) throw new Error(`inbox command ${a.inboxId} was already applied`);
      }
      const inserted = await insertSimOutputs(c, t);
      const written = await insertStream(c, t.buildStream(inserted));
      if (t.snapshot) {
        await c.query("INSERT INTO sim_snapshots (tick, state, state_hash) VALUES ($1,$2,$3) ON CONFLICT (tick) DO NOTHING", [t.snapshot.tick, t.snapshot.state, t.snapshot.hash]);
        await c.query("DELETE FROM sim_snapshots WHERE tick NOT IN (SELECT tick FROM sim_snapshots ORDER BY tick DESC LIMIT 5)");
      }
      if (t.view) await this.upsertView(t.nextTick, t.view);
      if (t.pruneStreamOlderThan) await c.query("DELETE FROM stream_events WHERE created_at < $1", [t.pruneStreamOlderThan.toISOString()]);
      if (written.length) await c.query("SELECT pg_notify($1, $2)", [CHANNELS.stream, String(written[written.length - 1]!.seq)]);
      if (t.view) await c.query("SELECT pg_notify($1, $2)", [CHANNELS.view, String(t.nextTick)]);
      if (t.applied.length) await c.query("SELECT pg_notify($1, $2)", [CHANNELS.applied, JSON.stringify({ ids: t.applied.map((a) => a.inboxId), tick: t.nextTick - 1 })]);
      await c.query("COMMIT");
      return written.length ? written[written.length - 1]!.seq : null;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => undefined);
      // Any failed commit means in-memory state may have diverged from the database: give up leadership.
      this.markLost(`commit failed: ${String(e)}`);
      throw e instanceof LeadershipLost ? e : new LeadershipLost(String(e));
    }
  }

  private async upsertView(tick: number, gz: Buffer) {
    await this.client.query(
      `INSERT INTO sim_view (id, tick, epoch, state_gz, updated_at) VALUES (1, $1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE SET tick = EXCLUDED.tick, epoch = EXCLUDED.epoch, state_gz = EXCLUDED.state_gz, updated_at = now()`,
      [tick, this.epoch, gz],
    );
  }

  async publishView(tick: number, stateGz: Buffer) {
    this.assertLive();
    const c = this.client;
    try {
      await c.query("BEGIN");
      await this.fence();
      await this.upsertView(tick, stateGz);
      await c.query("SELECT pg_notify($1, $2)", [CHANNELS.view, String(tick)]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => undefined);
      this.markLost(`view publish failed: ${String(e)}`);
      throw e;
    }
  }

  async release() {
    if (!this._lost) {
      await this.client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEYS.sim]).catch(() => undefined);
      this.markLost("released");
    }
    await this.client.end().catch(() => undefined);
  }
}

class PgLease implements Lease {
  lost = false;
  constructor(
    readonly name: string,
    private readonly client: pg.Client,
    readonly epoch: number,
    private readonly key: number,
  ) {
    client.on("error", () => (this.lost = true));
    client.on("end", () => (this.lost = true));
  }

  async heartbeat() {
    if (this.lost) throw new LeadershipLost(`lease ${this.name} lost`);
    try {
      const r = await this.client.query("UPDATE service_leases SET heartbeat_at = now() WHERE name = $1 AND epoch = $2", [this.name, this.epoch]);
      if (r.rowCount !== 1) throw new LeadershipLost(`lease ${this.name} fenced`);
    } catch (e) {
      this.lost = true;
      throw e;
    }
  }

  async release() {
    if (!this.lost) await this.client.query("SELECT pg_advisory_unlock($1)", [this.key]).catch(() => undefined);
    this.lost = true;
    await this.client.end().catch(() => undefined);
  }
}
