import { hashSeed, isLand, type BuildingVisual, type ChunkVisual } from "./layout";

export const vegetationPolicy = {
  civic: { retain: 0.06, streetSpacing: 10, scale: 0.7, separation: 5 },
  market: { retain: 0.12, streetSpacing: 8, scale: 0.74, separation: 4 },
  industrial: { retain: 0.08, streetSpacing: 10, scale: 0.68, separation: 5 },
  residential: { retain: 0.48, streetSpacing: 6, scale: 0.84, separation: 3 },
  waterfront: { retain: 0.6, streetSpacing: 8, scale: 0.88, separation: 3 },
  agricultural: { retain: 0.75, streetSpacing: 9, scale: 0.95, separation: 2.2 },
  natural: { retain: 1, streetSpacing: 10, scale: 1, separation: 1.3 },
  park: { retain: 1, streetSpacing: 6, scale: 1, separation: 1.3 },
} as const;
export type VegetationZone = keyof typeof vegetationPolicy;
export type TreeSpecies = "broadleaf" | "evergreen" | "columnar" | "layered" | "ornamental" | "shrub";
export const districtSpecies: Record<VegetationZone, readonly TreeSpecies[]> = {
  civic: ["columnar", "columnar", "ornamental", "layered"],
  market: ["layered", "columnar", "ornamental", "shrub"],
  industrial: ["columnar", "evergreen", "shrub"],
  residential: ["broadleaf", "layered", "ornamental", "evergreen", "columnar"],
  waterfront: ["broadleaf", "layered", "ornamental", "shrub"],
  agricultural: ["evergreen", "broadleaf", "columnar", "layered", "ornamental"],
  natural: ["broadleaf", "evergreen", "columnar", "layered", "ornamental", "shrub"],
  park: ["broadleaf", "evergreen", "columnar", "layered", "ornamental", "shrub"],
};
export interface PlannedTree {
  x: number; z: number; scale: number; elevation: number;
  kind: TreeSpecies; zone: VegetationZone;
  placement: "street" | "landscape" | "natural" | "park";
}

function buildingZone(b: BuildingVisual): VegetationZone {
  if (b.kind === "town-hall" || b.kind === "headquarters") return "civic";
  if (b.districtTheme && b.districtTheme in vegetationPolicy)
    return b.districtTheme as VegetationZone;
  if (["factory", "warehouse", "quarry", "power-station", "lumber-yard"].includes(b.kind)) return "industrial";
  if (["market", "bakery"].includes(b.kind)) return "market";
  if (["farm", "mill"].includes(b.kind)) return "agricultural";
  return "residential";
}

/** Renderer-only landscaping. Never writes, moves, or deletes authoritative props. */
export function planVegetation(chunk: ChunkVisual, seed: number,
  context: ChunkVisual[] = [chunk]): PlannedTree[] {
  const neighbors = context.filter((c) => Math.abs(c.x - chunk.x) <= 1 && Math.abs(c.z - chunk.z) <= 1);
  const lookup = new Map(neighbors.map((c) => [`${c.x}:${c.z}`, c]));
  const buildings = neighbors.flatMap((c) => c.buildings);
  const parks = neighbors.flatMap((c) => c.parks ?? []);
  const size = chunk.size ?? 32;
  const cell = (x: number, z: number) => {
    const cx = Math.floor(x / size), cz = Math.floor(z / size);
    const c = lookup.get(`${cx}:${cz}`);
    if (!c) return undefined;
    const localX = Math.floor(x) - cx * size, localZ = Math.floor(z) - cz * size;
    if (c.terrain) return c.terrain[localZ * size + localX];
    if (!isLand(x, z, seed)) return "w";
    const roadX = ((Math.floor(x) % 16) + 16) % 16;
    const roadZ = ((Math.floor(z) % 16) + 16) % 16;
    return roadX < 2 || roadZ < 2 ? "r" : "g";
  };
  const distanceToParcel = (x: number, z: number, b: BuildingVisual) => {
    const swap = !b.sourceKind && Math.abs(Math.sin(b.rotation)) > 0.5;
    return Math.hypot(
      Math.max(0, Math.abs(x - b.x) - (swap ? b.depth : b.width) / 2),
      Math.max(0, Math.abs(z - b.z) - (swap ? b.width : b.depth) / 2));
  };
  const zoneAt = (x: number, z: number): VegetationZone => {
    if (parks.some((p) => Math.abs(x - p.x) <= p.size / 2 && Math.abs(z - p.z) <= p.size / 2)) return "park";
    let nearest: BuildingVisual | undefined, distance = 12;
    for (const b of buildings) {
      const d = distanceToParcel(x, z, b);
      if (d < distance || (d === distance && b.id < (nearest?.id ?? ""))) {
        nearest = b; distance = d;
      }
    }
    return nearest ? buildingZone(nearest) : "natural";
  };
  const safe = (tree: PlannedTree) => {
    const radius = tree.scale * 0.8;
    if (cell(tree.x, tree.z) !== "g") return false;
    // Check the entire canopy against terrain cells, including neighboring chunks.
    for (let x = Math.floor(tree.x - radius); x <= Math.floor(tree.x + radius); x++)
      for (let z = Math.floor(tree.z - radius); z <= Math.floor(tree.z + radius); z++) {
        const distance = Math.hypot(Math.max(x - tree.x, 0, tree.x - x - 1),
          Math.max(z - tree.z, 0, tree.z - z - 1));
        if (distance < radius && cell(x + 0.5, z + 0.5) !== "g") return false;
      }
    for (const b of buildings) {
      if (distanceToParcel(tree.x, tree.z, b) < radius + 0.65) return false;
      const entrance = b.entrance ?? {
        x: b.x + Math.sin(b.rotation) * (b.depth / 2 + 1),
        z: b.z + Math.cos(b.rotation) * (b.depth / 2 + 1),
      };
      if (Math.hypot(tree.x - entrance.x, tree.z - entrance.z) < radius + 2.5) return false;
    }
    // Leave the fixture park's central fountain and benches accessible.
    if (parks.some((p) => Math.abs(tree.x - p.x) < 3 + radius && Math.abs(tree.z - p.z) < 1.2 + radius)) return false;
    return true;
  };
  const candidates = new Map<string, PlannedTree>();
  const add = (x: number, z: number, sourceScale: number, street: boolean) => {
    const zone = zoneAt(x, z), policy = vegetationPolicy[zone];
    const hash = hashSeed(seed, Math.floor(x), Math.floor(z));
    if (!street && hash / 0x100000000 >= policy.retain) return;
    const scale = zone === "park" || zone === "natural"
      ? sourceScale : Math.min(sourceScale, policy.scale);
    const localX = Math.floor(x) - chunk.x * size, localZ = Math.floor(z) - chunk.z * size;
    const tree: PlannedTree = { x, z, scale,
      elevation: Number(chunk.elevation?.[localZ * size + localX] ?? "0") * 0.08,
      kind: districtSpecies[zone][hash % districtSpecies[zone].length]!, zone,
      placement: street ? "street" : zone === "park" || zone === "natural" ? zone : "landscape" };
    if (safe(tree)) candidates.set(`${x}:${z}`, tree);
  };
  for (const tree of chunk.trees) add(tree.x, tree.z, tree.scale, false);
  // Regular planting strips on grass, two cells from actual roads; never on paths.
  for (let x = chunk.x * size; x < (chunk.x + 1) * size; x++)
    for (let z = chunk.z * size; z < (chunk.z + 1) * size; z++) {
      if (cell(x + 0.5, z + 0.5) !== "g") continue;
      const zone = zoneAt(x + 0.5, z + 0.5), policy = vegetationPolicy[zone];
      if (zone === "natural" || zone === "park") continue;
      const horizontal = cell(x + 0.5, z - 1.5) === "r" || cell(x + 0.5, z + 2.5) === "r";
      const vertical = cell(x - 1.5, z + 0.5) === "r" || cell(x + 2.5, z + 0.5) === "r";
      if ((horizontal && ((x % policy.streetSpacing) + policy.streetSpacing) % policy.streetSpacing === 2) ||
        (vertical && ((z % policy.streetSpacing) + policy.streetSpacing) % policy.streetSpacing === 2))
        add(x + 0.5, z + 0.5, policy.scale, true);
    }
  const priority = { park: 0, street: 1, landscape: 2, natural: 3 };
  const sorted = [...candidates.values()].sort((a, b) => priority[a.placement] - priority[b.placement] ||
    hashSeed(seed, Math.floor(a.x), Math.floor(a.z)) - hashSeed(seed, Math.floor(b.x), Math.floor(b.z)));
  const result: PlannedTree[] = [];
  for (const tree of sorted)
    if (result.every((other) => Math.hypot(tree.x - other.x, tree.z - other.z) >=
      Math.min(vegetationPolicy[tree.zone].separation, vegetationPolicy[other.zone].separation)))
      result.push(tree);
  return result;
}
