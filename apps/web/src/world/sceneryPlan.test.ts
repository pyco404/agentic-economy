import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createBatch, geometryLibrary, disposeGroup } from "./geometry";
import * as THREE from "three";
import fixture from "./fixtures/underground-rail-world.json";
import type { ChunkVisual } from "./layout";
import { prepareScenery, reviveScenery, chunkSignature, type SceneryMessage } from "./sceneryPlan";
import { sampleRail } from "./riversideRail";
import { undergroundService } from "./undergroundRail";

describe("worker world preparation", () => {
  const chunks = fixture.chunks as unknown as ChunkVisual[], messages: SceneryMessage[] = [];
  const before = JSON.stringify(chunks);
  beforeAll(() => prepareScenery({ revision: 7, chunks, seed: fixture.seed, catalog: fixture.catalog, style: "frontier",
    center: { x: 48, z: 48 }, known: {}, wanted: [chunks[0]!.id, chunks[5]!.id] }, (message) => messages.push(message)), 30000);
  it("sends ground/roads and spatial chunks before heavy scenery without altering authoritative coordinates", () => {
    expect(messages[0]!.kind).toBe("roads"); expect(messages.at(-1)!.kind).toBe("scenery");
    const prepared = messages.filter((m) => m.kind === "chunk"); expect(prepared).toHaveLength(2);
    expect(prepared[0]!.chunk.data.id).toBe(chunks[5]!.id);
    expect(prepared.every((m) => m.revision === 7 && m.chunk.landscape.length > 0 && m.chunk.architecture.length > 0)).toBe(true);
    expect(prepared[0]!.chunk.rank).toBeLessThan(prepared[1]!.chunk.rank);
    expect(JSON.stringify(chunks)).toBe(before);
    expect(chunkSignature(chunks[0]!, chunks)).toBe(chunkSignature(chunks[0]!, [...chunks].reverse()));
  });
  it("keeps final instancing, materials and coordinates identical to the original combined batches", () => {
    const road = messages.find((m) => m.kind === "roads")!, prepared = messages.find((m) => m.kind === "chunk")!;
    if (road.kind !== "roads" || prepared.kind !== "chunk") throw new Error("Missing prepared geometry");
    const { landscape, architecture, data } = prepared.chunk, library = geometryLibrary();
    const ground = [...landscape, ...(road.streets.parts.get(data.id) ?? [])];
    const before = createBatch([...ground, ...architecture], library), after = new THREE.Group();
    after.add(createBatch(ground, library), createBatch(architecture, library));
    const digest = (root: THREE.Object3D) => {
      const rows: string[] = [];
      root.traverse((object) => {
        if (!(object instanceof THREE.InstancedMesh)) return;
        const hash = createHash("sha256"); hash.update(new Uint8Array(object.instanceMatrix.array.buffer));
        if (object.instanceColor) hash.update(new Uint8Array(object.instanceColor.array.buffer));
        const material = object.material as THREE.MeshLambertMaterial;
        rows.push(JSON.stringify([object.name, object.count, hash.digest("hex"), material.color.toArray(), material.flatShading]));
      });
      return rows.sort();
    };
    expect(digest(after)).toEqual(digest(before));
    const shared = new Set(Object.values(library)); disposeGroup(before, shared); disposeGroup(after, shared);
    Object.values(library).forEach((geometry) => geometry.dispose());
  });
  it("round-trips Maps and vector operations while preserving both railways and production timing", () => {
    const cloned = messages.map((m) => reviveScenery(structuredClone(m)));
    const roads = cloned.find((m) => m.kind === "roads")!;
    if (roads.kind !== "roads") throw new Error("Missing streets");
    expect(roads.pathNetwork.values().next().value).toBeInstanceOf(THREE.Vector2);
    expect(roads.streets.vehicles.values().next().value).toBeInstanceOf(THREE.Vector2);
    const scenery = cloned.find((m) => m.kind === "scenery")!;
    if (scenery.kind !== "scenery") throw new Error("Missing scenery");
    const plan = scenery.ambient; expect(plan.mirroredRail?.report.mode).toBe("mirrored");
    expect(plan.rail).toBe(plan.railway!.path); expect(plan.mirroredRail!.source.path).toBe(plan.rail);
    const point = new THREE.Vector3(), direction = new THREE.Vector3();
    sampleRail(plan.rail!, 20, point, direction); expect(Number.isFinite(point.x)).toBe(true);
    expect(plan.cars.every((p) => p.points.every((v) => v instanceof THREE.Vector3))).toBe(true);
    const service = undergroundService(0, plan.rail!, plan.railway!.underground!);
    expect(service.emergesAt - service.hiddenAt).toBeCloseTo(120, 10);
  });
});
