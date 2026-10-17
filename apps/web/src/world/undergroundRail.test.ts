import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import fixture from "./fixtures/underground-rail-world.json";
import type { ChunkVisual } from "./layout";
import { generateFrontier } from "./frontier";
import { planStreets } from "./streets";
import { planRiversideRail, sampleRail, type RiversidePlan } from "./riversideRail";
import { planUndergroundRail, undergroundService, railCarHidden, UNDERGROUND_RAIL } from "./undergroundRail";
import { excavateRailTerrain } from "./railExcavation";
import { createAmbientScene } from "./ambient";
import { geometryLibrary, disposeGroup } from "./geometry";

describe("connected Riverside underground service", () => {
  const chunks = fixture.chunks as unknown as ChunkVisual[], { seed, catalog } = fixture;
  let plan: RiversidePlan;
  beforeAll(() => {
    const frontier = generateFrontier(seed, chunks, catalog), streets = planStreets(chunks, seed);
    plan = planUndergroundRail(planRiversideRail(chunks, frontier, seed, streets), chunks, frontier, seed, streets);
  }, 20000);
  it("constructs both portals and a closed path without mutating parcels, roads or terrain", () => {
    const before = JSON.stringify(chunks), frontier = generateFrontier(seed, chunks, catalog), streets = planStreets(chunks, seed);
    const terrain = JSON.stringify(frontier), paving = JSON.stringify([...streets.tiles]);
    const result = planUndergroundRail(planRiversideRail(chunks, frontier, seed, streets), chunks, frontier, seed, streets);
    expect(result.report.issues).toEqual([]); expect(result.underground).toBeDefined();
    expect(result.underground!.maxGrade).toBeLessThan(.045); expect(result.underground!.minCover).toBeGreaterThanOrEqual(.3);
    expect(result.underground!.west.x).toBe(20); expect(result.underground!.east.x).toBe(148);
    expect(result.report.visibleLength).toBeLessThan(result.report.previousVisibleLength! * .6);
    expect(result.underground!.surface.points.every((p) => p.x >= 18 && p.x <= 150)).toBe(true);
    // Every shortened-off approach is physically roofed; no open-air hiding.
    const roofs = result.parts.filter((p) => p.color === "#d4c6aa");
    for (const p of result.path!.points.filter((p) => (p.z === -7 && p.x < 20 && p.x >= -40.75) ||
      (p.z === 1 && p.x > 148 && p.x <= 214.75))) {
      expect(roofs.some((roof) => Math.abs(roof.position[0] - p.x) <= roof.scale[0] / 2 + 1e-6 &&
        Math.abs(roof.position[2] - p.z) < .01 && roof.position[1] - roof.scale[1] / 2 >= p.y + 1.49)).toBe(true);
    }
    expect(result.path!.points[0]!.distanceTo(result.path!.points.at(-1)!)).toBeLessThan(1e-8);
    expect(result.parts.some((p) => p.role === "rail-buffer")).toBe(false);
    expect(JSON.stringify(chunks)).toBe(before); expect(JSON.stringify(frontier)).toBe(terrain); expect(JSON.stringify([...streets.tiles])).toBe(paving);
  }, 20000);
  it("fails closed when an authoritative parcel or a full-height obstacle occupies an approach", () => {
    const changed = structuredClone(chunks);
    changed[0]!.buildings.push({ ...changed[0]!.buildings[0]!, id: "future-west-reservation", x: -20, z: -7, width: 4, depth: 4 });
    const frontier = generateFrontier(seed, changed, catalog), streets = planStreets(changed, seed);
    const blocked = planUndergroundRail(planRiversideRail(changed, frontier, seed, streets), changed, frontier, seed, streets);
    expect(blocked.path).toBeNull(); expect(blocked.report.issues.join(" ")).toContain("future-west-reservation");
    const originalFrontier = generateFrontier(seed, chunks, catalog);
    originalFrontier.parts.push({ geometry: "box", position: [200, 0, 1], scale: [2, 4, 2], color: "#aaa" });
    const originalStreets = planStreets(chunks, seed);
    const obstruction = planUndergroundRail(planRiversideRail(chunks, originalFrontier, seed, originalStreets), chunks, originalFrontier, seed, originalStreets);
    expect(obstruction.path).toBeNull(); expect(obstruction.report.issues.join(" ")).toContain("obstruction");
  }, 20000);
  it("runs forward continuously for three complete loops and hides for exactly 120 seconds", () => {
    const path = plan.path!, route = plan.underground!, first = undergroundService(0, path, route);
    expect(first.emergesAt - first.hiddenAt).toBeCloseTo(120, 10);
    const point = new THREE.Vector3(), direction = new THREE.Vector3();
    const previous: THREE.Vector3[] = [];
    for (let t = 0; t < first.period * 3; t += .1) {
      const service = undergroundService(t, path, route);
      expect(service.speed).toBeGreaterThanOrEqual(-1e-8);
      for (let i = 0; i < 3; i++) {
        const d = ((service.distance - i * 2.6) % path.length + path.length) % path.length;
        sampleRail(path, d, point, direction);
        if (previous[i]) expect(point.distanceTo(previous[i]!)).toBeLessThan(.1 * Math.max(1.6, service.speed) + .04);
        previous[i] = point.clone();
        if (service.state === "underground") expect(railCarHidden(d, path, route)).toBe(true);
      }
    }
    for (const offset of [0, 1 / 15, .25, 10, 119.9]) expect(undergroundService(first.hiddenAt + offset + 1e-6, path, route).state).toBe("underground");
    expect(undergroundService(first.emergesAt + .01, path, route).state).toBe("emerging-tunnel");
    expect(undergroundService(first.emergesAt + 4, path, route).state).toBe("emerging-tunnel");
    expect(undergroundService(first.emergesAt + 8, path, route).state).toBe("surface");
  });
  it("keeps static railway visible as each carriage enters and emerges, using independent elapsed time", () => {
    const library = geometryLibrary(), scene = createAmbientScene({ railway: plan, rail: plan.path, cars: [],
      center: new THREE.Vector3(64, 0, 64), width: 128, depth: 128, altitude: 12, seed }, library);
    const service = undergroundService(0, plan.path!, plan.underground!);
    const visible = (t: number) => { scene.update(0, true, t); return scene.railState().cars.filter((c) => c.visible).length; };
    expect(visible(service.hiddenAt - 4)).toBe(3);
    expect(visible(service.hiddenAt - 2)).toBe(2);
    expect(visible(service.hiddenAt - .5)).toBe(1);
    expect(visible(service.hiddenAt + 1)).toBe(0); expect(scene.railState().trackVisible).toBe(true);
    expect(visible(service.emergesAt + .5)).toBe(1);
    expect(visible(service.emergesAt + 2)).toBe(2);
    expect(visible(service.emergesAt + 4)).toBe(3);
    scene.update(0, false, service.emergesAt + 5); expect(scene.railState().trackVisible).toBe(true);
    expect(UNDERGROUND_RAIL.hiddenSeconds).toBe(120);
    disposeGroup(scene.group, new Set(Object.values(library))); Object.values(library).forEach((g) => g.dispose());
  });
});

describe("rail terrain cutting", () => {
  it("removes only the cutting footprint and preserves outer terrain height, color and winding", () => {
    const positions = [-5, 0, -5, -5, 0, 5, 5, 0, 5, -5, 0, -5, 5, 0, 5, 5, 0, -5];
    const colors = positions.map(() => .5), before = [...positions];
    const cut = excavateRailTerrain(positions, colors, [{ minX: -2, maxX: 2, minZ: -1, maxZ: 1 }]);
    let area = 0;
    for (let i = 0; i < cut.positions.length; i += 9) {
      const a = new THREE.Vector3(...cut.positions.slice(i, i + 3) as [number, number, number]);
      const b = new THREE.Vector3(...cut.positions.slice(i + 3, i + 6) as [number, number, number]);
      const c = new THREE.Vector3(...cut.positions.slice(i + 6, i + 9) as [number, number, number]);
      const cross = b.sub(a).cross(c.sub(a)); expect(cross.y).toBeGreaterThanOrEqual(-1e-8); area += cross.y / 2;
    }
    expect(area).toBeCloseTo(92); expect(cut.colors).toHaveLength(cut.positions.length);
    expect(cut.colors.every((value) => value === .5)).toBe(true); expect(positions).toEqual(before);
  });
});
