import type { ChunkVisual } from "./layout";
import type { FrontierData } from "./frontier";
import type { StreetPlan } from "./streets";
import { generateBuilding, generateLandscape, type Part } from "./geometry";
import { railTerrain } from "./railTerrain";
import { railConflicts } from "./railClearance";
import type { RiversidePlan } from "./riversideRail";
import type { RailCut } from "./railExcavation";

/** Mirror the existing generator, never the city. Small outward offsets are
 * tried in order; future expansion fails closed rather than moving parcels. */
export const MIRRORED_RAIL = { maxOffset: 8, offsetStep: 1, phaseSeconds: 40 } as const;
export interface MirroredRail {
  source: RiversidePlan; reflectionZ: number; cuts: RailCut[]; clearedFrontierParts: number[];
  report: { mode: "mirrored" | "unavailable"; centerZ: number; offset: number;
    visibleLength: number; issues: string[]; rejected: { offset: number; issues: string[] }[] };
}
function bounds(part: Part, reflect: number | null = null) {
  const yaw = part.rotation?.[1] ?? 0;
  return { id: "scenery", x: part.position[0], z: reflect === null ? part.position[2] : reflect - part.position[2],
    width: Math.abs(Math.cos(yaw)) * part.scale[0] + Math.abs(Math.sin(yaw)) * part.scale[2],
    depth: Math.abs(Math.sin(yaw)) * part.scale[0] + Math.abs(Math.cos(yaw)) * part.scale[2],
    low: part.position[1] - part.scale[1] / 2, high: part.position[1] + part.scale[1] / 2 };
}
export function planMirroredRail(source: RiversidePlan, chunks: ChunkVisual[], frontier: FrontierData, streets: StreetPlan, seed: number): MirroredRail {
  const sum = Math.min(...chunks.map((c) => c.z * 32)) + Math.max(...chunks.map((c) => (c.z + 1) * 32));
  const report: MirroredRail["report"] = { mode: "unavailable", centerZ: sum / 2, offset: 0,
    visibleLength: source.report.visibleLength ?? 0, issues: [], rejected: [] };
  const failed = () => ({ source: { ...source, path: null, parts: [] }, reflectionZ: sum, cuts: [], clearedFrontierParts: [], report });
  if (!source.path || !source.underground) { report.issues = ["Original connected railway unavailable."]; return failed(); }
  const ground = railTerrain(chunks, frontier), buildings = chunks.flatMap((c) => c.buildings);
  const scenery = [...buildings.flatMap(generateBuilding), ...chunks.flatMap((c) => generateLandscape(c, seed, chunks)), ...frontier.parts.filter((p) => !p.role?.startsWith("tree-"))]
    .filter((p) => p.scale[1] > .25 || p.role?.startsWith("tree-")).map((p) => bounds(p));
  const overlaps = (a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>) =>
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + .02 && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 + .02 &&
    a.low < b.high - .02 && a.high > b.low + .02;
  for (let offset = 0; offset <= MIRRORED_RAIL.maxOffset; offset += MIRRORED_RAIL.offsetStep) {
    const reflectionZ = sum + offset, issues = new Set<string>();
    const points = source.underground.surface.points.map((p) => ({ x: p.x, y: p.y, z: reflectionZ - p.z }));
    for (const hit of railConflicts(points, buildings, 1.6)) issues.add(`Parcel ${hit.id}`);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!;
      const nearby = scenery.filter((s) => s.high > Math.min(a.y, b.y) - .36 && s.low < Math.max(a.y, b.y) + 1.75 &&
        s.x > Math.min(a.x, b.x) - s.width / 2 - 1.6 && s.x < Math.max(a.x, b.x) + s.width / 2 + 1.6 &&
        s.z > Math.min(a.z, b.z) - s.depth / 2 - 1.6 && s.z < Math.max(a.z, b.z) + s.depth / 2 + 1.6);
      if (nearby.length && railConflicts([a, b], nearby, 1.6).length) issues.add(`Train clearance near ${b.x.toFixed(1)},${b.z.toFixed(1)}`);
    }
    // Broad-phase pruning keeps this out of the animation loop and inexpensive.
    const minX = Math.min(...points.map((p) => p.x)) - 2, maxX = Math.max(...points.map((p) => p.x)) + 2;
    const minZ = Math.min(...points.map((p) => p.z)) - 2, maxZ = Math.max(...points.map((p) => p.z)) + 2;
    for (const tile of streets.tiles.values()) {
      const x = (tile.x + .5) * .25, z = (tile.z + .5) * .25;
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      const hit = railConflicts(points, [{ id: "paving", x, z, width: .25, depth: .25 }], 1.6)[0];
      if (hit?.segments.some((i) => Math.min(points[i]!.y, points[i + 1]!.y) - .36 - tile.level - .17 < 1.65)) issues.add("Road/pedestrian headroom");
    }
    // The old, disconnected depot ornament is not part of the through service.
    // Copy its active through-platform instead of placing old access stairs in
    // the opposite neighborhood. The original depot remains untouched.
    const template = source.parts.filter((p) => !(p.position[0] >= 58 && p.position[0] <= 64 && p.position[2] > 5));
    // Extend physical cover only where the destination has shallower ground.
    // Portals, exposed track, grades and service distances are unchanged.
    for (let i = 1; i < source.path.points.length; i += 2) {
      const d = source.path.distances[i]!, p = source.path.points[i]!, a = source.path.points[i - 1]!;
      if (d < source.underground.hiddenStart || d > source.underground.hiddenEnd) continue;
      const g = ground(p.x, reflectionZ - p.z) ?? { height: -.5, wet: false };
      if (g.height - p.y >= 2.05) continue;
      const yaw = Math.atan2(p.x - a.x, p.z - a.z), span = p.distanceTo(a) * 2 + .025;
      const covered = source.underground.galleries.some((gallery) => gallery.some((s) => Math.abs(s.x - p.x) < .6 && Math.abs(s.z - p.z) < .01));
      if (covered) continue;
      for (const side of [-1.45, 1.45]) template.push({ geometry: "box", color: "#c4b89d",
        position: [p.x + Math.cos(yaw) * side, p.y + .57, p.z - Math.sin(yaw) * side], scale: [.28, 1.86, span], rotation: [0, yaw, 0] });
      template.push({ geometry: "box", color: "#c8d0ae", position: [p.x, p.y + 1.625, p.z], scale: [3.2, .25, span], rotation: [0, yaw, 0] });
    }
    const parts = template.map((part) => {
      let copy = { ...part, position: [...part.position] as Part["position"], scale: [...part.scale] as Part["scale"] };
      const b = bounds(copy, reflectionZ), g = ground(b.x, b.z);
      // Same rail elevation; only slender foundation feet meet the actual ground.
      const pier = part.role === "rail-pier" || (part.scale[0] <= .43 && part.scale[2] <= .43 && part.scale[1] > .5 && b.high < 3.3);
      if (pier && g && !g.wet && b.high > g.height) {
        copy = { ...copy, position: [part.position[0], (b.high + g.height - .06) / 2, part.position[2]],
          scale: [part.scale[0], b.high - g.height + .06, part.scale[2]] };
      }
      const footprint = bounds(copy, reflectionZ);
      if (buildings.some((b) => Math.abs(footprint.x - b.x) < (footprint.width + b.width) / 2 + .02 &&
        Math.abs(footprint.z - b.z) < (footprint.depth + b.depth) / 2 + .02)) issues.add("Infrastructure enters a parcel");
      const obstruction = scenery.find((s) => overlaps(footprint, s));
      if (obstruction) issues.add(`Scenery obstruction near ${b.x.toFixed(1)},${b.z.toFixed(1)}: ${obstruction.width.toFixed(2)}x${obstruction.depth.toFixed(2)} at ${obstruction.x.toFixed(1)},${obstruction.z.toFixed(1)}`);
      if (pier && (!g || g.wet)) issues.add(`Foundation lacks dry ground near ${b.x.toFixed(1)},${b.z.toFixed(1)}`);
      return copy;
    });
    if (issues.size) { report.rejected.push({ offset, issues: [...issues] }); continue; }
    report.mode = "mirrored"; report.offset = offset;
    const cuts = source.underground.cuts.map((cut) => ({ ...cut, minZ: reflectionZ - cut.maxZ, maxZ: reflectionZ - cut.minZ }));
    // Reserve only decorative frontier planting intersected by actual works.
    // Drop each whole tree (trunk + crowns), never isolated canopy pieces.
    const works = parts.map((p) => bounds(p, reflectionZ));
    const clearedFrontierParts: number[] = [];
    for (let i = 0; i < frontier.parts.length; i++) {
      if (frontier.parts[i]!.role !== "tree-trunk") continue;
      let end = i + 1;
      while (end < frontier.parts.length && frontier.parts[end]!.role === "tree-crown") end++;
      const tree = frontier.parts.slice(i, end).map((p) => bounds(p));
      const obstructs = tree.some((p) => works.some((w) => overlaps(p, w)) || points.some((rail) =>
        p.high > rail.y - .36 && p.low < rail.y + 1.75 &&
        Math.abs(p.x - rail.x) < p.width / 2 + 1.6 && Math.abs(p.z - rail.z) < p.depth / 2 + 1.6));
      if (obstructs) for (let j = i; j < end; j++) clearedFrontierParts.push(j);
      i = end - 1;
    }
    return { source: { ...source, parts }, reflectionZ, cuts, clearedFrontierParts, report };
  }
  report.issues = report.rejected.at(-1)?.issues ?? ["No safe opposite-edge alignment."];
  return failed();
}
