import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createBatch, geometryLibrary, disposeGroup } from "./geometry";
import * as THREE from "three";
import fixture from "./fixtures/underground-rail-world.json";
import type { ChunkVisual } from "./layout";
import { createSceneryPreparer, reviveScenery, chunkSignature, type SceneryMessage, type SceneryRequest } from "./sceneryPlan";
import { sampleRail } from "./riversideRail";
import { undergroundService } from "./undergroundRail";

describe("worker world preparation", () => {
  const chunks = fixture.chunks as unknown as ChunkVisual[], messages: SceneryMessage[] = [];
  const before = JSON.stringify(chunks);
  // Includes full-city road/water navigation; preparation runs off the render thread.
  const prepareScenery=createSceneryPreparer();
  beforeAll(() => prepareScenery({ revision: 7, chunks, seed: fixture.seed, catalog: fixture.catalog, style: "frontier",
    center: { x: 48, z: 48 }, known: {}, wanted: [chunks[0]!.id, chunks[5]!.id] }, (message) => messages.push(message)), 60000);
  it("sends ground/roads and spatial chunks before heavy scenery without altering authoritative coordinates", () => {
    expect(messages[0]!.kind).toBe("roads"); expect(messages.at(-1)!.kind).toBe("scenery");
    const prepared = messages.filter((m) => m.kind === "chunk"); expect(prepared).toHaveLength(2);
    expect(prepared[0]!.chunk.data.id).toBe(chunks[5]!.id);
    expect(prepared.every((m) => m.revision === 7 && m.chunk.landscape.length > 0 && m.chunk.architecture.length > 0)).toBe(true);
    expect(prepared[0]!.chunk.rank).toBeLessThan(prepared[1]!.chunk.rank);
    expect(JSON.stringify(chunks)).toBe(before);
    expect(chunkSignature(chunks[0]!, chunks)).toBe(chunkSignature(chunks[0]!, [...chunks].reverse()));
  });
  it("reuses the prepared environment when only camera visibility changes",()=>{
    const next:SceneryMessage[]=[];
    prepareScenery({revision:8,chunks,seed:fixture.seed,catalog:fixture.catalog,style:"frontier",center:{x:100,z:100},known:{},wanted:[chunks[1]!.id]},m=>next.push(m));
    const old=messages.find(m=>m.kind==="scenery")!,current=next.find(m=>m.kind==="scenery")!;
    expect(current.revision).toBe(8);
    if(old.kind!=="scenery"||current.kind!=="scenery")throw new Error("Missing environment");
    expect(current.ambient).toBe(old.ambient);expect(current.frontier).toBe(old.frontier);
    const previousRoads=messages.find(m=>m.kind==="roads")!,nextRoads=next.find(m=>m.kind==="roads")!;
    if(previousRoads.kind!=="roads"||nextRoads.kind!=="roads")throw Error("Missing roads");
    expect(nextRoads.streets).toBe(previousRoads.streets);
    expect(nextRoads.pathNetwork).toBe(previousRoads.pathNetwork);
    expect(next.filter(m=>m.kind==="chunk").map(m=>m.chunk.data.id)).toEqual([chunks[1]!.id]);
  });
  it("invalidates cached preparation for geometry, seed, catalog and terrain style changes",()=>{
    const original=messages.find((m):m is Extract<SceneryMessage,{kind:"scenery"}>=>m.kind==="scenery")!;
    const reused:(typeof original|undefined)[]=[];
    // Observe the cache boundary without rebuilding unrelated coastal terrain.
    // The preceding integration test uses the real full-city preparation.
    const prepare=createSceneryPreparer((request,send,reusable)=>{reused.push(reusable);send({...original,revision:request.revision});});
    const chunk:ChunkVisual={id:"0:0",x:0,z:0,seed:1,size:32,terrain:"g".repeat(1024),buildings:[],trees:[]};
    const request:SceneryRequest={revision:1,chunks:[chunk],seed:1,catalog:[{cx:0,cy:0}],style:"frontier",center:{x:16,z:16},known:{},wanted:[]};
    prepare(request,()=>{});expect(reused.at(-1)).toBeUndefined();
    prepare({...request,revision:2,center:{x:30,z:30},wanted:["0:0"]},()=>{});expect(reused.at(-1)).toBeDefined();
    const changed={...request,chunks:[{...chunk,terrain:"s"+chunk.terrain!.slice(1)}]};
    prepare({...changed,revision:3},()=>{});expect(reused.at(-1)).toBeUndefined();
    prepare({...changed,revision:4,seed:2},()=>{});expect(reused.at(-1)).toBeUndefined();
    prepare({...changed,revision:5,seed:2,style:"coastal"},()=>{});expect(reused.at(-1)).toBeUndefined();
    prepare({...changed,revision:6,seed:2,style:"coastal",catalog:[{cx:0,cy:0},{cx:1,cy:0}]},()=>{});expect(reused.at(-1)).toBeUndefined();
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
    expect(scenery.landmass.cells).toBeInstanceOf(Set);
    expect(scenery.landmass.frontier.water).toEqual(scenery.frontier.water);
    expect(scenery.landmass.report.rectangleFill).toBeLessThan(.85);
    expect(scenery.landmass.frontier.parts.some(p=>p.role==="city-edge")).toBe(false);
    const plan = scenery.ambient; expect(plan.mirroredRail?.report.mode).toBe("mirrored");
    for(const p of plan.railway!.underground!.surface.points){
      expect(scenery.landmass.cells.has(`${Math.floor(p.x/8)}:${Math.floor(p.z/8)}`)).toBe(true);
      expect(scenery.landmass.cells.has(`${Math.floor(p.x/8)}:${Math.floor((plan.mirroredRail!.reflectionZ-p.z)/8)}`)).toBe(true);
    }
    expect(plan.navigation!.traffic.nodes).toBeInstanceOf(Map);
    expect(plan.navigation!.water.graph.edges).toBeInstanceOf(Map);
    expect(plan.navigation!.water.docks.length).toBeGreaterThanOrEqual(6);
    const curve=[...plan.navigation!.traffic.edges.values()].flat().find(edge=>edge.curve)?.curve;
    expect(curve).toBeInstanceOf(Float32Array);expect(curve!.length%4).toBe(0);
    expect(plan.rail).toBe(plan.railway!.path); expect(plan.mirroredRail!.source.path).toBe(plan.rail);
    const point = new THREE.Vector3(), direction = new THREE.Vector3();
    sampleRail(plan.rail!, 20, point, direction); expect(Number.isFinite(point.x)).toBe(true);
    expect(plan.cars.every((p) => p.points.every((v) => v instanceof THREE.Vector3))).toBe(true);
    const service = undergroundService(0, plan.rail!, plan.railway!.underground!);
    expect(service.emergesAt - service.hiddenAt).toBeCloseTo(120, 10);
  });
});
