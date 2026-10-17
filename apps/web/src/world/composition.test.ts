import { beforeAll, describe, expect, it } from "vitest";
import { composeCityEdges } from "./composition";
import { generateFrontier, FRONTIER_WATER } from "./frontier";
import type { ChunkVisual } from "./layout";
import fixture from "./fixtures/underground-rail-world.json";
import { planStreets } from "./streets";
import { planRiversideRail, type RiversidePlan } from "./riversideRail";
import { planUndergroundRail } from "./undergroundRail";
import { railTerrain } from "./railTerrain";

describe("contained city composition", () => {
  const chunks = fixture.chunks as unknown as ChunkVisual[];
  let frontier: ReturnType<typeof generateFrontier>, railway: RiversidePlan;
  beforeAll(() => {
    frontier = generateFrontier(fixture.seed, chunks, fixture.catalog);
    const streets = planStreets(chunks, fixture.seed);
    railway = planUndergroundRail(planRiversideRail(chunks, frontier, fixture.seed, streets), chunks, frontier, fixture.seed, streets);
  }, 20000);
  it("keeps the validated railway continuous with the same portals and two-minute service", () => {
    expect(railway.report.issues).toEqual([]);
    expect(railway.report.tunnel).toMatchObject({ continuous: true, hiddenSeconds: 120,
      west: { x: 20, z: -7 }, east: { x: 148, z: 1 } });
  });
  it("adds deterministic, low landscape geometry without changing parcels, roads or rail state", () => {
    const before = JSON.stringify({ chunks, railway: railway.report });
    const result = composeCityEdges(chunks, frontier, fixture.seed, railway, fixture.catalog);
    expect(result.edgeSegments).toBeGreaterThan(100);
    expect(result.railGardens).toBeGreaterThan(0);
    expect(result.railGardens).toBeLessThan(16);
    expect(result).toEqual(composeCityEdges(chunks, frontier, fixture.seed, railway, fixture.catalog));
    expect(JSON.stringify({ chunks, railway: railway.report })).toBe(before);
    const ground = railTerrain(chunks, frontier);
    for (const part of result.parts) {
      expect(part.buildingId).toBeUndefined();
      expect(ground(part.position[0], part.position[2])?.wet).toBe(false);
      expect(chunks.some((c) => c.buildings.some((b) =>
        Math.abs(part.position[0] - b.x) < (b.width + part.scale[0]) / 2 &&
        Math.abs(part.position[2] - b.z) < (b.depth + part.scale[2]) / 2))).toBe(false);
      if (part.role !== "rail-fill") expect(part.scale[1]).toBeLessThanOrEqual(.3);
    }
  });
  it("leaves road and water openings, and removes seams when the city expands", () => {
    const terrain = Array.from({ length: 1024 }, () => "g");
    for (let z = 0; z < 32; z++) { terrain[z * 32 + 8] = "r"; terrain[z * 32 + 16] = "w"; }
    const chunk: ChunkVisual = { id: "0:0", x: 0, z: 0, seed: 42, terrain: terrain.join(""), elevation: "0".repeat(1024), buildings: [], trees: [] };
    const catalog = [{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }];
    const landscape = generateFrontier(42, [chunk], catalog);
    const result = composeCityEdges([chunk], landscape, 42, null, catalog);
    for (const part of result.parts) {
      expect(part.position[0]).toBeLessThan(32); // no curb along a future internal seam
      if (part.position[2] < 0 || part.position[2] > 32) {
        expect(Math.abs(part.position[0] - 8.5)).toBeGreaterThan(1);
        expect(Math.abs(part.position[0] - 16.5)).toBeGreaterThan(1);
      }
    }
    const water = generateFrontier(42, [chunk]);
    for (let i = 0; i < water.water.length; i += 3) {
      expect(water.water[i + 2]).toBeGreaterThanOrEqual(-FRONTIER_WATER.reach);
      expect(water.water[i + 2]).toBeLessThanOrEqual(32 + FRONTIER_WATER.reach);
    }
  });
});
