import type { Part } from "./geometry";
import type { BuildingVisual } from "./layout";
import { cityPalette } from "./palette";

/** Presentation families follow the authoritative kind; no new economic types. */
export function windowFamily(b: BuildingVisual) {
  const kind = b.sourceKind ?? b.kind;
  if (kind === "house") return "house";
  if (kind === "apartment") return "apartment";
  if (kind === "headquarters") return "office";
  if (kind === "town_hall" || kind === "town-hall") return "civic";
  return "workshop";
}

/** Local +z faces out of the facade. Glass is behind the projecting reveal,
 * rather than transparent or cut into the solid wall with expensive booleans. */
export function generateWindow(
  width: number,
  height: number,
  options: { framed: boolean; mullion: boolean; reflection: boolean; sill: boolean },
): Part[] {
  const parts: Part[] = [];
  const add = (role: Part["role"], color: string, x: number, y: number, z: number,
    sx: number, sy: number, sz: number, detail = false) => parts.push({
      geometry: "box", role, color, position: [x, y, z], scale: [sx, sy, sz],
      detail, outline: false,
    });
  add("window", cityPalette.window, 0, 0, 0.025, width, height, 0.035);
  // Opaque, softly colored reflection: no environment map, transparency or pass.
  if (options.reflection)
    add("window-reflection", cityPalette.windowReflection, 0, height * 0.23,
      0.047, width * 0.84, height * 0.18, 0.008);
  if (options.framed) {
    for (const side of [-1, 1])
      add("window-frame", cityPalette.windowFrame, side * (width / 2 + 0.025),
        0, 0.06, 0.05, height, 0.09, true);
    add("window-frame", cityPalette.windowFrame, 0, height / 2 + 0.025,
      0.06, width + 0.1, 0.05, 0.09, true);
    add("window-frame", cityPalette.windowFrame, 0, -height / 2 - 0.025,
      0.06, width + 0.1, 0.05, 0.09, true);
  }
  if (options.mullion)
    add("window-frame", cityPalette.windowFrame, 0, 0, 0.065,
      0.045, height, 0.045, true);
  if (options.sill)
    add("window-frame", cityPalette.windowFrame, 0, -height / 2 - 0.085,
      0.09, width + 0.16, 0.07, 0.2, true);
  return parts;
}
