import * as THREE from 'three';
import type { ChunkVisual } from './layout';
import type { Part } from './geometry';
import { cityPalette } from './palette';

export const LAKE_CHANNEL = { radius: 1.3, bank: .65, clearance: .3, step: .25, sample: .35, bridgeApproach: 1.5, waterLevel: -.25, bedLevel: -.65 } as const;
type Point = { x: number; z: number };
export interface LakeChannel {
  points: Point[];
  original: Map<string, { code: string; level: number }>;
  crossings: { x: number; z: number; clearance: number }[];
  start: Point;
  end: Point;
  width: number;
}
const key = (x: number, z: number) => `${Math.floor(x)}:${Math.floor(z)}`;
export function channelDistance(channel: LakeChannel, x: number, z: number) {
  let best = Infinity;
  for (let i = 1; i < channel.points.length; i++) {
    const a = channel.points[i - 1]!, b = channel.points[i]!;
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  return best;
}
/** Detect actual water bodies. Never assume screen coordinates or mutate server chunks. */
export function planLakeChannel(chunks: readonly ChunkVisual[]): { channel: LakeChannel | null; reason: string } {
  const original: LakeChannel['original'] = new Map();
  for (const c of chunks) {
    if (!c.terrain) continue;
    const size = c.size ?? 32;
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) original.set(key(c.x * size + x, c.z * size + z),
      { code: c.terrain[z * size + x]!, level: Number(c.elevation?.[z * size + x] ?? 0) * .08 });
  }
  const unseen = new Set([...original].filter(([, c]) => 'wb'.includes(c.code)).map(([k]) => k));
  const bodies: Point[][] = [];
  while (unseen.size) {
    const first = unseen.values().next().value!; unseen.delete(first);
    const stack = [first], cells: Point[] = [];
    while (stack.length) {
      const k = stack.pop()!, [x, z] = k.split(':').map(Number) as [number, number];
      cells.push({ x: x + .5, z: z + .5 });
      for (const n of [key(x + 1, z), key(x - 1, z), key(x, z + 1), key(x, z - 1)]) if (unseen.delete(n)) stack.push(n);
    }
    if (cells.length > 60) bodies.push(cells);
  }
  const stats = bodies.map(cells => ({ cells, x: cells.reduce((n, p) => n + p.x, 0) / cells.length,
    z: cells.reduce((n, p) => n + p.z, 0) / cells.length,
    span: Math.max(...cells.map(p => p.z)) - Math.min(...cells.map(p => p.z)) }));
  const river = stats.filter(b => b.span > 40).sort((a, b) => b.span - a.span)[0];
  const lake = stats.filter(b => b !== river && b.x < (river?.x ?? -Infinity) && b.span < 36).sort((a, b) => b.cells.length - a.cells.length)[0];
  if (!river || !lake) return { channel: null, reason: 'Both the western lake and main river must be loaded.' };
  const row = Math.floor(lake.z) + .5;
  const shore = lake.cells.filter(p => Math.abs(p.z - row) < 1).sort((a, b) => b.x - a.x)[0]!;
  const start = { x: shore.x - 2, z: shore.z };
  const end = [...river.cells].sort((a, b) => Math.abs(a.z - row) - Math.abs(b.z - row) || a.x - b.x)[0]!;
  if (end.x - start.x > 90 || end.x - start.x < 12) return { channel: null, reason: 'Unsupported separation between water bodies.' };
  const buildings = chunks.flatMap(c => c.buildings);
  for (const bend of [-.8, -1.3, 0, .8]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(start.x, 0, start.z),
      new THREE.Vector3(start.x + (end.x - start.x) * .3, 0, row + bend),
      new THREE.Vector3(start.x + (end.x - start.x) * .68, 0, row + bend * .65), new THREE.Vector3(end.x, 0, end.z)]);
    const points = curve.getSpacedPoints(Math.ceil(curve.getLength() / LAKE_CHANNEL.sample)).map(p => ({ x: p.x, z: p.z }));
    const margin = LAKE_CHANNEL.radius + LAKE_CHANNEL.bank + LAKE_CHANNEL.clearance;
    if (points.some(p => !original.has(key(p.x, p.z)) || buildings.some(b =>
      Math.hypot(Math.max(0, Math.abs(p.x - b.x) - b.width / 2), Math.max(0, Math.abs(p.z - b.z) - b.depth / 2)) < margin ||
      b.entrance && Math.hypot(p.x - b.entrance.x, p.z - b.entrance.z) < margin))) continue;
    // No plaza, reserved parcel or road junction may be cut.
    const protectedCell = (x: number, z: number) => {
      const code = original.get(key(x, z))?.code;
      if (!code || code === 'x' || code === 'p') return true;
      if (code !== 'r') return false;
      const adjacent = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => 'rbp'.includes(original.get(key(x + dx!, z + dz!))?.code ?? '?'));
      return adjacent.length > 2;
    };
    const channel: LakeChannel = { points, original, start, end, width: LAKE_CHANNEL.radius * 2, crossings: [] };
    const nearby = [...original].filter(([k]) => { const [x, z] = k.split(':').map(Number) as [number, number];
      return channelDistance(channel, x + .5, z + .5) < LAKE_CHANNEL.radius + LAKE_CHANNEL.bank + .5; });
    if (nearby.some(([k]) => { const [x, z] = k.split(':').map(Number) as [number, number]; return protectedCell(x, z); })) continue;
    const roads = nearby.filter(([, c]) => c.code === 'r');
    const xs = [...new Set(roads.map(([k]) => Number(k.split(':')[0])))];
    channel.crossings = xs.map(x => ({ x: x + .5, z: points.reduce((a, b) => Math.abs(a.x - x - .5) < Math.abs(b.x - x - .5) ? a : b).z,
      clearance: Math.min(...roads.filter(([k]) => Number(k.split(':')[0]) === x).map(([, c]) => c.level + .08)) + .25 }));
    return { channel, reason: 'Validated curved lake-to-river connection.' };
  }
  return { channel: null, reason: 'No clear channel alignment: preserve existing parcels, entrances and junctions.' };
}
/** Presentation topology only. Existing road cells remain walkable bridge cells. */
export function channelChunks(chunks: readonly ChunkVisual[], channel: LakeChannel): ChunkVisual[] {
  return chunks.map(c => {
    if (!c.terrain) return c;
    const size = c.size ?? 32, terrain = [...c.terrain]; let changed = false;
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      const i = z * size + x;
      const bridge = 'rb'.includes(terrain[i]!);
      if (channelDistance(channel, c.x * size + x + .5, c.z * size + z + .5) > LAKE_CHANNEL.radius + LAKE_CHANNEL.bank + (bridge ? LAKE_CHANNEL.bridgeApproach : 0)) continue;
      if ('rb'.includes(terrain[i]!)) terrain[i] = 'b';
      else if ('gfs'.includes(terrain[i]!)) terrain[i] = 'w';
      else continue;
      changed = true;
    }
    return changed ? { ...c, terrain: terrain.join(''), geometryKey: `${c.geometryKey}:lake-channel-v1`,
      trees: c.trees.filter(p => channelDistance(channel, p.x, p.z) > 2.3),
      props: c.props?.filter(p => channelDistance(channel, p.x, p.z) > 2.3) } : c;
  });
}
/** Excavate solid ground into quarter-cell riverbed and sloping banks. No blue overlay on dry land. */
export function channelTile(channel: LakeChannel, x: number, z: number): Part[] | null {
  const source = channel.original.get(key(x, z));
  if (!source || source.code === 'w' || channelDistance(channel, x, z) > LAKE_CHANNEL.radius + LAKE_CHANNEL.bank + .71) return null;
  const parts: Part[] = [], step = LAKE_CHANNEL.step;
  for (let dx = -0.5 + step / 2; dx < .5; dx += step) for (let dz = -.5 + step / 2; dz < .5; dz += step) {
    const px = x + dx, pz = z + dz, distance = channelDistance(channel, px, pz);
    const wet = distance <= LAKE_CHANNEL.radius;
    const t = THREE.MathUtils.smoothstep(distance, LAKE_CHANNEL.radius, LAKE_CHANNEL.radius + LAKE_CHANNEL.bank);
    const top = wet ? LAKE_CHANNEL.bedLevel : THREE.MathUtils.lerp(-.25, source.level, t);
    parts.push({ geometry: 'box', role: 'channel-bed', color: wet ? '#b3baa1' : distance < 1.7 ? '#c9cbaa' : '#b4c797',
      position: [px, (top - .9) / 2, pz], scale: [step, top + .9, step] });
    if (wet) parts.push({ geometry: 'box', role: 'channel-water', color: cityPalette.water,
      position: [px, -.265, pz], scale: [step, .03, step] });
  }
  return parts;
}
/** Static bank planting only; keep the full carriageway and sidewalk envelope clear. */
export function channelDetails(channel: LakeChannel, chunk: ChunkVisual): Part[] {
  const parts: Part[] = [], size = chunk.size ?? 32;
  channel.points.forEach((p, i) => {
    if (i % 12 || i < 10 || i > channel.points.length - 10) return;
    const a = channel.points[i - 1]!, b = channel.points[i + 1]!, length = Math.hypot(b.x - a.x, b.z - a.z);
    for (const side of [-1, 1]) {
      const x = p.x - (b.z - a.z) / length * 1.8 * side, z = p.z + (b.x - a.x) / length * 1.8 * side;
      if (Math.floor(x / size) !== chunk.x || Math.floor(z / size) !== chunk.z) continue;
      if (channel.crossings.some(c => Math.abs(c.x - x) < 2.2) || channel.original.get(key(x, z))?.code === 'w') continue;
      const top = -.25 + THREE.MathUtils.smoothstep(1.8, LAKE_CHANNEL.radius, LAKE_CHANNEL.radius + LAKE_CHANNEL.bank) *
        ((channel.original.get(key(x, z))?.level ?? .2) + .25);
      if (i % 24 === 0) parts.push({ geometry: 'round', role: 'channel-rock', color: '#adb5a1',
        position: [x, top + .07, z], scale: [.3, .18, .22] });
      else for (let stem = -1; stem <= 1; stem++) parts.push({ geometry: 'cylinder', role: 'channel-reed', color: '#8fa57d',
        position: [x + stem * .09, top + .17, z + stem * .06], scale: [.035, .34 + stem * .04, .035] });
    }
  });
  return parts;
}
/** Clearance gate for a future boat router; it must not infer bridge navigability from blue pixels. */
export function channelPassage(channel: LakeChannel, beam: number, heightAboveWater: number, margin = .12, draft = .15) {
  return beam > 0 && heightAboveWater > 0 && draft > 0 && draft + margin < LAKE_CHANNEL.waterLevel - LAKE_CHANNEL.bedLevel && beam + margin * 2 < channel.width &&
    channel.crossings.every(c => heightAboveWater + margin < c.clearance);
}
