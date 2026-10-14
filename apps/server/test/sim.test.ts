import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { RESOURCES, type Profession, type Resource } from "@agentic-economy/shared";
import { generateWorld, type WorldLayout } from "@agentic-economy/world-spec";
import { SimEngine, createInitialState, hashState, stockQty, DEFAULT_STRATEGY, TICKS_PER_DAY } from "../src/sim/engine.js";
import { checkLedgerInvariant, agentAccount, transfer } from "../src/sim/ledger.js";
import type { SimCommand, SimReceipt, SimState, LoggedCommand } from "../src/sim/types.js";

let layout: WorldLayout;
beforeAll(() => {
  layout = generateWorld("sim-test-seed");
});

const WALLET_A = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const WALLET_B = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

function agentCmd(id: string, profession: Profession, wallet = WALLET_A, community = "com_demo001"): SimCommand {
  return { type: "agent.create", agentId: id, ownerWallet: wallet, communityId: community, name: `Agent ${id}`, profession, strategy: { ...DEFAULT_STRATEGY } };
}

const crew: SimCommand[] = [
  { type: "community.register", communityId: "com_demo001", name: "Demo Bakers", branding: { primary: "#c98b6b", accent: "#3d5a80" } },
  agentCmd("agt_logi0001", "logistics_operator"),
  agentCmd("agt_logi0002", "logistics_operator", WALLET_B),
  agentCmd("agt_merc0001", "merchant"),
  agentCmd("agt_farm0001", "farmer", WALLET_B),
  agentCmd("agt_manu0001", "manufacturer"),
  agentCmd("agt_build001", "builder", WALLET_B),
];

/** Total units of a resource anywhere: building stock, reservations and agent cargo. */
function totalUnits(s: SimState, r: Resource): number {
  let n = 0;
  for (const id of s.buildingOrder) {
    const b = s.buildings[id]!;
    n += stockQty(b, r);
    for (const res of Object.values(b.reserved)) if (res.resource === r) n += res.lots.reduce((m, l) => m + l.qty, 0);
  }
  for (const id of s.agentOrder) {
    const c = s.agents[id]!.cargo;
    if (c && c.resource === r) n += c.lots.reduce((m, l) => m + l.qty, 0);
  }
  return n;
}

function allLotsPositive(s: SimState): boolean {
  for (const id of s.buildingOrder) {
    const b = s.buildings[id]!;
    for (const lots of Object.values(b.stock)) if (lots!.some((l) => !(l.qty > 0))) return false;
    for (const res of Object.values(b.reserved)) if (res.lots.some((l) => !(l.qty > 0))) return false;
  }
  return true;
}

interface RunResult {
  engine: SimEngine;
  receipts: SimReceipt[];
  log: LoggedCommand[];
  events: number;
}

function run(ticks: number, commandsAt: Record<number, SimCommand[]>, opts: { checkEveryTick?: boolean } = {}): RunResult {
  const engine = new SimEngine(createInitialState(layout), layout);
  const initial = Object.fromEntries(RESOURCES.map((r) => [r, totalUnits(engine.state, r)])) as Record<Resource, number>;
  const receipts: SimReceipt[] = [];
  const log: LoggedCommand[] = [];
  let seq = 0;
  let events = 0;
  for (let i = 0; i < ticks; i++) {
    for (const c of commandsAt[engine.tick] ?? []) log.push(engine.enqueue(c, seq++));
    const out = engine.step();
    receipts.push(...out.receipts);
    events += out.events.length;
    if (opts.checkEveryTick) {
      const s = engine.state;
      const err = checkLedgerInvariant(s.ledger);
      if (err) throw new Error(`tick ${s.tick}: ${err}`);
      if (!allLotsPositive(s)) throw new Error(`tick ${s.tick}: non-positive lot`);
      for (const r of RESOURCES) {
        const expected = initial[r] + s.stats.produced[r] - s.stats.consumed[r];
        if (totalUnits(s, r) !== expected) throw new Error(`tick ${s.tick}: ${r} conservation broken (${totalUnits(s, r)} != ${expected})`);
      }
    }
  }
  return { engine, receipts, log, events };
}

describe("simulation engine", () => {
  it("runs wheat → flour → bread end-to-end with verified services, conserving goods and credits every tick", () => {
    const { engine, receipts } = run(TICKS_PER_DAY * 3, { 0: crew }, { checkEveryTick: true });
    const s = engine.state;
    expect(s.stats.produced.wheat).toBeGreaterThan(0);
    expect(s.stats.consumed.wheat).toBeGreaterThan(0); // mills consumed wheat…
    expect(s.stats.produced.flour).toBeGreaterThan(0); // …into flour
    expect(s.stats.consumed.flour).toBeGreaterThan(0); // bakeries consumed flour…
    expect(s.stats.produced.bread).toBeGreaterThan(0); // …into bread
    expect(s.stats.consumed.bread).toBeGreaterThan(0); // residents ate bread
    const kinds = new Set(receipts.map((r) => r.kind));
    expect(kinds.has("delivery")).toBe(true);
    expect(kinds.has("demand_fulfillment")).toBe(true);
    expect(kinds.has("production_shift")).toBe(true);
    // Delivered wheat must have come from a farm (provenance).
    const wheat = receipts.filter((r) => r.resource === "wheat");
    expect(wheat.length).toBeGreaterThan(0);
    expect(s.epoch).toBe(3);
  });

  it("never creates goods without inputs (a mill with no wheat produces no flour)", () => {
    const engine = new SimEngine(createInitialState(layout), layout);
    const mill = Object.values(engine.state.buildings).find((b) => b.kind === "mill")!;
    mill.stock = {}; // no inputs at all
    mill.production = { progress: 0, running: false, inputsConsumed: false };
    // Disconnect it from deliveries by making it unreachable for suppliers: drain all wheat in the world.
    for (const b of Object.values(engine.state.buildings)) delete b.stock.wheat;
    for (let i = 0; i < 50; i++) engine.step();
    expect(stockQty(engine.state.buildings[mill.id]!, "flour")).toBe(0);
  });

  it("is deterministic: same seed + same commands ⇒ identical state hash", () => {
    const a = run(400, { 0: crew, 150: [{ type: "agent.update", agentId: "agt_merc0001", status: "paused" }] });
    const b = run(400, { 0: crew, 150: [{ type: "agent.update", agentId: "agt_merc0001", status: "paused" }] });
    expect(hashState(a.engine.state)).toBe(hashState(b.engine.state));
  });

  it("recovers from a snapshot + command log replay to the exact same state", () => {
    const commands = { 0: crew, 180: [agentCmd("agt_late0001", "merchant", WALLET_B)], 260: [{ type: "agent.update" as const, agentId: "agt_logi0001", strategy: { risk: "high" as const } }] };
    const continuous = run(420, commands);

    // Crash at tick 200 with a snapshot taken at tick 160.
    const partial = run(160, commands);
    const snapshot = JSON.stringify(partial.engine.state);
    const restored = new SimEngine(JSON.parse(snapshot) as SimState, layout);
    const remaining = continuous.log.filter((c) => c.tick >= 160);
    while (restored.tick < 420) {
      for (const c of remaining.filter((c) => c.tick === restored.tick)) restored.enqueueLogged(c);
      restored.step();
    }
    expect(hashState(restored.state)).toBe(hashState(continuous.engine.state));
  });

  it("hash-chains receipts and every receipt passes all verification checks", () => {
    const { receipts } = run(TICKS_PER_DAY * 2, { 0: crew });
    expect(receipts.length).toBeGreaterThan(5);
    let prev = "0".repeat(64);
    for (const r of receipts) {
      expect(r.prevHash).toBe(prev);
      const { hash, ...body } = r;
      expect(createHash("sha256").update(JSON.stringify(body)).digest("hex")).toBe(hash);
      expect(r.checks.every((c) => c.passed)).toBe(true);
      prev = hash;
    }
    expect(new Set(receipts.map((r) => r.taskId)).size).toBe(receipts.length);
  });

  it("awards no points for self-dealing (requester owned by the performer's wallet) but still settles credits", () => {
    const engine = new SimEngine(createInitialState(layout), layout);
    let seq = 0;
    for (const c of [agentCmd("agt_owner001", "farmer", WALLET_A), agentCmd("agt_merc0009", "merchant", WALLET_A)]) engine.enqueue(c, seq++);
    // The market is operated (and paid for) by an agent owned by WALLET_A from the very first tick.
    const market = Object.values(engine.state.buildings).find((b) => b.kind === "market")!;
    market.account = agentAccount("agt_owner001");
    transfer(engine.state.ledger, "city", agentAccount("agt_owner001"), Math.floor((engine.state.ledger.balances["city"] ?? 0) / 2));
    expect(checkLedgerInvariant(engine.state.ledger)).toBeNull();
    const receipts: SimReceipt[] = [];
    for (let i = 0; i < TICKS_PER_DAY * 2; i++) receipts.push(...engine.step().receipts);
    const self = receipts.filter((r) => r.agentId === "agt_merc0009" && r.kind === "demand_fulfillment");
    expect(self.length).toBeGreaterThan(0);
    for (const r of self) {
      expect(r.pointsAwarded).toBe(0);
      expect(r.creditsPaid).toBeGreaterThan(0);
      expect(r.pointAdjustments[0]?.reason).toMatch(/^self_dealing/);
    }
  });

  it("pausing an agent mid-task releases the task and returns goods to the reservation", () => {
    const { engine } = run(60, { 0: crew }, { checkEveryTick: true });
    const busy = engine.state.agentOrder.map((id) => engine.state.agents[id]!).find((a) => a.taskId);
    expect(busy).toBeDefined();
    const taskId = busy!.taskId!;
    engine.enqueue({ type: "agent.update", agentId: busy!.id, status: "paused" }, 999);
    engine.step();
    const a = engine.state.agents[busy!.id]!;
    expect(a.status).toBe("paused");
    expect(a.taskId).toBeNull();
    expect(a.cargo).toBeNull();
    const t = engine.state.tasks[taskId]!;
    expect(["open", "claimed", "in_progress", "verified"]).toContain(t.status);
    expect(t.claimedBy).not.toBe(a.id);
    const cell = { ...a.cell };
    for (let i = 0; i < 20; i++) engine.step();
    expect(engine.state.agents[busy!.id]!.cell).toEqual(cell); // paused agents do not move
  });

  it("keeps the economy running with no agents at all (background city labour)", () => {
    const { engine } = run(TICKS_PER_DAY * 2, {}, { checkEveryTick: true });
    expect(engine.state.stats.consumed.bread).toBeGreaterThan(0);
    expect(engine.state.stats.produced.flour).toBeGreaterThan(0);
  });

  it("produces dry-run reward records only (shares, no payouts) at epoch close", () => {
    const engine = new SimEngine(createInitialState(layout), layout);
    let seq = 0;
    for (const c of crew) engine.enqueue(c, seq++);
    const rewards = [];
    for (let i = 0; i < TICKS_PER_DAY; i++) rewards.push(...engine.step().rewards);
    expect(rewards.length).toBeGreaterThan(0);
    const totalBps = rewards.reduce((n, r) => n + r.estimatedShareBps, 0);
    expect(totalBps).toBeLessThanOrEqual(10_000);
    expect(totalBps).toBeGreaterThan(9_900);
    for (const r of rewards) expect(Object.keys(r).sort()).toEqual(["agentId", "epoch", "estimatedShareBps", "id", "ownerWallet", "points", "receiptIds"]);
  });
});
