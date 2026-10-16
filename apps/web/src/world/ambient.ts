import * as THREE from "three";
import { type GeometryLibrary, type Part } from "./geometry";
import type { FrontierData } from "./frontier";
import { agentSeed, pathBetween, type PathNetwork } from "./agentMotion";
import { random, type ChunkVisual } from "./layout";
import { createRiversideScene, planRiversideRail, railService, sampleRail, RIVERSIDE_RAIL } from "./riversideRail";
import { planUndergroundRail, undergroundService, railCarHidden } from "./undergroundRail";
import { carsOverlap, lanePoints, streetShuttleLoops, vehicleFitsStreet, type StreetPlan } from "./streets";

/** Decorative transport only. These actors never become agents, deliveries or receipts. */
export const AMBIENT = {
  train: { enabled: true, carriages: 2 },
  cars: { enabled: true, count: 6, minSpeed: 2.2, speedVariation: 0.8, stopSeconds: 1.2 },
  plane: { enabled: true, count: 1, loopSeconds: 190, altitude: 18 },
  helicopter: { enabled: true, count: 1, loopSeconds: 150, altitude: 12, rotorSpeed: 9 },
  balloon: { enabled: true, count: 1, loopSeconds: 260, altitude: 20, bob: 0.6 },
} as const;
export interface AmbientPath { points: THREE.Vector3[]; length: number; }
export function ambientPath(points: THREE.Vector3[]): AmbientPath {
  return { points, length: points.reduce((sum, point, i) => sum + (i ? point.distanceTo(points[i - 1]!) : 0), 0) };
}
export function loopDistance(time: number, length: number, speed: number, phase: number, hold = 0) {
  const half = length / speed / 2, period = half * 2 + hold * 2;
  const t = ((time + phase * period) % period + period) % period;
  if (t < hold) return 0;
  if (t < hold + half) return (t - hold) * speed;
  if (t < hold * 2 + half) return length / 2;
  return length / 2 + (t - hold * 2 - half) * speed;
}
export function sampleAmbient(path: AmbientPath, distance: number, position: THREE.Vector3,
  direction: THREE.Vector3) {
  let rest = ((distance % path.length) + path.length) % path.length;
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1]!, b = path.points[i]!, length = a.distanceTo(b);
    if (rest <= length) {
      position.lerpVectors(a, b, length ? rest / length : 0); direction.subVectors(b, a).normalize(); return;
    }
    rest -= length;
  }
}

export function vehicleLoops(network: PathNetwork): AmbientPath[] {
  const loops: AmbientPath[] = [], centers: THREE.Vector2[] = [];
  // Discover actual street rectangles; no roads or persisted routes are changed.
  for (const start of network.values()) {
    if (loops.length >= AMBIENT.cars.count) break;
    for (const width of [16, 24, 12, 32]) {
      const depth = 16, center = new THREE.Vector2(start.x + width / 2, start.y + depth / 2);
      if (centers.some((p) => p.distanceTo(center) < 14)) continue;
      const points = [start, new THREE.Vector2(start.x + width, start.y),
        new THREE.Vector2(start.x + width, start.y + depth), new THREE.Vector2(start.x, start.y + depth), start];
      const route: THREE.Vector3[] = [];
      let valid = true;
      for (let i = 1; i < points.length; i++) {
        const from = points[i - 1]!, to = points[i]!, span = from.distanceTo(to);
        for (let s = 0; s < span; s++) {
          const point = from.clone().lerp(to, s / span);
          if (!network.has(`${Math.floor(point.x)}:${Math.floor(point.y)}`)) { valid = false; break; }
          route.push(new THREE.Vector3(point.x, 0.12, point.y));
        }
      }
      if (valid) { route.push(route[0]!.clone()); loops.push(ambientPath(route)); centers.push(center); break; }
    }
  }
  // Irregular streets can still host an out-and-back route between junctions.
  if (!loops.length) {
    const roads = [...network.values()];
    const from = roads[0], to = roads[Math.floor(roads.length / 2)];
    const route = from && to ? pathBetween(network, from, to, 4096) : null;
    if (route && route.length > 12) loops.push(ambientPath([...route, ...route.slice(0, -1).reverse()]
      .map((p) => new THREE.Vector3(p.x, 0.12, p.y))));
  }
  return loops;
}

export function planAmbient(chunks: ChunkVisual[], frontier: FrontierData, network: PathNetwork, seed: number, streets?: StreetPlan) {
  const minX = Math.min(...chunks.map((c) => c.x * 32)), maxX = Math.max(...chunks.map((c) => (c.x + 1) * 32));
  const minZ = Math.min(...chunks.map((c) => c.z * 32)), maxZ = Math.max(...chunks.map((c) => (c.z + 1) * 32));
  const railway = streets ? planUndergroundRail(planRiversideRail(chunks, frontier, seed, streets), chunks, frontier, seed, streets) : null;
  const rail = railway?.path ?? null;
  let cars = vehicleLoops(network);
  if (streets) {
    const raw = vehicleLoops(streets.vehicles), lanes: AmbientPath[] = [];
    for (const path of raw) for (const reverse of [false, true]) {
      const points = lanePoints(path.points, reverse);
      if (points.length && points.every((p, i) => {
        const next = points[(i + 1) % points.length]!;
        return vehicleFitsStreet(p, Math.atan2(next.x - p.x, next.z - p.z), streets);
      })) lanes.push(ambientPath(points));
    }
    cars = lanes.length ? lanes : streetShuttleLoops(streets).map(ambientPath);
  }
  const levels = new Map<string, number>();
  for (const chunk of chunks) if (chunk.elevation) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++)
    levels.set(`${chunk.x * 32 + x}:${chunk.z * 32 + z}`, Number(chunk.elevation[z * 32 + x] ?? 0) * 0.08);
  for (const path of cars) {
    path.points.forEach((point) => { point.y = (streets?.tiles.get(`${Math.floor(point.x / 0.25)}:${Math.floor(point.z / 0.25)}`)?.level ??
      levels.get(`${Math.floor(point.x)}:${Math.floor(point.z)}`) ?? 0) + 0.04; });
    path.length = ambientPath(path.points).length;
  }
  return { rail, railway, cars, center: new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2),
    width: maxX - minX, depth: maxZ - minZ,
    altitude: Math.max(12, ...chunks.flatMap((c) => c.buildings.map((b) => b.height))), seed };
}

type ActorKind = "train" | "car" | "plane" | "helicopter" | "balloon";
export function createAmbientScene(plan: ReturnType<typeof planAmbient>, library: GeometryLibrary) {
  const group = new THREE.Group();
  if (AMBIENT.train.enabled && plan.railway) group.add(createRiversideScene(plan.railway, library, {
    minX: plan.center.x - plan.width / 2, maxX: plan.center.x + plan.width / 2,
    minZ: plan.center.z - plan.depth / 2, maxZ: plan.center.z + plan.depth / 2,
  }));
  const moving = new THREE.Group(); group.add(moving);
  const actors: { kind: ActorKind; index: number; path?: AmbientPath; phase: number; speed: number; pose: THREE.Object3D;
    delay: number; initialized: boolean; hidden: boolean }[] = [];
  const parts: { actor: number; part: Part; rotor?: boolean }[] = [];
  const add = (kind: ActorKind, index: number, path?: AmbientPath) => {
    const rng = random(agentSeed(`${plan.seed}:${kind}:${index}`));
    const id = actors.length;
    actors.push({ kind, index, path, phase: rng(), speed: AMBIENT.cars.minSpeed + rng() * AMBIENT.cars.speedVariation,
      pose: new THREE.Object3D(), delay: 0, initialized: false, hidden: false });
    const box = (color: string, position: Part["position"], scale: Part["scale"], geometry = "box", rotor = false) =>
      parts.push({ actor: id, part: { geometry, color, position, scale }, rotor });
    const cream = "#f2e7ce", green = "#537e6d", blue = "#82aabd", clay = "#c77f66", dark = "#526761";
    if (kind === "train" || kind === "car") {
      const train = kind === "train";
      box(train ? green : [cream, blue, clay][index % 3]!, [0, 0.43, 0], [train ? 0.95 : 0.58, 0.42, train ? 2.25 : 0.98]);
      box(train ? cream : blue, [0, 0.8, -0.12], [train ? 0.65 : 0.49, train ? 0.55 : 0.32, train ? 1.8 : 0.55]);
      for (const x of [-1, 1]) for (const z of [-1, 1]) box(dark, [x * (train ? 0.45 : 0.27), 0.22, z * (train ? 0.68 : 0.32)], [train ? 0.16 : 0.12, 0.27, train ? 0.27 : 0.22]);
      if (train) for (const end of [-1, 1]) {
        box(blue, [0, 0.82, end * 1.135], [0.62, 0.23, 0.025]);
        for (const side of [-0.28, 0.28]) box(cream, [side, 0.48, end * 1.145], [0.1, 0.09, 0.025]);
      }
    } else if (kind === "plane") {
      box(cream, [0, 0, 0], [0.55, 0.45, 2.7], "round");
      box(blue, [0, 0, 0], [3.7, 0.09, 0.65]);
      box(blue, [0, 0.12, -0.9], [1.35, 0.08, 0.42]);
      box(green, [0, 0.32, -1], [0.09, 0.7, 0.5]);
    } else if (kind === "helicopter") {
      box(green, [0, 0, 0], [1, 0.75, 1.6], "round"); box(blue, [0, 0.1, 0.5], [0.7, 0.45, 0.6], "round");
      box(cream, [0, 0, -1.35], [0.18, 0.18, 1.7]);
      box(dark, [0, 0.65, 0], [3.3, 0.045, 0.12], "box", true);
      box(dark, [0, 0.65, 0], [0.12, 0.045, 3.3], "box", true);
      for (const x of [-0.48, 0.48]) box(dark, [x, -0.47, 0], [0.07, 0.07, 1.5]);
    } else {
      box(clay, [0, 3.3, 0], [3.1, 4.1, 3.1], "sphere");
      box(cream, [0, 1.4, 0], [1.15, 0.7, 1.15], "cone");
      box(green, [0, 0, 0], [0.85, 0.6, 0.8]);
      for (const x of [-0.35, 0.35]) for (const z of [-0.35, 0.35]) box(dark, [x, 0.7, z], [0.035, 1.1, 0.035]);
    }
  };
  if (AMBIENT.train.enabled && plan.rail) for (let i = 0; i <= AMBIENT.train.carriages; i++) add("train", i, plan.rail);
  if (AMBIENT.cars.enabled && plan.cars.length) for (let i = 0; i < AMBIENT.cars.count; i++) add("car", i, plan.cars[i % plan.cars.length]);
  for (const kind of ["plane", "helicopter", "balloon"] as const) if (AMBIENT[kind].enabled)
    for (let i = 0; i < AMBIENT[kind].count; i++) add(kind, i);
  const batches = new Map<string, typeof parts>();
  for (const part of parts) {
    const key = `${part.part.geometry}:${part.part.color}`, list = batches.get(key) ?? [];
    list.push(part); batches.set(key, list);
  }
  const meshes = [...batches.values()].map((list) => {
    const mesh = new THREE.InstancedMesh(library[list[0]!.part.geometry as keyof GeometryLibrary],
      new THREE.MeshLambertMaterial({ color: list[0]!.part.color }), list.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); moving.add(mesh); return { mesh, list };
  });
  const position = new THREE.Vector3(), direction = new THREE.Vector3(), local = new THREE.Object3D(), matrix = new THREE.Matrix4();
  let previousTime = -Infinity;
  let previousRailTime = -Infinity;
  const serviceOffset = RIVERSIDE_RAIL.dwell - RIVERSIDE_RAIL.initialDwell;
  const serviceAt = (seconds: number) => !plan.rail ? null : plan.railway?.underground
    ? undergroundService(seconds, plan.rail, plan.railway.underground) : railService(seconds + serviceOffset, plan.rail.length);
  let service = serviceAt(0);
  const update = (time: number, enabled: boolean, railTime = time) => {
    // Track, bridges and portals are static infrastructure, independent of trains.
    moving.visible = enabled;
    if (!enabled || (time - previousTime < 1 / 30 && railTime - previousRailTime < 1 / 30)) return;
    const delta = Number.isFinite(previousTime) ? Math.max(0, time - previousTime) : 0;
    previousTime = time;
    previousRailTime = railTime;
    service = serviceAt(railTime);
    for (const actor of actors) {
      const { kind, phase, pose, path, index } = actor;
      if (path) {
        let distance = kind === "train"
          ? (service?.distance ?? 0) + (plan.railway?.underground ? -index : index - 1) * RIVERSIDE_RAIL.spacing
          : loopDistance(time - actor.delay, path.length, actor.speed, actor.phase, index % 2 ? AMBIENT.cars.stopSeconds : 0);
        if (kind === "train" && plan.rail) {
          if (plan.railway?.underground) distance = ((distance % plan.rail.length) + plan.rail.length) % plan.rail.length;
          sampleRail(plan.rail, distance, position, direction);
          actor.hidden = !!plan.railway?.underground && railCarHidden(distance, plan.rail, plan.railway.underground);
        }
        else sampleAmbient(path, distance, position, direction);
        if (kind === "car") {
          const conflict = () => actors.some((other) => other !== actor && other.kind === "car" && other.initialized &&
            carsOverlap(position, Math.atan2(direction.x, direction.z), other.pose.position, other.pose.rotation.y));
          if (!actor.initialized) {
            for (let attempt = 0; conflict() && attempt < 12; attempt++) {
              actor.phase = (actor.phase + 1 / 12) % 1;
              distance = loopDistance(time, path.length, actor.speed, actor.phase, index % 2 ? AMBIENT.cars.stopSeconds : 0);
              sampleAmbient(path, distance, position, direction);
            }
          } else if (conflict()) {
            actor.delay += delta; position.copy(pose.position);
            direction.set(Math.sin(pose.rotation.y), 0, Math.cos(pose.rotation.y));
          }
        }
        pose.position.copy(position); pose.rotation.set(kind === "train" ? -Math.atan2(direction.y, Math.hypot(direction.x, direction.z)) : 0, Math.atan2(direction.x, direction.z), 0, "YXZ");
      } else {
        const settings = AMBIENT[kind as "plane" | "helicopter" | "balloon"];
        const angle = (time / settings.loopSeconds + phase) * Math.PI * 2;
        const sx = kind === "plane" ? plan.width * 0.72 : kind === "helicopter" ? plan.width * 0.3 : plan.width * 0.18;
        const sz = kind === "plane" ? plan.depth * 0.16 : plan.depth * 0.25;
        pose.position.set(plan.center.x + Math.cos(angle) * sx, plan.altitude + settings.altitude +
          Math.sin(time * 0.3 + phase) * (kind === "balloon" ? AMBIENT.balloon.bob : 0.3),
          plan.center.z + Math.sin(angle) * sz);
        pose.rotation.set(0, Math.atan2(-Math.sin(angle) * sx, Math.cos(angle) * sz), 0);
      }
      pose.updateMatrix();
      actor.initialized = true;
    }
    for (const { mesh, list } of meshes) {
      list.forEach(({ actor, part, rotor }, i) => {
        local.position.set(...part.position); local.scale.set(...part.scale);
        if (actors[actor]!.hidden) local.scale.setScalar(0);
        local.rotation.set(0, rotor ? time * AMBIENT.helicopter.rotorSpeed : 0, 0); local.updateMatrix();
        matrix.multiplyMatrices(actors[actor]!.pose.matrix, local.matrix); mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    }
  };
  update(0, true);
  return { group, update, railway: plan.railway?.report ?? null, cuts: plan.railway?.underground?.cuts ?? [],
    railState: () => ({ distance: service?.distance ?? null, speed: service?.speed ?? 0,
      state: service?.state ?? "unavailable", period: service?.period ?? null,
      ...(service && "hiddenAt" in service ? { hiddenAt: service.hiddenAt, emergesAt: service.emergesAt,
        hiddenSeconds: service.hiddenSeconds, elapsed: service.elapsed, dwelling: service.dwelling } : {}),
      trackVisible: group.visible && group.children.some((child) => child.name === "Riverside urban railway" && child.visible),
      cars: actors.filter((a) => a.kind === "train").map((a) => ({ position: a.pose.position.toArray(), heading: a.pose.rotation.y, visible: !a.hidden && enabledForDiagnostics() })) }),
    traffic: () => actors.filter((actor) => actor.kind === "car")
    .map((actor) => ({ position: actor.pose.position.clone(), heading: actor.pose.rotation.y })),
    counts: { train: plan.rail && AMBIENT.train.enabled ? 1 : 0,
    cars: AMBIENT.cars.enabled && plan.cars.length ? AMBIENT.cars.count : 0,
    plane: Number(AMBIENT.plane.enabled), helicopter: Number(AMBIENT.helicopter.enabled), balloon: Number(AMBIENT.balloon.enabled) } };
  function enabledForDiagnostics() { return moving.visible; }
}
