import { describe, expect, it } from "vitest";
import { generateFrontier, frontierDrift } from "./frontier";
import type { ChunkVisual } from "./layout";
const chunk: ChunkVisual = { id: "0:0", x: 0, z: 0, seed: 42,
  terrain: "g".repeat(1024), elevation: "0".repeat(1024), buildings: [], trees: [] };
describe("scenic expansion frontier", () => {
  it("reproduces low-detail terrain without economic entities or changes to persisted inputs", () => {
    const before = JSON.stringify(chunk);
    const data = generateFrontier(42, [chunk]);
    expect(data).toEqual(generateFrontier(42, [chunk]));
    expect(JSON.stringify(chunk)).toBe(before);
    expect(data.parts.every((p) => !p.buildingId)).toBe(true);
    expect(data.positions.length).toBeGreaterThan(1000);
    expect((data.positions.length + data.water.length) / 9).toBeLessThan(40000);
    expect(data.positions.every(Number.isFinite)).toBe(true);
    expect(data.colors.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(data.water).toHaveLength(0); // No surrounding ocean without a source.
  });
  it("yields all terrain, hints and motion to newly advertised occupied chunks", () => {
    const data = generateFrontier(42, [chunk], [{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }]);
    for (let i = 0; i < data.positions.length; i += 9) {
      const x = (data.positions[i]! + data.positions[i + 3]! + data.positions[i + 6]!) / 3;
      const z = (data.positions[i + 2]! + data.positions[i + 5]! + data.positions[i + 8]!) / 3;
      expect(x < 0 || x >= 64 || z < 0 || z >= 32).toBe(true);
    }
    for (const point of [...data.parts.map((p) => ({ x: p.position[0], z: p.position[2] })), ...data.shimmer])
      expect(point.x < 0 || point.x >= 64 || point.z < 0 || point.z >= 32).toBe(true);
  });
  it("continues real waterways selectively and offers a one-sided coastal comparison", () => {
    const terrain = chunk.terrain!.split("");
    for (let z = 0; z < 32; z++) for (let x = 14; x < 18; x++) terrain[z * 32 + x] = "w";
    const river = generateFrontier(42, [{ ...chunk, terrain: terrain.join("") }]);
    expect(river.water.length).toBeGreaterThan(0);
    const coast = generateFrontier(42, [chunk], undefined, "coastal");
    expect(coast.water.length).toBeGreaterThan(0);
    for (let i = 0; i < coast.water.length; i += 3) expect(coast.water[i]).toBeGreaterThan(32);
  });
  it("bounds atmospheric drift and keeps it away from active city geometry", () => {
    const data = generateFrontier(42, [chunk]);
    expect(data.shimmer.length).toBeGreaterThan(0);
    for (let time = 0; time < 100; time += 7) {
      const drift = frontierDrift(time, 1.2);
      expect(Math.abs(drift.x)).toBeLessThanOrEqual(0.45);
      expect(Math.abs(drift.z)).toBeLessThanOrEqual(0.25);
      expect(drift.opacity).toBeLessThanOrEqual(0.105);
    }
    for (const p of data.shimmer) expect(p.x < -16 || p.x > 48 || p.z < -16 || p.z > 48).toBe(true);
  });
});
