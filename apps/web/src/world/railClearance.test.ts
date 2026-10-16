import { describe, expect, it } from "vitest";
import { railConflicts } from "./railClearance";
import riverside from "./fixtures/riverside-rail-world.json";

describe("read-only rail corridor clearance", () => {
  const parcel = { id: "persisted-home", x: 5, z: 5, width: 2, depth: 2 };
  it("checks the continuous sweep rather than only distant sample points", () => {
    expect(railConflicts([{ x: -100, z: -100 }, { x: 100, z: 100 }], [parcel], 0.95))
      .toEqual([{ id: parcel.id, segments: [0] }]);
    // Centerline misses the parcel; the train's width still clips it.
    expect(railConflicts([{ x: 0, z: 6.8 }, { x: 10, z: 6.8 }], [parcel], 0.95)).toHaveLength(1);
    expect(railConflicts([{ x: 0, z: 7 }, { x: 10, z: 7 }], [parcel], 0.95)).toHaveLength(0);
  });
  it("protects endpoints and returns stable, deduplicated conflicts without mutation", () => {
    const points = [{ x: 0, z: 5 }, { x: 5, z: 5 }, { x: 5, z: 10 }];
    const obstacles = [parcel, { ...parcel, width: 1 }];
    const before = JSON.stringify({ points, obstacles });
    expect(railConflicts(points, obstacles, 0.95)).toEqual([{ id: parcel.id, segments: [0, 1] }]);
    expect(JSON.stringify({ points, obstacles })).toBe(before);
    expect(railConflicts([{ x: 5, z: 5 }, { x: 5, z: 5 }], [parcel], 0.95)).toHaveLength(1);
  });
  it("rejects invalid inputs rather than reporting a false clear route", () => {
    expect(() => railConflicts([], [], 1)).toThrow();
    expect(() => railConflicts([{ x: 0, z: 0 }, { x: NaN, z: 1 }], [], 1)).toThrow();
    expect(() => railConflicts([{ x: 0, z: 0 }, { x: 1, z: 1 }], [], -1)).toThrow();
  });
  it("detects the persisted power station immediately beyond the depot terminus", () => {
    const buildings = riverside.chunks.flatMap((c) => c.buildings);
    const before = JSON.stringify(buildings);
    const hits = railConflicts([{ x: 64, z: 18 }, { x: 64, z: 32 }], buildings, 0.95);
    expect(hits.map((hit) => hit.id)).toContain("bld_0p3nc76");
    expect(hits.map((hit) => hit.id)).toContain("bld_1fl12j2");
    expect(JSON.stringify(buildings)).toBe(before);
  });
  it("rejects a gentle descent or four-unit-radius escape before the parcel", () => {
    const station = riverside.chunks.flatMap((c) => c.buildings).find((b) => b.id === "bld_0p3nc76")!;
    const freeDistance = station.z - station.depth / 2 - 0.95 - 18;
    expect(freeDistance).toBeCloseTo(1.05);
    const fullyCoveredRail = station.elevation - 0.3 - 1.25;
    expect((3 - fullyCoveredRail) / 0.045).toBeGreaterThan(95);
    expect(3 - freeDistance * 0.045).toBeGreaterThan(station.elevation);
    const leftAtContact = 64 - (4 - Math.sqrt(16 - freeDistance ** 2));
    const safeLeft = station.x - station.width / 2 - 0.95;
    expect(leftAtContact).toBeGreaterThan(safeLeft);
  });
  it("detects the power station on both forward-only departures from the fixed depot endpoint", () => {
    const buildings = riverside.chunks.flatMap((c) => c.buildings);
    for (const direction of [-1, 1]) {
      const points = [{ x: 64, z: 18 }];
      for (let i = 1; i <= 26; i++) {
        const angle = i / 26 * Math.PI / 2;
        points.push({ x: 64 + direction * 4 * (1 - Math.cos(angle)), z: 18 + 4 * Math.sin(angle) });
      }
      expect(railConflicts(points, buildings, .95).map((hit) => hit.id)).toContain("bld_0p3nc76");
    }
  });
});
