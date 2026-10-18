import * as THREE from "three";
import { hashSeed, type ChunkVisual } from "./layout";

/** Diffuse turf only: no geometry, elevation, navigation or simulation changes. */
export const TURF = {
  natural: ["#a6bd89", "#b6c99a"],
  residential: ["#b4c797", "#c3d1a9"],
  civic: ["#d0d5b6", "#dce0c7"],
  industrial: ["#bec8a5", "#ced4b9"],
} as const;
export type TurfZone = keyof typeof TURF;
const tones = Object.fromEntries(Object.entries(TURF).map(([zone, colors]) =>
  [zone, colors.map(color => new THREE.Color(color))])) as Record<TurfZone, THREE.Color[]>;
const smooth = (t: number) => t * t * (3 - 2 * t);
function noise(seed: number, x: number, z: number, span: number) {
  const gx = Math.floor(x / span), gz = Math.floor(z / span);
  const tx = smooth(x / span - gx), tz = smooth(z / span - gz);
  const at = (dx: number, dz: number) => hashSeed(seed, gx + dx, gz + dz) / 0xffffffff;
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(0, 0), at(1, 0), tx),
    THREE.MathUtils.lerp(at(0, 1), at(1, 1), tx), tz);
}
/** Broad meadow changes with finer worn-turf variation; continuous at chunk seams. */
export function turfColor(seed: number, x: number, z: number, zone: TurfZone = "natural") {
  const t = noise(seed, x, z, 24) * .68 + noise(seed + 307, x, z, 7) * .32;
  return tones[zone][0]!.clone().lerp(tones[zone][1]!, t);
}

export function createTurfSampler(seed: number, chunks: readonly ChunkVisual[]) {
  const plots = chunks.flatMap(c => c.buildings).map(b => ({
    x: b.x, z: b.z, width: b.width, depth: b.depth,
    zone: (b.kind === "town-hall" || b.kind === "headquarters" || b.floors >= 3 ? "civic" :
      ["factory", "warehouse", "quarry", "power-station", "lumber-yard", "market", "bakery"].includes(b.kind)
        ? "industrial" : b.kind === "farm" || b.kind === "mill" ? "natural" : "residential") as TurfZone,
  }));
  const parks = chunks.flatMap(c => c.parks ?? []);
  return (x: number, z: number) => {
    const natural = turfColor(seed, x, z);
    if (parks.some(p => Math.abs(x - p.x) < p.size / 2 && Math.abs(z - p.z) < p.size / 2)) return natural;
    let distance = 10, zone: TurfZone = "natural";
    for (const p of plots) {
      const d = Math.hypot(Math.max(0, Math.abs(x - p.x) - p.width / 2),
        Math.max(0, Math.abs(z - p.z) - p.depth / 2));
      if (d < distance) { distance = d; zone = p.zone; }
    }
    return natural.lerp(turfColor(seed, x, z, zone), 1 - smooth(distance / 10));
  };
}
