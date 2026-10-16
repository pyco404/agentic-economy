import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { carsOverlap, lanePoints, planStreets, STREETS, streetShuttleLoops, vehicleFitsStreet } from "./streets";
import { ambientPath, createAmbientScene } from "./ambient";
import { disposeGroup, geometryLibrary } from "./geometry";
import type { ChunkVisual } from "./layout";

function cross(): ChunkVisual {
  const terrain: string[] = Array.from({ length: 1024 }, (_, i) => i % 32 === 16 || Math.floor(i / 32) === 16 ? "r" : "g");
  for (let z = 8; z < 12; z++) for (let x = 0; x < 32; x++) terrain[z * 32 + x] = x === 16 ? "b" : "w";
  return { id: "0:0", x: 0, z: 0, seed: 10, terrain: terrain.join(""), elevation: "0".repeat(1024), buildings: [], trees: [], props: [] };
}
describe("two-way street presentation", () => {
  it("widens safe verges, joins crossroads without overlapping paving and leaves waterways open", () => {
    const chunk = cross(), before = JSON.stringify(chunk), plan = planStreets([chunk], 10);
    expect(plan.constraints.twoWayCells).toBeGreaterThan(40);
    expect(plan.constraints.bridgeCells).toBe(4);
    const covered = new Set<string>();
    for (const part of [...plan.parts.values()].flat().filter((p) => ["street-surface", "street-sidewalk"].includes(p.role ?? ""))) {
      for (let x = part.position[0] - part.scale[0] / 2 + 0.125; x < part.position[0] + part.scale[0] / 2; x += 0.25)
        for (let z = part.position[2] - part.scale[2] / 2 + 0.125; z < part.position[2] + part.scale[2] / 2; z += 0.25) {
          const key = `${Math.floor(x / 0.25)}:${Math.floor(z / 0.25)}`;
          expect(covered.has(key)).toBe(false); covered.add(key);
        }
    }
    expect(covered.size).toBe(plan.tiles.size);
    for (const tile of plan.tiles.values()) {
      const x = (tile.x + 0.5) * 0.25, z = (tile.z + 0.5) * 0.25;
      if (chunk.terrain![Math.floor(z) * 32 + Math.floor(x)] === "w") expect(tile.bridge).toBe(true);
      expect(tile.level + 0.08).toBeGreaterThan(-0.25); // Deck stays above water, no piers.
    }
    expect(JSON.stringify(chunk)).toBe(before);
  });
  it("preserves occupied structure clearance and reports streets that cannot support two lanes", () => {
    const chunk = cross();
    chunk.buildings.push({ id: "bld_tightplot", name: "Tight house", seed: 4, kind: "house", sourceKind: "house",
      x: 18.5, z: 20, width: 4, depth: 4, height: 6, floors: 2, roofStyle: "gable", roofColor: "#ce7759", rotation: 0, chunkId: chunk.id });
    const before = JSON.stringify(chunk), plan = planStreets([chunk], 10);
    expect(plan.constraints.constrainedCells).toBeGreaterThan(0);
    expect(plan.vehicles.has("16:20")).toBe(false);
    expect(JSON.stringify(chunk)).toBe(before);
  });
  it("builds opposite lanes and smooth turn loops inside actual paved street space", () => {
    const plan = planStreets([cross()], 10), paths = streetShuttleLoops(plan);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) for (let i = 0; i < path.length - 1; i++) {
      const p = path[i]!, next = path[i + 1]!;
      expect(vehicleFitsStreet(p, Math.atan2(next.x - p.x, next.z - p.z), plan)).toBe(true);
    }
    const square = [[4, 0, 4], [20, 0, 4], [20, 0, 20], [4, 0, 20], [4, 0, 4]]
      .map((p) => new THREE.Vector3(...p as [number, number, number]));
    const forward = lanePoints(square), reverse = lanePoints(square, true);
    expect(forward.length).toBeGreaterThan(30); expect(reverse.length).toBeGreaterThan(30);
    expect(forward.some((p) => Math.abs(p.z - (4 - STREETS.laneOffset)) < 0.001)).toBe(true);
    expect(reverse.some((p) => Math.abs(p.z - (4 + STREETS.laneOffset)) < 0.001)).toBe(true);
    expect(carsOverlap(new THREE.Vector3(0, 0, -0.5), Math.PI / 2, new THREE.Vector3(0, 0, 0.5), -Math.PI / 2)).toBe(false);
  });
  it("keeps six ambient cars from overlapping while following the same two-way loop", () => {
    const street = planStreets([cross()], 10), path = streetShuttleLoops(street)[0]!;
    const library = geometryLibrary(), shared = new Set(Object.values(library));
    const scene = createAmbientScene({ rail: null, railway: null, cars: [ambientPath(path)], center: new THREE.Vector3(16, 0, 16),
      width: 32, depth: 32, altitude: 12, seed: 10 }, library);
    for (let frame = 0; frame < 400; frame++) {
      scene.update(frame * 0.1, true);
      const cars = scene.traffic();
      for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++)
        expect(carsOverlap(cars[i]!.position, cars[i]!.heading, cars[j]!.position, cars[j]!.heading)).toBe(false);
    }
    disposeGroup(scene.group, shared); Object.values(library).forEach((g) => g.dispose());
  }, 15000);
});
