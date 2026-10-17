import * as THREE from "three";
import { createBatch, generateBuilding, generateLandscape, type GeometryLibrary, type Part } from "./geometry";
import type { FrontierData } from "./frontier";
import type { ChunkVisual } from "./layout";
import type { StreetPlan } from "./streets";
import { railConflicts } from "./railClearance";
import { railTerrain } from "./railTerrain";
import type { UndergroundRoute } from "./undergroundRail";
import { cityPalette } from "./palette";

export const RIVERSIDE_RAIL = { speed: 1.6, acceleration: 0.45, dwell: 7, spacing: 2.6,
  initialDwell: 0.5,
  halfEnvelope: 0.95, maxGrade: 0.045, roadHeadroom: 1.65, sample: 0.25,
  startX: 146, endZ: 18, deckLevel: 3, supportSpan: 8.5 } as const;
export interface RailPath { points: THREE.Vector3[]; length: number; distances: number[] }
interface Bounds { id: string; x: number; z: number; width: number; depth: number; low: number; high: number }
export interface RiversidePlan {
  underground?: UndergroundRoute;
  path: RailPath | null; parts: Part[];
  report: { mode: "riverside" | "unavailable"; issues: string[]; maxGrade: number; minRoadHeadroom: number;
    roadTiles: number; supports: number; minWaterHeadroom: number; length: number;
    visibleLength?: number; previousVisibleLength?: number; depot: { x: number; z: number };
    tunnel?: { west: UndergroundRoute["west"]; east: UndergroundRoute["east"]; hiddenSeconds: number; minCover: number;
      station: { x: number; z: number }; continuous: boolean; originalDepotPreserved: boolean; cuts: UndergroundRoute["cuts"]; supports: number };
  };
}
const bounds = (p: Part, id: string): Bounds => {
  const yaw = p.rotation?.[1] ?? 0;
  return { id, x: p.position[0], z: p.position[2],
    width: Math.abs(Math.cos(yaw)) * p.scale[0] + Math.abs(Math.sin(yaw)) * p.scale[2],
    depth: Math.abs(Math.sin(yaw)) * p.scale[0] + Math.abs(Math.cos(yaw)) * p.scale[2],
    low: p.position[1] - p.scale[1] / 2, high: p.position[1] + p.scale[1] / 2 };
};
const overlap = (a: Bounds, b: Bounds, pad = 0.02) => a.x + a.width / 2 + pad > b.x - b.width / 2 &&
  a.x - a.width / 2 - pad < b.x + b.width / 2 && a.z + a.depth / 2 + pad > b.z - b.depth / 2 &&
  a.z - a.depth / 2 - pad < b.z + b.depth / 2 && a.high > b.low + 0.01 && a.low < b.high - 0.01;

export function riversidePoints() {
  const points: THREE.Vector3[] = [];
  const height = (x: number) => {
    const t = THREE.MathUtils.clamp((RIVERSIDE_RAIL.startX - x) / (RIVERSIDE_RAIL.startX - 68), 0, 1);
    return 1.05 + (RIVERSIDE_RAIL.deckLevel - 1.05) * t * t * (3 - 2 * t);
  };
  for (let x = RIVERSIDE_RAIL.startX; x >= 68; x -= RIVERSIDE_RAIL.sample) {
    const z = 1 - 1.6 * Math.exp(-((x - 109.5) ** 2) / 25)
      - 1.6 * Math.exp(-((x - 94) ** 2) / 30) - Math.exp(-((x - 90) ** 2) / 10);
    points.push(new THREE.Vector3(x, height(x), z));
  }
  for (let i = 1; i <= 40; i++) {
    const a = -Math.PI / 2 - i / 40 * Math.PI / 2;
    points.push(new THREE.Vector3(68 + 4 * Math.cos(a), RIVERSIDE_RAIL.deckLevel, 5 + 4 * Math.sin(a)));
  }
  for (let z = 5.25; z <= RIVERSIDE_RAIL.endZ; z += 0.25) points.push(new THREE.Vector3(64, RIVERSIDE_RAIL.deckLevel, z));
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1]! + points[i]!.distanceTo(points[i - 1]!));
  return { points, distances, length: distances.at(-1)! };
}

/** Open-path sampling clamps endpoints; it never wraps or teleports the consist. */
export function sampleRail(path: RailPath, distance: number, out: THREE.Vector3, tangent: THREE.Vector3) {
  const d = THREE.MathUtils.clamp(distance, 0, path.length);
  let lo = 1, hi = path.distances.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (path.distances[mid]! < d) lo = mid + 1; else hi = mid; }
  const a = path.points[lo - 1]!, b = path.points[lo]!, span = path.distances[lo]! - path.distances[lo - 1]!;
  const alpha = span ? (d - path.distances[lo - 1]!) / span : 0;
  out.lerpVectors(a, b, alpha);
  // Blend vertex tangents, rather than quantizing yaw to each short track segment.
  const before = path.points[Math.max(0, lo - 2)]!, after = path.points[Math.min(path.points.length - 1, lo + 1)]!;
  const ax = b.x - before.x, ay = b.y - before.y, az = b.z - before.z;
  const bx = after.x - a.x, by = after.y - a.y, bz = after.z - a.z;
  const al = Math.hypot(ax, ay, az) || 1, bl = Math.hypot(bx, by, bz) || 1;
  tangent.set(THREE.MathUtils.lerp(ax / al, bx / bl, alpha), THREE.MathUtils.lerp(ay / al, by / bl, alpha),
    THREE.MathUtils.lerp(az / al, bz / bl, alpha)).normalize();
}

/** Bidirectional service: fixed cab orientation, continuous carriage order, eased stops. */
export function railService(time: number, length: number) {
  const { speed, acceleration, dwell, spacing } = RIVERSIDE_RAIL;
  const margin = spacing + 1.3, distance = Math.max(0, length - 2 * margin);
  const peak = Math.min(speed, Math.sqrt(distance * acceleration));
  const ramp = peak / acceleration, rampDistance = peak * ramp / 2;
  const cruise = peak ? Math.max(0, distance - 2 * rampDistance) / peak : 0;
  const travel = ramp * 2 + cruise, period = 2 * (travel + dwell);
  const phase = ((time % period) + period) % period;
  const displacement = (t: number) => t < ramp ? acceleration * t * t / 2 : t < ramp + cruise
    ? rampDistance + (t - ramp) * peak : distance - acceleration * (travel - t) ** 2 / 2;
  const velocity = (t: number) => t < ramp ? acceleration * t : t < ramp + cruise ? peak : acceleration * (travel - t);
  if (phase < dwell) return { distance: length - margin, speed: 0, state: "depot" as const, period };
  if (phase < dwell + travel) {
    const t = phase - dwell; return { distance: length - margin - displacement(t), speed: -velocity(t), state: "outbound" as const, period };
  }
  if (phase < 2 * dwell + travel) return { distance: margin, speed: 0, state: "east-stop" as const, period };
  const t = phase - 2 * dwell - travel;
  return { distance: margin + displacement(t), speed: velocity(t), state: "inbound" as const, period };
}

export function planRiversideRail(chunks: ChunkVisual[], frontier: FrontierData, seed: number, streets: StreetPlan): RiversidePlan {
  const report: RiversidePlan["report"] = { mode: "unavailable", issues: [], maxGrade: 0, minRoadHeadroom: Infinity,
    roadTiles: 0, supports: 0, minWaterHeadroom: Infinity, length: 0, depot: { x: 61, z: 16 } };
  const failed = () => ({ path: null, parts: [], report });
  const buildings = chunks.flatMap((c) => c.buildings);
  if (!buildings.some((b) => b.kind === "warehouse" && Math.abs(b.x - 61) < 0.1 && Math.abs(b.z - 10.5) < 0.1)) {
    report.issues.push("Riverside warehouse anchor unavailable; no external-loop fallback."); return failed();
  }
  const path = riversidePoints(), ground = railTerrain(chunks, frontier), parts: Part[] = [], solids: Bounds[] = [];
  const relevant = (x: number, z: number) => x > 54 && x < 150 && z > -7 && z < 24;
  for (const b of buildings) if (relevant(b.x, b.z)) solids.push(...generateBuilding(b).map((p) => bounds(p, b.id)));
  for (const c of chunks.filter((c) => c.z === 0)) for (const p of generateLandscape(c, seed, chunks))
    if (relevant(p.position[0], p.position[2]) && (p.scale[1] > 0.25 || p.role === "tree-trunk" || p.role === "tree-crown"))
      solids.push(bounds(p, "landscape"));
  for (const p of frontier.parts) if (relevant(p.position[0], p.position[2]) && p.scale[1] > 0.25)
    solids.push(bounds(p, "frontier"));
  const conflicts = railConflicts(path.points, buildings, RIVERSIDE_RAIL.halfEnvelope);
  if (conflicts.length) report.issues.push(`Persisted parcel conflict: ${conflicts.map((c) => c.id).join(",")}`);
  const streetAt = (x: number, z: number) => streets.tiles.get(`${Math.floor(x / 0.25)}:${Math.floor(z / 0.25)}`);
  const samples = [-0.92, 0, 0.92], crossedPaving = new Set<string>();
  for (let i = 0; i < path.points.length; i++) {
    const p = path.points[i]!, next = path.points[Math.min(i + 1, path.points.length - 1)]!, prior = path.points[Math.max(0, i - 1)]!;
    const yaw = Math.atan2(next.x - prior.x, next.z - prior.z);
    if (i) report.maxGrade = Math.max(report.maxGrade, Math.abs(p.y - prior.y) / Math.hypot(p.x - prior.x, p.z - prior.z));
    for (const side of samples) {
      const x = p.x + Math.cos(yaw) * side, z = p.z - Math.sin(yaw) * side, terrain = ground(x, z);
      if (!terrain) { report.issues.push("Missing terrain sample."); continue; }
      if (!terrain.wet && p.y - 0.36 < terrain.height + 0.07) report.issues.push("Deck intersects terrain.");
      if (terrain.wet) report.minWaterHeadroom = Math.min(report.minWaterHeadroom, p.y - 0.36 - terrain.height);
      const street = streetAt(x, z);
      if (street) { crossedPaving.add(`${street.x}:${street.z}`); report.minRoadHeadroom = Math.min(report.minRoadHeadroom, p.y - 0.36 - street.level - 0.17); }
    }
    const swept: Bounds = { id: "train", x: p.x, z: p.z, width: 1.9, depth: 1.9, low: p.y - 0.36, high: p.y + 1.25 };
    if (solids.some((s) => overlap(swept, s))) report.issues.push("Full-height track/train obstruction.");
  }
  if (report.maxGrade > RIVERSIDE_RAIL.maxGrade) report.issues.push("Rail grade exceeds limit.");
  // Check every paving tile intersecting the actual deck sweep, including strips
  // between the terrain sample offsets. Ground-level traffic remains untouched.
  for (const tile of streets.tiles.values()) {
    const x = (tile.x + 0.5) * 0.25, z = (tile.z + 0.5) * 0.25;
    if (!relevant(x, z)) continue;
    const hit = railConflicts(path.points, [{ id: "paving", x, z, width: 0.25, depth: 0.25 }], 0.77)[0];
    if (!hit) continue;
    crossedPaving.add(`${tile.x}:${tile.z}`);
    for (const segment of hit.segments) report.minRoadHeadroom = Math.min(report.minRoadHeadroom,
      Math.min(path.points[segment]!.y, path.points[segment + 1]!.y) - 0.36 - tile.level - 0.17);
  }
  report.roadTiles = crossedPaving.size;
  if (report.minRoadHeadroom < RIVERSIDE_RAIL.roadHeadroom) report.issues.push("Insufficient road/pedestrian headroom.");
  if (!Number.isFinite(report.minWaterHeadroom) || report.minWaterHeadroom < 1) report.issues.push("Canal bridge clearance unavailable.");
  const box = (color: string, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0) =>
    parts.push({ geometry: "box", color, position: [x, y, z], scale: [w, h, d], rotation: [0, yaw, 0] });
  const point = new THREE.Vector3(), tangent = new THREE.Vector3();
  // Independently checked piers; no columns in roads, sidewalks or the waterway.
  const supports: number[] = [];
  for (let distance = 0.5; distance < path.length; distance += 5) {
    for (const shift of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2]) {
      const at = THREE.MathUtils.clamp(distance + shift, 0, path.length);
      sampleRail(path, at, point, tangent);
      const terrain = ground(point.x, point.z);
      if (!terrain || terrain.wet) continue;
      const foot = Math.min(...[-0.21, 0, 0.21].flatMap((dx) => [-0.21, 0, 0.21].map((dz) =>
        ground(point.x + dx, point.z + dz)?.height ?? terrain.height))) - 0.06;
      const pier: Part = { geometry: "box", color: "#c4b593", position: [point.x, (foot + point.y - 0.36) / 2, point.z],
        role: "rail-pier", scale: [0.42, point.y - 0.36 - foot, 0.42] };
      if (pier.scale[1] <= 0 || [-0.35, 0, 0.35].some((dx) => [-0.35, 0, 0.35].some((dz) => {
        const g = ground(point.x + dx, point.z + dz); return !g || g.wet || streetAt(point.x + dx, point.z + dz);
      })) || solids.some((s) => overlap(bounds(pier, "pier"), s))) continue;
      parts.push(pier); supports.push(at); break;
    }
  }
  supports.sort((a, b) => a - b);
  if (!supports.length || supports[0]! > RIVERSIDE_RAIL.supportSpan || path.length - supports.at(-1)! > RIVERSIDE_RAIL.supportSpan ||
    supports.some((d, i) => i && d - supports[i - 1]! > RIVERSIDE_RAIL.supportSpan)) report.issues.push("Unresolved support span.");
  report.supports = supports.length;
  // Separate bank abutments carry the canal span; nothing is planted in the channel.
  for (const bankX of [80.8, 86.8]) {
    const nearest = path.points.reduce((best, p) => Math.abs(p.x - bankX) < Math.abs(best.x - bankX) ? p : best);
    const index = path.points.indexOf(nearest);
    sampleRail(path, path.distances[index]!, point, tangent);
    const terrain = ground(point.x, point.z);
    const yaw = Math.atan2(tangent.x, tangent.z);
    const foot = Math.min(...[-0.35, 0, 0.35].flatMap((dx) => [-0.82, 0, 0.82].map((dz) =>
      ground(point.x + dx, point.z + dz)?.height ?? terrain?.height ?? 0))) - 0.08;
    const h = point.y - 0.36 - foot;
    const abutment: Part = { geometry: "box", color: "#cbbb9a", position: [point.x, (point.y - 0.36 + foot) / 2, point.z],
      scale: [1.6, h, 0.65], rotation: [0, yaw, 0] };
    const base = bounds(abutment, "abutment");
    if (!terrain || h <= 0 || solids.some((s) => overlap(base, s)) ||
      [-1, 0, 1].some((dx) => [-1, 0, 1].some((dz) => {
        const x = base.x + dx * base.width / 2, z = base.z + dz * base.depth / 2, g = ground(x, z);
        return !g || g.wet || streetAt(x, z);
      }))) report.issues.push("Canal abutment foundation not clear.");
    else parts.push(abutment);
  }
  // Low earth approach, only where the deck is close to dry terrain. Higher
  // sections use slender piers so roads and the landscape stay open underneath.
  for (let d = 0; d < path.length; d += 0.65) {
    sampleRail(path, d, point, tangent);
    const terrain = ground(point.x, point.z), height = point.y - 0.35 - (terrain?.height ?? 0);
    if (!terrain || terrain.wet || height > 0.7 || height < 0.05) continue;
    const fill: Part = { geometry: "box", color: "#cbbb9f", position: [point.x, terrain.height + height / 2 - 0.02, point.z],
      role: "rail-fill", scale: [1.6, height + 0.04, 0.65], rotation: [0, Math.atan2(tangent.x, tangent.z), 0] };
    const b = bounds(fill, "embankment");
    if (solids.some((s) => overlap(b, s)) || [-1, 0, 1].some((dx) => [-1, 0, 1].some((dz) => {
      const x = b.x + dx * b.width / 2, z = b.z + dz * b.depth / 2; return ground(x, z)?.wet || streetAt(x, z);
    }))) continue;
    parts.push(fill);
  }
  // Sleepers sit between the ballast and rails, never coplanar with either.
  for (let d = 0.3; d < path.length; d += 0.65) {
    sampleRail(path, d, point, tangent);
    box("#a58c6c", point.x, point.y - 0.075, point.z, 1.14, 0.08, 0.16, Math.atan2(tangent.x, tangent.z));
    parts.at(-1)!.role = "rail-sleeper";
  }
  const bufferStart = parts.length;
  for (const end of [0, path.length]) {
    sampleRail(path, end, point, tangent);
    const yaw = Math.atan2(tangent.x, tangent.z);
    box("#745f4b", point.x, point.y + 0.28, point.z, 0.98, 0.16, 0.15, yaw);
    for (const side of [-0.45, 0.45]) box("#745f4b", point.x + Math.cos(yaw) * side, point.y + 0.1,
      point.z - Math.sin(yaw) * side, 0.1, 0.4, 0.15, yaw);
  }
  for (const part of parts.slice(bufferStart)) part.role = "rail-buffer";
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1]!, b = path.points[i]!, mid = a.clone().add(b).multiplyScalar(0.5);
    if (mid.x < 79.7 || mid.x > 86.8) continue;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    for (const side of [-0.79, 0.79]) box("#719084", mid.x + Math.cos(yaw) * side, mid.y + 0.6,
      mid.z - Math.sin(yaw) * side, 0.045, 0.055, a.distanceTo(b), yaw);
    if (i % 4 === 0) for (const side of [-0.79, 0.79]) box("#719084", mid.x + Math.cos(yaw) * side,
      mid.y + 0.25, mid.z - Math.sin(yaw) * side, 0.055, 0.65, 0.055);
  }
  // Platform and open stair well stay west of the railway and outside canonical parcels.
  const stationStart = parts.length, top = RIVERSIDE_RAIL.deckLevel + 0.16;
  box("#d0bfa0", 61.9, top - 0.12, 16, 2.4, 0.24, 6);
  box("#f0dfb9", 62.97, top + 0.012, 16, 0.14, 0.025, 6);
  box("#d0bfa0", 60, top - 0.12, 18.525, 1.4, 0.24, 0.95);
  for (let i = 0; i < 13; i++) {
    const z = 13.05 + i * 0.4, groundLevel = ground(59.9, z)?.height ?? 0.32;
    const stepTop = groundLevel + (top - groundLevel) * (i + 1) / 13;
    box("#c8b899", 59.9, (stepTop + groundLevel) / 2, z, 1.25, stepTop - groundLevel, 0.4);
  }
  const accessHeight = Math.max(ground(58.6, 12.65)?.height ?? 0.4, 0.4) + 0.08;
  box("#e0cfad", 58.6, accessHeight + 0.07, 12.65, 1.8, 0.08, 0.7);
  box("#e9d7b5", 61.55, top + 0.85, 14.35, 1.2, 1.7, 1.65);
  box("#8aa49c", 61.55, top + 1.79, 14.35, 1.45, 0.14, 1.9);
  box("#526e65", 62.165, top + 0.7, 14.35, 0.035, 1.4, 0.55);
  box("#82a9b5", 61.55, top + 0.8, 15.19, 0.7, 0.48, 0.035);
  for (const x of [60.85, 62.75]) for (const z of [15.65, 18.25]) box("#6d8372", x, top + 0.9, z, 0.09, 1.8, 0.09);
  box("#78978b", 61.8, top + 1.88, 16.95, 2.25, 0.16, 3.15);
  // Small freight props and bench; environmental, never inventory or production.
  for (let i = 0; i < 2; i++) box(i ? "#aa7561" : "#8b9e90", 61.3, top + 0.23, 17 + i * 0.65, 0.6, 0.46, 0.48);
  box("#9b876b", 62.2, top + 0.42, 15.75, 0.28, 0.14, 0.8);
  box("#9b876b", 62.03, top + 0.65, 15.75, 0.07, 0.45, 0.8);
  for (const z of [13.5, 18.5]) { box("#6c7d6f", 60.8, top + 0.78, z, 0.06, 1.56, 0.06); box("#eedaa4", 60.8, top + 1.58, z, 0.22, 0.12, 0.22); }
  // Platform piers avoid the open stairwell and existing warehouse parcels.
  for (const z of [13.6, 18.5]) for (const x of [60.9, 62.7]) {
    const level = ground(x, z)?.height ?? 0.32;
    box("#c4b593", x, (top - 0.24 + level) / 2, z, 0.24, top - 0.24 - level, 0.24);
  }
  // Guardrails, with the access opening left clear.
  box("#839584", 60.75, top + 0.5, 16.75, 0.05, 0.06, 3);
  for (const z of [15.25, 16.75, 18.25]) box("#839584", 60.75, top + 0.25, z, 0.05, 0.5, 0.05);
  box("#839584", 59.35, top + 0.5, 18.525, 0.05, 0.06, 0.95);
  for (const z of [18.1, 18.95]) box("#839584", 59.35, top + 0.25, z, 0.05, 0.5, 0.05);
  box("#6d8372", 61.6, RIVERSIDE_RAIL.deckLevel + 2.27, 16.5, 0.05, 0.35, 0.05);
  for (const p of parts.slice(stationStart)) {
    const b = bounds(p, "depot");
    if (solids.some((s) => overlap(b, s))) report.issues.push("Depot/access conflicts with existing geometry.");
    if (buildings.some((building) => Math.abs(b.x - building.x) < b.width / 2 + building.width / 2 + 0.03 &&
      Math.abs(b.z - building.z) < b.depth / 2 + building.depth / 2 + 0.03)) report.issues.push("Depot/access enters a persisted parcel.");
  }
  // Landing touches existing pedestrian paving; no new navigation graph or crossing.
  if (!streetAt(57.7, 12.65)?.walk) report.issues.push("Depot pedestrian landing lacks sidewalk access.");
  report.issues = [...new Set(report.issues)]; report.length = path.length;
  if (report.issues.length) return failed();
  report.mode = "riverside";
  return { path, parts, report };
}

/** Continuous joined cross-sections prevent coplanar segment overlap and curve gaps. */
export function ribbon(path: RailPath, offset: number, width: number, height: number, level: number, color: string) {
  const positions: number[] = [], indices: number[] = [];
  path.points.forEach((p, i) => {
    const a = path.points[Math.max(0, i - 1)]!, b = path.points[Math.min(path.points.length - 1, i + 1)]!;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    for (const [side, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const lateral = offset + side! * width / 2;
      positions.push(p.x + Math.cos(yaw) * lateral, p.y + level + y! * height / 2, p.z - Math.sin(yaw) * lateral);
    }
    if (!i) return;
    for (let edge = 0; edge < 4; edge++) {
      const a = (i - 1) * 4 + edge, b = (i - 1) * 4 + (edge + 1) % 4, c = i * 4 + edge, d = i * 4 + (edge + 1) % 4;
      indices.push(a, b, c, b, d, c);
    }
  });
  indices.push(0, 2, 1, 0, 3, 2);
  const end = (path.points.length - 1) * 4;
  indices.push(end, end + 1, end + 2, end, end + 2, end + 3);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color })); mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
export function createRiversideScene(plan: RiversidePlan, library: GeometryLibrary,
  urbanBounds?: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  const group = new THREE.Group();
  if (!plan.path) return group;
  group.name = "Riverside urban railway";
  const station = new THREE.Vector3(), direction = new THREE.Vector3();
  if (plan.underground) sampleRail(plan.path, plan.underground.station, station, direction);
  const approachColor = (color: string, x: number, z: number) => {
    const tint = new THREE.Color(color);
    if (!urbanBounds || !plan.underground || (x >= urbanBounds.minX && x <= urbanBounds.maxX &&
      z >= urbanBounds.minZ && z <= urbanBounds.maxZ)) return tint;
    // Solid, quieter aggregate on country approaches; no opacity, fog or
    // disappearing track. Keep the district and station rail detail crisp.
    return tint.lerp(new THREE.Color("#cdd0b5"), THREE.MathUtils.smoothstep(
      Math.hypot(x - station.x, z - station.z), 24, 86) * .52);
  };
  group.add(createBatch(plan.parts.map((part) => part.color === "#a58c6c"
    ? { ...part, color: `#${approachColor(part.color, part.position[0], part.position[2]).getHexString()}` }
    : part), library, false));
  // Continuous graded earth skin over the physical gallery roof. Adjacent
  // samples share vertices, avoiding a striped row of overlapping wedges.
  for (const gallery of plan.underground?.galleries ?? []) {
    const positions: number[] = [], indices: number[] = [];
    gallery.forEach((p, i) => {
      for (const [z, y] of [[p.z - p.left, p.leftY], [p.z - 1.6, p.y], [p.z + 1.6, p.y], [p.z + p.right, p.rightY]])
        positions.push(p.x, y!, z!);
      if (!i) return;
      const forward = p.x > gallery[i - 1]!.x;
      for (let band = 0; band < 3; band++) {
        const a = (i - 1) * 4 + band, b = a + 1, c = i * 4 + band, d = c + 1;
        indices.push(...(forward ? [a, b, c, b, d, c] : [a, c, b, b, c, d]));
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const soil = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: cityPalette.terrain }));
    soil.receiveShadow = true; soil.name = "Landscaped rail cover"; group.add(soil);
  }
  const renderedPath = plan.underground?.surface ?? plan.path;
  const track = (offset: number, width: number, height: number, level: number, color: string) => {
    const mesh = ribbon(renderedPath, offset, width, height, level, color);
    const positions = mesh.geometry.getAttribute("position"), colors: number[] = [];
    for (let i = 0; i < positions.count; i++) colors.push(...approachColor(color, positions.getX(i), positions.getZ(i)).toArray());
    mesh.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    mesh.material.color.set("white"); mesh.material.vertexColors = true;
    return mesh;
  };
  group.add(track(0, 1.5, .18, -.27, "#c1b18f"), track(0, 1.32, .13, -.13, "#a9a69a"));
  for (const side of [-.36, .36]) group.add(track(side, .065, .07, 0, "#63776f"));
  // Physical station sign, not an economic label or backend building.
  if (typeof document === "undefined") return group;
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#eee3ca"; ctx.fillRect(0, 0, 512, 96); ctx.fillStyle = "#315346";
    ctx.font = "600 37px sans-serif"; ctx.textAlign = "center"; ctx.fillText("RIVERSIDE DEPOT", 256, 62);
    const texture = new THREE.CanvasTexture(canvas), material = new THREE.SpriteMaterial({ map: texture, depthTest: true });
    material.addEventListener("dispose", () => texture.dispose());
    const sprite = new THREE.Sprite(material);
    sprite.position.set(61.6, RIVERSIDE_RAIL.deckLevel + 2.65, 16.5); sprite.scale.set(3.8, 0.71, 1); group.add(sprite);
  }
  return group;
}
