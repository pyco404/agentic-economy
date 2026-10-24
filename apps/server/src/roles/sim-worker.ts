import { gzipSync } from "node:zlib";
import type { Community, EconomicEvent } from "@agentic-economy/shared";
import type { WorldLayout } from "@agentic-economy/world-spec";
import type { AppConfig } from "../config.js";
import type { Coordinator, LeaderSession, StreamDraft } from "../coord/types.js";
import { SimEngine, createInitialState, hashState, AGENT_SPEED } from "../sim/engine.js";
import type { LoggedCommand, TickOutput } from "../sim/types.js";
import { cellCenter, marketQuotes, toAgentSummary } from "../sim/view.js";
import { decorateCommunity, communityBranding } from "../services/community.js";
import type { Store } from "../store/types.js";
import { upgradeState } from "../sim/identity.js";
import { streamDraft } from "./stream.js";

export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

const CHUNK_FLUSH_TICKS = 10;
const PRUNE_EVERY_TICKS = 120;
const RECONCILE_EVERY_TICKS = 120;
const INBOX_BATCH = 200;
const COMMUNITY_EVENTS = new Set(["community.registered", "building.placed", "agent.activated", "agent.paused", "agent.resumed", "task.verified"]);

/**
 * The single simulation writer. Only runs ticks while it holds leadership; every tick (commands applied,
 * outputs, stream events, snapshots, published view) is committed atomically under the fencing epoch.
 * On ANY commit failure or connection loss it drops its in-memory engine and stops; it only resumes after
 * re-acquiring leadership and rebuilding state from the database (snapshot + applied-command replay).
 */
export class SimWorker {
  engine: SimEngine | null = null;
  private session: LeaderSession | null = null;
  private nextSeq = 0;
  private timer: NodeJS.Timeout | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private lastAttempt = 0;
  private readonly dirtyChunks = new Set<string>();
  private readonly communityCache = new Map<string, Community>();
  readonly metrics = { ticks: 0, tickErrors: 0, avgTickMs: 0, lastTickMs: 0, acquisitions: 0, losses: 0, recoveredTicks: 0 };

  constructor(
    private readonly config: AppConfig,
    private readonly layout: WorldLayout,
    private readonly coord: Coordinator,
    private readonly store: Store,
    private readonly log: Logger,
    readonly holder: string,
  ) {}

  get isLeader(): boolean {
    return this.session !== null && !this.session.lost && this.engine !== null;
  }
  get epoch(): number | null {
    return this.isLeader ? this.session!.epoch : null;
  }
  get looping(): boolean {
    return this.timer !== null;
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Try to become leader (no-op if already). Returns whether this process is now the leader. */
  ensureLeader(): Promise<boolean> {
    return this.serial(() => this.acquire());
  }

  private async acquire(): Promise<boolean> {
    if (this.isLeader) return true;
    this.lastAttempt = Date.now();
    const session = await this.coord.tryAcquireSimLeadership(this.holder);
    if (!session) return false;
    try {
      await this.recover(session);
    } catch (e) {
      this.log.error({ err: String(e) }, "recovery failed after acquiring leadership; releasing");
      await session.release().catch(() => undefined);
      this.engine = null;
      return false;
    }
    session.onLost((reason) => {
      if (this.session !== session) return;
      this.metrics.losses += 1;
      this.session = null;
      this.engine = null; // never keep simulating on state the database may not have
      this.dirtyChunks.clear();
      this.log.warn({ reason, epoch: session.epoch }, "stopped simulating: leadership lost");
      void session.release().catch(() => undefined);
    });
    this.session = session;
    this.metrics.acquisitions += 1;
    this.log.info({ epoch: session.epoch, tick: this.engine!.tick, holder: this.holder }, "acquired simulation leadership");
    return true;
  }

  private async recover(session: LeaderSession) {
    const rec = await session.loadRecovery();
    let state;
    if (rec.snapshot) {
      const raw = JSON.parse(rec.snapshot.state);
      // Integrity is checked on the stored form; only then is a v1 snapshot upgraded (pure, deterministic).
      if (hashState(raw) !== rec.snapshot.hash) throw new Error(`snapshot at tick ${rec.snapshot.tick} failed its integrity hash`);
      state = upgradeState(raw);
    } else state = createInitialState(this.layout);
    if (state.autonomy && !this.config.localAutonomy) throw new Error('Local autonomous state cannot run outside the isolated prototype');
    const engine = new SimEngine(state, this.layout, undefined, this.config.localAutonomy);
    const byTick = new Map<number, LoggedCommand[]>();
    for (const c of rec.log) byTick.set(c.tick, [...(byTick.get(c.tick) ?? []), c]);
    const start = engine.tick;
    // Silent catch-up to the last committed tick (outputs of those ticks are already persisted).
    while (engine.tick < rec.lastTick) {
      for (const c of byTick.get(engine.tick) ?? []) engine.enqueueLogged(c);
      engine.step();
    }
    this.metrics.recoveredTicks += engine.tick - start;
    this.engine = engine;
    this.nextSeq = rec.maxSeq + 1;
    await session.publishView(engine.tick, gzipSync(JSON.stringify(engine.state), { level: 1 }));
  }

  /** Run one tick if (and only if) this process is the leader. Returns null when not leader. */
  tickOnce(): Promise<TickOutput | null> {
    return this.serial(async () => {
      if (!(await this.acquire())) return null;
      const session = this.session!;
      const engine = this.engine!;
      const t0 = performance.now();
      try {
        // Activation is a durable, replayable command, never a snapshot rewrite or schema migration.
        if (Boolean(engine.state.society?.enabled) !== this.config.socialSimulationEnabled)
          await this.coord.enqueueCommand({ type: "society.configure", enabled: this.config.socialSimulationEnabled }, `society:v1:${engine.tick}:${this.config.socialSimulationEnabled}`);
        const inbox = await session.claimInbox(INBOX_BATCH);
        const applied = inbox.map((r) => {
          const logged: LoggedCommand = { tick: engine.tick, seq: this.nextSeq++, command: r.command };
          engine.enqueueLogged(logged);
          return { inboxId: r.id, logged };
        });
        const out = engine.step();
        await this.prefetchCommunities(out);
        const nextTick = engine.tick;
        for (const id of out.changedBuildings) {
          const b = engine.state.buildings[id];
          if (b) this.dirtyChunks.add(`${Math.floor(b.origin.x / this.layout.chunkSize)},${Math.floor(b.origin.y / this.layout.chunkSize)}`);
        }
        const flushChunks = nextTick % CHUNK_FLUSH_TICKS === 0 ? [...this.dirtyChunks].sort() : [];
        if (flushChunks.length) this.dirtyChunks.clear();
        const snapshot = nextTick % this.config.snapshotEveryTicks === 0 ? JSON.stringify(engine.state) : null;
        const publishView = applied.length > 0 || flushChunks.length > 0 || nextTick % this.config.viewEveryTicks === 0;
        const stateJson = snapshot ?? (publishView ? JSON.stringify(engine.state) : null);

        await session.commitTick({
          nextTick,
          applied,
          events: out.events.map((e) => ({ ...e, at: new Date().toISOString() })),
          actions: out.actions,
          receipts: out.receipts,
          rewards: out.rewards.map((r) => ({ ...r, status: "dry_run" as const })),
          buildStream: (inserted) => this.streamFor(out, inserted, flushChunks),
          snapshot: snapshot ? { tick: nextTick, state: snapshot, hash: hashState(engine.state) } : null,
          view: publishView && stateJson ? gzipSync(stateJson, { level: 1 }) : null,
          pruneStreamOlderThan: nextTick % PRUNE_EVERY_TICKS === 0 ? new Date(Date.now() - this.config.streamRetentionMinutes * 60_000) : null,
        });
        if (nextTick % RECONCILE_EVERY_TICKS === 0) await this.reconcileCommunities();
        const ms = performance.now() - t0;
        this.metrics.ticks += 1;
        this.metrics.lastTickMs = ms;
        this.metrics.avgTickMs = this.metrics.avgTickMs * 0.95 + ms * 0.05;
        return out;
      } catch (e) {
        this.metrics.tickErrors += 1;
        this.log.error({ err: String(e) }, "tick failed; dropping in-memory state");
        // The session marks itself lost on commit failure; make sure we never continue on this engine.
        if (this.session === session) {
          this.session = null;
          this.engine = null;
          await session.release().catch(() => undefined);
        }
        return null;
      }
    });
  }

  private async prefetchCommunities(out: TickOutput) {
    for (const e of out.events)
      if (e.communityId && COMMUNITY_EVENTS.has(e.type) && !this.communityCache.has(e.communityId)) {
        const c = await this.store.getCommunity(e.communityId);
        if (c) this.communityCache.set(c.id, c);
      }
  }

  private streamFor(out: TickOutput, inserted: EconomicEvent[], flushChunks: string[]): StreamDraft[] {
    const tick = out.tick;
    const state = this.engine!.state;
    const drafts: StreamDraft[] = [];
    // Presence/progress must continue updating while an agent works in place.
    // This publishes a read model only; the engine remains the sole economic writer.
    const changed = new Set(out.moves.map((m) => m.id));
    const visible = state.agentOrder.map((id) => state.agents[id]!).filter((a) => changed.has(a.id) || a.taskId !== null);
    for (let offset = 0; offset < visible.length; offset += 128)
      drafts.push(
        streamDraft(`sim:${tick}:moved:${offset}`, "agent.moved", tick, {
          moves: visible.slice(offset, offset + 128).map((a) => ({ id: a.id, pos: cellCenter(a.cell), state: a.status === "paused" ? "paused" as const : a.activity, target: a.target, speed: AGENT_SPEED, agent: toAgentSummary(state, a) })),
        }),
      );
    for (const a of out.actions) drafts.push(streamDraft(`sim:action:${a.id}`, "agent.action", tick, { action: a }));
    for (const e of inserted) drafts.push(streamDraft(`evt:${e.id}`, "activity.created", tick, { event: e }));
    if (out.pricesChanged) drafts.push(streamDraft(`sim:${tick}:prices`, "economy.price_updated", tick, { quotes: marketQuotes(state) }));
    // Chunk updates are markers; API processes expand them from their state view (keeps the stream small).
    for (const key of flushChunks) {
      const [cx, cy] = key.split(",").map(Number) as [number, number];
      drafts.push(streamDraft(`sim:${tick}:chunk:${key}`, "world.chunk.updated", tick, { coord: { cx, cy }, version: tick + 1 }));
    }
    const touched = new Set(out.events.filter((e) => e.communityId && COMMUNITY_EVENTS.has(e.type)).map((e) => e.communityId!));
    for (const id of [...touched].sort()) {
      const c = this.communityCache.get(id);
      if (c) drafts.push(streamDraft(`sim:${tick}:community:${id}`, "community.updated", tick, { community: decorateCommunity(c, state) }));
    }
    return drafts;
  }

  /** Make sure every registered community has been applied to the world (heals a crash between registration and enqueue). */
  private async reconcileCommunities() {
    const state = this.engine?.state;
    if (!state) return;
    for (const c of await this.store.allCommunities())
      if (!state.communities[c.id])
        await this.coord.enqueueCommand({ type: "community.register", communityId: c.id, name: c.name, branding: communityBranding(c.mint) }, `community.register:${c.id}`);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!this.isLeader && Date.now() - this.lastAttempt < this.config.leaderRetryMs) return;
      void this.tickOnce();
    }, this.config.tickMs);
  }

  /** Graceful stop: final snapshot, then release leadership so a standby can take over immediately. */
  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.serial(async () => {
      const session = this.session;
      const engine = this.engine;
      if (!session || !engine || session.lost) return;
      try {
        await session.commitTick({
          nextTick: engine.tick,
          applied: [],
          events: [],
          actions: [],
          receipts: [],
          rewards: [],
          buildStream: () => [],
          snapshot: { tick: engine.tick, state: JSON.stringify(engine.state), hash: hashState(engine.state) },
          view: gzipSync(JSON.stringify(engine.state), { level: 1 }),
          pruneStreamOlderThan: null,
        });
      } catch (e) {
        this.log.warn({ err: String(e) }, "final snapshot failed");
      }
      this.session = null;
      this.engine = null;
      await session.release().catch(() => undefined);
    });
  }

  /** TEST/OPS: abandon leadership without a final snapshot (simulates a crash of this process's leadership). */
  async abandon() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const s = this.session;
    this.session = null;
    this.engine = null;
    await s?.release().catch(() => undefined);
  }
}
