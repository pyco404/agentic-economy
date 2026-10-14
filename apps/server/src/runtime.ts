import {
  CONTRACT_VERSION,
  WS_PROTOCOL_VERSION,
  type AgentAction,
  type ChunkCoord,
  type RewardRecord,
  type ServerEvent,
  type ServerEventOf,
  type ServerEventType,
  type TaskReceipt,
  type WorldBootstrap,
  type WorldChunk,
} from "@agentic-economy/shared";
import { GENERATOR_VERSION, buildingCatalog, chunkCoords, chunkOfCell, extractChunk, generateWorld, type BuildingPlacement, type StaticChunk, type WorldLayout } from "@agentic-economy/world-spec";
import type { AppConfig } from "./config.js";
import { SimEngine, createInitialState, hashState, TICKS_PER_DAY, AGENT_SPEED } from "./sim/engine.js";
import type { SimCommand, SimState, TickOutput } from "./sim/types.js";
import { cellCenter, marketQuotes, toAgentSummary, toBuilding } from "./sim/view.js";
import type { NewEvent, Store } from "./store/types.js";

export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

type Listener = (e: ServerEvent) => void;

const RING_SIZE = 2_000;
const CHUNK_FLUSH_TICKS = 10;

/**
 * Owns the persistent world and the authoritative simulation:
 * - generates the layout from the persisted seed (refuses to start if seed/generator changed),
 * - restores the latest snapshot and replays the command log (deterministic recovery),
 * - runs the tick loop, persists outputs, and publishes sequenced WebSocket envelopes.
 * All mutations of the engine go through `serial()` so ticks and commands never interleave.
 */
export class CityRuntime {
  readonly layout: WorldLayout;
  readonly engine: SimEngine;
  private readonly placements: Map<string, BuildingPlacement>;
  private readonly staticChunks = new Map<string, StaticChunk>();
  private readonly chunkVersions = new Map<string, number>();
  private readonly dirtyChunks = new Set<string>();
  private readonly listeners = new Set<Listener>();
  private readonly ring: ServerEvent[] = [];
  private seq = 0;
  private commandSeq: number;
  private lock: Promise<unknown> = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;
  private tickWaiters: Array<() => void> = [];
  private lastTickMs = 0;
  readonly metrics = { ticks: 0, tickErrors: 0, avgTickMs: 0, eventsPersisted: 0 };
  /** Hook for services that derive views from sim events (e.g. community HQ updates). */
  onSimEvents: ((events: NewEvent[]) => void) | null = null;

  private constructor(
    readonly config: AppConfig,
    readonly store: Store,
    private readonly log: Logger,
    layout: WorldLayout,
    engine: SimEngine,
    commandSeq: number,
  ) {
    this.layout = layout;
    this.engine = engine;
    this.commandSeq = commandSeq;
    this.placements = new Map(layout.buildings.map((b) => [b.id, b]));
    for (const c of chunkCoords(layout)) this.chunkVersions.set(`${c.cx},${c.cy}`, engine.tick);
  }

  static async create(config: AppConfig, store: Store, log: Logger): Promise<CityRuntime> {
    const layout = generateWorld(config.worldSeed);
    const meta = await store.initWorldMeta({ worldId: layout.worldId, seed: config.worldSeed, generatorVersion: GENERATOR_VERSION, createdAt: new Date().toISOString() });
    if (meta.seed !== config.worldSeed || meta.generatorVersion !== GENERATOR_VERSION)
      throw new Error(
        `Persisted world was created with seed "${meta.seed}" / generator v${meta.generatorVersion}; refusing to start with seed "${config.worldSeed}" / v${GENERATOR_VERSION}. Worlds are persistent — migrate explicitly.`,
      );

    const snap = await store.loadLatestSnapshot();
    const state: SimState = snap ? (JSON.parse(snap.state) as SimState) : createInitialState(layout);
    if (snap && hashState(state) !== snap.hash) throw new Error(`snapshot at tick ${snap.tick} failed its integrity hash`);
    const engine = new SimEngine(state, layout);
    const rt = new CityRuntime(config, store, log, layout, engine, (await store.maxCommandSeq()) + 1);

    // Deterministic replay of commands logged after the snapshot.
    const commands = await store.commandsFrom(engine.tick);
    if (commands.length > 0) {
      const lastTick = Math.max(...commands.map((c) => c.tick));
      log.info({ from: engine.tick, to: lastTick, commands: commands.length }, "replaying command log");
      while (engine.tick <= lastTick) {
        for (const c of commands.filter((c) => c.tick === engine.tick)) engine.enqueueLogged(c);
        await rt.persist(engine.step(), false);
      }
    }
    log.info({ tick: engine.tick, worldId: layout.worldId, restored: Boolean(snap) }, "city runtime ready");
    return rt;
  }

  /* ------------------------------------------------------------ loop */

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tickOnce().catch((e) => {
        this.metrics.tickErrors += 1;
        this.log.error({ err: e }, "tick failed");
      });
    }, this.config.tickMs);
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.serial(async () => this.snapshot());
  }

  /** Run exactly one tick (also used directly by tests and when the loop is not running). */
  tickOnce(): Promise<TickOutput> {
    return this.serial(async () => {
      const t0 = performance.now();
      const out = this.engine.step();
      await this.persist(out, true);
      if (this.engine.tick % this.config.snapshotEveryTicks === 0) await this.snapshot();
      this.lastTickMs = performance.now() - t0;
      this.metrics.ticks += 1;
      this.metrics.avgTickMs = this.metrics.avgTickMs * 0.95 + this.lastTickMs * 0.05;
      const waiters = this.tickWaiters;
      this.tickWaiters = [];
      for (const w of waiters) w();
      return out;
    });
  }

  private async snapshot() {
    const state = this.engine.state;
    await this.store.saveSnapshot(state.tick, JSON.stringify(state), hashState(state));
  }

  /** Persist a command, queue it for the next tick, and resolve once that tick has run. */
  async submit(command: SimCommand): Promise<void> {
    await this.serial(async () => {
      const logged = this.engine.enqueue(command, this.commandSeq++);
      await this.store.appendCommand(logged);
    });
    if (this.running) await new Promise<void>((resolve) => this.tickWaiters.push(resolve));
    else await this.tickOnce();
  }

  /** Commands queued but not yet applied (used for per-wallet agent caps). */
  pendingAgentCreates(wallet: string, communityId: string): number {
    return this.engine.queued.filter(
      (c) => c.command.type === "agent.create" && c.command.ownerWallet === wallet && c.command.communityId === communityId,
    ).length;
  }

  private async persist(out: TickOutput, live: boolean) {
    const now = new Date().toISOString();
    const events: NewEvent[] = out.events.map((e) => ({ ...e, at: now }));
    const actions: AgentAction[] = out.actions;
    const receipts: TaskReceipt[] = out.receipts;
    const rewards: RewardRecord[] = out.rewards.map((r) => ({ ...r, status: "dry_run" as const }));
    const inserted = await this.store.appendSimOutputs({ events, actions, receipts, rewards });
    this.metrics.eventsPersisted += inserted.length;
    if (!live) return;

    if (inserted.length && this.onSimEvents) this.onSimEvents(events);
    const tick = out.tick;
    if (out.moves.length)
      this.publish("agent.moved", tick, {
        moves: out.moves.map((m) => ({ id: m.id, pos: cellCenter(m.cell), state: m.activity, target: m.target, speed: AGENT_SPEED })),
      });
    for (const a of actions) this.publish("agent.action", tick, { action: a });
    for (const e of inserted) this.publish("activity.created", tick, { event: e });
    if (out.pricesChanged) this.publish("economy.price_updated", tick, { quotes: marketQuotes(this.engine.state) });

    for (const id of out.changedBuildings) {
      const b = this.engine.state.buildings[id];
      if (b) this.dirtyChunks.add(`${Math.floor(b.origin.x / this.layout.chunkSize)},${Math.floor(b.origin.y / this.layout.chunkSize)}`);
    }
    if (this.engine.tick % CHUNK_FLUSH_TICKS === 0 && this.dirtyChunks.size) {
      for (const key of [...this.dirtyChunks].sort()) {
        const [cx, cy] = key.split(",").map(Number) as [number, number];
        this.chunkVersions.set(key, this.engine.tick);
        this.publish("world.chunk.updated", tick, { chunk: this.chunk({ cx, cy })! });
      }
      this.dirtyChunks.clear();
    }
  }

  /* ------------------------------------------------------------ events */

  publish<T extends ServerEventType>(type: T, tick: number, data: ServerEventOf<T>["data"]): ServerEvent {
    const sequenced = type !== "system.heartbeat";
    const env = { v: WS_PROTOCOL_VERSION, type, seq: sequenced ? ++this.seq : this.seq, tick, ts: new Date().toISOString(), data } as ServerEvent;
    if (sequenced) {
      this.ring.push(env);
      if (this.ring.length > RING_SIZE) this.ring.shift();
    }
    for (const l of this.listeners) l(env);
    return env;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  get currentSeq(): number {
    return this.seq;
  }

  /** Events after `lastSeq`, or null if the gap is no longer in the ring buffer (client needs a snapshot). */
  eventsSince(lastSeq: number): ServerEvent[] | null {
    if (lastSeq > this.seq) return null; // server restarted: client is ahead of us
    if (lastSeq === this.seq) return [];
    const first = this.ring[0];
    if (!first || first.seq > lastSeq + 1) return null;
    return this.ring.filter((e) => e.seq > lastSeq);
  }

  /* ------------------------------------------------------------ views */

  bootstrap(): WorldBootstrap {
    return {
      mode: this.config.mode,
      contractVersion: CONTRACT_VERSION,
      worldId: this.layout.worldId,
      seed: this.layout.seed,
      generatorVersion: this.layout.generatorVersion,
      size: { width: this.layout.width, height: this.layout.height },
      chunkSize: this.layout.chunkSize,
      chunks: chunkCoords(this.layout),
      regions: this.layout.regions,
      catalog: buildingCatalog(),
      sim: { tick: this.engine.tick, tickMs: this.config.tickMs, serverTime: new Date().toISOString(), ticksPerDay: TICKS_PER_DAY },
    };
  }

  chunk(coord: ChunkCoord): WorldChunk | null {
    const key = `${coord.cx},${coord.cy}`;
    if (!this.chunkVersions.has(key)) return null;
    let st = this.staticChunks.get(key);
    if (!st) {
      st = extractChunk(this.layout, coord);
      this.staticChunks.set(key, st);
    }
    const s = this.engine.state;
    return {
      coord,
      size: st.size,
      version: this.chunkVersions.get(key)!,
      terrain: st.terrain,
      elevation: st.elevation,
      buildings: st.buildings.map((p) => toBuilding(this.layout, p, s.buildings[p.id]!)),
      props: st.props,
    };
  }

  building(id: string) {
    const p = this.placements.get(id);
    const b = this.engine.state.buildings[id];
    return p && b ? toBuilding(this.layout, p, b) : null;
  }

  chunkOf(pos: { x: number; y: number }): ChunkCoord {
    return chunkOfCell(this.layout, Math.floor(pos.x), Math.floor(pos.y));
  }

  agentSummaries() {
    const s = this.engine.state;
    return s.agentOrder.map((id) => toAgentSummary(s, s.agents[id]!));
  }

  chunkVersionList() {
    return [...this.chunkVersions.entries()].map(([k, version]) => {
      const [cx, cy] = k.split(",").map(Number) as [number, number];
      return { coord: { cx, cy }, version };
    });
  }

  health() {
    return { tick: this.engine.tick, running: this.running, lastTickMs: this.lastTickMs, contractVersion: CONTRACT_VERSION };
  }
}
