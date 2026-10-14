import { createHash } from "node:crypto";
import { RESOURCES, type AgentPermission, type AgentStrategy, type GridPos, type Profession, type Resource, type TaskKind } from "@agentic-economy/shared";
import { KIND_SPECS, Rng, deriveSeed, type WorldLayout } from "@agentic-economy/world-spec";
import { NavGrid } from "./nav.js";
import { UtilityPlanner, type Planner, type TaskCandidate } from "./planner.js";
import {
  CITY_ACCOUNT,
  RESIDENTS_ACCOUNT,
  agentAccount,
  balanceOf,
  burn,
  escrowAccount,
  genesisIssue,
  issue,
  transfer,
  tryTransfer,
} from "./ledger.js";
import type {
  AgentSimState,
  BuildingState,
  LoggedCommand,
  Lot,
  SimAction,
  SimCommand,
  SimEvent,
  SimReceipt,
  SimState,
  TaskState,
  TickOutput,
} from "./types.js";

/* ------------------------------------------------------------ tuning */

export const TICKS_PER_DAY = 240;
export const AGENT_SPEED = 2; // cells per tick
const TASK_GEN_INTERVAL = 5;
const MARKET_INTERVAL = 10;
const DECISION_COOLDOWN = 4;
const CITY_PORTER_AFTER = 120; // ticks an unclaimed delivery waits before the city handles it (low-fidelity background labour)
const OPEN_TASK_TTL = 300;
const CLAIMED_TASK_TTL = 400;
const MAX_LOT_PATH = 8;
const MAX_CARRY = 10;
const SHIFT_TICKS = 30;
const REPAIR_TICKS = 6;
const AGENT_POINTS_CAP_PER_EPOCH = 300;
const BREAD_PER_RESIDENT_PER_DAY = 1 / 12;
const STARTER_GRANT = 50_000; // 50 CC, transferred from the city (not newly issued)
const AGENT_DAILY_UPKEEP = 5_000; // burned
const BUILDING_DAILY_UPKEEP = 500; // burned from operator account per production building
const TRADE_BURN_BPS = 100; // 1% of resident purchases burned
const GENESIS_CITY_CREDITS = 500_000_000;
const GENESIS_RESIDENT_CREDITS = 100_000_000;
const ISSUANCE_PER_RESIDENT_PER_DAY = 1_000;

export const BASE_PRICES: Record<Resource, number> = {
  wheat: 2_000,
  flour: 5_000,
  bread: 9_000,
  timber: 3_000,
  stone: 3_000,
  energy: 1_500,
};

const DEFAULT_PERMISSIONS: AgentPermission[] = ["claim_tasks", "trade_market", "operate_building", "perform_maintenance"];

const TASK_PROFESSIONS: Record<Exclude<TaskKind, "production_shift">, Profession[]> = {
  delivery: ["logistics_operator", "merchant"],
  demand_fulfillment: ["merchant", "logistics_operator"],
  maintenance: ["builder", "property_manager"],
};

export const DEFAULT_STRATEGY: AgentStrategy = {
  temperament: "balanced",
  risk: "medium",
  objective: "profitability",
  dailyBudget: 20_000,
  minMarginBps: 500,
  preferredResources: [],
  homeBuildingId: null,
};

/* ------------------------------------------------------------ helpers */

const zeroByResource = (): Record<Resource, number> => Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>;
const lotQty = (lots: readonly Lot[] | undefined) => (lots ?? []).reduce((n, l) => n + l.qty, 0);
const same = (a: GridPos, b: GridPos) => a.x === b.x && a.y === b.y;

export function stockQty(b: BuildingState, r: Resource): number {
  return lotQty(b.stock[r]);
}

function totalHeld(b: BuildingState): number {
  let n = 0;
  for (const r of RESOURCES) n += stockQty(b, r);
  for (const res of Object.values(b.reserved)) n += lotQty(res.lots);
  return n;
}

/** Remove `qty` units FIFO from a lot list, returning the removed (possibly split) lots. */
function takeLots(lots: Lot[], qty: number): Lot[] {
  const out: Lot[] = [];
  let need = qty;
  while (need > 0 && lots.length > 0) {
    const head = lots[0]!;
    if (head.qty <= need) {
      out.push(head);
      lots.shift();
      need -= head.qty;
    } else {
      head.qty -= need;
      out.push({ id: head.id, qty: need, path: [...head.path] });
      need = 0;
    }
  }
  if (need > 0) throw new Error("takeLots: insufficient quantity (invariant violated)");
  return out;
}

function canonicalHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function hashState(state: SimState): string {
  return canonicalHash(state);
}

/* ------------------------------------------------------------ init */

export function createInitialState(layout: WorldLayout): SimState {
  const rng = new Rng(deriveSeed(layout.seed, "sim"));
  const buildings: Record<string, BuildingState> = {};
  const order: string[] = [];
  let lotCounter = 0;
  const seedLot = (bId: string, qty: number): Lot => ({ id: `lot_${(++lotCounter).toString(36)}`, qty, path: [bId] });
  const initialStock: Partial<Record<string, Partial<Record<Resource, number>>>> = {
    farm: { wheat: 10 },
    mill: { wheat: 6, energy: 3, flour: 4 },
    bakery: { flour: 6, energy: 3, bread: 6 },
    market: { bread: 12 },
    power_station: { energy: 9 },
    lumber_yard: { timber: 6 },
    quarry: { stone: 6 },
    warehouse: { timber: 10, stone: 10 },
  };

  let population = 0;
  for (const p of layout.buildings) {
    const spec = KIND_SPECS[p.kind];
    const stock: BuildingState["stock"] = {};
    for (const [r, q] of Object.entries(initialStock[p.kind] ?? {})) stock[r as Resource] = [seedLot(p.id, q)];
    const masonry = ["stone", "brick", "concrete", "glass"].includes(p.params.material);
    buildings[p.id] = {
      id: p.id,
      kind: p.kind,
      name: p.name,
      origin: p.origin,
      entrance: p.entrance,
      status: p.status === "reserved_lot" ? "reserved_lot" : "active",
      condition: p.status === "reserved_lot" ? 100 : 62 + rng.int(0, 38),
      account: CITY_ACCOUNT,
      ownerAgentId: null,
      communityId: null,
      branding: null,
      stock,
      reserved: {},
      production: { progress: 0, running: false, inputsConsumed: false },
      workerAgentId: null,
      repairResource: masonry ? "stone" : "timber",
      storageCapacity: spec.storageCapacity,
    };
    order.push(p.id);
    if (p.kind === "house") population += 4;
    if (p.kind === "apartment") population += 12;
  }

  const ledger = { balances: {}, issued: 0, burned: 0, issuedThisEpoch: 0 };
  genesisIssue(ledger, CITY_ACCOUNT, GENESIS_CITY_CREDITS);
  genesisIssue(ledger, RESIDENTS_ACCOUNT, GENESIS_RESIDENT_CREDITS);

  const market = Object.fromEntries(RESOURCES.map((r) => [r, { price: BASE_PRICES[r], dayAgo: BASE_PRICES[r] }])) as SimState["market"];

  return {
    version: 1,
    worldSeed: layout.seed,
    tick: 0,
    rngState: rng.seedState,
    counters: { action: 0, task: 0, lot: lotCounter, receipt: 0, event: 0 },
    buildings,
    buildingOrder: order,
    agents: {},
    agentOrder: [],
    tasks: {},
    ledger,
    stats: { produced: zeroByResource(), consumed: zeroByResource(), verifiedTasks: 0, verifiedTasksThisEpoch: 0, pointsThisEpoch: 0 },
    market,
    residents: { population, breadBacklog: 0 },
    receiptsHead: "0".repeat(64),
    epoch: 0,
    epochPoints: {},
    epochReceipts: {},
    communities: {},
  };
}

/* ------------------------------------------------------------ engine */

export class SimEngine {
  readonly nav: NavGrid;
  private rng: Rng;
  private out!: TickOutput;
  private pending: LoggedCommand[] = [];

  constructor(
    public state: SimState,
    layout: WorldLayout,
    private readonly planner: Planner = new UtilityPlanner(),
  ) {
    this.nav = new NavGrid(layout.width, layout.height, layout.terrain);
    this.rng = new Rng(state.rngState);
  }

  get tick(): number {
    return this.state.tick;
  }

  /** Queue a command for the NEXT tick. Returns the tick it will be applied at (for the command log). */
  enqueue(command: SimCommand, seq: number): LoggedCommand {
    const logged = { tick: this.state.tick, seq, command };
    this.pending.push(logged);
    return logged;
  }

  /** Commands queued for the next tick (read-only view). */
  get queued(): readonly LoggedCommand[] {
    return this.pending;
  }

  /** Re-queue a logged command during replay (must target the current tick). */
  enqueueLogged(logged: LoggedCommand): void {
    if (logged.tick !== this.state.tick) throw new Error(`replay command for tick ${logged.tick} at tick ${this.state.tick}`);
    this.pending.push(logged);
  }

  step(): TickOutput {
    const s = this.state;
    this.out = { tick: s.tick, events: [], actions: [], receipts: [], rewards: [], moves: [], pricesChanged: false, changedBuildings: [] };

    const cmds = this.pending.sort((a, b) => a.seq - b.seq);
    this.pending = [];
    for (const c of cmds) this.applyCommand(c.command);

    if (s.tick % MARKET_INTERVAL === 0) this.payResidentWages();
    if (s.tick % TASK_GEN_INTERVAL === 0) this.generateTasks();
    for (const id of s.agentOrder) this.stepAgent(s.agents[id]!);
    this.runProduction();
    if (s.tick % MARKET_INTERVAL === 0) this.residentsBuyBread();
    this.cityBackgroundLabour();
    this.expireTasks();
    if (s.tick % MARKET_INTERVAL === 5) this.updatePrices();

    s.tick += 1;
    if (s.tick % TICKS_PER_DAY === 0) this.closeEpoch();
    s.rngState = this.rng.seedState;
    return this.out;
  }

  /* ---------------------------------------------------------- commands */

  private applyCommand(c: SimCommand) {
    const s = this.state;
    switch (c.type) {
      case "agent.create": {
        if (s.agents[c.agentId]) return; // idempotent
        const hq = s.communities[c.communityId]?.hqBuildingId;
        const spawnBuilding = (hq && s.buildings[hq]) || s.buildings[s.buildingOrder.find((id) => s.buildings[id]!.kind === "town_hall")!]!;
        const agent: AgentSimState = {
          id: c.agentId,
          name: c.name,
          ownerWallet: c.ownerWallet,
          communityId: c.communityId,
          profession: c.profession,
          status: "active",
          activity: "idle",
          strategy: c.strategy,
          permissions: [...DEFAULT_PERMISSIONS],
          createdTick: s.tick,
          cell: { ...spawnBuilding.entrance },
          path: [],
          target: null,
          taskId: null,
          busyTicks: 0,
          cargo: null,
          spentToday: 0,
          perf: { creditsEarned: 0, creditsSpent: 0, tasksCompleted: 0, tasksFailed: 0 },
          totalPoints: 0,
          verifiedTasks: 0,
          nextDecisionTick: s.tick,
        };
        s.agents[c.agentId] = agent;
        s.agentOrder.push(c.agentId);
        const granted = tryTransfer(s.ledger, CITY_ACCOUNT, agentAccount(c.agentId), STARTER_GRANT);
        this.event("agent.activated", `${c.name} joined the city as a ${c.profession.replace(/_/g, " ")}`, {
          agentId: c.agentId,
          communityId: c.communityId,
          data: { profession: c.profession, starterGrant: granted ? STARTER_GRANT : 0 },
        });
        return;
      }
      case "agent.update": {
        const a = s.agents[c.agentId];
        if (!a) return;
        if (c.strategy) {
          a.strategy = { ...a.strategy, ...c.strategy };
          this.event("agent.strategy_updated", `${a.name} updated strategy`, { agentId: a.id, communityId: a.communityId, data: { strategy: a.strategy } });
        }
        if (c.status && c.status !== a.status) {
          a.status = c.status;
          if (c.status === "paused") {
            if (a.taskId) this.releaseTask(a, "agent paused by owner");
            a.activity = "paused";
            a.path = [];
            a.target = null;
            this.event("agent.paused", `${a.name} was paused by its owner`, { agentId: a.id, communityId: a.communityId });
          } else {
            a.activity = "idle";
            a.nextDecisionTick = s.tick;
            this.event("agent.resumed", `${a.name} resumed work`, { agentId: a.id, communityId: a.communityId });
          }
          this.out.moves.push({ id: a.id, cell: a.cell, activity: a.activity, target: a.target });
        }
        return;
      }
      case "community.register": {
        if (s.communities[c.communityId]) return;
        const lotId = s.buildingOrder.find((id) => {
          const b = s.buildings[id]!;
          return b.kind === "headquarters" && b.status === "reserved_lot";
        });
        s.communities[c.communityId] = { communityId: c.communityId, hqBuildingId: lotId ?? null };
        if (lotId) {
          const b = s.buildings[lotId]!;
          b.status = "active";
          b.communityId = c.communityId;
          b.branding = c.branding;
          b.name = `${c.name} HQ`;
          b.condition = 100;
          s.residents.population += 6; // HQ staff
          this.out.changedBuildings.push(lotId);
          this.event("building.placed", `${c.name} opened its headquarters`, { buildingId: lotId, communityId: c.communityId, data: { kind: "headquarters" } });
        }
        this.event("community.registered", `${c.name} joined Agentic Economy`, { communityId: c.communityId, data: { hqBuildingId: lotId ?? null } });
        return;
      }
    }
  }

  /* ---------------------------------------------------------- outputs */

  private event(type: SimEvent["type"], summary: string, o: { agentId?: string; buildingId?: string; communityId?: string; data?: Record<string, unknown> } = {}) {
    const s = this.state;
    s.counters.event += 1;
    this.out.events.push({
      id: `evt_${s.tick.toString(36).padStart(7, "0")}${this.out.events.length.toString(36).padStart(3, "0")}`,
      tick: s.tick,
      type,
      summary,
      agentId: o.agentId ?? null,
      buildingId: o.buildingId ?? null,
      communityId: o.communityId ?? null,
      data: o.data ?? {},
    });
  }

  private action(a: AgentSimState, kind: SimAction["kind"], reason: string, o: { utility?: number; taskId?: string | null; buildingId?: string | null; detail?: Record<string, unknown> } = {}) {
    const s = this.state;
    s.counters.action += 1;
    this.out.actions.push({
      id: `act_${s.counters.action.toString(36)}`,
      agentId: a.id,
      tick: s.tick,
      kind,
      reason,
      utility: o.utility ?? 0,
      taskId: o.taskId ?? null,
      buildingId: o.buildingId ?? null,
      detail: o.detail ?? {},
    });
  }

  private newLot(buildingId: string, qty: number): Lot {
    this.state.counters.lot += 1;
    return { id: `lot_${this.state.counters.lot.toString(36)}`, qty, path: [buildingId] };
  }

  /* ---------------------------------------------------------- tasks */

  private incoming(bId: string, r: Resource): number {
    let n = 0;
    for (const t of Object.values(this.state.tasks)) if (t.toBuildingId === bId && t.resource === r && (t.status === "open" || t.status === "claimed" || t.status === "in_progress") && t.kind !== "maintenance") n += t.quantity;
    return n;
  }

  private openTaskFor(bId: string, kind: TaskKind): boolean {
    return Object.values(this.state.tasks).some((t) => t.toBuildingId === bId && t.kind === kind && (t.status === "open" || t.status === "claimed" || t.status === "in_progress"));
  }

  private findSupplier(r: Resource, consumer: BuildingState, kinds: readonly string[]): BuildingState | null {
    let best: BuildingState | null = null;
    let bestD = Infinity;
    for (const id of this.state.buildingOrder) {
      const b = this.state.buildings[id]!;
      if (b.id === consumer.id || !kinds.includes(b.kind) || b.status === "reserved_lot") continue;
      if (stockQty(b, r) <= 0) continue;
      const d = this.nav.distance(b.entrance, consumer.entrance);
      if (d === null) continue;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  private createTask(kind: TaskKind, to: BuildingState, opts: { from?: BuildingState; resource?: Resource; qty?: number; reward: number; goods: number; points: number; professions: Profession[]; work?: number }): TaskState | null {
    const s = this.state;
    const payer = to.account;
    const escrowTotal = opts.reward + opts.goods;
    s.counters.task += 1;
    const id = `tsk_${s.counters.task.toString(36).padStart(6, "0")}`;
    if (!tryTransfer(s.ledger, payer, escrowAccount(id), escrowTotal)) return null;
    if (opts.from && opts.resource && opts.qty) {
      const lots = takeLots(opts.from.stock[opts.resource]!, opts.qty);
      opts.from.reserved[id] = { resource: opts.resource, lots };
    }
    const task: TaskState = {
      id,
      kind,
      status: "open",
      createdTick: s.tick,
      expiresTick: s.tick + OPEN_TASK_TTL,
      fromBuildingId: opts.from?.id ?? null,
      toBuildingId: to.id,
      resource: opts.resource ?? null,
      quantity: opts.qty ?? 0,
      rewardCredits: opts.reward,
      baseReward: opts.reward,
      goodsCredits: opts.goods,
      payer,
      points: opts.points,
      claimedBy: null,
      claimedTick: null,
      pickupTick: null,
      workTicksRemaining: opts.work ?? 0,
      receiptId: null,
      professions: opts.professions,
    };
    s.tasks[id] = task;
    this.event("task.created", `${kind.replace(/_/g, " ")} posted: ${task.quantity ? `${task.quantity} ${task.resource} → ` : ""}${to.name}`, {
      buildingId: to.id,
      data: { taskId: id, kind, reward: opts.reward },
    });
    return task;
  }

  private generateTasks() {
    const s = this.state;
    const activeByProfession = new Map<Profession, number>();
    for (const id of s.agentOrder) {
      const a = s.agents[id]!;
      if (a.status === "active") activeByProfession.set(a.profession, (activeByProfession.get(a.profession) ?? 0) + 1);
    }
    const openShifts = new Map<Profession, number>();
    for (const t of Object.values(s.tasks))
      if (t.kind === "production_shift" && t.status === "open") openShifts.set(t.professions[0]!, (openShifts.get(t.professions[0]!) ?? 0) + 1);

    // Urgency premium: unclaimed work gets +10% of its base fee every 20 ticks (funded by the requester, max +50%).
    for (const t of Object.values(s.tasks)) {
      const age = s.tick - t.createdTick;
      if (t.status !== "open" || age === 0 || age % 20 !== 0 || age > 100) continue;
      const bump = Math.round(t.baseReward * 0.1);
      if (tryTransfer(s.ledger, t.payer, escrowAccount(t.id), bump)) t.rewardCredits += bump;
    }

    for (const id of s.buildingOrder) {
      const b = s.buildings[id]!;
      if (b.status === "reserved_lot") continue;
      const spec = KIND_SPECS[b.kind];

      // 1. Input deliveries for producers; bread for the market (demand sink).
      const needs: Array<[Resource, number, string[]]> = [];
      for (const [r, q] of Object.entries(spec.inputs) as Array<[Resource, number]>) {
        const producers = r === "energy" ? ["power_station", "warehouse"] : r === "wheat" ? ["farm", "warehouse"] : r === "flour" ? ["mill", "warehouse"] : ["warehouse"];
        needs.push([r, q * 4, producers]);
      }
      if (b.kind === "market") needs.push(["bread", 30, ["bakery"]]);

      for (const [r, target, kinds] of needs) {
        const have = stockQty(b, r) + this.incoming(b.id, r);
        if (have >= target) continue;
        const room = b.storageCapacity - totalHeld(b) - this.incomingAll(b.id);
        const supplier = this.findSupplier(r, b, kinds);
        if (!supplier || room <= 0) continue;
        const qty = Math.min(target - have, stockQty(supplier, r), MAX_CARRY, room);
        if (qty <= 0) continue;
        const dist = this.nav.distance(supplier.entrance, b.entrance) ?? 50;
        const kind: TaskKind = b.kind === "market" ? "demand_fulfillment" : "delivery";
        this.createTask(kind, b, {
          from: supplier,
          resource: r,
          qty,
          reward: 300 + dist * 20 + qty * 20,
          goods: s.market[r].price * qty,
          points: (kind === "demand_fulfillment" ? 12 : 10) + Math.floor(qty / 2),
          professions: TASK_PROFESSIONS[kind],
        });
      }

      // 2. Maintenance when condition drops.
      if (b.condition < 60 && spec.wearPerDay > 0 && !this.openTaskFor(b.id, "maintenance")) {
        const supplier = this.findSupplier(b.repairResource, b, ["warehouse", b.repairResource === "stone" ? "quarry" : "lumber_yard"]);
        if (supplier && stockQty(supplier, b.repairResource) >= 2) {
          this.createTask("maintenance", b, {
            from: supplier,
            resource: b.repairResource,
            qty: 2,
            reward: 800,
            goods: s.market[b.repairResource].price * 2,
            points: 15,
            professions: TASK_PROFESSIONS.maintenance,
          });
        }
      }

      // 3. Production shifts for city-operated producers, only if someone could take them.
      const prof = spec.profession as Profession | null;
      if (spec.cycleTicks > 0 && prof && (openShifts.get(prof) ?? 0) < (activeByProfession.get(prof) ?? 0) * 2 && !b.workerAgentId && !this.openTaskFor(b.id, "production_shift")) {
        openShifts.set(prof, (openShifts.get(prof) ?? 0) + 1);
        this.createTask("production_shift", b, {
          reward: 600,
          goods: 0,
          points: 8,
          professions: [prof],
          work: SHIFT_TICKS,
        });
      }
    }
  }

  private incomingAll(bId: string): number {
    let n = 0;
    for (const t of Object.values(this.state.tasks))
      if (t.toBuildingId === bId && t.kind !== "maintenance" && t.kind !== "production_shift" && (t.status === "open" || t.status === "claimed" || t.status === "in_progress")) n += t.quantity;
    return n;
  }

  /** Return reserved/carried goods to the source and refund escrow. */
  private cancelTask(t: TaskState, status: "expired" | "rejected", carried: Lot[] | null) {
    const s = this.state;
    if (t.fromBuildingId) {
      const src = s.buildings[t.fromBuildingId]!;
      const res = src.reserved[t.id];
      const lots = carried ?? res?.lots ?? [];
      if (t.resource && lots.length) (src.stock[t.resource] ??= []).push(...lots);
      delete src.reserved[t.id];
    }
    transfer(s.ledger, escrowAccount(t.id), t.payer, balanceOf(s.ledger, escrowAccount(t.id)));
    t.status = status;
    if (t.kind === "production_shift") {
      const b = s.buildings[t.toBuildingId]!;
      if (b.workerAgentId === t.claimedBy) b.workerAgentId = null;
    }
    this.event("task.expired", `${t.kind.replace(/_/g, " ")} ${t.id} ${status}`, { buildingId: t.toBuildingId, data: { taskId: t.id, status } });
  }

  /** Agent drops its task (pause / failure). The task returns to the open pool if still valid. */
  private releaseTask(a: AgentSimState, why: string) {
    const t = a.taskId ? this.state.tasks[a.taskId] : undefined;
    a.taskId = null;
    a.busyTicks = 0;
    if (!t) return;
    if (a.cargo && t.fromBuildingId) {
      // Goods go back into the reservation so the task can be re-claimed.
      this.state.buildings[t.fromBuildingId]!.reserved[t.id] = { resource: a.cargo.resource, lots: a.cargo.lots };
    }
    a.cargo = null;
    if (t.kind === "production_shift") {
      const b = this.state.buildings[t.toBuildingId]!;
      if (b.workerAgentId === a.id) b.workerAgentId = null;
      t.workTicksRemaining = SHIFT_TICKS;
    }
    t.status = "open";
    t.claimedBy = null;
    t.claimedTick = null;
    t.pickupTick = null;
    a.perf.tasksFailed += 1;
    this.action(a, "rejected", `released task: ${why}`, { taskId: t.id });
  }

  private expireTasks() {
    const s = this.state;
    for (const t of Object.values(s.tasks)) {
      if (t.status === "open" && s.tick >= t.expiresTick) this.cancelTask(t, "expired", null);
      if ((t.status === "claimed" || t.status === "in_progress") && t.claimedTick !== null && s.tick - t.claimedTick >= CLAIMED_TASK_TTL) {
        const a = t.claimedBy ? s.agents[t.claimedBy] : undefined;
        const carried = a?.cargo?.lots ?? null;
        if (a) {
          a.cargo = null;
          a.taskId = null;
          a.activity = "idle";
          a.perf.tasksFailed += 1;
          this.action(a, "rejected", "task timed out", { taskId: t.id });
        }
        this.cancelTask(t, "expired", carried);
      }
    }
    // Garbage-collect finished tasks after a day so state stays bounded.
    for (const [id, t] of Object.entries(s.tasks)) if ((t.status === "verified" || t.status === "expired" || t.status === "rejected") && s.tick - t.createdTick > TICKS_PER_DAY * 2) delete s.tasks[id];
  }

  /**
   * Low-fidelity background labour: deliveries nobody claimed are eventually carried out by the city
   * so the economy keeps flowing with few or no active agents. No points are awarded and the fee is refunded.
   */
  private cityBackgroundLabour() {
    const s = this.state;
    for (const t of Object.values(s.tasks)) {
      if (t.status !== "open" || s.tick - t.createdTick < CITY_PORTER_AFTER) continue;
      if (t.kind === "production_shift") continue; // shifts simply expire
      const src = t.fromBuildingId ? s.buildings[t.fromBuildingId]! : null;
      const dst = s.buildings[t.toBuildingId]!;
      const res = src?.reserved[t.id];
      if (!src || !res || !t.resource) continue;
      delete src.reserved[t.id];
      const esc = escrowAccount(t.id);
      transfer(s.ledger, esc, src.account, t.goodsCredits);
      transfer(s.ledger, esc, t.payer, balanceOf(s.ledger, esc));
      if (t.kind === "maintenance") {
        s.stats.consumed[t.resource] += lotQty(res.lots);
        dst.condition = Math.min(100, dst.condition + 35);
        if (dst.status === "needs_maintenance") dst.status = "active";
      } else {
        for (const l of res.lots) (dst.stock[t.resource] ??= []).push({ ...l, path: [...l.path, dst.id].slice(-MAX_LOT_PATH) });
      }
      t.status = "verified";
      t.receiptId = null;
      this.out.changedBuildings.push(dst.id);
      this.event("task.verified", `City crew completed ${t.kind.replace(/_/g, " ")} to ${dst.name}`, { buildingId: dst.id, data: { taskId: t.id, byCity: true, points: 0 } });
    }
  }

  /* ---------------------------------------------------------- agents */

  private candidates(a: AgentSimState): TaskCandidate[] {
    const s = this.state;
    const out: TaskCandidate[] = [];
    for (const t of Object.values(s.tasks)) {
      if (t.status !== "open" || !t.professions.includes(a.profession)) continue;
      if (!this.permitted(a, t)) continue;
      const to = s.buildings[t.toBuildingId]!;
      const from = t.fromBuildingId ? s.buildings[t.fromBuildingId]! : null;
      const leg1 = this.nav.distance(a.cell, (from ?? to).entrance);
      const leg2 = from ? this.nav.distance(from.entrance, to.entrance) : 0;
      if (leg1 === null || leg2 === null) continue;
      const work = t.kind === "production_shift" ? SHIFT_TICKS : t.kind === "maintenance" ? REPAIR_TICKS : 0;
      out.push({ task: t, durationTicks: Math.ceil((leg1 + leg2) / AGENT_SPEED) + work, communal: to.kind === "market" || to.kind === "headquarters" });
    }
    return out.sort((x, y) => (x.task.id < y.task.id ? -1 : 1));
  }

  private permitted(a: AgentSimState, t: TaskState): boolean {
    if (!a.permissions.includes("claim_tasks")) return false;
    if (t.kind === "maintenance" && !a.permissions.includes("perform_maintenance")) return false;
    if (t.kind === "production_shift" && !a.permissions.includes("operate_building")) return false;
    return true;
  }

  private walkTo(a: AgentSimState, target: GridPos): boolean {
    const path = this.nav.path(a.cell, target);
    if (path === null) return false;
    a.path = path;
    a.target = target;
    return true;
  }

  private stepAgent(a: AgentSimState) {
    const s = this.state;
    if (a.status === "paused") return;
    const before = { ...a.cell };
    const beforeActivity = a.activity;

    // Movement.
    if (a.path.length > 0) {
      for (let i = 0; i < AGENT_SPEED && a.path.length > 0; i++) a.cell = a.path.shift()!;
      if (a.path.length === 0) a.target = null;
    }

    if (a.busyTicks > 0) {
      a.busyTicks -= 1;
      if (a.busyTicks === 0) this.finishInPlace(a);
    } else if (a.taskId && a.path.length === 0) {
      this.advanceTask(a);
    } else if (!a.taskId && a.path.length === 0 && s.tick >= a.nextDecisionTick) {
      this.decide(a);
    }

    if (!same(before, a.cell) || beforeActivity !== a.activity) this.out.moves.push({ id: a.id, cell: { ...a.cell }, activity: a.activity, target: a.target });
  }

  private decide(a: AgentSimState) {
    const s = this.state;
    const proposal = this.planner.propose({ agent: a, tick: s.tick, candidates: this.candidates(a) });
    // Validate the proposal against authoritative rules — planners are never trusted directly.
    if (proposal.kind === "claim_task") {
      const t = s.tasks[proposal.taskId];
      const valid = t && t.status === "open" && t.professions.includes(a.profession) && this.permitted(a, t);
      if (!valid) {
        this.action(a, "rejected", `planner proposal rejected: task ${proposal.taskId} not claimable`, { taskId: proposal.taskId });
        a.nextDecisionTick = s.tick + DECISION_COOLDOWN;
        return;
      }
      t.status = "claimed";
      t.claimedBy = a.id;
      t.claimedTick = s.tick;
      a.taskId = t.id;
      a.activity = "moving";
      const first = t.fromBuildingId ? s.buildings[t.fromBuildingId]! : s.buildings[t.toBuildingId]!;
      if (!this.walkTo(a, first.entrance)) {
        this.releaseTask(a, "destination unreachable");
        return;
      }
      this.action(a, "claim_task", proposal.reason, { utility: proposal.utility, taskId: t.id, buildingId: first.id });
      this.event("task.claimed", `${a.name} took ${t.kind.replace(/_/g, " ")} for ${s.buildings[t.toBuildingId]!.name}`, { agentId: a.id, communityId: a.communityId, buildingId: t.toBuildingId, data: { taskId: t.id } });
      return;
    }
    a.nextDecisionTick = s.tick + DECISION_COOLDOWN * 3;
    if (proposal.kind === "stroll") {
      const near = s.buildingOrder.filter((id) => {
        const b = s.buildings[id]!;
        const d = this.nav.distance(a.cell, b.entrance);
        return d !== null && d > 2 && d < 24;
      });
      if (near.length > 0 && this.walkTo(a, s.buildings[this.rng.pick(near)]!.entrance)) {
        a.activity = "moving";
        this.action(a, "move", proposal.reason, { detail: { to: a.target } });
        return;
      }
    }
    a.activity = "resting";
    this.action(a, "wait", proposal.reason);
  }

  /** Arrived at the current leg's destination: pick up, deliver, or start in-place work. */
  private advanceTask(a: AgentSimState) {
    const s = this.state;
    const t = s.tasks[a.taskId!];
    if (!t) {
      a.taskId = null;
      a.activity = "idle";
      return;
    }
    const to = s.buildings[t.toBuildingId]!;
    const from = t.fromBuildingId ? s.buildings[t.fromBuildingId]! : null;

    if (from && t.pickupTick === null) {
      if (!same(a.cell, from.entrance)) {
        if (!this.walkTo(a, from.entrance)) this.releaseTask(a, "source unreachable");
        return;
      }
      const res = from.reserved[t.id];
      if (!res || lotQty(res.lots) !== t.quantity) {
        this.releaseTask(a, "reserved goods missing at source");
        return;
      }
      a.cargo = { resource: res.resource, lots: res.lots };
      delete from.reserved[t.id];
      t.pickupTick = s.tick;
      t.status = "in_progress";
      a.activity = "delivering";
      this.action(a, "pickup", `picked up ${t.quantity} ${t.resource} at ${from.name}`, { taskId: t.id, buildingId: from.id });
      this.out.changedBuildings.push(from.id);
      if (!this.walkTo(a, to.entrance)) this.releaseTask(a, "destination unreachable");
      return;
    }

    if (!same(a.cell, to.entrance)) {
      if (!this.walkTo(a, to.entrance)) this.releaseTask(a, "destination unreachable");
      return;
    }

    if (t.kind === "production_shift") {
      if (to.workerAgentId && to.workerAgentId !== a.id) {
        this.releaseTask(a, "another worker is on shift");
        return;
      }
      to.workerAgentId = a.id;
      t.status = "in_progress";
      a.activity = "working";
      a.busyTicks = t.workTicksRemaining;
      this.action(a, "produce", `started a ${t.workTicksRemaining}-tick shift at ${to.name}`, { taskId: t.id, buildingId: to.id });
      return;
    }
    if (t.kind === "maintenance") {
      a.activity = "working";
      a.busyTicks = REPAIR_TICKS;
      this.action(a, "maintain", `repairing ${to.name} with ${t.quantity} ${t.resource}`, { taskId: t.id, buildingId: to.id });
      return;
    }
    this.complete(a, t);
  }

  private finishInPlace(a: AgentSimState) {
    const t = a.taskId ? this.state.tasks[a.taskId] : undefined;
    if (!t) {
      a.activity = "idle";
      return;
    }
    if (t.kind === "production_shift") {
      const b = this.state.buildings[t.toBuildingId]!;
      if (b.workerAgentId !== a.id || !same(a.cell, b.entrance)) {
        this.releaseTask(a, "shift presence check failed");
        return;
      }
      t.workTicksRemaining = 0;
      b.workerAgentId = null;
    }
    this.complete(a, t);
  }

  /** Verify and settle a task, producing a hash-chained receipt and (dry-run) contribution points. */
  private complete(a: AgentSimState, t: TaskState) {
    const s = this.state;
    const to = s.buildings[t.toBuildingId]!;
    const from = t.fromBuildingId ? s.buildings[t.fromBuildingId]! : null;
    const esc = escrowAccount(t.id);
    const lots = a.cargo?.lots ?? [];

    const checks: SimReceipt["checks"] = [
      { check: "unique_task_id", passed: t.receiptId === null },
      { check: "claimed_by_performer", passed: t.claimedBy === a.id },
      { check: "escrow_funded", passed: balanceOf(s.ledger, esc) === t.rewardCredits + t.goodsCredits },
      { check: "at_destination", passed: same(a.cell, to.entrance) },
    ];
    if (from) {
      checks.push({ check: "picked_up_at_source", passed: t.pickupTick !== null });
      checks.push({ check: "quantity_matches", passed: lotQty(lots) === t.quantity && a.cargo?.resource === t.resource });
    }
    if (t.kind === "production_shift") checks.push({ check: "shift_presence_complete", passed: t.workTicksRemaining === 0 });
    if (checks.some((c) => !c.passed)) {
      this.action(a, "rejected", `verification failed: ${checks.filter((c) => !c.passed).map((c) => c.check).join(", ")}`, { taskId: t.id });
      a.taskId = null;
      a.activity = "idle";
      a.perf.tasksFailed += 1;
      this.cancelTask(t, "rejected", a.cargo?.lots ?? null);
      a.cargo = null;
      return;
    }

    // Settle goods.
    if (from && t.resource) {
      if (t.kind === "maintenance") {
        s.stats.consumed[t.resource] += lotQty(lots);
        to.condition = Math.min(100, to.condition + 50);
        if (to.status === "needs_maintenance") to.status = "active";
      } else {
        for (const l of lots) (to.stock[t.resource] ??= []).push({ ...l, path: [...l.path, to.id].slice(-MAX_LOT_PATH) });
      }
      transfer(s.ledger, esc, from.account, t.goodsCredits);
    }
    transfer(s.ledger, esc, agentAccount(a.id), t.rewardCredits);
    a.perf.creditsEarned += t.rewardCredits;

    // Contribution points (dry-run reward basis) with anti-abuse adjustments.
    const adjustments: SimReceipt["pointAdjustments"] = [];
    let points = t.points;
    const payerAgent = t.payer.startsWith("agent:") ? s.agents[t.payer.slice(6)] : undefined;
    if (payerAgent && payerAgent.ownerWallet === a.ownerWallet) {
      adjustments.push({ reason: "self_dealing: requester owned by performer's wallet", delta: -points });
      points = 0;
    }
    if (points > 0 && lots.some((l) => l.path.slice(0, -1).includes(to.id))) {
      adjustments.push({ reason: "circular_movement: goods returned to a previous holder", delta: -points });
      points = 0;
    }
    if (points > 0 && t.claimedTick !== null && s.tick - t.claimedTick < 3) {
      adjustments.push({ reason: "implausibly_fast_completion", delta: -points });
      points = 0;
    }
    const already = s.epochPoints[a.id] ?? 0;
    if (points > 0 && already + points > AGENT_POINTS_CAP_PER_EPOCH) {
      const allowed = Math.max(0, AGENT_POINTS_CAP_PER_EPOCH - already);
      adjustments.push({ reason: "epoch_points_cap", delta: allowed - points });
      points = allowed;
    }

    s.counters.receipt += 1;
    const body = {
      id: `rcp_${s.counters.receipt.toString(36).padStart(6, "0")}`,
      taskId: t.id,
      agentId: a.id,
      ownerWallet: a.ownerWallet,
      kind: t.kind,
      claimedTick: t.claimedTick!,
      pickupTick: t.pickupTick,
      completedTick: s.tick,
      from: from ? from.entrance : null,
      to: to.entrance,
      resource: t.resource,
      quantity: t.quantity,
      lots: lots.map((l) => l.id),
      creditsPaid: t.rewardCredits,
      pointsAwarded: points,
      pointAdjustments: adjustments,
      checks,
      prevHash: s.receiptsHead,
    };
    const receipt: SimReceipt = { ...body, hash: canonicalHash(body) };
    s.receiptsHead = receipt.hash;
    this.out.receipts.push(receipt);

    t.status = "verified";
    t.receiptId = receipt.id;
    a.taskId = null;
    a.cargo = null;
    a.activity = "idle";
    a.nextDecisionTick = s.tick + 1;
    a.perf.tasksCompleted += 1;
    a.verifiedTasks += 1;
    a.totalPoints += points;
    s.epochPoints[a.id] = already + points;
    const list = (s.epochReceipts[a.id] ??= []);
    if (list.length < 200) list.push(receipt.id);
    s.stats.verifiedTasks += 1;
    s.stats.verifiedTasksThisEpoch += 1;
    s.stats.pointsThisEpoch += points;
    this.out.changedBuildings.push(to.id);
    this.action(a, "deliver", `completed ${t.kind.replace(/_/g, " ")} at ${to.name}: +${t.rewardCredits} mCC, +${points} pts`, { taskId: t.id, buildingId: to.id, detail: { receiptId: receipt.id } });
    this.event("task.verified", `${a.name} completed ${t.kind.replace(/_/g, " ")}${t.quantity ? ` (${t.quantity} ${t.resource})` : ""} for ${to.name}`, {
      agentId: a.id,
      communityId: a.communityId,
      buildingId: to.id,
      data: { taskId: t.id, receiptId: receipt.id, points, reward: t.rewardCredits },
    });
  }

  /* ---------------------------------------------------------- production */

  private runProduction() {
    const s = this.state;
    for (const id of s.buildingOrder) {
      const b = s.buildings[id]!;
      const spec = KIND_SPECS[b.kind];
      if (spec.cycleTicks === 0 || b.status === "reserved_lot") continue;
      if (b.condition < 30) {
        if (b.status !== "needs_maintenance") {
          b.status = "needs_maintenance";
          this.out.changedBuildings.push(b.id);
        }
        continue;
      }
      const p = b.production;
      if (!p.inputsConsumed) {
        const outQty = Object.values(spec.outputs).reduce((n, q) => n + (q ?? 0), 0);
        const inQty = Object.values(spec.inputs).reduce((n, q) => n + (q ?? 0), 0);
        const hasInputs = (Object.entries(spec.inputs) as Array<[Resource, number]>).every(([r, q]) => stockQty(b, r) >= q);
        const hasRoom = totalHeld(b) - inQty + outQty <= b.storageCapacity;
        if (!hasInputs || !hasRoom) {
          if (b.status === "active") {
            b.status = "idle";
            this.out.changedBuildings.push(b.id);
          }
          continue;
        }
        for (const [r, q] of Object.entries(spec.inputs) as Array<[Resource, number]>) {
          takeLots(b.stock[r]!, q);
          s.stats.consumed[r] += q;
        }
        p.inputsConsumed = true;
        if (b.status !== "active") {
          b.status = "active";
          this.out.changedBuildings.push(b.id);
        }
      }
      // City-operated buildings without a worker run at half speed (background fidelity).
      p.progress += b.workerAgentId ? 2 : 1;
      if (p.progress >= spec.cycleTicks * 2) {
        p.progress = 0;
        p.inputsConsumed = false;
        for (const [r, q] of Object.entries(spec.outputs) as Array<[Resource, number]>) {
          (b.stock[r] ??= []).push(this.newLot(b.id, q));
          s.stats.produced[r] += q;
        }
        this.out.changedBuildings.push(b.id);
        if (b.kind !== "farm" || b.workerAgentId) {
          const worker = b.workerAgentId ? s.agents[b.workerAgentId] : undefined;
          this.event("production.completed", `${b.name} produced ${Object.entries(spec.outputs).map(([r, q]) => `${q} ${r}`).join(", ")}${worker ? ` (shift: ${worker.name})` : ""}`, {
            buildingId: b.id,
            agentId: worker?.id,
            data: { outputs: spec.outputs, inputs: spec.inputs },
          });
        }
      }
    }
  }

  /* ---------------------------------------------------------- residents & market */

  private issuanceCap(): number {
    return this.state.residents.population * ISSUANCE_PER_RESIDENT_PER_DAY;
  }

  private payResidentWages() {
    const s = this.state;
    const dailyBreadSpend = Math.ceil(s.residents.population * BREAD_PER_RESIDENT_PER_DAY) * s.market.bread.price;
    const target = dailyBreadSpend * 2;
    const have = balanceOf(s.ledger, RESIDENTS_ACCOUNT);
    if (have >= target) return;
    const chunk = Math.ceil(dailyBreadSpend / (TICKS_PER_DAY / MARKET_INTERVAL)) * 2;
    issue(s.ledger, RESIDENTS_ACCOUNT, Math.min(target - have, chunk), this.issuanceCap());
  }

  private residentsBuyBread() {
    const s = this.state;
    const perTickDemand = (s.residents.population * BREAD_PER_RESIDENT_PER_DAY) / TICKS_PER_DAY;
    s.residents.breadBacklog = Math.min(s.residents.breadBacklog + perTickDemand * MARKET_INTERVAL, s.residents.population * BREAD_PER_RESIDENT_PER_DAY);
    const want = Math.floor(s.residents.breadBacklog);
    if (want <= 0) return;
    for (const id of s.buildingOrder) {
      const b = s.buildings[id]!;
      if (b.kind !== "market") continue;
      const price = s.market.bread.price;
      const affordable = Math.floor(balanceOf(s.ledger, RESIDENTS_ACCOUNT) / Math.max(1, price));
      const qty = Math.min(want, stockQty(b, "bread"), affordable);
      if (qty <= 0) continue;
      takeLots(b.stock.bread!, qty);
      const cost = price * qty;
      const burned = Math.floor((cost * TRADE_BURN_BPS) / 10_000);
      transfer(s.ledger, RESIDENTS_ACCOUNT, b.account, cost - burned);
      burn(s.ledger, RESIDENTS_ACCOUNT, burned);
      s.stats.consumed.bread += qty;
      s.residents.breadBacklog -= qty;
      this.out.changedBuildings.push(b.id);
      this.event("consumption", `Residents bought ${qty} bread at ${b.name} for ${(cost / 1000).toFixed(1)} CC`, { buildingId: b.id, data: { resource: "bread", quantity: qty, price } });
      return;
    }
  }

  private updatePrices() {
    const s = this.state;
    for (const r of RESOURCES) {
      let supply = 0;
      for (const id of s.buildingOrder) {
        const b = s.buildings[id]!;
        if (b.kind === "warehouse" || KIND_SPECS[b.kind].outputs[r] || b.kind === "market") supply += stockQty(b, r);
      }
      let demand = 0;
      for (const t of Object.values(s.tasks)) if (t.resource === r && t.status !== "verified" && t.status !== "expired") demand += t.quantity;
      if (r === "bread") demand += Math.ceil(s.residents.breadBacklog) + 10;
      const m = s.market[r];
      const pressure = (demand - supply) / (demand + supply + 1);
      const next = Math.round(m.price * (1 + 0.03 * pressure));
      const clamped = Math.max(Math.round(BASE_PRICES[r] * 0.25), Math.min(BASE_PRICES[r] * 4, next));
      if (clamped !== m.price) {
        m.price = clamped;
        this.out.pricesChanged = true;
      }
    }
  }

  /* ---------------------------------------------------------- epochs */

  private closeEpoch() {
    const s = this.state;
    // Dry-run reward records: share of verified points. No SOL amounts, no claims.
    const total = Object.values(s.epochPoints).reduce((n, p) => n + p, 0);
    for (const id of s.agentOrder) {
      const pts = s.epochPoints[id] ?? 0;
      if (pts <= 0) continue;
      const a = s.agents[id]!;
      this.out.rewards.push({
        id: `rwd_${s.epoch}_${id}`,
        epoch: s.epoch,
        agentId: id,
        ownerWallet: a.ownerWallet,
        points: pts,
        estimatedShareBps: Math.floor((pts * 10_000) / total),
        receiptIds: s.epochReceipts[id] ?? [],
      });
    }
    // Wear, upkeep burns (credit sinks).
    for (const id of s.buildingOrder) {
      const b = s.buildings[id]!;
      if (b.status === "reserved_lot") continue;
      b.condition = Math.max(0, b.condition - KIND_SPECS[b.kind].wearPerDay * 3);
      if (KIND_SPECS[b.kind].cycleTicks > 0) burn(s.ledger, b.account, BUILDING_DAILY_UPKEEP);
      this.out.changedBuildings.push(b.id);
    }
    for (const id of s.agentOrder) {
      const a = s.agents[id]!;
      const paid = burn(s.ledger, agentAccount(id), AGENT_DAILY_UPKEEP);
      a.perf.creditsSpent += paid;
      a.spentToday = 0;
    }
    for (const r of RESOURCES) s.market[r].dayAgo = s.market[r].price;
    s.epoch += 1;
    s.epochPoints = {};
    s.epochReceipts = {};
    s.stats.verifiedTasksThisEpoch = 0;
    s.stats.pointsThisEpoch = 0;
    s.ledger.issuedThisEpoch = 0;
  }
}
