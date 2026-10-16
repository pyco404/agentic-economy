import * as THREE from "three";
import type { Part } from "./geometry";
import { hashSeed, isLand, random, type ChunkVisual } from "./layout";
import { cityPalette } from "./palette";
import { districtSpecies } from "./vegetation";
import { generateTreeParts } from "./vegetationGeometry";

export type FrontierStyle = "frontier" | "coastal";
export interface FrontierData {
  positions: number[];
  colors: number[];
  water: number[];
  waterColors: number[];
  parts: Part[];
  shimmer: { x: number; y: number; z: number; phase: number }[];
  style: FrontierStyle;
}
const ease = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Visual motion only; bounded ground-level drift outside authoritative chunks. */
export function frontierDrift(seconds: number, phase: number) {
  return { x: Math.sin(seconds * 0.12 + phase) * 0.45,
    z: Math.cos(seconds * 0.09 + phase) * 0.25,
    opacity: 0.055 + (Math.sin(seconds * 0.18) + 1) * 0.025 };
}

/** Scenic planning hints are never returned as world chunks, buildings or routes. */
export function generateFrontier(seed: number, chunks: ChunkVisual[],
  catalog?: { cx: number; cy: number }[], style: FrontierStyle = "frontier"): FrontierData {
  const output: FrontierData = { positions: [], colors: [], water: [], waterColors: [], parts: [], shimmer: [], style };
  const coords = catalog?.length ? catalog : chunks.map((c) => ({ cx: c.x, cy: c.z }));
  if (!coords.length) return output;
  const occupied = new Set(coords.map((c) => `${c.cx}:${c.cy}`));
  const loaded = new Map(chunks.map((c) => [`${c.x}:${c.z}`, c]));
  const minX = Math.min(...coords.map((c) => c.cx)) * 32,
    maxX = (Math.max(...coords.map((c) => c.cx)) + 1) * 32,
    minZ = Math.min(...coords.map((c) => c.cy)) * 32,
    maxZ = (Math.max(...coords.map((c) => c.cy)) + 1) * 32;
  const inside = (x: number, z: number) => occupied.has(`${Math.floor(x / 32)}:${Math.floor(z / 32)}`);
  const distance = (x: number, z: number) => Math.min(...coords.map((c) => Math.hypot(
    Math.max(c.cx * 32 - x, 0, x - (c.cx + 1) * 32),
    Math.max(c.cy * 32 - z, 0, z - (c.cy + 1) * 32))));
  const phase = (hashSeed(seed, 19, 73) / 0xffffffff) * Math.PI * 2;
  const field = (x: number, z: number) => {
    const gx = Math.floor(x / 48), gz = Math.floor(z / 48),
      tx = ease(0, 1, x / 48 - gx), tz = ease(0, 1, z / 48 - gz);
    const at = (dx: number, dz: number) => hashSeed(seed, gx + dx, gz + dz) / 0xffffffff;
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(0, 0), at(1, 0), tx),
      THREE.MathUtils.lerp(at(0, 1), at(1, 1), tx), tz);
  };
  const heightCache = new Map<string, number>();
  const height = (x: number, z: number) => {
    const key = `${x}:${z}`, cached = heightCache.get(key);
    if (cached !== undefined) return cached;
    const d = distance(x, z);
    let closest = Infinity, edge = 0;
    for (const c of chunks) {
      const px = Math.max(c.x * 32, Math.min(c.x * 32 + 31, Math.floor(x))),
        pz = Math.max(c.z * 32, Math.min(c.z * 32 + 31, Math.floor(z))),
        gap = Math.hypot(x - px, z - pz);
      if (gap < closest) {
        closest = gap;
        edge = Number(c.elevation?.[(pz - c.z * 32) * 32 + px - c.x * 32] ?? "0") * 0.08;
      }
    }
    const rolling = -0.04 + field(x, z) * 1.35;
    const value = THREE.MathUtils.lerp(THREE.MathUtils.lerp(edge, rolling, ease(0, 36, d)),
      -0.4, ease(100, 172, d));
    heightCache.set(key, value);
    return value;
  };
  const exits: { x: number; z: number; nx: number; nz: number; width: number; water: boolean }[] = [];
  for (const c of coords) {
    const chunk = loaded.get(`${c.cx}:${c.cy}`);
    for (const [nx, nz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      if (occupied.has(`${c.cx + nx}:${c.cy + nz}`)) continue;
      const sample = (i: number) => {
        const x = nx ? (nx < 0 ? 0 : 31) : i,
          z = nz ? (nz < 0 ? 0 : 31) : i;
        return chunk?.terrain?.[z * 32 + x] ??
          (chunk && !chunk.terrain && !isLand(c.cx * 32 + x, c.cy * 32 + z, seed) ? "w" : "g");
      };
      for (let i = 0; i < 32;) {
        const water = sample(i) === "w", road = "rb".includes(sample(i));
        if (!water && !road) { i++; continue; }
        const start = i++;
        while (i < 32 && (water ? sample(i) === "w" : "rb".includes(sample(i)))) i++;
        const mid = (start + i) / 2;
        exits.push({ x: c.cx * 32 + (nx ? (nx < 0 ? 0 : 32) : mid),
          z: c.cy * 32 + (nz ? (nz < 0 ? 0 : 32) : mid), nx, nz, width: i - start, water });
      }
    }
  }
  const channels = exits.filter((e) => e.water);
  const waterAt = (x: number, z: number) => {
    if (inside(x, z)) return false;
    if (style === "coastal" && ((x - maxX - 140) / 130) ** 2 +
      ((z - (minZ + maxZ) / 2 - 24) / 150) ** 2 < 1) return true;
    return channels.some((e) => {
      const dx = x - e.x, dz = z - e.z, along = dx * e.nx + dz * e.nz;
      const bend = Math.sin(along / 27 + phase) * 3 * ease(0, 24, along);
      return along >= 0 && Math.abs(-dx * e.nz + dz * e.nx - bend) < e.width / 2 + along * 0.025;
    });
  };
  const land = new THREE.Color(cityPalette.terrain), far = new THREE.Color(cityPalette.parchment),
    meadow = new THREE.Color("#d7d6b7"), waterColor = new THREE.Color(cityPalette.water);
  const tintCache = new Map<string, number[]>();
  const tint = (x: number, z: number, water = false) => {
    const key = `${x}:${z}:${water}`, cached = tintCache.get(key);
    if (cached) return cached;
    const d = distance(x, z), color = (water ? waterColor : land).clone();
    if (!water) color.lerp(meadow, field(x + 18, z - 17) * 0.22 * ease(0, 16, d));
    color.lerp(far, ease(36, 152, d) * (water ? 0.65 : 1));
    const rgb = color.toArray(); tintCache.set(key, rgb); return rgb;
  };
  const waterHeight = (x: number, z: number) => -0.25 - ease(100, 172, distance(x, z)) * 0.22;
  const vertex = (x: number, z: number, water: boolean) => {
    (water ? output.water : output.positions).push(x, water ? waterHeight(x, z) : height(x, z), z);
    (water ? output.waterColors : output.colors).push(...tint(x, z, water));
  };
  const tile = (x: number, z: number, span: number) => {
    const mx = x + span / 2, mz = z + span / 2;
    if (inside(mx, mz)) return;
    const wet = waterAt(mx, mz);
    for (const [dx, dz] of [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]])
      vertex(x + dx! * span, z + dz! * span, wet);
    if (wet) {
      for (const [ax, az, bx, bz] of [[0, 0, 0, 1], [0, 1, 1, 1], [1, 1, 1, 0], [1, 0, 0, 0]]) {
        const ex = x + (ax! + bx!) * span / 2, ez = z + (az! + bz!) * span / 2;
        const ox = ex + (ex - mx) * 0.01, oz = ez + (ez - mz) * 0.01;
        if (inside(ox, oz) || waterAt(ox, oz)) continue;
        const a = [x + ax! * span, z + az! * span], b = [x + bx! * span, z + bz! * span];
        for (const [point, top] of [[a, true], [b, true], [a, false], [a, false], [b, true], [b, false]] as const) {
          output.positions.push(point[0]!, top ? height(point[0]!, point[1]!) : waterHeight(point[0]!, point[1]!), point[1]!);
          output.colors.push(...tint(point[0]!, point[1]!));
        }
      }
    }
  };
  for (let x = minX - 192; x < maxX + 192; x += 8)
    for (let z = minZ - 192; z < maxZ + 192; z += 8) {
      if (inside(x + 4, z + 4)) continue;
      const nearWater = [[0, 0], [4, 4], [8, 8], [0, 8], [8, 0]].some(([dx, dz]) => waterAt(x + dx!, z + dz!));
      const step = nearWater ? 2 : distance(x + 4, z + 4) < 48 ? 4 : 8;
      for (let dx = 0; dx < 8; dx += step) for (let dz = 0; dz < 8; dz += step) tile(x + dx, z + dz, step);
    }
  const clear = (x: number, z: number, radius = 1) => distance(x, z) > radius + 1 &&
    [-1, 0, 1].every((dx) => [-1, 0, 1].every((dz) => !waterAt(x + dx * radius, z + dz * radius)));
  const guide = (x: number, z: number, width: number, depth: number) => {
    if (!clear(x, z, Math.hypot(width, depth) / 2)) return;
    output.parts.push({ geometry: "box", color: "#ded4bd", position: [x, height(x, z) + 0.07, z],
      scale: [width, 0.012, depth] });
  };
  for (const e of exits.filter((e) => !e.water))
    for (let i = 0; i < 7; i++) {
      const d = 3 + i * 4;
      guide(e.x + e.nx * d, e.z + e.nz * d, e.nx ? 2.2 : 0.45, e.nz ? 2.2 : 0.45);
    }
  for (let x = minX - 80; x <= maxX + 80; x += 16)
    for (let z = minZ - 80; z <= maxZ + 80; z += 16) {
      const d = distance(x, z);
      if (d < 8 || d > 64 || hashSeed(seed, x, z) % 3 !== 0) continue;
      guide(x + 1, z, 2, 0.045); guide(x, z + 1, 0.045, 2);
    }
  for (let cx = Math.floor(minX / 32) - 3; cx < maxX / 32 + 3; cx++)
    for (let cz = Math.floor(minZ / 32) - 3; cz < maxZ / 32 + 3; cz++) {
      if (occupied.has(`${cx}:${cz}`)) continue;
      const rng = random(hashSeed(seed, cx, cz)), count = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < count; i++) {
        const x = cx * 32 + 3 + rng() * 26, z = cz * 32 + 3 + rng() * 26,
          scale = 0.65 + rng() * 0.5, d = distance(x, z);
        if (d > 88 || !clear(x, z, 3)) continue;
        if (chunks.some((c) => c.buildings.some((b) => Math.hypot(
          Math.max(0, Math.abs(x - b.x) - b.width / 2), Math.max(0, Math.abs(z - b.z) - b.depth / 2)) < scale * 0.8 + 1))) continue;
        const species = districtSpecies.natural;
        const pieces = generateTreeParts({ x, z, scale, elevation: height(x, z),
          kind: species[Math.floor(rng() * species.length)]!, zone: "natural", placement: "natural" });
        for (const part of pieces) {
          part.color = new THREE.Color(part.color).lerp(far, d > 48 ? 0.58 : 0.35).getHexString();
          part.color = `#${part.color}`;
        }
        output.parts.push(...pieces);
        if (d > 18 && output.shimmer.length < 20)
          output.shimmer.push({ x: x + 2, y: height(x + 2, z) + 0.12, z, phase: rng() * Math.PI * 2 });
      }
    }
  return output;
}
