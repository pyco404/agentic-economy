import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { routes, ServerEvent, type RouteName } from "../src/index.js";

const fx = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8"));

const FIXTURE_ROUTES: Record<string, RouteName> = {
  "world-bootstrap": "worldBootstrap",
  "world-chunks": "worldChunks",
  "world-stats": "worldStats",
  "world-agents": "worldAgents",
  activities: "activities",
  markets: "markets",
  "economy-summary": "economySummary",
  tasks: "tasks",
  receipts: "receipts",
  rewards: "rewards",
  communities: "communities",
  community: "community",
  "community-agents": "communityAgents",
  agent: "agent",
  "agent-activity": "agentActivity",
  treasury: "treasury",
  "treasury-entries": "treasuryEntries",
  launch: "launch",
};

describe("published fixtures match the published contract", () => {
  for (const [file, route] of Object.entries(FIXTURE_ROUTES)) {
    it(`${file}.json ⊨ ${route} response`, () => {
      const res = (routes[route].response as z.ZodType).safeParse(fx(file));
      expect(res.success, res.success ? "" : JSON.stringify(res.error.issues.slice(0, 3))).toBe(true);
    });
  }

  it("ws-events.json contains valid server events of every streamed type", () => {
    const events = fx("ws-events") as unknown[];
    for (const e of events) expect(ServerEvent.safeParse(e).success).toBe(true);
    const types = new Set(events.map((e) => (e as { type: string }).type));
    for (const t of ["agent.moved", "agent.action", "activity.created", "economy.price_updated", "world.chunk.updated"]) expect(types.has(t)).toBe(true);
  });

  it("every fixture is labelled demo mode", () => {
    for (const file of Object.keys(FIXTURE_ROUTES)) {
      const d = fx(file);
      const mode = d.mode ?? d.launch?.mode;
      if (mode !== undefined) expect(mode).toBe("demo");
    }
  });
});
