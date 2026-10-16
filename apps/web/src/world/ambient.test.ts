import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AMBIENT, ambientPath, loopDistance, planAmbient, sampleAmbient, vehicleLoops } from "./ambient";
import { buildPathNetwork } from "./agentMotion";
import { generateFrontier } from "./frontier";
import { generateWorld, WORLD_SEED } from "./layout";

describe("decorative ambient city loops", () => {
  it("repeats continuous path positions and pauses at implied stations", () => {
    const path = ambientPath([[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10], [0, 0, 0]]
      .map((p) => new THREE.Vector3(...p as [number, number, number])));
    const period = path.length / 2 + 6;
    for (const time of [0, 2, 5, 15, 25]) {
      expect(loopDistance(time, path.length, 2, 0.13, 3)).toBeCloseTo(loopDistance(time + period, path.length, 2, 0.13, 3));
      const position = new THREE.Vector3(), direction = new THREE.Vector3();
      sampleAmbient(path, time, position, direction);
      expect([position.x, position.y, position.z, direction.length()].every(Number.isFinite)).toBe(true);
    }
    expect(loopDistance(1, path.length, 2, 0, 3)).toBe(0);
    expect(loopDistance(2, path.length, 2, 0, 3)).toBe(0);
  });
  it("uses actual road cells for cars and does not restore the old exterior rail loop on unsupported worlds", () => {
    const chunks = generateWorld(WORLD_SEED, 156), before = JSON.stringify(chunks);
    const network = buildPathNetwork(chunks, WORLD_SEED, true);
    const paths = vehicleLoops(network);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.length).toBeLessThanOrEqual(AMBIENT.cars.count);
    for (const path of paths) for (const point of path.points)
      expect(network.has(`${Math.floor(point.x)}:${Math.floor(point.z)}`)).toBe(true);
    const frontier = generateFrontier(WORLD_SEED, chunks);
    const plan = planAmbient(chunks, frontier, network, WORLD_SEED);
    expect(plan.rail).toBeNull();
    expect(JSON.stringify(chunks)).toBe(before);
  });
});
