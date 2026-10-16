import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { architectureProfile } from "./architecture";
import { generateBuilding, geometryLibrary } from "./geometry";
import { buildingWallColor } from "./buildingPalette";
import type { BuildingVisual } from "./layout";

const base: BuildingVisual = {
  id: "variation",
  seed: 10,
  kind: "house",
  x: 0,
  z: 0,
  width: 6,
  depth: 5,
  height: 9,
  floors: 6,
  roofStyle: "gable",
  roofColor: "#d39477",
  rotation: 0,
  name: "Variation",
  chunkId: "0:0",
  windowPattern: "grid",
};

describe("deterministic architectural variation", () => {
  it("keeps primary openings in the base LOD with clear entrance bays", () => {
    for (const pattern of ["grid", "sparse", "bands", "storefront"] as const) {
      const parts = generateBuilding({ ...base, windowPattern: pattern });
      const openings = parts.filter((p) => p.role === "window" || p.role === "door");
      expect(openings.length).toBeGreaterThan(1);
      expect(openings.every((p) => !p.detail && !p.outline)).toBe(true);
      const door = openings.find((p) => p.role === "door")!;
      for (const pane of openings.filter((p) => p.role === "window")) {
        const bounds = (part: typeof pane) => new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(...part.position), new THREE.Vector3(...part.scale),
        );
        expect(bounds(pane).intersectsBox(bounds(door))).toBe(false);
      }
      expect(parts.some((p) => p.detail)).toBe(true);
    }
  });

  it("varies massing and rhythms across seeds without mutating authoritative dimensions", () => {
    const profiles = [],
      silhouettes = new Set<string>(),
      library = geometryLibrary();
    for (let seed = 0; seed < 48; seed++) {
      const input = Object.freeze({ ...base, seed });
      const before = JSON.stringify(input),
        parts = generateBuilding(input),
        profile = architectureProfile(input);
      expect(parts).toEqual(generateBuilding(input));
      expect(JSON.stringify(input)).toBe(before);
      profiles.push(profile);
      const walls = parts.filter((p) => p.color === buildingWallColor(input));
      silhouettes.add(JSON.stringify(walls.map((p) => [p.position, p.scale])));
      expect(walls.length).toBe(profile.stepped ? 2 : 1);
      for (const wall of walls) {
        const bounds = new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(...wall.position),
          new THREE.Vector3(...wall.scale),
        );
        expect(bounds.min.x).toBeGreaterThanOrEqual(-base.width / 2);
        expect(bounds.max.x).toBeLessThanOrEqual(base.width / 2);
        expect(bounds.min.z).toBeGreaterThanOrEqual(-base.depth / 2);
        expect(bounds.max.z).toBeLessThanOrEqual(base.depth / 2);
        expect(bounds.max.y).toBeLessThanOrEqual(base.height + 0.25001);
      }
      const keys = parts.map((p) =>
        JSON.stringify([p.geometry, p.position, p.scale, p.rotation]),
      );
      expect(new Set(keys).size).toBe(keys.length);
      expect(parts.length).toBeLessThan(base.floors * 30 + 30);
    }
    expect(new Set(profiles.map((p) => p.facade)).size).toBe(4);
    expect(new Set(profiles.map((p) => p.columns)).size).toBe(3);
    expect(silhouettes.size).toBeGreaterThan(2);
    Object.values(library).forEach((g) => g.dispose());
  });

  it("honors none, sparse, bands and storefront instead of treating every pattern as a grid", () => {
    const windows = (pattern: BuildingVisual["windowPattern"]) =>
      generateBuilding({ ...base, floors: 3, windowPattern: pattern }).filter(
        (p) => p.role === "window",
      );
    expect(windows("none")).toHaveLength(0);
    expect(windows("sparse")).toHaveLength(11); // Front ground-floor bay is the door.
    expect(windows("grid").length).toBeGreaterThan(windows("sparse").length);
    const width = (p: ReturnType<typeof windows>[number]) =>
      Math.max(p.scale[0], p.scale[2]);
    expect(Math.max(...windows("bands").map(width))).toBeGreaterThan(
      Math.max(...windows("grid").map(width)),
    );
    expect(
      Math.max(...windows("storefront").map((p) => p.scale[1])),
    ).toBeGreaterThan(Math.max(...windows("grid").map((p) => p.scale[1])));
  });
});
