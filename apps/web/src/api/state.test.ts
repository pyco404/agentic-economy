import { describe, it, expect } from "vitest";
import { demoDashboard, worldChunkToVisual } from "./adapter";
import { applyServerEvent, mergeDashboard } from "./state";
import type { ServerEvent, WorldChunk } from "./shared";
const fixtureWorld=demoDashboard().bootstrap;
const snapshot = (
  agents: ReturnType<typeof demoDashboard>["agents"],
  tick: number,
  chunks: { cx: number; cy: number }[] | null,
): ServerEvent => ({
  v: 1,
  type: "world.snapshot",
  seq: 100,
  tick,
  ts: new Date().toISOString(),
  data: {
    mode: "demo",
    worldId: fixtureWorld.worldId,
    seed: fixtureWorld.seed,
    reason: "subscription_changed",
    subscribedChunks: chunks,
    agents,
    quotes: [],
    chunkVersions: [],
  },
});
describe("authoritative world reconciliation", () => {
  it('keeps the old complete world until a foreign-seed snapshot is replaced by a complete HTTP world',()=>{
    const d=demoDashboard(),event=snapshot([],500,null);
    if(event.type!=='world.snapshot')throw Error('fixture');event.data.worldId='world_approved';event.data.seed='approved-seed';
    expect(applyServerEvent(d,event)).toBe(d);
    const incoming={...d,bootstrap:{...d.bootstrap,worldId:event.data.worldId,seed:event.data.seed},activities:[]};
    expect(mergeDashboard(d,incoming)).toBe(incoming);
  });
  it('does not replay old-world activity into an explicitly aligned simulation',()=>{
    const d=demoDashboard();d.stats.simulation={profile:'fixture',startedTick:100,groups:[]};
    const event=snapshot([],99,null);expect(applyServerEvent(d,event)).toBe(d);
  });
  it("keeps offscreen agents in global lists when a region snapshot arrives", () => {
    const d = demoDashboard(),
      a = d.agents[0]!;
    const updated = applyServerEvent(
      d,
      snapshot([{ ...a, pos: { x: 12, y: 15 } }], 500, [{ cx: 0, cy: 0 }]),
    );
    expect(updated.agents).toHaveLength(d.agents.length);
    expect(updated.agents[0]?.pos.x).toBe(12);
  });
  it("replayed movement cannot regress newer snapshot positions", () => {
    const d = demoDashboard(),
      a = d.agents[0]!;
    const fresh = applyServerEvent(
      d,
      snapshot([{ ...a, pos: { x: 12, y: 15 } }], 500, null),
    );
    const result = applyServerEvent(fresh, {
      v: 1,
      type: "agent.moved",
      seq: 50,
      tick: 490,
      ts: new Date().toISOString(),
      data: {
        moves: [
          {
            id: a.id,
            pos: { x: 2, y: 3 },
            state: "moving",
            target: null,
            speed: 2,
          },
        ],
      },
    });
    expect(result.agents[0]?.pos.x).toBe(12);
  });
  it("HTTP refresh preserves newer stream positions and deduplicates activity", () => {
    const d = demoDashboard(),
      a = d.agents[0]!;
    const current = applyServerEvent(
      d,
      snapshot([{ ...a, pos: { x: 12, y: 15 } }], 500, [{ cx: 0, cy: 0 }]),
    );
    const result = mergeDashboard(current, d);
    expect(result.agents[0]?.pos.x).toBe(12);
    expect(new Set(result.activities.map((a) => a.id)).size).toBe(
      result.activities.length,
    );
  });
  it("inventory changes do not change procedural geometry fingerprints", () => {
    const chunk: WorldChunk = {
      coord: { cx: 0, cy: 0 },
      size: 32,
      version: 1,
      terrain: "g".repeat(1024),
      elevation: "0".repeat(1024),
      buildings: [],
      props: [],
    };
    expect(worldChunkToVisual(chunk).geometryKey).toBe(
      worldChunkToVisual({ ...chunk, version: 20 }).geometryKey,
    );
    expect(worldChunkToVisual(chunk).seed).toBe(
      worldChunkToVisual({ ...chunk, version: 20 }).seed,
    );
  });
  it("database-reset snapshots clear stale version and tick barriers", () => {
    const d = demoDashboard();
    d.agentTicks = { [d.agents[0]!.id]: 900 };
    d.streamTick = 900;
    d.stats.tick = 900;
    const reset = applyServerEvent(d, {
      ...snapshot([d.agents[0]!], 2, null),
      data: {
        ...snapshot([], 2, null).data,
        reason: "server_restart",
        agents: [d.agents[0]!],
      },
    } as ServerEvent);
    expect(reset.stats.tick).toBe(0);
    expect(reset.streamTick).toBe(2);
    expect(reset.agentTicks?.[d.agents[0]!.id]).toBe(2);
    expect(reset.worldChunks).toEqual([]);
  });
});

it('upserts new publicly observed Common Agents and removes full exits from the live roster', () => {
  const data = demoDashboard();
  const wallet = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const agent = { ...data.agents[0]!, id: 'agt_common0001', ownerWallet: null, identity: {
    kind: 'aeco_observed' as const, wallet, tokenMint: wallet, network: 'devnet' as const, balanceRaw: '10', decimals: 6, observedSlot: 100,
  } };
  const event: ServerEvent = { v: 1, type: 'agent.moved', seq: 101, tick: data.stats.tick + 1, ts: new Date().toISOString(), data: { moves: [{ id: agent.id, agent, pos: agent.pos, state: 'moving', target: null, speed: 2 }] } };
  const added = applyServerEvent(data, event);
  expect(added.agents.find(a => a.id === agent.id)?.identity.kind).toBe('aeco_observed');
  const exited = applyServerEvent(added, { ...event, seq: 102, tick: event.tick + 1, data: { moves: [{ ...event.data.moves[0]!, state: 'paused' }] } });
  expect(exited.agents.some(a => a.id === agent.id)).toBe(false);
});

it('clears stale social presence when a complete agent update disables the simulation', () => {
  const d = demoDashboard(), agent = d.agents[0]!;
  agent.social = { tick: 500, personality: { temperament: 'sociable', interest: 'music', routine: 'evening square' }, mood: 'content', socialNeed: 10, current: null, destination: null };
  const replacement = { ...agent }; delete replacement.social;
  const next = applyServerEvent(d, { v: 1, type: 'agent.moved', seq: 200, tick: 501, ts: '2026-10-23T00:00:00Z',
    data: { moves: [{ id: agent.id, pos: agent.pos, state: agent.state, target: null, speed: 2, agent: replacement }] } });
  expect(next.agents.find(a => a.id === agent.id)!.social).toBeUndefined();
});
