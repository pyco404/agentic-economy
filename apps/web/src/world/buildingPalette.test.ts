import { describe, expect, it } from "vitest";
import { buildingColorFamily, buildingWallColor, buildingWallFamilies } from "./buildingPalette";
import type { BuildingVisual } from "./layout";
const base: BuildingVisual = { id: "color", seed: 10, kind: "house", x: 20, z: 30,
  width: 5, depth: 5, height: 6, floors: 3, roofStyle: "gable", roofColor: "#c97c5d",
  rotation: 0, name: "Color", chunkId: "0:0" };
describe("controlled Mediterranean facade palette", () => {
  it("selects from distinct canonical building families with bounded seeded variation", () => {
    const examples = { house: "residential", apartment: "apartment", market: "commercial",
      factory: "industrial", town_hall: "civic" } as const;
    for (const [sourceKind, family] of Object.entries(examples)) {
      const colors = new Set<string>();
      for (let seed = 0; seed < 40; seed++) {
        const b = Object.freeze({ ...base, seed, sourceKind });
        expect(buildingColorFamily(b)).toBe(family);
        const color = buildingWallColor(b);
        expect(buildingWallFamilies[family] as readonly string[]).toContain(color);
        expect(buildingWallColor(b)).toBe(color);
        colors.add(color);
      }
      expect(colors.size).toBe(3);
    }
  });
});
