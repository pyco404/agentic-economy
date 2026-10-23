import type { Part } from './geometry';
import type { FrontierData } from './frontier';
import { hashSeed, random, type ChunkVisual } from './layout';
import { railTerrain } from './railTerrain';
import type { ScenicRail, ScenicFootprint } from './outskirts';

export const GROUND_COVER = { radius: .7, railMargin: 3.4, maxClusters: 1100,
  tones: ['#93aa78', '#a3b887', '#b2c397'] } as const;

/** Tiny faceted clusters, not rectangular lawn stamps. Uses two existing shared geometries. */
export function grassCluster(x: number, z: number, level: number, seed: number, shrub = false): Part[] {
  const rng = random(hashSeed(seed + 1759, Math.round(x * 20), Math.round(z * 20)));
  const parts: Part[] = [];
  for (let i = 0; i < 3; i++) {
    const angle = rng() * Math.PI * 2, radius = rng() * .32, height = .24 + rng() * .24;
    parts.push({ geometry: 'cone', role: 'ground-grass', color: GROUND_COVER.tones[Math.floor(rng() * 3)]!,
      position: [x + Math.cos(angle) * radius, level + height / 2, z + Math.sin(angle) * radius],
      scale: [.12 + rng() * .12, height, .12 + rng() * .12], rotation: [(rng() - .5) * .45, angle, (rng() - .5) * .45] });
  }
  if (shrub) parts.push({ geometry: 'round', role: 'ground-shrub', color: GROUND_COVER.tones[0],
    position: [x + .28, level + .18, z - .18], scale: [.55, .36, .48] });
  return parts;
}

/** Worker-only, renderer-only cover on retained dry land. Never alters parcels or navigation. */
export function planGroundCover(chunks: ChunkVisual[], frontier: FrontierData, seed: number,
  footprint: ScenicFootprint, rails: readonly ScenicRail[] = [], infrastructure: readonly Part[] = [],
  streets: ReadonlyMap<string, unknown> = new Map(), catalog?: { cx: number; cy: number }[]) {
  const loaded = new Map(chunks.map(c => [`${c.x}:${c.z}`, c]));
  const canonical = new Set((catalog?.length ? catalog : chunks.map(c => ({ cx: c.x, cy: c.z }))).map(c => `${c.cx}:${c.cy}`));
  const ground = railTerrain(chunks, frontier), water = railTerrain([], { ...frontier, positions: [] });
  const cell = (x: number, z: number) => {
    const cx = Math.floor(x / 32), cz = Math.floor(z / 32), c = loaded.get(`${cx}:${cz}`);
    return c ? c.terrain?.[(Math.floor(z) - cz * 32) * 32 + Math.floor(x) - cx * 32] : undefined;
  };
  type Obstacle = { x: number; z: number; w: number; d: number };
  const buckets = new Map<string, Obstacle[]>();
  const reserve = (o: Obstacle) => {
    for (let x = Math.floor((o.x - o.w / 2 - 3) / 8); x <= Math.floor((o.x + o.w / 2 + 3) / 8); x++)
      for (let z = Math.floor((o.z - o.d / 2 - 3) / 8); z <= Math.floor((o.z + o.d / 2 + 3) / 8); z++) {
        const key = `${x}:${z}`, list = buckets.get(key) ?? []; list.push(o); buckets.set(key, list);
      }
  };
  for (const c of chunks) {
    for (const b of c.buildings) {
      const swap = !b.sourceKind && Math.abs(Math.sin(b.rotation)) > .5;
      reserve({ x: b.x, z: b.z, w: (swap ? b.depth : b.width) + 1.4, d: (swap ? b.width : b.depth) + 1.4 });
      const e = b.entrance ?? { x: b.x + Math.sin(b.rotation) * (b.depth / 2 + 1), z: b.z + Math.cos(b.rotation) * (b.depth / 2 + 1) };
      reserve({ ...e, w: 3.6, d: 3.6 });
    }
    for (const t of c.trees) reserve({ x: t.x, z: t.z, w: 1.1, d: 1.1 });
    for (const p of c.props ?? []) reserve({ x: p.x, z: p.z, w: 1, d: 1 });
  }
  for (const p of [...infrastructure, ...frontier.parts]) {
    if (p.role === 'ground-grass' || p.role === 'ground-shrub' || p.position[1] + p.scale[1] / 2 < -.4) continue;
    const yaw = p.rotation?.[1] ?? 0;
    reserve({ x: p.position[0], z: p.position[2], w: Math.abs(Math.cos(yaw)) * p.scale[0] + Math.abs(Math.sin(yaw)) * p.scale[2],
      d: Math.abs(Math.sin(yaw)) * p.scale[0] + Math.abs(Math.cos(yaw)) * p.scale[2] });
  }
  const nearRail = (x: number, z: number, margin: number) => rails.some(path => {
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1]!, b = path.points[i]!, dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - a.x - t * dx, z - a.z - t * dz) < margin) return true;
    }
    return false;
  });
  const safe = (x: number, z: number) => {
    if ((buckets.get(`${Math.floor(x / 8)}:${Math.floor(z / 8)}`) ?? []).some(o =>
      Math.abs(o.x - x) < o.w / 2 + GROUND_COVER.radius && Math.abs(o.z - z) < o.d / 2 + GROUND_COVER.radius)) return false;
    if (nearRail(x, z, GROUND_COVER.railMargin + GROUND_COVER.radius)) return false;
    let min = Infinity, max = -Infinity;
    for (const dx of [-.9, 0, .9]) for (const dz of [-.9, 0, .9]) {
      const px = x + dx, pz = z + dz;
      if (!footprint.contains(px, pz) || water(px, pz)?.wet) return false;
      const coord = `${Math.floor(px / 32)}:${Math.floor(pz / 32)}`;
      if (canonical.has(coord) && cell(px, pz) !== 'g') return false;
      const g = ground(px, pz); if (!g || g.wet) return false;
      if (streets.has(`${Math.floor(px / .25)}:${Math.floor(pz / .25)}`)) return false;
      min = Math.min(min, g.height); max = Math.max(max, g.height);
    }
    return max - min < .22;
  };
  const points = new Map<string, { x: number; z: number; rank: number }>();
  const tiles = new Set<string>();
  for (const c of chunks) for (let x = c.x * 4; x < (c.x + 1) * 4; x++) for (let z = c.z * 4; z < (c.z + 1) * 4; z++) tiles.add(`${x}:${z}`);
  for (let i = 0; i < frontier.positions.length; i += 3) tiles.add(`${Math.floor(frontier.positions[i]! / 8)}:${Math.floor(frontier.positions[i + 2]! / 8)}`);
  for (const key of [...tiles].sort()) {
    const [tx, tz] = key.split(':').map(Number);
    for (let i = 0; i < 18; i++) {
      const rng = random(hashSeed(seed + 2819 + i, tx!, tz!));
      const x = tx! * 8 + .8 + rng() * 6.4, z = tz! * 8 + .8 + rng() * 6.4;
      const region = hashSeed(seed + 941, Math.floor(x / 18), Math.floor(z / 18)) / 0xffffffff;
      if (rng() > .35 + region * .4) continue;
      const c = loaded.get(`${Math.floor(x / 32)}:${Math.floor(z / 32)}`);
      if (c) {
        const edge = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dz]) => !canonical.has(`${c.x + dx!}:${c.z + dz!}`) &&
          (dx === -1 ? x - c.x * 32 : dx === 1 ? (c.x + 1) * 32 - x : dz === -1 ? z - c.z * 32 : (c.z + 1) * 32 - z) < 12);
        const rural = chunks.some(chunk => chunk.buildings.some(b => ['farm', 'mill', 'warehouse', 'power-station', 'lumber-yard', 'quarry'].includes(b.kind) && Math.hypot(x - b.x, z - b.z) < 14));
        const bank = [[-3, 0], [3, 0], [0, -3], [0, 3]].some(([dx, dz]) => cell(x + dx!, z + dz!) === 'w');
        if (!edge && !rural && !bank) continue;
      }
      points.set(`${x}:${z}`, { x, z, rank: hashSeed(seed + 659, Math.round(x * 100), Math.round(z * 100)) });
    }
  }
  const accepted = new Map<string, { x: number; z: number }[]>(), parts: Part[] = [];
  let clusters = 0;
  for (const p of [...points.values()].sort((a, b) => a.rank - b.rank || a.x - b.x || a.z - b.z)) {
    if (clusters >= GROUND_COVER.maxClusters) break;
    const gx = Math.floor(p.x / 3), gz = Math.floor(p.z / 3);
    if ([-1, 0, 1].some(dx => [-1, 0, 1].some(dz => (accepted.get(`${gx + dx}:${gz + dz}`) ?? []).some(q => Math.hypot(q.x - p.x, q.z - p.z) < 1.7)))) continue;
    if (!safe(p.x, p.z)) continue;
    // Broader fields get clusters; infrastructure verges remain visibly sparse and low.
    const verge = nearRail(p.x, p.z, 8) ||
      (buckets.get(`${Math.floor(p.x / 8)}:${Math.floor(p.z / 8)}`) ?? []).some(o => Math.abs(o.x - p.x) < o.w / 2 + 2.5 && Math.abs(o.z - p.z) < o.d / 2 + 2.5) ||
      [[-2.5, 0], [2.5, 0], [0, -2.5], [0, 2.5]].some(([dx, dz]) => 'rpbx'.includes(cell(p.x + dx!, p.z + dz!) ?? '?'));
    if (verge && p.rank % 2 !== 0) continue;
    const shrub = p.rank % 17 === 0 && !verge;
    const cluster = grassCluster(p.x, p.z, ground(p.x, p.z)!.height, seed, shrub);
    for (const part of cluster) part.position[1] += (ground(part.position[0], part.position[2])?.height ?? ground(p.x, p.z)!.height) - ground(p.x, p.z)!.height;
    parts.push(...cluster); clusters++;
    const key = `${gx}:${gz}`, list = accepted.get(key) ?? []; list.push(p); accepted.set(key, list);
  }
  return { parts, clusters };
}
