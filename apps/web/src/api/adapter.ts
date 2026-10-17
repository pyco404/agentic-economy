import { roofPalette } from "../world/palette";
import type { CityActivity } from "./state";
import type { z } from "zod";
import {
  routes,
  WorldBootstrap,
  WorldStats,
  Community,
  AgentSummary,
  MarketsResponse,
  Task,
  EconomicEvent,
  TreasurySummary,
  type CreateAgentRequest,
  type PatchAgentRequest,
  type Agent,
  type AgentAction,
  type HolderEligibility,
  type WorldChunk,
} from "./shared";
import {
  generateWorld,
  WORLD_SEED,
  type ChunkVisual,
  type BuildingVisual,
  random,
  hashSeed,
} from "../world/layout";
export interface Dashboard {
  identitySource?: "backend" | "fixtures";
  mode: "demo" | "devnet" | "production";
  bootstrap: WorldBootstrap;
  stats: WorldStats;
  chunks?: ChunkVisual[];
  communities: Community[];
  agents: AgentSummary[];
  markets: MarketsResponse;
  tasks: Task[];
  activities: EconomicEvent[];
  treasury: TreasurySummary;
  worldChunks?: WorldChunk[];
  agentTicks?: Record<string, number>;
  actions?: AgentAction[];
  cityActivity?: CityActivity[];
  streamTick?: number;
}
export interface ApiAdapter {
  kind: "demo" | "http";
  load(signal?: AbortSignal): Promise<Dashboard>;
  createAgent(input: CreateAgentRequest): Promise<AgentSummary>;
  updateAgent(id: string, patch: PatchAgentRequest): Promise<AgentSummary>;
  agentDetails(id: string): Promise<Agent>;
  agentLog(id: string): Promise<AgentAction[]>;
  eligibility(communityId: string): Promise<HolderEligibility>;
}
const now = "2026-10-14T08:00:00.000Z",
  wallet = "11111111111111111111111111111111",
  signature = "1".repeat(88);
const professions = [
  "farmer",
  "manufacturer",
  "merchant",
  "logistics_operator",
  "builder",
  "property_manager",
] as const;
const summaries = [
  "Wheat delivery received at the mill",
  "Bakery completed a production shift",
  "Bread delivered to the neighborhood market",
  "Infrastructure maintenance verified",
  "Warehouse inventory reserved for delivery",
  "A builder began a maintenance task",
];
export function demoDashboard(): Dashboard {
  const communities: Community[] = [
    "Moss Collective",
    "Kiln Works",
    "Harbor Union",
  ].map((name, i) =>
    Community.parse({
      id: `com_demo00${i}`,
      name,
      symbol: ["MOSS", "KILN", "HBR"][i],
      description: [
        "A community building a greener shared city.",
        "Making useful things, one workshop at a time.",
        "Keeping the city connected through reliable deliveries.",
      ][i],
      imageUri: null,
      metadataUri: `https://example.invalid/demo/${i}`,
      mint: wallet,
      launchId: `lch_demo00${i}`,
      launchSignature: signature,
      creatorWallet: wallet,
      feeSharingConfig: null,
      links: {
        pumpFun: "https://pump.fun",
        explorer: "https://explorer.solana.com",
        website: null,
        twitter: null,
        telegram: null,
      },
      headquartersBuildingId: null,
      stats: {
        agents: 48 + i * 12,
        activeAgents: 42 + i * 8,
        verifiedTasks: 128 + i * 72,
        prominence: 240 + i * 180,
      },
      registeredAt: now,
    }),
  );
  const agents = Array.from({ length: 156 }, (_, i) =>
    AgentSummary.parse({
      id: `agt_demo${String(i).padStart(4, "0")}`,
      name:
        ["Rowan", "Ada", "Finn", "Mira", "Theo", "Jun"][i % 6] +
        ` ${Math.floor(i / 6) + 1}`,
      displayName: `Citizen_${String(i).padStart(3, "0")}`,
      identity: { kind: "house", syntheticName: `Citizen_${String(i).padStart(3, "0")}` },
      profession: professions[i % 6],
      communityId: communities[i % 3]!.id,
      ownerWallet: "identity" in AgentSummary.shape ? null : wallet,
      status: "active",
      state: i % 2 ? "delivering" : "working",
      pos: { x: -32 + (i % 6) * 16, y: -32 },
      credits: 240000 + i * 500,
      verifiedTasks: 8 + (i % 20),
      points: 24 + (i % 80),
    }),
  );
  const activities = Array.from({ length: 12 }, (_, i) =>
    EconomicEvent.parse({
      id: `evt_demo${String(i).padStart(4, "0")}`,
      seq: 12 - i,
      tick: 480 - i * 8,
      at: new Date(Date.parse(now) - i * 12000).toISOString(),
      type: i % 2 ? "production.completed" : "task.verified",
      summary: summaries[i % summaries.length],
      agentId: agents[i]!.id,
      buildingId: null,
      communityId: communities[i % 3]!.id,
      data: { demo: true },
    }),
  );
  const quotes = ["wheat", "flour", "bread", "timber", "stone", "energy"].map(
    (resource, i) => ({
      resource,
      price: [2100, 3800, 6200, 4500, 3100, 1800][i],
      bid: 1500,
      ask: 7000,
      supply: 280 - i * 24,
      demand: 180 - i * 15,
      changePct24h: [2.1, -0.8, 3.4, 1.2, -1.5, 0.6][i],
    }),
  );
  const chunks = generateWorld(WORLD_SEED, 156);
  return {
    identitySource: "fixtures",
    mode: "demo",
    bootstrap: WorldBootstrap.parse({
      mode: "demo",
      contractVersion: "0.1.0",
      worldId: "genesis-demo",
      seed: String(WORLD_SEED),
      generatorVersion: 1,
      size: { width: 128, height: 128 },
      chunkSize: 32,
      chunks: chunks.map((c) => ({ cx: c.x, cy: c.z })),
      regions: [],
      catalog: [],
      sim: { tick: 480, tickMs: 1000, serverTime: now, ticksPerDay: 1440 },
    }),
    stats: WorldStats.parse({
      mode: "demo",
      tick: 480,
      population: 1248,
      activeAgents: 156,
      pausedAgents: 0,
      communities: 3,
      buildings: chunks.reduce((sum, c) => sum + c.buildings.length, 0),
      creditsInCirculation: 486200000,
      goodsProduced: { wheat: 840, flour: 510, bread: 320 },
      goodsConsumed: { bread: 280 },
      verifiedTasks: 624,
    }),
    communities,
    agents,
    markets: MarketsResponse.parse({
      mode: "demo",
      tick: 480,
      currency: "CITY_CREDIT_MILLI",
      quotes,
      listings: [],
    }),
    tasks: Array.from({ length: 8 }, (_, i) =>
      Task.parse({
        id: `tsk_demo00${i}`,
        kind: i % 3 ? "delivery" : "maintenance",
        status: i < 5 ? "open" : "verified",
        createdTick: 460,
        expiresTick: 600,
        fromBuildingId: null,
        toBuildingId: "bld_demo0000",
        resource: i % 3 ? "wheat" : null,
        quantity: i % 3 ? 12 : 0,
        rewardCredits: 8000 + i * 1200,
        points: 4 + i,
        claimedBy: i < 5 ? null : agents[i]!.id,
        receiptId: i < 5 ? null : `demo-receipt-${i}`,
      }),
    ),
    activities,
    treasury: TreasurySummary.parse({
      mode: "demo",
      platformTreasury: wallet,
      agentRewardsTreasury: wallet,
      launchFees: {
        description: "Fixture launch fee receipts; no chain transactions.",
        launches: 3,
        totals: [],
      },
      creatorFees: {
        description: "No real creator fees received in this frontend demo.",
        agentRewards: [],
        platform: [],
        expectedSplitBps: { agentRewards: 6000, platform: 4000, launcher: 0 },
        reconciliation: "unreconciled",
        reconciliationNotes: ["Demo fixtures are not on-chain receipts."],
      },
      feeRouting: {
        mechanism: "pump_fees_sharing_config",
        verified: false,
        verifiedPaths: [],
        notes: [
          "Awaiting backend verification of the supported launch and graduation paths.",
        ],
      },
      payouts: {
        mode: "disabled_dry_run",
        description:
          "Contribution points only. No real payouts or guaranteed rewards.",
      },
      recentEntries: [],
      asOf: now,
    }),
  };
}
export class DemoAdapter implements ApiAdapter {
  readonly kind = "demo" as const;
  private data = demoDashboard();
  private strategies = new Map<string, Partial<Agent["strategy"]>>();
  async load() {
    return structuredClone(this.data);
  }
  async createAgent(input: CreateAgentRequest) {
    const id = `agt_demo${String(this.data.agents.length).padStart(4, "0")}`;
    const agent = AgentSummary.parse({
      id,
      name: input.name,
      displayName: `Citizen_${String(this.data.agents.length).padStart(3, "0")}`,
      identity: { kind: "house", syntheticName: `Citizen_${String(this.data.agents.length).padStart(3, "0")}` },
      profession: input.profession,
      communityId: input.communityId,
      ownerWallet: "identity" in AgentSummary.shape ? null : wallet,
      status: "active",
      state: "idle",
      pos: { x: 0, y: 0 },
      credits: input.strategy?.dailyBudget ?? 100000,
      verifiedTasks: 0,
      points: 0,
    });
    this.strategies.set(id, input.strategy ?? {});
    this.data.agents.push(agent);
    this.data.stats.activeAgents++;
    return agent;
  }
  async updateAgent(id: string, patch: PatchAgentRequest) {
    const a = this.data.agents.find((a) => a.id === id);
    if (!a) throw new Error("Agent not found");
    if (patch.status) {
      a.status = patch.status;
      a.state = patch.status === "paused" ? "paused" : "idle";
    }
    if (patch.strategy)
      this.strategies.set(id, {
        ...this.strategies.get(id),
        ...patch.strategy,
      });
    this.data.stats.activeAgents = this.data.agents.filter(
      (a) => a.status === "active",
    ).length;
    this.data.stats.pausedAgents = this.data.agents.filter(
      (a) => a.status === "paused",
    ).length;
    return { ...a };
  }
  async agentDetails(id: string): Promise<Agent> {
    const a = this.data.agents.find((a) => a.id === id);
    if (!a) throw new Error("Agent not found");
    return {
      ...a,
      strategy: {
        temperament: "cooperative",
        risk: "low",
        objective: "reliability",
        dailyBudget: 100000,
        minMarginBps: 500,
        preferredResources: [],
        homeBuildingId: null,
        ...this.strategies.get(id),
      },
      permissions: ["claim_tasks", "trade_market"],
      createdTick: 0,
      target: null,
      path: [],
      currentTaskId: null,
      operatedBuildingId: null,
      cargo: { wheat: 12 },
      performance: {
        creditsEarned: 80000,
        creditsSpent: 40000,
        tasksCompleted: a.verifiedTasks,
        tasksFailed: 0,
        reliabilityPct: 100,
      },
    };
  }
  async agentLog(id: string): Promise<AgentAction[]> {
    return [
      {
        id: "demo-log",
        agentId: id,
        tick: 480,
        kind: "claim_task",
        reason:
          "Demo planner prioritized a nearby delivery with available inventory and a bounded budget.",
        utility: 0.82,
        taskId: null,
        buildingId: null,
        detail: { demo: true },
      },
    ];
  }
  async eligibility(id: string): Promise<HolderEligibility> {
    return {
      wallet,
      communityId: id,
      mint: wallet,
      eligible: true,
      balance: "1000000",
      threshold: "1000000",
      decimals: 6,
      source: "mock_chain",
      slot: null,
      checkedAt: now,
      expiresAt: "2099-01-01T00:00:00.000Z",
    };
  }
}
export function mutedAccent(hex: string, fallback: string): string {
  if (!/^#[a-f0-9]{6}$/i.test(hex)) return fallback;
  const neutral = [204, 207, 191];
  return (
    "#" +
    neutral
      .map((channel, i) =>
        Math.round(
          parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) * 0.38 + channel * 0.62,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function worldChunkToVisual(chunk: WorldChunk): ChunkVisual {
  return {
    id: `${chunk.coord.cx}:${chunk.coord.cy}`,
    x: chunk.coord.cx,
    z: chunk.coord.cy,
    seed: hashSeed(0, chunk.coord.cx, chunk.coord.cy),
    version: chunk.version,
    geometryKey: JSON.stringify([
      chunk.terrain,
      chunk.elevation,
      chunk.buildings.map((b) => [
        b.id,
        b.kind,
        b.origin,
        b.entrance,
        b.params,
        b.status === "reserved_lot"
          ? "reserved_lot"
          : b.status === "under_construction"
            ? "under_construction"
            : "built",
        b.branding,
      ]),
      chunk.props,
    ]),
    terrain: chunk.terrain,
    elevation: chunk.elevation,
    size: chunk.size,
    buildings: chunk.buildings.map((b) => {
      const p = b.params;
      const palette = roofPalette;
      const kindMap: Record<string, BuildingVisual["kind"]> = {
        town_hall: "town-hall",
        apartment: "house",
        lumber_yard: "lumber-yard",
        quarry: "quarry",
        power_station: "power-station",
      };
      return {
        id: b.id,
        status: b.status,
        inventory: b.inventory,
        condition: b.condition,
        sourceKind: b.kind,
        entrance: { x: b.entrance.x + 0.5, z: b.entrance.y + 0.5 },
        elevation:
          Number(
            chunk.elevation[
              (b.origin.y - chunk.coord.cy * chunk.size) * chunk.size +
                (b.origin.x - chunk.coord.cx * chunk.size)
            ] ?? "0",
          ) * 0.08,
        seed: p.seed,
        kind: kindMap[b.kind] ?? (b.kind as BuildingVisual["kind"]),
        x: b.origin.x + p.width / 2,
        z: b.origin.y + p.depth / 2,
        width: p.width,
        depth: p.depth,
        height: p.height,
        floors: p.floors,
        roofStyle: p.roofStyle,
        material: p.material,
        windowPattern: p.windowPattern,
        districtTheme: p.districtTheme,
        roofColor: b.branding?.primary
          ? mutedAccent(b.branding.primary, palette[p.roofPalette]!)
          : palette[p.roofPalette]!,
        rotation: { n: Math.PI, e: -Math.PI / 2, s: 0, w: Math.PI / 2 }[
          p.facing
        ],
        name: b.name,
        chunkId: `${chunk.coord.cx}:${chunk.coord.cy}`,
      };
    }),
    props: chunk.props.map((p) => ({
      kind: p.kind,
      x: p.pos.x + 0.5,
      z: p.pos.y + 0.5,
      scale: p.scale,
      seed: p.seed,
    })),
    trees: chunk.props
      .filter((p) => p.kind.startsWith("tree"))
      .map((p) => ({ x: p.pos.x + 0.5, z: p.pos.y + 0.5, scale: p.scale })),
  };
}
export class HttpAdapter implements ApiAdapter {
  readonly kind = "http" as const;
  constructor(
    private base: string,
    private getToken: () => string | null = () => null,
  ) {}
  get webSocketUrl() {
    const url = new URL(this.base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/api/v1/ws";
    url.search = "";
    url.hash = "";
    return url.href;
  }
  async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: RequestInit = {},
  ): Promise<T> {
    const token = this.getToken();
    const response = await fetch(`${this.base.replace(/\/$/, "")}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(
        body?.error?.message ?? `API request failed (${response.status})`,
      );
    }
    return schema.parse(await response.json());
  }
  async allCommunities(signal?: AbortSignal) {
    const items: Community[] = [],
      seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const query = new URLSearchParams({ limit: "200" });
      if (cursor) query.set("cursor", cursor);
      const page = await this.request(
        `${routes.communities.path}?${query}`,
        routes.communities.response,
        { signal },
      );
      items.push(...page.items);
      cursor = page.nextCursor;
      if (cursor) {
        if (seen.has(cursor))
          throw new Error("Backend returned a repeated community cursor");
        seen.add(cursor);
      }
    } while (cursor);
    return items;
  }
  async load(signal?: AbortSignal): Promise<Dashboard> {
    const get = <S extends z.ZodType>(route: { path: string; response: S }) =>
      this.request(route.path, route.response, { signal }) as Promise<
        z.infer<S>
      >;
    const [
      bootstrap,
      stats,
      communities,
      agents,
      markets,
      tasks,
      activities,
      treasury,
    ] = await Promise.all([
      get(routes.worldBootstrap),
      get(routes.worldStats),
      this.allCommunities(signal),
      get(routes.worldAgents),
      get(routes.markets),
      get(routes.tasks),
      get(routes.activities),
      get(routes.treasury),
    ]);
    const coords = bootstrap.chunks;
    const centerX = coords.length
        ? Math.floor(coords.reduce((n, c) => n + c.cx, 0) / coords.length)
        : 0,
      centerY = coords.length
        ? Math.floor(coords.reduce((n, c) => n + c.cy, 0) / coords.length)
        : 0;
    const chunks = await this.request(
      `${routes.worldChunks.path}?x=${centerX}&y=${centerY}&radius=4`,
      routes.worldChunks.response,
      { signal },
    );
    return {
      identitySource: "backend",
      mode: bootstrap.mode,
      bootstrap,
      stats,
      communities,
      agents: agents.agents,
      markets,
      tasks: tasks.items,
      activities: activities.items,
      treasury,
      chunks: chunks.chunks.map(worldChunkToVisual),
      worldChunks: chunks.chunks,
      agentTicks: Object.fromEntries(
        agents.agents.map((a) => [a.id, agents.tick]),
      ),
    };
  }

  async getChunks(coords: { cx: number; cy: number }[], signal?: AbortSignal) {
    const output: WorldChunk[] = [];
    for (let i = 0; i < coords.length; i += 6) {
      const pages = await Promise.all(
        coords
          .slice(i, i + 6)
          .map((c) =>
            this.request(
              `${routes.worldChunks.path}?x=${c.cx}&y=${c.cy}&radius=0`,
              routes.worldChunks.response,
              { signal },
            ),
          ),
      );
      output.push(...pages.flatMap((p) => p.chunks));
    }
    return output;
  }
  async refreshSummary(signal?: AbortSignal) {
    const [stats, tasks] = await Promise.all([
      this.request(routes.worldStats.path, routes.worldStats.response, {
        signal,
      }),
      this.request(routes.tasks.path, routes.tasks.response, { signal }),
    ]);
    return { stats, tasks: tasks.items };
  }

  async createAgent(input: CreateAgentRequest) {
    const result = await this.request(
      routes.createAgent.path,
      routes.createAgent.response,
      {
        method: "POST",
        body: JSON.stringify(input),
        headers: { "Idempotency-Key": crypto.randomUUID() },
      },
    );
    return result.agent;
  }
  async updateAgent(id: string, patch: PatchAgentRequest) {
    const result = await this.request(
      routes.patchAgent.path.replace(":id", encodeURIComponent(id)),
      routes.patchAgent.response,
      {
        method: "PATCH",
        body: JSON.stringify(patch),
        headers: { "Idempotency-Key": crypto.randomUUID() },
      },
    );
    return result.agent;
  }
  async agentDetails(id: string) {
    return (
      await this.request(
        routes.agent.path.replace(":id", encodeURIComponent(id)),
        routes.agent.response,
      )
    ).agent;
  }
  async agentLog(id: string) {
    return (
      await this.request(
        routes.agentActivity.path.replace(":id", encodeURIComponent(id)),
        routes.agentActivity.response,
      )
    ).items;
  }
  eligibility(id: string) {
    return this.request(
      routes.communityEligibility.path.replace(":id", encodeURIComponent(id)),
      routes.communityEligibility.response,
    );
  }
}
export function createAdapter(): ApiAdapter {
  const source = new URLSearchParams(window.location.search).get("source");
  const mode =
    source === "fixtures"
      ? "demo"
      : source === "backend"
        ? "api"
        : (import.meta.env.VITE_DATA_MODE ?? "api");
  if (mode === "demo") return new DemoAdapter();
  if (mode === "api")
    return new HttpAdapter(
      import.meta.env.VITE_API_URL ?? "http://localhost:8787",
    );
  throw new Error("VITE_DATA_MODE must be demo or api");
}
export function numericSeed(seed: string): number {
  const n = Number(seed);
  if (Number.isFinite(n)) return n >>> 0;
  let hash = 0;
  for (const c of seed) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) | 0;
  return hash >>> 0;
}
export function illustrativeActivity(seq: number): EconomicEvent {
  const rng = random(seq);
  return {
    id: `evt_demo${String(seq).padStart(4, "0")}`,
    seq,
    tick: 480 + seq,
    at: new Date().toISOString(),
    type: "task.verified",
    summary: summaries[Math.floor(rng() * summaries.length)]!,
    agentId: null,
    buildingId: null,
    communityId: null,
    data: { demo: true },
  };
}
