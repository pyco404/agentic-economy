import type { Part } from "./geometry";
import type { PlannedTree } from "./vegetation";
import { cityPalette } from "./palette";
import { hashSeed } from "./layout";

export const vegetationTones = {
  broadleaf: ["#7da565", "#92b273"], evergreen: ["#577f68", "#6d9369"],
  ornamental: ["#94b583", "#81a67c"],
} as const;

/** Six silhouettes using the existing shared primitives/materials; no scene per plant.
 * Every crown stays inside the planner's conservative radius of 0.8 * scale. */
export function generateTreeParts(tree: PlannedTree): Part[] {
  const { x, z, scale: s, elevation, kind } = tree;
  const parts: Part[] = [];
  const small = kind === "shrub";
  const variant = hashSeed(714, Math.round(x * 10), Math.round(z * 10)) % 2;
  const leaf = vegetationTones.broadleaf[variant]!;
  const needle = vegetationTones.evergreen[variant]!;
  const soft = vegetationTones.ornamental[variant]!;
  parts.push({ geometry: "cylinder", role: "tree-trunk", color: cityPalette.trunk,
    position: [x, elevation + (small ? 0.08 : 0.7) * s, z],
    scale: [0.16 * s, (small ? 0.16 : 1.4) * s, 0.16 * s] });
  const crown = (geometry: "round" | "cone", color: string,
    dx: number, y: number, width: number, height: number, depth: number) => parts.push({
      geometry, color, role: "tree-crown", position: [x + dx * s, elevation + y * s, z],
      scale: [width * s, height * s, depth * s], outline: true,
    });
  switch (kind) {
    case "broadleaf":
      crown("round", leaf, -0.1, 1.65, 1.4, 1.3, 1.4);
      crown("round", leaf, 0.25, 1.95, 1.05, 1.1, 1.2);
      break;
    case "evergreen":
      crown("cone", needle, 0, 1.3, 1.4, 1.5, 1.4);
      crown("cone", needle, 0, 2.1, 0.95, 1.2, 0.95);
      break;
    case "columnar":
      crown("round", needle, 0, 1.4, 0.85, 1.65, 0.8);
      crown("cone", needle, 0, 2.15, 0.75, 1.8, 0.7);
      break;
    case "layered":
      crown("round", leaf, 0, 1.6, 1.5, 0.8, 1.3);
      crown("round", leaf, 0.05, 2.05, 1.15, 0.7, 1.05);
      break;
    case "ornamental":
      crown("round", soft, -0.1, 1.15, 1.2, 0.8, 1.1);
      crown("round", soft, 0.15, 1.55, 0.9, 0.65, 0.9);
      break;
    case "shrub":
      crown("round", soft, 0, 0.38, 1.2, 0.7, 1.1);
      break;
  }
  return parts;
}
