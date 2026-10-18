import { bridgeSurface } from "./bridgeSurface";
import * as THREE from "three";
import { generateBuilding, type Part } from "./geometry";
import type { ChunkVisual } from "./layout";
import { buildPathNetwork, type PathNetwork } from "./agentMotion";
import { planVegetation } from "./vegetation";

export const STREETS = { carriageway: 2, sidewalk: 0.5, laneOffset: 0.5,
  grid: 0.25, turnRadius: 0.65, carHalfWidth: 0.34, carHalfLength: 0.5,
  surface: "#b9c1b3", sidewalkColor: "#ede6d1", marking: "#f7efdc" } as const;
type Tile = { x: number; z: number; level: number; walk: boolean; owner: string; bridge: boolean };
type Node = { point: THREE.Vector2; horizontal: boolean; vertical: boolean; junction: boolean; level: number; bridge: boolean; owner: string };
export interface StreetPlan { tiles: Map<string, Tile>; nodes: Map<string, Node>; parts: Map<string, Part[]>;
  vehicles: PathNetwork; constraints: { roadCells: number; twoWayCells: number; constrainedCells: number; bridgeCells: number }; }
const cellKey = (x: number, z: number) => `${Math.floor(x)}:${Math.floor(z)}`;
const microKey = (x: number, z: number) => `${Math.floor(x / STREETS.grid)}:${Math.floor(z / STREETS.grid)}`;

/** Presentation paving occupies only existing streets and vacant legal verges.
 * Persistent terrain, building parcels and navigation state are never changed. */
export function planStreets(chunks: ChunkVisual[], seed: number): StreetPlan {
  const source = buildPathNetwork(chunks, seed, true), terrain = new Map<string, string>();
  const levels = new Map<string, number>(), owners = new Map<string, string>();
  const obstacles = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number }[]>();
  const trees = new Map<string, { x: number; z: number; radius: number }[]>();
  for (const chunk of chunks) {
    const size = chunk.size ?? 32;
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      const key = cellKey(chunk.x * size + x, chunk.z * size + z);
      terrain.set(key, chunk.terrain?.[z * size + x] ?? "g");
      levels.set(key, bridgeSurface(chunks).level(chunk.x * size + x, chunk.z * size + z)); owners.set(key, chunk.id);
    }
    for (const b of chunk.buildings) for (const part of generateBuilding(b)) {
      const bottom = part.position[1] - part.scale[1] / 2, top = bottom + part.scale[1];
      if (top <= (b.elevation ?? 0) + 0.2 || bottom > (b.elevation ?? 0) + 1.3) continue;
      const yaw = part.rotation?.[1] ?? 0;
      const w = Math.abs(Math.cos(yaw)) * part.scale[0] + Math.abs(Math.sin(yaw)) * part.scale[2];
      const d = Math.abs(Math.sin(yaw)) * part.scale[0] + Math.abs(Math.cos(yaw)) * part.scale[2];
      const obstacle = { minX: part.position[0] - w / 2 - 0.12, maxX: part.position[0] + w / 2 + 0.12,
        minZ: part.position[2] - d / 2 - 0.12, maxZ: part.position[2] + d / 2 + 0.12 };
      for (let x = Math.floor(obstacle.minX); x <= Math.floor(obstacle.maxX); x++)
        for (let z = Math.floor(obstacle.minZ); z <= Math.floor(obstacle.maxZ); z++) {
          const key = cellKey(x, z), list = obstacles.get(key) ?? []; list.push(obstacle); obstacles.set(key, list);
        }
    }
    for (const tree of planVegetation(chunk, seed, chunks)) {
      const item = { x: tree.x, z: tree.z, radius: tree.scale * 0.8 + 0.1 };
      for (let x = Math.floor(item.x - item.radius); x <= Math.floor(item.x + item.radius); x++)
        for (let z = Math.floor(item.z - item.radius); z <= Math.floor(item.z + item.radius); z++) {
          const key = cellKey(x, z), list = trees.get(key) ?? []; list.push(item); trees.set(key, list);
        }
    }
    for (const prop of chunk.props ?? []) {
      if (prop.kind.startsWith("tree")) continue;
      const item = { x: prop.x, z: prop.z, radius: prop.kind === "lamp" ? 0.16 : prop.scale * 0.5 + 0.12 };
      for (let x = Math.floor(item.x - item.radius); x <= Math.floor(item.x + item.radius); x++)
        for (let z = Math.floor(item.z - item.radius); z <= Math.floor(item.z + item.radius); z++) {
          const key = cellKey(x, z), list = trees.get(key) ?? []; list.push(item); trees.set(key, list);
        }
    }
  }
  const nodes = new Map<string, Node>();
  for (const [key, point] of source) {
    const e = source.has(cellKey(point.x + 1, point.y)), w = source.has(cellKey(point.x - 1, point.y));
    const n = source.has(cellKey(point.x, point.y - 1)), s = source.has(cellKey(point.x, point.y + 1));
    nodes.set(key, { point, horizontal: e || w, vertical: n || s, junction: Number(e) + Number(w) + Number(n) + Number(s) >= 3,
      level: levels.get(key) ?? 0, bridge: terrain.get(key) === "b", owner: owners.get(key)! });
  }
  const tiles = new Map<string, Tile>(), half = STREETS.carriageway / 2 + STREETS.sidewalk;
  for (const node of nodes.values()) {
    const { x, y: z } = node.point;
    for (let ix = Math.floor((x - half) / STREETS.grid); ix < Math.ceil((x + half) / STREETS.grid); ix++)
      for (let iz = Math.floor((z - half) / STREETS.grid); iz < Math.ceil((z + half) / STREETS.grid); iz++) {
        const px = (ix + 0.5) * STREETS.grid, pz = (iz + 0.5) * STREETS.grid;
        const dx = Math.abs(px - x), dz = Math.abs(pz - z);
        const horizontal = node.horizontal && dx < 0.501, vertical = node.vertical && dz < 0.501;
        if (!horizontal && !vertical) continue;
        const cross = Math.min(horizontal ? dz : Infinity, vertical ? dx : Infinity);
        if (cross >= half) continue;
        const key = cellKey(px, pz), code = terrain.get(key);
        if (!code || (code === "w" && !node.bridge)) continue;
        if ((obstacles.get(key) ?? []).some((o) => px + STREETS.grid / 2 > o.minX && px - STREETS.grid / 2 < o.maxX &&
          pz + STREETS.grid / 2 > o.minZ && pz - STREETS.grid / 2 < o.maxZ)) continue;
        if ((trees.get(key) ?? []).some((tree) => Math.hypot(px - tree.x, pz - tree.z) < tree.radius)) continue;
        const walk = cross >= STREETS.carriageway / 2 || code === "p";
        const id = `${ix}:${iz}`, prior = tiles.get(id);
        if (!prior || (prior.walk && !walk)) tiles.set(id, { x: ix, z: iz,
          level: node.level, walk, owner: node.owner, bridge: node.bridge });
      }
  }
  const parts = new Map<string, Part[]>();
  const add = (owner: string, part: Part) => { const list = parts.get(owner) ?? []; list.push(part); parts.set(owner, list); };
  // Merge microcells into disjoint horizontal strips: no coplanar paving overlap
  // at turns, T-junctions, four-way junctions, or chunk boundaries.
  const rows = new Map<number, Tile[]>();
  for (const tile of tiles.values()) { const list = rows.get(tile.z) ?? []; list.push(tile); rows.set(tile.z, list); }
  for (const [z, row] of rows) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 0; i < row.length;) {
      const first = row[i]!, start = first.x; let end = start + 1; i++;
      while (i < row.length && row[i]!.x === end && row[i]!.walk === first.walk &&
        row[i]!.level === first.level && row[i]!.owner === first.owner && row[i]!.bridge === first.bridge) { end++; i++; }
      add(first.owner, { geometry: "box", color: first.walk ? STREETS.sidewalkColor : STREETS.surface,
        role: first.walk ? "street-sidewalk" : "street-surface",
        position: [(start + end) * STREETS.grid / 2, first.level + (first.walk ? 0.15 : 0.10), (z + 0.5) * STREETS.grid],
        scale: [(end - start) * STREETS.grid, 0.04, STREETS.grid] });
    }
  }
  const vehicles: PathNetwork = new Map();
  const paved = (x: number, z: number) => { const tile = tiles.get(microKey(x, z)); return !!tile && !tile.walk; };
  const marked = new Set<string>();
  for (const [key, node] of nodes) {
    const { x, y: z } = node.point;
    const safeH = !node.horizontal || [-0.94, 0.94].every((v) => paved(x, z + v));
    const safeV = !node.vertical || [-0.94, 0.94].every((v) => paved(x + v, z));
    if (safeH && safeV) vehicles.set(key, node.point);
    const nearJunction = [...[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((d) => nodes.get(cellKey(x + d, z))),
      ...[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((d) => nodes.get(cellKey(x, z + d)))].some((n) => n?.junction);
    if (!nearJunction && !node.bridge && (Math.floor(x + z) % 4 + 4) % 4 < 2 && safeH && safeV)
      add(node.owner, { geometry: "box", role: "street-marking", color: STREETS.marking,
        position: [x, node.level + 0.13, z], scale: node.horizontal ? [0.65, 0.008, 0.055] : [0.055, 0.008, 0.65] });
    if (node.junction && (Math.floor(x) * 7 + Math.floor(z) * 11) % 3 === 0) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let i = -3; i <= 3; i++) {
        const px = x + dx! * (2.5 + i * 0.18), pz = z + dz! * (2.5 + i * 0.18);
        const id = `${px}:${pz}`;
        if (marked.has(id) || ![-0.85, 0, 0.85].every((side) => paved(px + dz! * side, pz + dx! * side))) continue;
        marked.add(id); add(node.owner, { geometry: "box", role: "street-marking", color: STREETS.marking,
          position: [px, node.level + 0.132, pz], scale: dx ? [0.09, 0.008, 1.7] : [1.7, 0.008, 0.09] });
      }
    }
    if (node.bridge) for (const side of [-1, 1]) {
      const px = x + (node.vertical ? side * 1.44 : 0), pz = z + (node.horizontal ? side * 1.44 : 0);
      if (!tiles.has(microKey(px, pz))) continue;
      add(node.owner, { geometry: "box", role: "bridge-edge", color: "#a4ad9c",
        position: [px, node.level + 0.3, pz], scale: node.horizontal ? [0.94, 0.32, 0.07] : [0.07, 0.32, 0.94] });
    }
  }
  return { tiles, nodes, parts, vehicles, constraints: { roadCells: nodes.size, twoWayCells: vehicles.size,
    constrainedCells: nodes.size - vehicles.size, bridgeCells: [...nodes.values()].filter((n) => n.bridge).length } };
}

export function pedestrianStreetPoint(point: THREE.Vector2, idSeed: number, plan: StreetPlan, out: THREE.Vector2) {
  out.copy(point);
  const node = plan.nodes.get(cellKey(point.x, point.y));
  if (!node || node.junction || (node.horizontal && node.vertical)) return out;
  const junctionNear = [-1, 1].some((d) => plan.nodes.get(cellKey(node.point.x + (node.horizontal ? d : 0),
    node.point.y + (node.vertical ? d : 0)))?.junction);
  const offset = (STREETS.carriageway / 2 + STREETS.sidewalk / 2) * (junctionNear ? 0.5 : 1);
  for (const side of [idSeed % 2 ? 1 : -1, idSeed % 2 ? -1 : 1]) {
    const x = node.vertical ? node.point.x + side * offset : point.x;
    const z = node.horizontal ? node.point.y + side * offset : point.y;
    if (plan.tiles.get(microKey(x, z))?.walk) return out.set(x, z);
  }
  return out;
}

/** Offset each direction into its right-hand lane and round corner tangencies. */
export function lanePoints(points: THREE.Vector3[], reverse = false): THREE.Vector3[] {
  const input = (reverse ? [...points].reverse() : points).slice(0, -1);
  const corners = input.filter((p, i) => {
    const a = input[(i - 1 + input.length) % input.length]!, b = input[(i + 1) % input.length]!;
    return Math.abs((p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x)) > 0.001;
  });
  if (corners.length < 3) return [];
  const shifted = corners.map((p, i) => {
    const prev = corners[(i - 1 + corners.length) % corners.length]!, next = corners[(i + 1) % corners.length]!;
    const incoming = p.clone().sub(prev).setY(0).normalize(), outgoing = next.clone().sub(p).setY(0).normalize();
    const rightA = new THREE.Vector3(incoming.z, 0, -incoming.x), rightB = new THREE.Vector3(outgoing.z, 0, -outgoing.x);
    const miter = rightA.add(rightB).normalize();
    return { point: p.clone().addScaledVector(miter, STREETS.laneOffset / Math.max(0.4, miter.dot(rightB))), incoming, outgoing };
  });
  const result: THREE.Vector3[] = [];
  for (const { point, incoming, outgoing } of shifted) {
    const start = point.clone().addScaledVector(incoming, -STREETS.turnRadius), end = point.clone().addScaledVector(outgoing, STREETS.turnRadius);
    if (result.length) {
      const last = result.at(-1)!.clone(), span = last.distanceTo(start);
      for (let i = 1; i < Math.ceil(span * 2); i++) result.push(last.clone().lerp(start, i / Math.ceil(span * 2)));
    }
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      result.push(start.clone().multiplyScalar((1 - t) ** 2).addScaledVector(point, 2 * (1 - t) * t).addScaledVector(end, t * t));
    }
  }
  const last = result.at(-1)!.clone(), first = result[0]!, span = last.distanceTo(first);
  for (let i = 1; i < Math.ceil(span * 2); i++) result.push(last.clone().lerp(first, i / Math.ceil(span * 2)));
  result.push(first.clone()); return result;
}

export function vehicleFitsStreet(position: THREE.Vector3, heading: number, plan: StreetPlan) {
  for (const side of [-STREETS.carHalfWidth, 0, STREETS.carHalfWidth])
    for (const length of [-STREETS.carHalfLength, 0, STREETS.carHalfLength]) {
      const x = position.x + Math.cos(heading) * side + Math.sin(heading) * length;
      const z = position.z - Math.sin(heading) * side + Math.cos(heading) * length;
      const tile = plan.tiles.get(microKey(x, z));
      if (!tile || tile.walk) return false;
    }
  return true;
}

/** Short two-way loops where a protected street graph has no complete block loop.
 * Smooth end turns stay inside validated paving; nothing is routed through plazas. */
export function streetShuttleLoops(plan: StreetPlan): THREE.Vector3[][] {
  const paths: THREE.Vector3[][] = [], centers: THREE.Vector2[] = [];
  for (const axis of ["x", "z"] as const) for (const point of plan.vehicles.values()) {
    if (paths.length >= 6) return paths;
    const dx = axis === "x" ? 1 : 0, dz = axis === "z" ? 1 : 0;
    if (plan.vehicles.has(cellKey(point.x - dx, point.y - dz))) continue;
    let length = 1;
    while (plan.vehicles.has(cellKey(point.x + dx * length, point.y + dz * length))) length++;
    if (length < 10) continue;
    const middle = new THREE.Vector2(point.x + dx * length / 2, point.y + dz * length / 2);
    if (centers.some((p) => p.distanceTo(middle) < 10)) continue;
    const a = new THREE.Vector3(point.x + dx * 1.5, 0.04, point.y + dz * 1.5);
    const b = new THREE.Vector3(point.x + dx * (length - 2.5), 0.04, point.y + dz * (length - 2.5));
    const direction = new THREE.Vector3(dx, 0, dz), right = new THREE.Vector3(dz, 0, -dx);
    const route: THREE.Vector3[] = [];
    const line = (from: THREE.Vector3, to: THREE.Vector3) => {
      const count = Math.ceil(from.distanceTo(to) * 4);
      for (let i = 0; i < count; i++) route.push(from.clone().lerp(to, i / count));
    };
    line(a.clone().addScaledVector(right, STREETS.laneOffset), b.clone().addScaledVector(right, STREETS.laneOffset));
    for (let i = 0; i <= 20; i++) {
      const angle = i / 20 * Math.PI;
      route.push(b.clone().addScaledVector(right, Math.cos(angle) * STREETS.laneOffset)
        .addScaledVector(direction, Math.sin(angle) * STREETS.laneOffset));
    }
    line(b.clone().addScaledVector(right, -STREETS.laneOffset), a.clone().addScaledVector(right, -STREETS.laneOffset));
    for (let i = 0; i <= 20; i++) {
      const angle = i / 20 * Math.PI;
      route.push(a.clone().addScaledVector(right, -Math.cos(angle) * STREETS.laneOffset)
        .addScaledVector(direction, -Math.sin(angle) * STREETS.laneOffset));
    }
    route.push(route[0]!.clone());
    const clean = route.filter((p, i) => !i || p.distanceToSquared(route[i - 1]!) > 1e-10);
    if (clean.every((p, i) => {
      const next = clean[i + 1] ?? clean[1]!;
      return vehicleFitsStreet(p, Math.atan2(next.x - p.x, next.z - p.z), plan);
    })) { paths.push(clean); centers.push(middle); }
  }
  return paths;
}

/** Oriented footprint separation for lightweight ambient yielding, not simulation rules. */
export function carsOverlap(a: THREE.Vector3, yawA: number, b: THREE.Vector3, yawB: number) {
  const axes = [yawA, yawA + Math.PI / 2, yawB, yawB + Math.PI / 2];
  const radius = (axis: number, yaw: number) => Math.abs(Math.cos(axis - yaw)) * (STREETS.carHalfWidth + 0.025) +
    Math.abs(Math.sin(axis - yaw)) * (STREETS.carHalfLength + 0.025);
  return axes.every((axis) => Math.abs((b.x - a.x) * Math.cos(axis) + (b.z - a.z) * -Math.sin(axis)) < radius(axis, yawA) + radius(axis, yawB));
}
