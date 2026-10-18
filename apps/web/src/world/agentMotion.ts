import * as THREE from "three";
import { isLand, random, type BuildingVisual, type ChunkVisual } from "./layout";

export const AGENT_MOTION = { demoMinSpeed: 1.1, demoSpeedVariation: 0.65,
  demoMinIdle: 1.5, demoIdleVariation: 3, liveMaxGap: 8, liveSearchBudget: 192,
  demoSearchBudget: 4096 } as const;
export type PathNetwork = Map<string, THREE.Vector2>;
const key = (x: number, z: number) => `${Math.floor(x)}:${Math.floor(z)}`;
export function agentSeed(id: string) {
  return [...id].reduce((seed, letter) => Math.imul(seed ^ letter.charCodeAt(0), 16777619) >>> 0, 2166136261);
}
export function buildPathNetwork(chunks: ChunkVisual[], seed: number, vehicleOnly = false): PathNetwork {
  const network: PathNetwork = new Map();
  for (const chunk of chunks) {
    const size = chunk.size ?? 32;
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      const wx = chunk.x * size + x, wz = chunk.z * size + z;
      const code = chunk.terrain?.[z * size + x];
      const fixtureRoad = !chunk.terrain && isLand(wx + 0.5, wz + 0.5, seed) &&
        (((wx % 16) + 16) % 16 < 2 || ((wz % 16) + 16) % 16 < 2);
      if ((code && (vehicleOnly ? "rb" : "rpb").includes(code)) || fixtureRoad)
        network.set(key(wx, wz), new THREE.Vector2(wx + 0.5, wz + 0.5));
    }
  }
  return network;
}
function neighbors(point: THREE.Vector2, network: PathNetwork) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].flatMap(([dx, dz]) => {
    const next = network.get(key(point.x + dx!, point.y + dz!));
    return next ? [next] : [];
  });
}
/** Bounded visual reconstruction between known samples; never predicts a live destination. */
export function pathBetween(network: PathNetwork, from: THREE.Vector2, to: THREE.Vector2,
  budget: number = AGENT_MOTION.liveSearchBudget): THREE.Vector2[] | null {
  const start = network.get(key(from.x, from.y)), end = network.get(key(to.x, to.y));
  if (!start || !end) return null;
  const queue = [start], previous = new Map<string, THREE.Vector2 | null>([[key(start.x, start.y), null]]);
  for (let i = 0; i < queue.length && i < budget; i++) {
    const point = queue[i]!;
    if (point.equals(end)) {
      const route = [to.clone()];
      let current: THREE.Vector2 | null = point;
      while (current) { route.push(current); current = previous.get(key(current.x, current.y)) ?? null; }
      route.push(from.clone());
      return route.reverse().filter((p, j, list) => !j || !p.equals(list[j - 1]!));
    }
    for (const next of neighbors(point, network)) {
      const id = key(next.x, next.y);
      if (previous.has(id)) continue;
      previous.set(id, point); queue.push(next);
    }
  }
  return null;
}
/** Reconnect recovery follows the same connected paths, at the published walking
 * rate, instead of snapping across buildings or water. Null means wait for terrain. */
export function observedJourney(network: PathNetwork, from: THREE.Vector2, to: THREE.Vector2, tickMs: number) {
  const path = pathBetween(network, from, to, Math.max(AGENT_MOTION.liveSearchBudget, network.size));
  if (!path) return null;
  const length = path.reduce((sum,p,i)=>sum+(i?p.distanceTo(path[i-1]!):0),0);
  return { path, duration: Math.max(tickMs, length / 2 * tickMs) };
}
export function samplePath(path: THREE.Vector2[], progress: number, out: THREE.Vector2) {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += path[i]!.distanceTo(path[i - 1]!);
  let remaining = THREE.MathUtils.clamp(progress, 0, 1) * length;
  for (let i = 1; i < path.length; i++) {
    const span = path[i]!.distanceTo(path[i - 1]!);
    if (remaining <= span && span > 0) return out.lerpVectors(path[i - 1]!, path[i]!, remaining / span);
    remaining -= span;
  }
  return out.copy(path.at(-1) ?? out);
}

/** Offline fixtures only. No commands, production events, or backend state writes. */
export function createDemoWalkers(network: PathNetwork, buildings: BuildingVisual[]) {
  const roads = [...network.values()];
  const nearest = (x: number, z: number) => roads.reduce<THREE.Vector2 | null>((best, point) =>
    !best || (point.x - x) ** 2 + (point.y - z) ** 2 < (best.x - x) ** 2 + (best.y - z) ** 2 ? point : best, null);
  const places = buildings.filter((b) => ["town-hall", "market", "headquarters", "bakery"].includes(b.kind))
    .map((b) => nearest(b.entrance?.x ?? b.x, b.entrance?.z ?? b.z)).filter((p): p is THREE.Vector2 => !!p);
  const walkers = new Map<string, { position: THREE.Vector2; route: THREE.Vector2[]; next: number;
    idleUntil: number; speed: number; rng: () => number; visits: boolean }>();
  return {
    position(id: string, x: number, z: number, time: number, dt: number, frozen: boolean) {
      let walker = walkers.get(id);
      if (!walker) {
        const rng = random(agentSeed(id));
        walker = { position: (nearest(x, z) ?? new THREE.Vector2(x, z)).clone(), route: [], next: 0,
          idleUntil: time + rng() * AGENT_MOTION.demoIdleVariation,
          speed: AGENT_MOTION.demoMinSpeed + rng() * AGENT_MOTION.demoSpeedVariation,
          visits: rng() > 0.5, rng };
        walkers.set(id, walker);
      }
      if (!frozen && time >= walker.idleUntil) {
        if (walker.next >= walker.route.length) {
          let route: THREE.Vector2[] | null = null;
          if (walker.visits && places.length) route = pathBetween(network, walker.position,
            places[Math.floor(walker.rng() * places.length)]!, AGENT_MOTION.demoSearchBudget);
          if (!route || route.length < 2) {
            route = [walker.position.clone()];
            for (let i = 0; i < 12; i++) {
              const options = neighbors(route.at(-1)!, network).filter((p) => !p.equals(route!.at(-2) ?? new THREE.Vector2(Infinity, Infinity)));
              if (!options.length) break;
              route.push(options[Math.floor(walker.rng() * options.length)]!);
            }
          }
          walker.route = route; walker.next = 1;
        }
        let step = walker.speed * dt;
        while (step > 0 && walker.next < walker.route.length) {
          const destination = walker.route[walker.next]!, distance = walker.position.distanceTo(destination);
          if (step < distance) { walker.position.lerp(destination, step / distance); step = 0; }
          else { walker.position.copy(destination); step -= distance; walker.next++; }
        }
        if (walker.next >= walker.route.length)
          walker.idleUntil = time + AGENT_MOTION.demoMinIdle + walker.rng() * AGENT_MOTION.demoIdleVariation;
      }
      return walker.position;
    },
    prune(ids: Set<string>) { for (const id of walkers.keys()) if (!ids.has(id)) walkers.delete(id); },
  };
}
