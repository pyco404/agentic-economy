import { describe, it, expect } from "vitest";
import { generateWorld, WORLD_SEED } from "./layout";
import { visualEnvelope } from "./planning";
import { generateLandscape } from "./geometry";
import { cityPalette } from "./palette";
describe("procedural planning presentation", () => {
  it("reserves more visual yard space outside the core without changing parcel inputs", () => {
    const parcel = Object.freeze({ kind: "house", sourceKind: "house", width: 5, depth: 5 });
    const residential = visualEnvelope({ ...parcel, districtTheme: "residential" });
    const outer = visualEnvelope({ ...parcel, districtTheme: "agricultural" });
    const civic = visualEnvelope({ ...parcel, districtTheme: "civic" });
    expect(outer.width).toBeLessThan(residential.width);
    expect(residential.width).toBeLessThan(civic.width);
    expect(civic.width).toBeLessThan(parcel.width);
    expect(parcel.width).toBe(5);
  });
  it("recognizes existing wide roads across chunk edges and keeps curbs inside road cells", () => {
    const terrain = Array<string>(1024).fill("g");
    for (const z of [15, 16]) for (let x = 0; x < 32; x++) terrain[z * 32 + x] = "r";
    const chunks = [0, 1].map((x) => ({ id: `${x}:0`, x, z: 0, seed: 42, size: 32,
      terrain: terrain.join(""), buildings: [], trees: [] }));
    for (const chunk of chunks) {
      const parts = generateLandscape(chunk, 42, chunks);
      const edge = parts.find((p) => p.color === cityPalette.arterialRoad &&
        p.position[0] === (chunk.x ? 32.5 : 31.5) && p.position[2] === 15.5);
      expect(edge).toBeDefined();
      for (const curb of parts.filter((p) => p.color === cityPalette.curb)) {
        const x = Math.floor(curb.position[0]), z = Math.floor(curb.position[2]);
        expect(terrain[z * 32 + x - chunk.x * 32]).toBe("r");
        expect(curb.position[0] - curb.scale[0] / 2).toBeGreaterThanOrEqual(x);
        expect(curb.position[0] + curb.scale[0] / 2).toBeLessThanOrEqual(x + 1);
        expect(curb.position[2] - curb.scale[2] / 2).toBeGreaterThanOrEqual(z);
        expect(curb.position[2] + curb.scale[2] / 2).toBeLessThanOrEqual(z + 1);
      }
    }
  });
  it("keeps the fixture starter town compact and leaves deterministic park space", () => {
    const world = generateWorld(WORLD_SEED, 156);
    expect(world.flatMap((c) => c.buildings).length).toBeLessThan(150);
    expect(world.flatMap((c) => c.parks ?? []).length).toBeGreaterThan(2);
    expect(world).toEqual(generateWorld(WORLD_SEED, 156));
  });
  it("setbacks stay inside a persisted parcel without changing its configuration", () => {
    const parcel = { kind: "house", width: 4, depth: 3 };
    expect(visualEnvelope(parcel)).toEqual({
      width: 3.04,
      depth: 2.2800000000000002,
    });
    expect(parcel).toEqual({ kind: "house", width: 4, depth: 3 });
  });
});
