import { describe, it, expect, vi, afterEach } from "vitest";
import { agentIdentity } from "./agentIdentity";
import {
  DemoAdapter,
  HttpAdapter,
  demoDashboard,
  worldChunkToVisual,
} from "./adapter";
import {
  WorldStats,
  Community,
  AgentSummary,
  TreasurySummary,
  WorldBootstrap,
  MarketsResponse,
} from "./shared";
afterEach(() => vi.unstubAllGlobals());
describe("API adapter boundary", () => {
  it("demo fixtures pass canonical backend schemas and have no fabricated receipts", () => {
    const d = demoDashboard();
    WorldBootstrap.parse(d.bootstrap);
    WorldStats.parse(d.stats);
    d.communities.forEach((c) => Community.parse(c));
    d.agents.forEach((a) => AgentSummary.parse(a));
    if ("identity" in AgentSummary.shape) {
      expect(new Set(d.agents.map((a) => agentIdentity(a).displayName)).size).toBe(d.agents.length);
      d.agents.forEach((a) => expect(agentIdentity(a)).toMatchObject({ kind: "house", owner: null }));
    }
    TreasurySummary.parse(d.treasury);
    MarketsResponse.parse(d.markets);
    expect(d.treasury.recentEntries).toEqual([]);
    expect(d.treasury.feeRouting.verified).toBe(false);
  });
  it("demo activation and pause/resume leave on-chain data untouched", async () => {
    const api = new DemoAdapter();
    const d = await api.load();
    const a = await api.createAgent({
      communityId: d.communities[0]!.id,
      name: "Test worker",
      profession: "farmer",
    });
    expect((await api.load()).agents).toHaveLength(d.agents.length + 1);
    if ("identity" in AgentSummary.shape) expect(agentIdentity(a)).toMatchObject({ kind: "house", owner: null });
    expect((await api.updateAgent(a.id, { status: "paused" })).state).toBe(
      "paused",
    );
    expect((await api.updateAgent(a.id, { status: "active" })).status).toBe(
      "active",
    );
    expect((await api.load()).treasury).toEqual(d.treasury);
  });
  it("backend errors are surfaced without changing to demo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: "Simulation unavailable" } }),
      }),
    );
    const api = new HttpAdapter("http://localhost:3001");
    await expect(api.load()).rejects.toThrow("Simulation unavailable");
    expect(api.kind).toBe("http");
  });
  it("rejects malformed API payloads at the contract boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ activeAgents: "made up" }),
      }),
    );
    await expect(
      new HttpAdapter("http://localhost:3001").request("/stats", WorldStats),
    ).rejects.toThrow();
  });
  it("consumes persisted terrain and position without regenerating server layout", () => {
    const result = worldChunkToVisual({
      coord: { cx: 3, cy: 2 },
      size: 32,
      version: 4,
      terrain: "g".repeat(1024),
      elevation: "0".repeat(1024),
      props: [],
      buildings: [
        {
          id: "bld_demo0001",
          kind: "house",
          name: "Server home",
          origin: { x: 100, y: 70 },
          entrance: { x: 100, y: 69 },
          chunk: { cx: 3, cy: 2 },
          params: {
            width: 4,
            depth: 6,
            height: 3,
            floors: 2,
            roofStyle: "gable",
            material: "plaster",
            windowPattern: "grid",
            districtTheme: "residential",
            roofPalette: 0,
            facing: "s",
            seed: 15,
          },
          status: "active",
          condition: 100,
          ownerAgentId: null,
          communityId: null,
          inventory: {},
          branding: null,
        },
      ],
    });
    expect(result.buildings[0]?.x).toBe(102);
    expect(result.buildings[0]?.z).toBe(73);
    expect(result.terrain).toHaveLength(1024);
  });
});
