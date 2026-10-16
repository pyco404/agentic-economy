import { describe, it, expect } from "vitest";
import { demoDashboard, worldChunkToVisual } from "./adapter";
import { applyServerEvent, mergeDashboard } from "./state";
import type { ServerEvent, WorldChunk } from "./shared";
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
    worldId: "genesis-demo",
    seed: "42",
    reason: "subscription_changed",
    subscribedChunks: chunks,
    agents,
    quotes: [],
    chunkVersions: [],
  },
});
describe("authoritative world reconciliation", () => {
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
