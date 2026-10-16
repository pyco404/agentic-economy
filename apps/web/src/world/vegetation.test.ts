import { describe, expect, it } from "vitest";
import { districtSpecies, planVegetation, type TreeSpecies } from "./vegetation";
import { generateLandscape, geometryLibrary } from "./geometry";
import { generateTreeParts } from "./vegetationGeometry";
import type { ChunkVisual, BuildingVisual } from "./layout";

const building: BuildingVisual = {
  id: "parcel", seed: 1, sourceKind: "house", kind: "house", x: 16, z: 16,
  width: 4, depth: 4, height: 4, floors: 2, roofStyle: "gable",
  roofColor: "#c97c5d", rotation: 0, name: "Parcel", chunkId: "0:0",
  entrance: { x: 16, z: 19.5 }, districtTheme: "residential",
};
function block(theme = "residential"): ChunkVisual {
  const trees = [];
  for (let x = 4.5; x < 28; x += 2)
    for (let z = 4.5; z < 28; z += 2) trees.push({ x, z, scale: 1 });
  return { id: "0:0", x: 0, z: 0, seed: 42, size: 32, terrain: "g".repeat(1024),
    elevation: "0".repeat(1024), trees, buildings: [{ ...building, districtTheme: theme }] };
}
describe("district-aware visual vegetation", () => {
  it("generates six bounded silhouettes using only shared low-poly primitives", () => {
    const library = geometryLibrary();
    const silhouettes = new Set<string>();
    const kinds: TreeSpecies[] = ["broadleaf", "evergreen", "columnar", "layered", "ornamental", "shrub"];
    for (const kind of kinds) {
      const tree = { x: 10, z: 20, scale: 1.2, elevation: 0.24, kind,
        zone: "natural" as const, placement: "natural" as const };
      const parts = generateTreeParts(tree);
      expect(parts).toEqual(generateTreeParts(tree));
      expect(parts.length).toBeLessThanOrEqual(3);
      silhouettes.add(JSON.stringify(parts.map((p) => [p.geometry, p.position, p.scale])));
      for (const part of parts) {
        const geometry = library[part.geometry as keyof typeof library];
        const vertices = geometry.getAttribute("position");
        for (let i = 0; i < vertices.count; i++) {
          const x = vertices.getX(i) * part.scale[0] + part.position[0] - tree.x;
          const z = vertices.getZ(i) * part.scale[2] + part.position[2] - tree.z;
          expect(Math.hypot(x, z)).toBeLessThanOrEqual(0.8 * tree.scale + 0.00001);
        }
      }
    }
    expect(silhouettes.size).toBe(6);
    expect(districtSpecies.civic).not.toContain("broadleaf");
    expect(new Set(districtSpecies.residential).size).toBeGreaterThan(3);
    Object.values(library).forEach((g) => g.dispose());
  });
  it("substantially thins urban centers and preserves dense designated parks", () => {
    const civic = planVegetation(block("civic"), 42);
    const industrial = planVegetation(block("industrial"), 42);
    const residential = planVegetation(block(), 42);
    expect(civic.length).toBeLessThan(residential.length / 2);
    expect(industrial.length).toBeLessThan(residential.length / 2);
    const park = { ...block(), buildings: [], parks: [{ x: 16, z: 16, size: 26 }] };
    const forest = { ...park, parks: [] };
    expect(planVegetation(park, 42).length).toBeGreaterThan(park.trees.length * 0.7);
    expect(planVegetation(forest, 42)).toHaveLength(forest.trees.length);
  });
  it("keeps entire crowns off roads, paths, parcels and actual entrance approaches", () => {
    const chunk = block();
    const terrain = chunk.terrain!.split("");
    for (let x = 0; x < 32; x++) terrain[8 * 32 + x] = "r";
    for (let z = 0; z < 32; z++) terrain[z * 32 + 25] = "p";
    chunk.terrain = terrain.join("");
    const result = planVegetation(chunk, 42);
    expect(result.some((t) => t.placement === "street")).toBe(true);
    for (const t of result) {
      const radius = t.scale * 0.8;
      expect(Math.max(8 - t.z, 0, t.z - 9)).toBeGreaterThanOrEqual(radius);
      expect(Math.max(25 - t.x, 0, t.x - 26)).toBeGreaterThanOrEqual(radius);
      expect(Math.hypot(t.x - 16, t.z - 19.5)).toBeGreaterThanOrEqual(radius + 2.5);
      const parcelDistance = Math.hypot(Math.max(0, Math.abs(t.x - 16) - 2),
        Math.max(0, Math.abs(t.z - 16) - 2));
      expect(parcelDistance).toBeGreaterThanOrEqual(radius + 0.65);
    }
    const landscape = generateLandscape(chunk, 42);
    expect(landscape.filter((p) => p.role === "tree-trunk")).toHaveLength(result.length);
    expect(landscape.filter((p) => p.role === "tree-crown").length).toBeGreaterThanOrEqual(result.length);
  });
  it("checks neighboring parcels and reproduces plans without mutating persisted inputs", () => {
    const chunk = { ...block(), buildings: [], trees: [{ x: 30.5, z: 16.5, scale: 1 }] };
    const neighbor: ChunkVisual = { ...block(), id: "1:0", x: 1, trees: [],
      buildings: [{ ...building, id: "neighbor", x: 33, width: 4, depth: 10 }] };
    expect(planVegetation(chunk, 42)).toHaveLength(1);
    const before = JSON.stringify([chunk, neighbor]);
    const result = planVegetation(chunk, 42, [chunk, neighbor]);
    expect(result).toHaveLength(0);
    expect(planVegetation(chunk, 42, [neighbor, chunk])).toEqual(result);
    expect(JSON.stringify([chunk, neighbor])).toBe(before);
  });
});
