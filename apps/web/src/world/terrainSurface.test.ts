import { describe, expect, it } from "vitest";
import { createTurfSampler, turfColor } from "./terrainSurface";
import { generateLandscape } from "./geometry";
import { cityPalette } from "./palette";
import { generateWorld, WORLD_SEED, type ChunkVisual } from "./layout";

describe("zoned turf surfaces", () => {
  it("reproduces smooth, varied turf across positive and negative chunk boundaries", () => {
    const colors = new Set<string>();
    for (let x = -40; x <= 64; x += 2) {
      const color = turfColor(42, x, 12);
      expect(color.equals(turfColor(42, x, 12))).toBe(true);
      const adjacent = turfColor(42, x + .001, 12);
      expect(Math.hypot(color.r - adjacent.r, color.g - adjacent.g, color.b - adjacent.b)).toBeLessThan(.001);
      colors.add(color.getHexString());
    }
    expect(colors.size).toBeGreaterThan(10);
    expect(turfColor(42, 12, 12).equals(turfColor(99, 12, 12))).toBe(false);
  });
  it("keeps civic turf lighter than residential and unbuilt meadows without mutating buildings", () => {
    const base = generateWorld(WORLD_SEED, 10)[0]!;
    const building = { ...base.buildings[0]!, x: 8, z: 8, floors: 1 };
    const sample = (kind: typeof building.kind) => createTurfSampler(42,
      [{ ...base, parks: [], buildings: [{ ...building, kind }] }])(8, 8);
    const before = JSON.stringify(base);
    const lightness = (color: ReturnType<typeof turfColor>) => color.getHSL({ h: 0, s: 0, l: 0 }).l;
    expect(lightness(sample("town-hall"))).toBeGreaterThan(lightness(sample("house")));
    expect(lightness(sample("house"))).toBeGreaterThan(lightness(turfColor(42, 8, 8)));
    expect(JSON.stringify(base)).toBe(before);
  });
  it("changes only grass tile treatment and leaves water, paving, sand and reserved cells clear", () => {
    const chunk: ChunkVisual = { id: "0:0", x: 0, z: 0, seed: 42, size: 4,
      terrain: "gsrpfbxwgsrpfbxw", elevation: "0".repeat(16), buildings: [], trees: [] };
    const before = JSON.stringify(chunk), parts = generateLandscape(chunk, 42);
    const expected: Record<string, string> = { s: cityPalette.sand, r: cityPalette.road,
      p: cityPalette.plaza, f: cityPalette.field, b: "#c9bfa8", x: cityPalette.terrain, w: cityPalette.water };
    for (let i = 0; i < 16; i++) {
      const code = chunk.terrain![i]!, x = i % 4 + .5, z = Math.floor(i / 4) + .5;
      const ground = parts.find(p => p.position[0] === x && p.position[2] === z &&
        p.scale[0] === 1 && p.scale[2] === 1 && p.position[1] < 0)!;
      expect(ground).toBeDefined();
      expect(ground.color).toBe(code === "g" ? `#${turfColor(42, x, z).getHexString()}` : expected[code]);
      expect(ground.scale).toEqual([1, code === "w" ? .03 : .2, 1]);
    }
    expect(JSON.stringify(chunk)).toBe(before);
  });
});
