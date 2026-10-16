import { roofPalette } from "./palette";
/** Renderer-only presentation configuration. No authoritative economy rules live here. */
export type BuildingKind =
  | "house"
  | "farm"
  | "mill"
  | "bakery"
  | "market"
  | "warehouse"
  | "factory"
  | "headquarters"
  | "town-hall"
  | "lumber-yard"
  | "quarry"
  | "power-station";
export type RoofStyle = "gable" | "hip" | "flat" | "shed" | "sawtooth" | "dome";
export interface BuildingVisual {
  id: string;
  seed: number;
  status?: string;
  inventory?: Record<string, number>;
  condition?: number;
  elevation?: number;
  entrance?: { x: number; z: number };
  sourceKind?: string;
  kind: BuildingKind;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  floors: number;
  roofStyle: RoofStyle;
  roofColor: string;
  material?: "plaster" | "brick" | "timber" | "stone" | "concrete" | "glass";
  windowPattern?: "none" | "grid" | "bands" | "sparse" | "storefront";
  districtTheme?: string;
  rotation: number;
  name: string;
  chunkId: string;
}
export interface ChunkVisual {
  id: string;
  x: number;
  z: number;
  seed: number;
  version?: number;
  geometryKey?: string;
  terrain?: string;
  elevation?: string;
  size?: number;
  buildings: BuildingVisual[];
  parks?: { x: number; z: number; size: number }[];
  props?: { kind: string; x: number; z: number; scale: number; seed: number }[];
  trees: { x: number; z: number; scale: number }[];
}
export const CHUNK_SIZE = 32;
export const WORLD_SEED = 41827;
const roofs = roofPalette.slice(0, 6);
export function hashSeed(seed: number, x: number, z: number): number {
  let h =
    (seed ^ Math.imul(x + 8192, 374761393) ^ Math.imul(z + 8192, 668265263)) >>>
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
export function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shoreline(z: number, seed = WORLD_SEED): number {
  return 46 + Math.sin(z * 0.055 + (seed % 11)) * 5 + Math.sin(z * 0.15) * 2;
}
export function isLand(x: number, z: number, seed = WORLD_SEED): boolean {
  return x < shoreline(z, seed);
}
export function chunkCoordinates(
  activeAgents: number,
): { x: number; z: number }[] {
  // Demo infrastructure capacity preview, not a server-side expansion policy.
  const rings = Math.min(
    2,
    Math.max(0, Math.floor((activeAgents - 180) / 180)),
  );
  const chunks = [];
  for (let x = -2 - rings; x < 2 + rings; x++)
    for (let z = -2 - rings; z < 2 + rings; z++) chunks.push({ x, z });
  return chunks;
}
const labels: Record<BuildingKind, string> = {
  house: "Residence",
  farm: "Wheat farm",
  mill: "Windmill",
  bakery: "Neighborhood bakery",
  market: "Covered market",
  warehouse: "Goods warehouse",
  factory: "Workshop",
  headquarters: "Community headquarters",
  "town-hall": "Genesis town hall",
  "lumber-yard": "Timber yard",
  quarry: "Stone quarry",
  "power-station": "Power station",
};
export function generateChunk(
  seed: number,
  cx: number,
  cz: number,
): ChunkVisual {
  const chunkSeed = hashSeed(seed, cx, cz),
    rng = random(chunkSeed),
    id = `${cx}:${cz}`;
  const parks: NonNullable<ChunkVisual["parks"]> = [];
  const buildings: BuildingVisual[] = [],
    trees: ChunkVisual["trees"] = [];
  const kinds: BuildingKind[] = [
    "house",
    "house",
    "house",
    "house",
    "house",
    "market",
    "bakery",
    "warehouse",
    "factory",
    "farm",
    "mill",
  ];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const x = cx * CHUNK_SIZE + 5 + i * 8,
        z = cz * CHUNK_SIZE + 5 + j * 8;
      const buildingSeed = hashSeed(chunkSeed, i, j),
        r = random(buildingSeed);
      if (!isLand(x + 4, z, seed)) continue;
      let kind = kinds[Math.floor(r() * kinds.length)]!;
      if (cx === 0 && cz === 0 && i === 0 && j === 0) kind = "town-hall";
      if (
        ((cx === -1 && cz === 0) ||
          (cx === 0 && cz === -1) ||
          (cx === -1 && cz === -1)) &&
        i === 1 &&
        j === 1
      )
        kind = "headquarters";
      const forced =
        (cx === 0 &&
          cz === 0 &&
          ((i === 0 && j === 0) ||
            (i === 1 && j === 0) ||
            (i === 0 && j === 1))) ||
        kind === "headquarters";
      const distance = Math.hypot(x, z),
        industrial = cx === -2 && cz === -1;
      if (cx === 0 && cz === 0 && i === 1 && j === 0) kind = "market";
      if (cx === 0 && cz === 0 && i === 0 && j === 1) kind = "bakery";
      if (industrial && i === 1 && j === 1) kind = "factory";
      if (industrial && i === 2 && j === 1) kind = "warehouse";
      if (cx === -2 && cz === 1 && i === 0 && j === 0) kind = "farm";
      if (cx === 1 && cz === 0 && i === 0 && j === 2) kind = "mill";
      const landmark =
        forced ||
        (industrial && (i === 1 || i === 2) && j === 1) ||
        (kind === "mill" && cx === 1 && cz === 0 && i === 0 && j === 2) ||
        (kind === "farm" && cx === -2 && cz === 1 && i === 0 && j === 0);
      if (!landmark && i === 2 && j === 2 && distance < 55) {
        parks.push({ x, z, size: 6 });
        continue;
      }
      if (
        !landmark &&
        r() >
          (distance < 24
            ? 0.85
            : distance < 44
              ? 0.52
              : industrial
                ? 0.35
                : 0.13)
      )
        continue;
      if (!landmark) {
        if (industrial) kind = r() > 0.45 ? "warehouse" : "factory";
        else if (distance > 44) kind = r() > 0.6 ? "farm" : "house";
        else if (distance > 24) kind = r() > 0.86 ? "bakery" : "house";
        else kind = r() > 0.85 ? "market" : "house";
      }
      const floors =
        kind === "headquarters"
          ? 3
          : kind === "town-hall"
            ? 2
            : 1 + Math.floor(r() * (Math.abs(x) + Math.abs(z) < 50 ? 3 : 2));
      buildings.push({
        id: `b:${id}:${i}:${j}`,
        seed: buildingSeed,
        kind,
        x,
        z,
        width: 3.8 + r() * 1.7,
        depth: 3.8 + r() * 1.5,
        height: kind === "farm" ? 2 : floors * 1.65,
        floors,
        roofStyle:
          kind === "warehouse" || kind === "headquarters" || kind === "factory"
            ? "flat"
            : r() > 0.7
              ? "hip"
              : "gable",
        roofColor: roofs[Math.floor(r() * roofs.length)]!,
        rotation: r() > 0.5 ? Math.PI / 2 : 0,
        name: `${labels[kind]} ${buildings.length + 1}`,
        chunkId: id,
        districtTheme: industrial
          ? "industrial"
          : distance > 44
            ? "agricultural"
            : distance > 24
              ? "residential"
              : "market",
      });
    }
  for (let i = 0; i < 15; i++) {
    const x = cx * CHUNK_SIZE + rng() * CHUNK_SIZE,
      z = cz * CHUNK_SIZE + rng() * CHUNK_SIZE;
    if (
      isLand(x + 1, z, seed) &&
      ((x % 16) + 16) % 16 > 2 &&
      ((z % 16) + 16) % 16 > 2 &&
      !buildings.some((b) => Math.abs(b.x - x) < 3.8 && Math.abs(b.z - z) < 3.8)
    )
      trees.push({ x, z, scale: 0.7 + rng() * 0.7 });
  }
  return { id, x: cx, z: cz, seed: chunkSeed, buildings, trees, parks };
}
export function generateWorld(seed: number, agents: number): ChunkVisual[] {
  return chunkCoordinates(agents).map(({ x, z }) => generateChunk(seed, x, z));
}
export function roadPosition(t: number, index: number): [number, number] {
  const span = 64,
    progress =
      (((t * (1.2 + (index % 3) * 0.2) + index * 13) % (span * 4)) + span * 4) %
      (span * 4);
  const left = -48 + (index % 2) * 16,
    top = -48 + (index % 2) * 16;
  if (progress < span) return [left + progress, top];
  if (progress < span * 2) return [left + span, top + progress - span];
  if (progress < span * 3)
    return [left + span - (progress - span * 2), top + span];
  return [left, top + span - (progress - span * 3)];
}
