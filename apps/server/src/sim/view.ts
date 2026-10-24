import { socialSummary } from "./society.js";
import { autonomySummary } from "./autonomy.js";
import {
  RESOURCES,
  type Agent,
  type AgentSummary,
  type Building,
  type DataMode,
  type EconomySummary,
  type MarketQuote,
  type Resource,
  type Task,
  type WorldStats,
} from "@agentic-economy/shared";
import { chunkOfCell, type BuildingPlacement, type WorldLayout } from "@agentic-economy/world-spec";
import { agentAccount, balanceOf, circulating } from "./ledger.js";
import { stockQty, TICKS_PER_DAY, AGENT_SPEED } from "./engine.js";
import type { AgentSimState, BuildingState, SimState, TaskState } from "./types.js";

/** Agents stand at cell centres. */
export const cellCenter = (c: { x: number; y: number }) => ({ x: c.x + 0.5, y: c.y + 0.5 });

export function toBuilding(layout: WorldLayout, placement: BuildingPlacement, b: BuildingState): Building {
  const inventory: Building["inventory"] = {};
  for (const r of RESOURCES) {
    const q = stockQty(b, r);
    if (q > 0) inventory[r] = q;
  }
  return {
    id: b.id,
    kind: b.kind,
    name: b.name,
    origin: b.origin,
    entrance: b.entrance,
    chunk: chunkOfCell(layout, b.origin.x, b.origin.y),
    params: placement.params,
    status: b.status === "reserved_lot" ? "reserved_lot" : b.status === "needs_maintenance" ? "needs_maintenance" : b.status === "idle" ? "idle" : "active",
    condition: Math.round(b.condition),
    ownerAgentId: b.ownerAgentId,
    communityId: b.communityId,
    inventory,
    branding: b.branding,
  };
}

export function toAgentSummary(s: SimState, a: AgentSimState): AgentSummary {
  const task = a.taskId ? s.tasks[a.taskId] : undefined;
  const destination = task ? s.buildings[task.fromBuildingId && task.pickupTick === null ? task.fromBuildingId : task.toBuildingId] : undefined;
  const cargo: Partial<Record<Resource, number>> = {};
  if (a.cargo) cargo[a.cargo.resource] = a.cargo.lots.reduce((n, lot) => n + lot.qty, 0);
  return {
    id: a.id,
    name: a.name,
    displayName: a.displayName,
    identity: a.identity,
    profession: a.profession,
    communityId: a.communityId,
    ownerWallet: a.ownerWallet,
    status: a.status,
    state: a.status === "paused" ? "paused" : a.activity,
    social: autonomySummary(s, a.id) ?? socialSummary(s, a.id),
    work: {
      tick: s.tick, task: task ? toTask(task) : null,
      destination: destination ? { id: destination.id, name: destination.name, kind: destination.kind, entrance: { ...destination.entrance } } : null,
      target: a.target ? { ...a.target } : null,
      remainingWorkTicks: a.activity === "working" ? a.busyTicks : task?.workTicksRemaining ?? 0,
      cargo,
    },
    pos: cellCenter(a.cell),
    credits: balanceOf(s.ledger, agentAccount(a.id)),
    verifiedTasks: a.verifiedTasks,
    points: a.totalPoints,
  };
}

export function toAgent(s: SimState, a: AgentSimState): Agent {
  const t = a.taskId ? s.tasks[a.taskId] : undefined;
  const cargo: Agent["cargo"] = {};
  if (a.cargo) cargo[a.cargo.resource] = a.cargo.lots.reduce((n, l) => n + l.qty, 0);
  const done = a.perf.tasksCompleted;
  const failed = a.perf.tasksFailed;
  return {
    ...toAgentSummary(s, a),
    socialHistory: s.autonomy?.profiles[a.id]?.memories ?? s.society?.profiles[a.id]?.memories,
    relationships: s.autonomy?.profiles[a.id]?.relationships ?? s.society?.profiles[a.id]?.relationships,
    cognition: s.autonomy?.profiles[a.id] ? { preferences: s.autonomy.profiles[a.id]!.preferences, goal: s.autonomy.profiles[a.id]!.goal } : undefined,
    strategy: a.strategy,
    permissions: a.permissions,
    createdTick: a.createdTick,
    target: a.target,
    path: a.path.slice(0, 32),
    currentTaskId: t ? t.id : null,
    operatedBuildingId: t?.kind === "production_shift" && s.buildings[t.toBuildingId]?.workerAgentId === a.id ? t.toBuildingId : null,
    cargo,
    performance: {
      creditsEarned: a.perf.creditsEarned,
      creditsSpent: a.perf.creditsSpent,
      tasksCompleted: done,
      tasksFailed: failed,
      reliabilityPct: done + failed === 0 ? 100 : Math.round((done * 1000) / (done + failed)) / 10,
    },
  };
}

export function toTask(t: TaskState): Task {
  return {
    id: t.id,
    kind: t.kind,
    status: t.status,
    createdTick: t.createdTick,
    expiresTick: t.expiresTick,
    fromBuildingId: t.fromBuildingId,
    toBuildingId: t.toBuildingId,
    resource: t.resource,
    quantity: t.quantity,
    rewardCredits: t.rewardCredits,
    points: t.points,
    claimedBy: t.claimedBy,
    receiptId: t.receiptId,
  };
}

export function marketQuotes(s: SimState): MarketQuote[] {
  return RESOURCES.map((r: Resource) => {
    let supply = 0;
    for (const id of s.buildingOrder) supply += stockQty(s.buildings[id]!, r);
    let demand = 0;
    for (const t of Object.values(s.tasks)) if (t.resource === r && (t.status === "open" || t.status === "claimed" || t.status === "in_progress")) demand += t.quantity;
    if (r === "bread") demand += Math.ceil(s.residents.breadBacklog);
    const m = s.market[r];
    const spread = Math.max(1, Math.round(m.price * 0.02));
    return {
      resource: r,
      price: m.price,
      bid: m.price - spread,
      ask: m.price + spread,
      supply,
      demand,
      changePct24h: Math.round(((m.price - m.dayAgo) / m.dayAgo) * 1000) / 10,
    };
  });
}

export function economySummary(mode: DataMode, s: SimState): EconomySummary {
  const production: EconomySummary["production"] = {};
  for (const r of RESOURCES) {
    let stock = 0;
    for (const id of s.buildingOrder) stock += stockQty(s.buildings[id]!, r);
    production[r] = { produced: s.stats.produced[r], consumed: s.stats.consumed[r], stock };
  }
  return {
    mode,
    tick: s.tick,
    epoch: s.epoch,
    creditSupply: {
      issued: s.ledger.issued,
      burned: s.ledger.burned,
      circulating: circulating(s.ledger),
      issuanceCapPerEpoch: s.residents.population * 1_000,
    },
    production,
    quotes: marketQuotes(s),
    openTasks: Object.values(s.tasks).filter((t) => t.status === "open").length,
    verifiedTasksThisEpoch: s.stats.verifiedTasksThisEpoch,
    pointsThisEpoch: s.stats.pointsThisEpoch,
    rewardMode: "dry_run",
  };
}

export function worldStats(mode: DataMode, s: SimState): WorldStats {
  const agents = s.agentOrder.map((id) => s.agents[id]!);
  return {
    mode,
    tick: s.tick,
    population: s.residents.population,
    activeAgents: agents.filter((a) => a.status === "active").length,
    pausedAgents: agents.filter((a) => a.status === "paused").length,
    communities: Object.keys(s.communities).filter(id => !s.syntheticCity?.groups.some(g => g.id === id)).length,
    ...(s.syntheticCity ? { simulation: { profile: s.syntheticCity.profile, startedTick: s.syntheticCity.startedTick,
      groups: s.syntheticCity.groups.map(g => {
        const members=agents.filter(a=>a.communityId===g.id&&a.identity.kind==='house');
        return {...g,headquartersBuildingId:s.communities[g.id]?.hqBuildingId??null,
          activeAgents:members.filter(a=>a.status==='active').length,completedServices:members.reduce((n,a)=>n+a.verifiedTasks,0)};
      }) } } : {}),
    buildings: s.buildingOrder.filter((id) => s.buildings[id]!.status !== "reserved_lot").length,
    creditsInCirculation: circulating(s.ledger),
    goodsProduced: { ...s.stats.produced },
    goodsConsumed: { ...s.stats.consumed },
    verifiedTasks: s.stats.verifiedTasks,
  };
}

export const SIM_CONSTANTS = { ticksPerDay: TICKS_PER_DAY, agentSpeed: AGENT_SPEED };
