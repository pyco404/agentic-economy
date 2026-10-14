import pg from "pg";
import WebSocket from "ws";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { generateWorld } from "@agentic-economy/world-spec";
import { MockChain } from "../src/chain/mock.js";
import { MemoryCoordinator } from "../src/coord/memory.js";
import { SimEngine, createInitialState, hashState } from "../src/sim/engine.js";
import type { LoggedCommand } from "../src/sim/types.js";
import { MemoryStore } from "../src/store/memory.js";
import { PostgresStore } from "../src/store/postgres.js";
import { idem, killSimLeaderBackend, launch, login, makeEnv, type TestEnv } from "./helpers.js";
import { resetTestSchema } from "./helpers.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const SEED = "test-world";

const resetSchema = () => resetTestSchema(url!);

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const pool = new pg.Pool({ connectionString: url });
  try {
    return (await pool.query(sql, params)).rows as T[];
  } finally {
    await pool.end();
  }
}

/** Rebuild state from scratch purely from the durable applied-command log (independent oracle). */
async function replayFromLog(toTick: number): Promise<string> {
  const layout = generateWorld(SEED);
  const engine = new SimEngine(createInitialState(layout), layout);
  const log = (await q<{ seq: string; tick: string; command: string }>("SELECT seq, tick, command FROM sim_commands ORDER BY seq")).map(
    (r): LoggedCommand => ({ seq: Number(r.seq), tick: Number(r.tick), command: JSON.parse(r.command) }),
  );
  while (engine.tick < toTick) {
    for (const c of log.filter((c) => c.tick === engine.tick)) engine.enqueueLogged(c);
    engine.step();
  }
  return hashState(engine.state);
}

const pgEnv = async (role: string, extra: Record<string, string> = {}, chain?: MockChain) =>
  makeEnv({ DATABASE_URL: url!, ROLE: role, WORLD_SEED: SEED, SNAPSHOT_EVERY_TICKS: "20", ...extra }, { store: await PostgresStore.connect(url!), chain });

const envs: TestEnv[] = [];
const track = (e: TestEnv) => (envs.push(e), e);
afterAll(async () => {
  for (const e of envs) await e.close().catch(() => undefined);
});

describe("memory coordinator", () => {
  it("drops in-memory state on leadership loss and recovers exactly from the durable log", async () => {
    const store = new MemoryStore();
    const coord = new MemoryCoordinator(store);
    const env = track(await makeEnv({}, { store, coord }));
    const rt = env.ctx.runtime;
    for (let i = 0; i < 30; i++) await rt.tickOnce();
    const before = rt.tick;
    coord.killLeader();
    expect(rt.sim!.isLeader).toBe(false);
    expect(rt.sim!.engine).toBeNull(); // never keeps simulating on possibly-stale state
    await rt.tickOnce(); // re-acquires (new epoch) and rebuilds from snapshot + log
    expect(rt.sim!.isLeader).toBe(true);
    expect(rt.tick).toBe(before + 1);
    expect((await coord.simStatus()).epoch).toBe(2);
  });
});

d("multi-process coordination (Postgres)", () => {
  beforeEach(async () => {
    for (const e of envs.splice(0)) await e.close().catch(() => undefined);
    await resetSchema();
  });

  it("allows exactly one simulation leader; a standby takes over on leader death without double-processing", async () => {
    const a = track(await pgEnv("sim"));
    const b = track(await pgEnv("sim"));
    expect(a.ctx.runtime.sim!.isLeader).toBe(true);
    expect(b.ctx.runtime.sim!.isLeader).toBe(false);
    for (let i = 0; i < 25; i++) {
      expect(await b.ctx.runtime.tickOnce()).toBeNull(); // standby never ticks
      await a.ctx.runtime.tickOnce();
    }
    const api = track(await pgEnv("api"));
    const queued = await api.ctx.runtime.bus.enqueue({ type: "community.register", communityId: "com_failover01", name: "Failover", branding: { primary: "#111", accent: "#222" } }, "cr:failover");
    // Leader dies before applying the command.
    const lastCommitted = Number((await q<{ last_tick: string }>("SELECT last_tick FROM sim_leader"))[0]!.last_tick);
    expect(await killSimLeaderBackend(url!)).toBe(1);
    await new Promise((r) => setTimeout(r, 200)); // let the dead connection surface
    expect(a.ctx.runtime.sim!.isLeader).toBe(false); // dropped its in-memory state
    // The standby takes over and continues from the last committed tick (no tick processed twice).
    expect(await b.ctx.runtime.tickOnce()).not.toBeNull();
    const leader = b.ctx.runtime;
    expect(leader.sim!.isLeader).toBe(true);
    expect(leader.tick).toBe(lastCommitted + 1);
    expect(await a.ctx.runtime.tickOnce()).toBeNull(); // old leader cannot regain leadership while b holds it
    for (let i = 0; i < 10; i++) await leader.tickOnce();
    // The queued command was applied exactly once.
    const inbox = await q<{ applied_seq: string | null }>("SELECT applied_seq FROM sim_command_inbox WHERE id = $1", [queued!.id]);
    expect(inbox[0]!.applied_seq).not.toBeNull();
    expect((await q("SELECT 1 FROM sim_commands WHERE command LIKE '%com_failover01%'")).length).toBe(1);
    // Committed history equals an independent replay of the durable log.
    expect(hashState(leader.state)).toBe(await replayFromLog(leader.tick));
    // No event was written twice and ticks are contiguous.
    expect((await q("SELECT id FROM events GROUP BY id HAVING count(*) > 1")).length).toBe(0);
    const epochs = await q<{ epoch: string }>("SELECT epoch FROM sim_leader");
    expect(Number(epochs[0]!.epoch)).toBe(2); // a = 1, b = 2: fencing epochs only ever increase
  });

  it("fences a leader whose epoch was superseded: it writes nothing and stops", async () => {
    const a = track(await pgEnv("sim"));
    for (let i = 0; i < 5; i++) await a.ctx.runtime.tickOnce();
    const eventsBefore = (await q("SELECT 1 FROM events")).length;
    const tickBefore = Number((await q<{ last_tick: string }>("SELECT last_tick FROM sim_leader"))[0]!.last_tick);
    await q("UPDATE sim_leader SET epoch = epoch + 100"); // someone else claimed leadership
    expect(await a.ctx.runtime.tickOnce()).toBeNull();
    expect(a.ctx.runtime.sim!.engine).toBeNull();
    expect(Number((await q<{ last_tick: string }>("SELECT last_tick FROM sim_leader"))[0]!.last_tick)).toBe(tickBefore);
    expect((await q("SELECT 1 FROM events")).length).toBe(eventsBefore);
  });

  it("routes API commands through the durable inbox; idempotent retries never double-apply; API restarts keep serving", async () => {
    const chain = new MockChain();
    const sim = track(await pgEnv("sim"));
    sim.ctx.runtime.start();
    const api = track(await pgEnv("api", {}, chain));
    const user = await login(api.app);
    const { confirm } = await launch(api.app, user);
    expect(confirm.json().launch.status).toBe("confirmed");
    const communityId = confirm.json().launch.communityId as string;
    const headers = { ...user.auth, ...idem() };
    const body = { communityId, name: "Durable Courier", profession: "logistics_operator" };
    const first = await api.app.inject({ method: "POST", url: "/api/v1/agents", headers, payload: body });
    expect(first.statusCode).toBe(201);
    // Same key again (e.g. client retry): same agent, nothing new queued.
    const retry = await api.app.inject({ method: "POST", url: "/api/v1/agents", headers, payload: body });
    expect(retry.json().agent.id).toBe(first.json().agent.id);
    expect((await q("SELECT 1 FROM sim_command_inbox WHERE kind = 'agent.create'")).length).toBe(1);

    // HQ placement went through the inbox as well.
    const community = (await api.app.inject({ method: "GET", url: `/api/v1/communities/${communityId}` })).json().community;
    expect(community.headquartersBuildingId).toMatch(/^bld_/);

    // Restart the API process: it serves the same world from the published view.
    await api.close();
    envs.splice(envs.indexOf(api), 1);
    const api2 = track(await pgEnv("api", {}, chain));
    const agent = (await api2.app.inject({ method: "GET", url: `/api/v1/agents/${first.json().agent.id}` })).json().agent;
    expect(agent.name).toBe("Durable Courier");
    const ready = await api2.app.inject({ method: "GET", url: "/readyz" });
    expect(ready.statusCode).toBe(200);
    const health = (await api2.app.inject({ method: "GET", url: "/healthz" })).json();
    expect(health).toMatchObject({ role: "api", simRunning: true, simLeader: { localLeader: false } });
  });

  it("recovers WebSocket events across an API restart from the durable stream", async () => {
    const sim = track(await pgEnv("sim"));
    const api = track(await pgEnv("api"));
    await api.app.listen({ host: "127.0.0.1", port: 0 });
    const port = (api.app.server.address() as { port: number }).port;
    const received: Array<{ seq: number; type: string }> = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/ws`);
    ws.on("message", (m) => received.push(JSON.parse(String(m))));
    await new Promise((r) => ws.once("open", r));
    for (let i = 0; i < 6; i++) await sim.ctx.runtime.tickOnce();
    await new Promise((r) => setTimeout(r, 300));
    const lastSeen = Math.max(...received.filter((m) => m.type !== "world.snapshot").map((m) => m.seq));
    ws.close();

    // API goes down; the simulation keeps producing events.
    await api.close();
    envs.splice(envs.indexOf(api), 1);
    for (let i = 0; i < 6; i++) await sim.ctx.runtime.tickOnce();
    const produced = (await q<{ seq: string }>("SELECT seq FROM stream_events WHERE seq > $1 ORDER BY seq", [lastSeen])).map((r) => Number(r.seq));
    expect(produced.length).toBeGreaterThan(0);

    const api2 = track(await pgEnv("api"));
    await api2.app.listen({ host: "127.0.0.1", port: 0 });
    const port2 = (api2.app.server.address() as { port: number }).port;
    const got: Array<{ seq: number; type: string }> = [];
    const ws2 = new WebSocket(`ws://127.0.0.1:${port2}/api/v1/ws`);
    ws2.on("message", (m) => got.push(JSON.parse(String(m))));
    await new Promise((r) => ws2.once("open", r));
    ws2.send(JSON.stringify({ v: 1, type: "resume", lastSeq: lastSeen }));
    await new Promise((r) => setTimeout(r, 500));
    const replayed = got.filter((m) => m.type !== "world.snapshot").map((m) => m.seq);
    expect(replayed).toEqual(produced); // every missed event, in order, none duplicated
    ws2.close();
  });

  it("runs exactly one active indexer and never double-counts creator fees across instances or takeovers", async () => {
    const chain = new MockChain();
    const devnet = {
      MODE: "devnet",
      SOLANA_RPC_URL: "http://127.0.0.1:1",
      PLATFORM_TREASURY: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      AGENT_REWARDS_TREASURY: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    };
    track(await pgEnv("sim", devnet));
    const i1 = track(await pgEnv("indexer", devnet, chain));
    const i2 = track(await pgEnv("indexer", devnet, chain));
    // Register a community directly (devnet launches are disabled; we only need registry + chain data here).
    const mint = (await import("@solana/web3.js")).Keypair.generate().publicKey.toBase58();
    await q("INSERT INTO launches (id, status, launcher_wallet, mint, doc) VALUES ('lch_idx000001', 'confirmed', 'x', $1, '{}')", [mint]);
    await q("INSERT INTO communities (id, mint, launch_id, doc, registered_at) VALUES ('com_idx000001', $1, 'lch_idx000001', $2, now())", [
      mint,
      JSON.stringify({ id: "com_idx000001", mint, launchId: "lch_idx000001", symbol: "IDX" }),
    ]);
    for (let n = 0; n < 3; n++)
      chain.simulateCreatorFeeDistribution({ mint, payouts: [{ address: devnet.AGENT_REWARDS_TREASURY, lamports: 600n }, { address: devnet.PLATFORM_TREASURY, lamports: 400n }] });

    const [r1, r2] = await Promise.all([i1.ctx.indexer!.runOnce(), i2.ctx.indexer!.runOnce()]);
    expect([r1, r2].filter(Boolean)).toHaveLength(1); // one active, one standby
    expect((await q("SELECT 1 FROM treasury_entries WHERE stream = 'creator_fee'")).length).toBe(6);

    // The active indexer dies; the standby takes over with fresh cursors and re-reads history.
    const active = r1 ? i1 : i2;
    const standby = r1 ? i2 : i1;
    await killSimLeaderBackend(url!, 4_242_002);
    await new Promise((r) => setTimeout(r, 100));
    expect(await standby.ctx.indexer!.runOnce()).toBe(true);
    expect((await q("SELECT 1 FROM treasury_entries WHERE stream = 'creator_fee'")).length).toBe(6); // nothing double-counted
    expect((await q("SELECT key FROM stream_events WHERE type = 'treasury.updated' GROUP BY key HAVING count(*) > 1")).length).toBe(0);
    expect(active.ctx.indexer!.isActive).toBe(false);
  });
});
