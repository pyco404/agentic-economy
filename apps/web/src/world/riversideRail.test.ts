import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import fixture from "./fixtures/riverside-rail-world.json";
import type { ChunkVisual } from "./layout";
import { generateFrontier } from "./frontier";
import { planStreets } from "./streets";
import { createAmbientScene } from "./ambient";
import { disposeGroup, geometryLibrary } from "./geometry";
import { createRiversideScene, planRiversideRail, railService, RIVERSIDE_RAIL, sampleRail, type RiversidePlan } from "./riversideRail";

describe("Riverside ambient railway", () => {
  const chunks = fixture.chunks as unknown as ChunkVisual[], seed = fixture.seed;
  let plan: RiversidePlan;
  beforeAll(() => { plan = planRiversideRail(chunks, generateFrontier(seed, chunks), seed, planStreets(chunks, seed)); });
  it("fits the persisted northern geometry, bridge banks, sidewalk landing and road headroom without mutation", () => {
    const before = JSON.stringify(chunks), streets = planStreets(chunks, seed), paving = JSON.stringify([...streets.tiles]);
    const result = planRiversideRail(chunks, generateFrontier(seed, chunks), seed, streets);
    expect(result.report.issues).toEqual([]); expect(result.report.mode).toBe("riverside");
    expect(result.report.maxGrade).toBeLessThanOrEqual(RIVERSIDE_RAIL.maxGrade);
    expect(result.report.minRoadHeadroom).toBeGreaterThanOrEqual(RIVERSIDE_RAIL.roadHeadroom);
    expect(result.report.minWaterHeadroom).toBeGreaterThan(2);
    expect(result.report.roadTiles).toBeGreaterThan(0); expect(result.report.supports).toBeGreaterThan(10);
    expect(result.path!.points.at(-1)!.toArray()).toEqual([64, 3, 18]);
    expect(JSON.stringify(chunks)).toBe(before); expect(JSON.stringify([...streets.tiles])).toBe(paving);
  });
  it("fails closed for a new persisted depot parcel or obstructed transport headroom", () => {
    const changed = structuredClone(chunks), b = changed[1]!.buildings[0]!;
    changed[1]!.buildings.push({ ...b, id: "new-authoritative-parcel", x: 61.5, z: 16, width: 1, depth: 1 });
    const bad = planRiversideRail(changed, generateFrontier(seed, changed), seed, planStreets(changed, seed));
    expect(bad.path).toBeNull(); expect(bad.report.issues.join(" ")).toContain("persisted parcel");
    const streets = planStreets(chunks, seed);
    for (const t of streets.tiles.values()) if (Math.abs(t.x * 0.25 - 64) < 1 && Math.abs(t.z * 0.25 - 8.5) < 1) t.level = 2;
    const low = planRiversideRail(chunks, generateFrontier(seed, chunks), seed, streets);
    expect(low.path).toBeNull(); expect(low.report.issues).toContain("Insufficient road/pedestrian headroom.");
  });
  it("rejects full-height frontier obstacles and never substitutes the old loop", () => {
    const frontier = generateFrontier(seed, chunks);
    frontier.parts.push({ geometry: "box", color: "#aaa", position: [140, 1.5, 1], scale: [1, 2, 1] });
    const result = planRiversideRail(chunks, frontier, seed, planStreets(chunks, seed));
    expect(result.path).toBeNull(); expect(result.report.issues).toContain("Full-height track/train obstruction.");
    expect(planRiversideRail([], frontier, seed, planStreets([], seed)).path).toBeNull();
  });
  it("runs an entire reversible service cycle with continuous carriage positions, fixed order and smooth turns", () => {
    const library = geometryLibrary(), scene = createAmbientScene({ rail: plan.path, railway: plan, cars: [],
      center: new THREE.Vector3(64, 0, 64), width: 128, depth: 128, altitude: 12, seed }, library);
    const period = railService(0, plan.path!.length).period;
    let previous: ReturnType<typeof scene.railState> | undefined;
    let lastSpeed = 0, outbound = false, inbound = false, eastStop = false;
    for (let t = 0; t <= period + 0.2; t += 0.1) {
      scene.update(t, true); const state = scene.railState();
      outbound ||= state.state === "outbound"; inbound ||= state.state === "inbound"; eastStop ||= state.state === "east-stop";
      expect(Math.abs(state.speed!)).toBeLessThanOrEqual(RIVERSIDE_RAIL.speed + 1e-6);
      expect(Math.abs(state.speed! - lastSpeed)).toBeLessThanOrEqual(RIVERSIDE_RAIL.acceleration * 0.1 + 1e-6);
      for (let i = 0; i < 3; i++) {
        const p = new THREE.Vector3(...state.cars[i]!.position as [number, number, number]);
        if (previous) {
          expect(p.distanceTo(new THREE.Vector3(...previous.cars[i]!.position as [number, number, number]))).toBeLessThan(0.161);
          const turn = state.cars[i]!.heading - previous.cars[i]!.heading;
          expect(Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)))).toBeLessThan(0.075);
        }
        if (i) expect(p.distanceTo(new THREE.Vector3(...state.cars[i - 1]!.position as [number, number, number]))).toBeGreaterThan(2.5);
      }
      previous = state; lastSpeed = state.speed!;
    }
    expect(outbound && inbound && eastStop).toBe(true);
    expect(railService(period, plan.path!.length).state).toBe("depot");
    disposeGroup(scene.group, new Set(Object.values(library))); Object.values(library).forEach((g) => g.dispose());
  });
  it("clamps open endpoints rather than wrapping to the other end", () => {
    const point = new THREE.Vector3(), direction = new THREE.Vector3();
    sampleRail(plan.path!, -100, point, direction); expect(point.toArray()).toEqual(plan.path!.points[0]!.toArray());
    sampleRail(plan.path!, plan.path!.length + 100, point, direction); expect(point.toArray()).toEqual([64, 3, 18]);
  });
  it("connects stair treads to the platform landing without gaps or excessive risers", () => {
    const stairs = plan.parts.filter((p) => p.color === "#c8b899").sort((a, b) => a.position[2] - b.position[2]);
    expect(stairs).toHaveLength(13);
    for (let i = 1; i < stairs.length; i++) {
      const a = stairs[i - 1]!, b = stairs[i]!;
      expect(b.position[2] - b.scale[2] / 2 - a.position[2] - a.scale[2] / 2).toBeCloseTo(0);
      expect(b.position[1] + b.scale[1] / 2 - a.position[1] - a.scale[1] / 2).toBeLessThan(0.25);
    }
    const last = stairs.at(-1)!, landing = plan.parts.find((p) => p.color === "#d0bfa0" && p.position[0] === 60)!;
    expect(landing.position[2] - landing.scale[2] / 2).toBeCloseTo(last.position[2] + last.scale[2] / 2);
    expect(landing.position[1] + landing.scale[1] / 2).toBeCloseTo(last.position[1] + last.scale[1] / 2);
  });
  it("lets the service use bounded elapsed time independently of legacy actor timing, and freezes when hidden", () => {
    const library = geometryLibrary(), scene = createAmbientScene({ rail: plan.path, railway: plan, cars: [],
      center: new THREE.Vector3(64, 0, 64), width: 128, depth: 128, altitude: 12, seed }, library);
    scene.update(0.05, true, 1.5);
    expect(scene.railState().state).toBe("outbound"); expect(scene.railState().speed).toBeCloseTo(-0.45);
    const before = scene.railState(); scene.update(0.1, false, 2);
    expect(scene.railState().distance).toBe(before.distance);
    expect(scene.railState().state).toBe(before.state);
    expect(scene.railState().trackVisible).toBe(true);
    expect(scene.railState().cars.every((car) => !car.visible)).toBe(true);
    disposeGroup(scene.group, new Set(Object.values(library))); Object.values(library).forEach((g) => g.dispose());
  });
  it("keeps rail and deck top faces outward-facing on the whole joined curve", () => {
    const library = geometryLibrary(), group = createRiversideScene(plan, library);
    const ribbons = group.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
    expect(ribbons).toHaveLength(4);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (const mesh of ribbons) {
      const position = mesh.geometry.getAttribute("position"), index = mesh.geometry.index!;
      expect([...position.array].every(Number.isFinite)).toBe(true);
      for (let i = 12; i < index.count - 12; i += 24) {
        a.fromBufferAttribute(position, index.getX(i)); b.fromBufferAttribute(position, index.getX(i + 1));
        c.fromBufferAttribute(position, index.getX(i + 2));
        expect(b.sub(a).cross(c.sub(a)).y).toBeGreaterThan(0);
      }
    }
    disposeGroup(group, new Set(Object.values(library))); Object.values(library).forEach((g) => g.dispose());
  });
});
