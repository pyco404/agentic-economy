import { hashSeed, type BuildingVisual } from "./layout";

export const pastelWalls = {
  sandstone: "#e2cb9f", cream: "#f0e3c6", clay: "#d6af91",
  sage: "#c2d1ad", stone: "#ced0c4", blueGrey: "#b7cbd8",
  peach: "#e4b9a2", teal: "#b7d4cb",
} as const;
export const buildingWallFamilies = {
  residential: [pastelWalls.cream, pastelWalls.peach, pastelWalls.sage],
  apartment: [pastelWalls.sandstone, pastelWalls.stone, pastelWalls.blueGrey],
  commercial: [pastelWalls.cream, pastelWalls.sandstone, pastelWalls.teal],
  industrial: [pastelWalls.stone, pastelWalls.clay, pastelWalls.sandstone],
  civic: [pastelWalls.cream, pastelWalls.teal, pastelWalls.blueGrey],
} as const;
export function buildingColorFamily(b: BuildingVisual): keyof typeof buildingWallFamilies {
  const kind = b.sourceKind ?? (b.kind === "house" && b.floors >= 4 ? "apartment" : b.kind);
  if (kind === "apartment") return "apartment";
  if (["town_hall", "town-hall", "headquarters"].includes(kind)) return "civic";
  if (["market", "bakery"].includes(kind)) return "commercial";
  if (["warehouse", "factory", "mill", "lumber_yard", "lumber-yard", "quarry", "power_station", "power-station"].includes(kind)) return "industrial";
  return "residential";
}

/** A neighborhood base tone with alternating parcel tones and sparse seeded variation. Roof/branding
 * indices remain authoritative inputs to the existing frontend roof palette. */
export function buildingWallColor(b: BuildingVisual): string {
  if (b.material === "glass") return pastelWalls.blueGrey;
  const family = buildingWallFamilies[buildingColorFamily(b)];
  const block = hashSeed(1209, Math.floor(b.x / 16), Math.floor(b.z / 16));
  const detail = hashSeed(b.seed, 391, 733);
  const parcel = Math.floor(b.x / 4) + Math.floor(b.z / 4) * 2;
  const offset = detail % 4 === 0 ? 1 + ((detail >>> 3) % 2) : 0;
  let index = ((block + parcel + offset) % family.length + family.length) % family.length;
  if (["#759bbd", "#97b9cf", "#86aaa0"].includes(b.roofColor) && family[index] === pastelWalls.blueGrey)
    index = (index + 1) % family.length;
  return family[index]!;
}
