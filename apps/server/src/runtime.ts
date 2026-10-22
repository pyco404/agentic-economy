import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { CONTRACT_VERSION, type ChunkCoord, type ServerEvent, type ServerEventOf, type ServerEventType, type WorldBootstrap, type WorldChunk } from "@agentic-economy/shared";
import { GENERATOR_VERSION, buildingCatalog, chunkCoords, chunkOfCell, extractChunk, generateWorld, type BuildingPlacement, type StaticChunk, type WorldLayout } from "@agentic-economy/world-spec";
import type { AppConfig, Role } from "./config.js";
import type { Coordinator } from "./coord/types.js";
import { TICKS_PER_DAY } from "./sim/engine.js";
import type { SimState, TickOutput } from "./sim/types.js";
import { toAgentSummary, toBuilding } from "./sim/view.js";
import type { Store } from "./store/types.js";
import { CommandBus, EventHub, StateReader } from "./roles/read-model.js";
import { SimWorker, type Logger } from "./roles/sim-worker.js";

export type { Logger } from "./roles/sim-worker.js";

/**
 * Per-process composition of the world for a ROLE:
 * - sim / all:  SimWorker (single writer, only while holding leadership)
 * - api / all:  StateReader (live engine if co-located leader, else published view), EventHub (durable stream), CommandBus
 * The layout itself is regenerated locally from the persisted seed (pure function; not "simulation").
 */
export class CityRuntime {
  private readonly placements: Map<string, BuildingPlacement>;
  private readonly staticChunks = new Map<string, StaticChunk>();
  private readonly chunkVersions = new Map<string, number>();
  private baseVersion = 0;

  private constructor(
    readonly config: AppConfig,
    readonly role: Role,
    readonly layout: WorldLayout,
    readonly coord: Coordinator,
    readonly sim: SimWorker | null,
    readonly reader: StateReader,
    readonly hub: EventHub | null,
    readonly bus: CommandBus,
  ) {
    this.placements = new Map(layout.buildings.map((b) => [b.id, b]));
    for (const c of chunkCoords(layout)) this.chunkVersions.set(`${c.cx},${c.cy}`, 0);
    if (hub)
      hub.expand = (e) => {
        if (e.type !== "world.chunk.updated") return e;
        const marker = e.data as unknown as { coord: ChunkCoord; version: number };
        this.chunkVersions.set(`${marker.coord.cx},${marker.coord.cy}`, marker.version);
        if (!this.reader.available) return null;
        const chunk = this.chunk(marker.coord);
        return chunk ? ({ ...e, data: { chunk } } as ServerEvent) : null;
      };
  }

  static async create(config: AppConfig, store: Store, coord: Coordinator, log: Logger): Promise<CityRuntime> {
    const layout = generateWorld(config.worldSeed);
    const meta = await store.initWorldMeta({ worldId: layout.worldId, seed: config.worldSeed, generatorVersion: GENERATOR_VERSION, createdAt: new Date().toISOString() });
    if (meta.seed !== config.worldSeed || meta.generatorVersion !== GENERATOR_VERSION)
      throw new Error(
        `Persisted world was created with seed "${meta.seed}" / generator v${meta.generatorVersion}; refusing to start with seed "${config.worldSeed}" / v${GENERATOR_VERSION}. Worlds are persistent — migrate explicitly.`,
      );
    const role = config.role;
    const holder = `${process.env.RAILWAY_REPLICA_ID ?? hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
    const sim = role === "sim" || role === "all" ? new SimWorker(config, layout, coord, store, log, holder) : null;
    const reader = new StateReader(coord, sim, log);
    const hub = role === "api" || role === "all" ? new EventHub(coord, log) : null;
    const bus = new CommandBus(coord, reader, sim);
    const rt = new CityRuntime(config, role, layout, coord, sim, reader, hub, bus);
    if (sim) await sim.ensureLeader();
    if (role === "api" || role === "all") {
      await reader.start();
      await bus.start();
      await hub!.start();
    }
    rt.baseVersion = reader.tick;
    log.info({ role, tick: reader.tick, worldId: layout.worldId, simLeader: sim?.isLeader ?? null }, "city runtime ready");
    return rt;
  }

  /* ------------------------------------------------------------ lifecycle */

  start() {
    this.sim?.start();
  }

  async stop() {
    await this.sim?.stop();
    await this.hub?.stop();
    await this.bus.stop();
    this.reader.stop();
  }

  /** Run one simulation tick in this process (tests/scripts). Returns null if this process is not the leader. */
  async tickOnce(): Promise<TickOutput | null> {
    if (!this.sim) throw new Error(`ROLE=${this.role} does not run the simulation`);
    const out = await this.sim.tickOnce();
    await this.hub?.drain();
    return out;
  }

  get state(): SimState {
    return this.reader.state;
  }

  get tick(): number {
    return this.reader.tick;
  }

  get running(): boolean {
    return this.sim?.looping ?? false;
  }

  publish<T extends ServerEventType>(key: string, type: T, tick: number, data: ServerEventOf<T>["data"]) {
    if (!this.hub) throw new Error(`ROLE=${this.role} has no event hub`);
    return this.hub.publish(key, type, tick, data);
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
      sim: { tick: this.tick, tickMs: this.config.tickMs, serverTime: new Date().toISOString(), ticksPerDay: TICKS_PER_DAY },
    };
  }

  private version(key: string) {
    return Math.max(this.chunkVersions.get(key) ?? 0, this.baseVersion);
  }

  chunk(coord: ChunkCoord): WorldChunk | null {
    const key = `${coord.cx},${coord.cy}`;
    if (!this.chunkVersions.has(key)) return null;
    let st = this.staticChunks.get(key);
    if (!st) {
      st = extractChunk(this.layout, coord);
      this.staticChunks.set(key, st);
    }
    const s = this.state;
    return {
      coord,
      size: st.size,
      version: this.version(key),
      terrain: st.terrain,
      elevation: st.elevation,
      buildings: st.buildings.map((p) => toBuilding(this.layout, p, s.buildings[p.id]!)),
      props: st.props,
    };
  }

  building(id: string) {
    const p = this.placements.get(id);
    const b = this.state.buildings[id];
    return p && b ? toBuilding(this.layout, p, b) : null;
  }

  chunkOf(pos: { x: number; y: number }): ChunkCoord {
    return chunkOfCell(this.layout, Math.floor(pos.x), Math.floor(pos.y));
  }

  agentSummaries() {
    const s = this.state;
    return s.agentOrder.filter(id => s.agents[id]!.identity.kind !== "aeco_observed" || s.agents[id]!.status === "active").map((id) => toAgentSummary(s, s.agents[id]!));
  }

  chunkVersionList() {
    return [...this.chunkVersions.keys()].map((k) => {
      const [cx, cy] = k.split(",").map(Number) as [number, number];
      return { coord: { cx, cy }, version: this.version(k) };
    });
  }
}
