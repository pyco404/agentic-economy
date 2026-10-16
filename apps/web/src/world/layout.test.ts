import { describe, it, expect } from "vitest";
import {
  generateChunk,
  generateWorld,
  chunkCoordinates,
  isLand,
  WORLD_SEED,
  roadPosition,
} from "./layout";
import {
  generateBuilding,
  createBatch,
  geometryLibrary,
  disposeGroup,
} from "./geometry";
import * as THREE from "three";
describe("procedural world invariants", () => {
  it("reproduces an identical city across reloads and generation order", () => {
    const a = generateWorld(WORLD_SEED, 156);
    generateWorld(999, 700);
    expect(generateWorld(WORLD_SEED, 156)).toEqual(a);
    expect(generateChunk(WORLD_SEED, -1, 0)).toEqual(
      a.find((c) => c.id === "-1:0"),
    );
  });
  it("seeds change the appearance while preserving valid placement", () => {
    const a = generateWorld(42, 156),
      b = generateWorld(43, 156);
    expect(a).not.toEqual(b);
    for (const chunk of a)
      for (const building of chunk.buildings) {
        expect(isLand(building.x + 4, building.z, 42)).toBe(true);
        expect(building.width).toBeGreaterThan(0);
        expect(building.depth).toBeGreaterThan(0);
      }
  });
  it("expands deterministically without changing existing districts", () => {
    const initial = generateWorld(WORLD_SEED, 156),
      expanded = generateWorld(WORLD_SEED, 520);
    expect(expanded.length).toBeGreaterThan(initial.length);
    for (const c of initial)
      expect(expanded.find((e) => e.id === c.id)).toEqual(c);
    expect(chunkCoordinates(100000).length).toBe(64);
  });
  it("generates distinct complete silhouettes for every required building", () => {
    const buildings = generateWorld(WORLD_SEED, 156).flatMap(
      (c) => c.buildings,
    );
    const kinds = [
      "house",
      "farm",
      "mill",
      "bakery",
      "market",
      "warehouse",
      "factory",
      "headquarters",
      "town-hall",
    ];
    const counts = [];
    for (const kind of kinds) {
      const b = buildings.find((b) => b.kind === kind)!;
      expect(b).toBeDefined();
      const parts = generateBuilding(b);
      expect(parts).toEqual(generateBuilding(b));
      expect(parts.length).toBeGreaterThan(5);
      expect(
        parts.every(
          (p) =>
            p.position.every(Number.isFinite) && p.scale.every((n) => n > 0),
        ),
      ).toBe(true);
      counts.push(parts.length);
    }
    expect(new Set(counts).size).toBeGreaterThan(5);
  });
  it("keeps moving indicators on the orthogonal street network", () => {
    for (let i = 0; i < 20; i++)
      for (let t = 0; t < 1000; t += 7) {
        const [x, z] = roadPosition(t, i);
        expect(Math.abs(x % 16) < 1e-8 || Math.abs(z % 16) < 1e-8).toBe(true);
        expect(isLand(x, z)).toBe(true);
      }
  });
  it("uses instancing and merged edges rather than one object per part", () => {
    const lib = geometryLibrary();
    const parts = generateWorld(WORLD_SEED, 156)
      .slice(0, 2)
      .flatMap((c) => c.buildings.flatMap(generateBuilding));
    const group = createBatch(parts, lib);
    expect(
      group.children.filter((c) => c instanceof THREE.InstancedMesh).length,
    ).toBeLessThan(parts.length / 5);
    expect(
      group.children.filter((c) => c instanceof THREE.LineSegments).length,
    ).toBe(1);
    disposeGroup(group, new Set(Object.values(lib)));
    Object.values(lib).forEach((g) => g.dispose());
  });
});
