import * as THREE from "three";
import type { Part } from "./geometry";
import type { FrontierData } from "./frontier";
import { hashSeed, isLand, type ChunkVisual } from "./layout";
import { railTerrain } from "./railTerrain";
import { sampleRail, type RiversidePlan } from "./riversideRail";

/** Scenic surfaces only: no parcel, navigation or train-service changes. */
export const WORLD_COMPOSITION = {
  curbWidth: 0.44, curbHeight: 0.12, apronWidth: 1.1,
  railGardenInterval: 15, railGardenOffset: 6, railGardenReach: 64,
} as const;

export function composeCityEdges(chunks: ChunkVisual[], frontier: FrontierData, seed: number,
  railway: RiversidePlan | null, catalog?: { cx: number; cy: number }[]) {
  const parts: Part[] = [];
  const occupied = new Set((catalog?.length ? catalog : chunks.map((c) => ({ cx: c.x, cy: c.z })))
    .map((c) => `${c.cx}:${c.cy}`));
  const loaded = new Map(chunks.map((c) => [`${c.x}:${c.z}`, c]));
  const buildings = chunks.flatMap((c) => c.buildings);
  const ground = railTerrain(chunks, frontier);
  const inside = (x: number, z: number) => occupied.has(`${Math.floor(x / 32)}:${Math.floor(z / 32)}`);
  const cell = (x: number, z: number) => {
    const c = loaded.get(`${Math.floor(x / 32)}:${Math.floor(z / 32)}`);
    return c?.terrain?.[(Math.floor(z) - c.z * 32) * 32 + Math.floor(x) - c.x * 32] ??
      (isLand(x, z, seed) ? "g" : "w");
  };
  const clear = (x: number, z: number, width: number, depth: number) => {
    if (buildings.some((b) => Math.abs(b.x - x) < (b.width + width) / 2 + 0.4 &&
      Math.abs(b.z - z) < (b.depth + depth) / 2 + 0.4)) return false;
    return [-0.5, 0, 0.5].every((dx) => [-0.5, 0, 0.5].every((dz) => {
      const px = x + dx * width, pz = z + dz * depth, g = ground(px, pz);
      return g && !g.wet && (!inside(px, pz) || !"rpbxw".includes(cell(px, pz)));
    }));
  };
  const box = (color: string, x: number, y: number, z: number, w: number, h: number, d: number) =>
    parts.push({ geometry: "box", color, position: [x, y, z], scale: [w, h, d] });
  let edgeSegments = 0, railGardens = 0;
  for (const chunk of chunks) for (const [nx, nz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    if (occupied.has(`${chunk.x + nx}:${chunk.z + nz}`)) continue;
    for (let i = 0; i < 32; i++) {
      const x = chunk.x * 32 + (nx ? (nx < 0 ? 0 : 32) : i + 0.5),
        z = chunk.z * 32 + (nz ? (nz < 0 ? 0 : 32) : i + 0.5);
      // Leave generous openings at roads, pedestrian paving and waterways.
      if ([-1, 0, 1].some((n) => "rpbw".includes(cell(x - nx * .5 + nz * n, z - nz * .5 + nx * n)))) continue;
      const cx = x + nx * .27, cz = z + nz * .27;
      const w = nx ? WORLD_COMPOSITION.curbWidth : .98, d = nz ? WORLD_COMPOSITION.curbWidth : .98;
      if (!clear(cx, cz, w, d)) continue;
      const level = ground(cx, cz)!.height;
      box("#cfc3a8", cx, level + .035, cz, w, WORLD_COMPOSITION.curbHeight, d);
      box("#f1e6cd", cx, level + .107, cz, w + (nx ? .035 : 0), .024, d + (nz ? .035 : 0));
      const ax = x + nx * 1.06, az = z + nz * 1.06;
      const aw = nx ? WORLD_COMPOSITION.apronWidth : .98, ad = nz ? WORLD_COMPOSITION.apronWidth : .98;
      if (clear(ax, az, aw, ad)) box("#d9d9bc", ax, ground(ax, az)!.height + .018, az, aw, .028, ad);
      edgeSegments++;
    }
  }
  // Ground the validated rail approaches with intermittent planted verges.
  // These stay outside developed parcels and outside the entire swept rail bed.
  const path = railway?.underground?.surface ?? railway?.path;
  if (path) {
    const point = new THREE.Vector3(), tangent = new THREE.Vector3();
    // Low dry-land approaches settle into earth, rather than reading as a
    // separate viaduct on stilts. Canal bridges and the high urban span stay open.
    for (let along = 1; along < path.length; along += 1.8) {
      sampleRail(path, along, point, tangent);
      if (inside(point.x, point.z)) continue;
      const g = ground(point.x, point.z);
      if (!g || g.wet) continue;
      const top = point.y - .36, rise = top - g.height;
      if (rise < .1 || rise > 1.25 || !clear(point.x, point.z, 4.4, 4.4)) continue;
      const yaw = Math.atan2(tangent.x, tangent.z);
      parts.push({ geometry: "box", color: "#d2c6a7", position: [point.x, g.height + rise / 2, point.z],
        scale: [1.8, rise, 1.78], rotation: [0, yaw, 0], role: "rail-fill" });
      for (const side of [-1, 1]) {
        const x = point.x + tangent.z * side * 1.55, z = point.z - tangent.x * side * 1.55;
        const land = ground(x, z)!;
        const h = Math.max(.04, Math.min(rise * .45, top - land.height));
        parts.push({ geometry: "box", color: "#ccd3ab", position: [x, land.height + h / 2, z],
          scale: [1.3, h, 1.78], rotation: [0, yaw, 0], role: "rail-fill" });
      }
    }
    for (let along = 5; along < path.length; along += WORLD_COMPOSITION.railGardenInterval) {
      sampleRail(path, along, point, tangent);
      const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
      for (const side of [-1, 1]) {
        const x = point.x + normal.x * side * WORLD_COMPOSITION.railGardenOffset,
          z = point.z + normal.z * side * WORLD_COMPOSITION.railGardenOffset;
        if (inside(x, z)) continue;
        const distance = Math.min(...chunks.map((c) => Math.hypot(
          Math.max(c.x * 32 - x, 0, x - (c.x + 1) * 32),
          Math.max(c.z * 32 - z, 0, z - (c.z + 1) * 32))));
        if (distance > WORLD_COMPOSITION.railGardenReach) continue;
        const tunnel = railway?.underground;
        const nearStation = tunnel && Math.hypot(point.x - 56, point.z + 7) < 22;
        const nearPortal = tunnel && [tunnel.west, tunnel.east].some((p) => Math.hypot(point.x - p.x, point.z - p.z) < 14);
        if (!nearStation && !nearPortal) continue;
        const hash = hashSeed(seed, Math.round(x), Math.round(z));
        const length = 5.6 + (hash % 5) * .45;
        const width = Math.abs(normal.x) > .7 ? 2.8 : length, depth = Math.abs(normal.x) > .7 ? length : 2.8;
        if (!clear(x, z, width, depth)) continue;
        // Check corners against every track sample, including curves and portals.
        if (path.points.some((p) => Math.abs(p.x - x) < width / 2 + 2 && Math.abs(p.z - z) < depth / 2 + 2)) continue;
        const level = ground(x, z)!.height;
        parts.push({ geometry: "sphere", color: distance < 24 ? "#c6d2a5" : "#d5dabc",
          position: [x, level + .025, z], scale: [width, .12, depth] });
        for (let n = 0; n < 3; n++) {
          const px = x + (width > depth ? (n - 1) * 1.8 : 0),
            pz = z + (depth > width ? (n - 1) * 1.8 : 0);
          parts.push({ geometry: "round", color: ["#9fb989", "#aabb90", "#b4c49c"][(hash + n) % 3]!,
            position: [px, ground(px, pz)!.height + .12, pz], scale: [.9 + (hash % 3) * .15, .3, .75] });
        }
        railGardens++;
      }
    }
  }
  return { parts, edgeSegments, railGardens };
}
