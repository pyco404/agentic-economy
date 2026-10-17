import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import fixture from "./fixtures/underground-rail-world.json";
import type { ChunkVisual } from "./layout";
import { generateFrontier } from "./frontier";
import { planStreets } from "./streets";
import { planRiversideRail, sampleRail, type RiversidePlan } from "./riversideRail";
import { planUndergroundRail, undergroundService } from "./undergroundRail";
import { planMirroredRail, MIRRORED_RAIL, type MirroredRail } from "./mirroredRail";
import { createAmbientScene } from "./ambient";
import { disposeGroup, geometryLibrary } from "./geometry";

describe("opposite-side railway", () => {
  const chunks = fixture.chunks as unknown as ChunkVisual[], { seed, catalog } = fixture;
  const frontier = generateFrontier(seed, chunks, catalog), streets = planStreets(chunks, seed);
  let source: RiversidePlan, mirror: MirroredRail;
  beforeAll(() => {
    source = planUndergroundRail(planRiversideRail(chunks, frontier, seed, streets), chunks, frontier, seed, streets);
    mirror = planMirroredRail(source, chunks, frontier, streets, seed);
  }, 30000);
  it("preserves the route exactly and chooses the smallest safe offset without editing the city", () => {
    const before = JSON.stringify({ source, chunks, frontier, tiles: [...streets.tiles] });
    const again = planMirroredRail(source, chunks, frontier, streets, seed);
    expect(again.report).toEqual(mirror.report);
    expect(mirror.report.mode).toBe("mirrored"); expect(mirror.report.issues).toEqual([]);
    expect(mirror.report.centerZ).toBe(64);
    expect(mirror.reflectionZ).toBe(128 + mirror.report.offset);
    expect(mirror.report.offset).toBeLessThanOrEqual(MIRRORED_RAIL.maxOffset);
    expect(mirror.report.rejected).toHaveLength(mirror.report.offset / MIRRORED_RAIL.offsetStep);
    expect(mirror.source.path).toBe(source.path);
    expect(mirror.report.visibleLength).toBe(source.report.visibleLength);
    expect(JSON.stringify({ source, chunks, frontier, tiles: [...streets.tiles] })).toBe(before);
    for (const i of mirror.clearedFrontierParts) expect(frontier.parts[i]!.role).toMatch(/^tree-/);
    expect(mirror.cuts).toEqual(source.underground!.cuts.map((c) => ({ ...c, minZ: mirror.reflectionZ - c.maxZ, maxZ: mirror.reflectionZ - c.minZ })));
  }, 30000);
  it("uses two forward services with the same 120-second timing and mirrored carriage alignment", () => {
    const library = geometryLibrary();
    const scene = createAmbientScene({ railway: source, rail: source.path, mirroredRail: mirror, cars: [],
      center: new THREE.Vector3(64, 0, 64), width: 128, depth: 128, altitude: 12, seed }, library);
    expect(scene.counts.train).toBe(2);
    const original = scene.group.getObjectByName("Riverside urban railway")!;
    const opposite = scene.group.getObjectByName("Opposite urban railway")!;
    expect(original.scale.toArray()).toEqual([1, 1, 1]);
    expect(opposite.scale.toArray()).toEqual([1, 1, -1]); expect(opposite.position.z).toBe(mirror.reflectionZ);
    const base = undergroundService(0, source.path!, source.underground!);
    const expected = new THREE.Vector3(), direction = new THREE.Vector3();
    for (const time of [0, 10, base.hiddenAt + 1, base.emergesAt + 4, base.period, base.period * 2 + 10]) {
      scene.update(time, true, time);
      const state = scene.railState(), other = undergroundService(time + MIRRORED_RAIL.phaseSeconds, source.path!, source.underground!);
      expect(state.mirrored!.state).toBe(other.state); expect(state.trackVisible).toBe(true);
      expect(other.emergesAt - other.hiddenAt).toBeCloseTo(120, 10);
      state.mirrored!.cars.forEach((car, i) => {
        const distance = (other.distance - i * 2.6 + source.path!.length) % source.path!.length;
        sampleRail(source.path!, distance, expected, direction); expected.z = mirror.reflectionZ - expected.z;
        expect(new THREE.Vector3(...car.position).distanceTo(expected)).toBeLessThan(1e-8);
      });
    }
    scene.update(0, false, base.hiddenAt + 1);
    expect(original.visible).toBe(true); expect(opposite.visible).toBe(true);
    disposeGroup(scene.group, new Set(Object.values(library))); Object.values(library).forEach((g) => g.dispose());
  });
  it("fails closed for a future parcel spanning the opposite corridor", () => {
    const changed = structuredClone(chunks);
    changed[0]!.buildings.push({ ...changed[0]!.buildings[0]!, id: "opposite-reservation", x: 100, z: 134, width: 8, depth: 26 });
    const blocked = planMirroredRail(source, changed, frontier, streets, seed);
    expect(blocked.report.mode).toBe("unavailable"); expect(blocked.source.path).toBeNull();
    expect(blocked.report.rejected.every((r) => r.issues.some((i) => i.includes("opposite-reservation")))).toBe(true);
    expect(source.path).not.toBeNull(); expect(blocked.clearedFrontierParts).toEqual([]);
  }, 30000);
});
