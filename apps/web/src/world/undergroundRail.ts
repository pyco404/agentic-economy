import * as THREE from "three";
import type { ChunkVisual } from "./layout";
import type { FrontierData } from "./frontier";
import type { StreetPlan } from "./streets";
import { generateBuilding, generateLandscape, type Part } from "./geometry";
import { railTerrain } from "./railTerrain";
import { railConflicts } from "./railClearance";
import { riversidePoints, sampleRail, RIVERSIDE_RAIL, type RailPath, type RiversidePlan } from "./riversideRail";
import type { RailCut } from "./railExcavation";

export const UNDERGROUND_RAIL = { hiddenSeconds: 120, halfLength: 1.3, carriages: 3, spacing: 2.6,
  interiorHeight: 1.5, roof: .25, cover: .3, halfCut: 1.32, halfWorks: 1.6, undergroundLevel: -3 } as const;
export const URBAN_RAIL = { westEntranceX: 20, eastEntranceX: 148, galleryHalfWidth: 1.6 } as const;
export interface UndergroundRoute {
  galleries: { x: number; y: number; z: number; left: number; right: number; leftY: number; rightY: number }[][];
  surface: RailPath; cuts: RailCut[]; west: { x: number; y: number; z: number; distance: number };
  east: { x: number; y: number; z: number; distance: number }; station: number;
  hiddenStart: number; hiddenEnd: number; minCover: number; maxGrade: number; supports: number;
}
export function railPath(points: THREE.Vector3[]): RailPath {
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1]! + points[i]!.distanceTo(points[i - 1]!));
  return { points, distances, length: distances.at(-1)! };
}
export function railGrade(d: number, length: number, from: number, to: number) {
  const ramp = 10, slope = (to - from) / (length - ramp);
  const area = d < ramp ? d * d / (2 * ramp) : d > length - ramp
    ? length - ramp - (length - d) ** 2 / (2 * ramp) : d - ramp / 2;
  return from + slope * area;
}
export function undergroundPoints() {
  const points = riversidePoints().points.filter((p) => p.x >= 68 && p.z <= 1.001);
  for (let i = 1; i <= 26; i++) { const a = Math.PI / 2 + i / 26 * Math.PI / 2;
    points.push(new THREE.Vector3(68 + 4 * Math.cos(a), 3, -3 + 4 * Math.sin(a))); }
  for (let i = 1; i <= 26; i++) { const a = -i / 26 * Math.PI / 2;
    points.push(new THREE.Vector3(60 + 4 * Math.cos(a), 3, -3 + 4 * Math.sin(a))); }
  for (let d = .25; d <= 154; d += .25) points.push(new THREE.Vector3(60 - d, railGrade(d, 154, 3, -3), -7));
  for (let i = 1; i <= 202; i++) { const a = -Math.PI / 2 - i / 202 * Math.PI;
    points.push(new THREE.Vector3(-94 + 16 * Math.cos(a), -3, 9 + 16 * Math.sin(a))); }
  for (let x = -93.75; x <= 274; x += .25) points.push(new THREE.Vector3(x, -3, 25));
  for (let i = 1; i <= 152; i++) { const a = Math.PI / 2 - i / 152 * Math.PI;
    points.push(new THREE.Vector3(274 + 12 * Math.cos(a), -3, 13 + 12 * Math.sin(a))); }
  for (let d = 127.75; d >= 0; d -= .25) points.push(new THREE.Vector3(146 + d, railGrade(d, 128, 1.05, -3), 1));
  return railPath(points);
}

/** Upgrade only after checking the complete continuous swept route and constructed earthworks. */
export function planUndergroundRail(base: RiversidePlan, chunks: ChunkVisual[], frontier: FrontierData, seed: number, streets: StreetPlan): RiversidePlan {
  if (!base.path) return base;
  const path = undergroundPoints(), ground = railTerrain(chunks, frontier), issues: string[] = [];
  const buildings = chunks.flatMap((c) => c.buildings);
  const scenery = [...chunks.flatMap((c) => generateLandscape(c, seed, chunks)), ...frontier.parts];
  const solids = [...buildings.flatMap(generateBuilding), ...scenery.filter((p) => p.scale[1] > .25 || p.role?.startsWith("tree-"))].map((p) => {
    const yaw = p.rotation?.[1] ?? 0;
    return { id: "geometry", x: p.position[0], z: p.position[2], width: Math.abs(Math.cos(yaw)) * p.scale[0] + Math.abs(Math.sin(yaw)) * p.scale[2],
      depth: Math.abs(Math.sin(yaw)) * p.scale[0] + Math.abs(Math.cos(yaw)) * p.scale[2], low: p.position[1] - p.scale[1] / 2, high: p.position[1] + p.scale[1] / 2 };
  });
  const overlaps = (p: Part) => {
    const yaw = p.rotation?.[1] ?? 0, w = Math.abs(Math.cos(yaw)) * p.scale[0] + Math.abs(Math.sin(yaw)) * p.scale[2],
      d = Math.abs(Math.sin(yaw)) * p.scale[0] + Math.abs(Math.cos(yaw)) * p.scale[2];
    const centerY = p.position[1] + (p.geometry === "shed" ? p.scale[1] / 2 : 0);
    return solids.some((s) => Math.abs(p.position[0] - s.x) < (w + s.width) / 2 + .02 &&
      Math.abs(p.position[2] - s.z) < (d + s.depth) / 2 + .02 && centerY + p.scale[1] / 2 > s.low && centerY - p.scale[1] / 2 < s.high);
  };
  const sampleGround = (p: THREE.Vector3, yaw = Math.PI / 2) => [-1.6, -.95, 0, .95, 1.6].map((s) => ground(p.x + Math.cos(yaw) * s, p.z - Math.sin(yaw) * s));
  const portalIndex = (start: number, end: number, step: number) => {
    let lastBad = start;
    for (let i = start; i !== end; i += step) {
      const p = path.points[i]!;
      if (sampleGround(p).some((g) => !g || g.wet || g.height - p.y - 1.75 < .3)) lastBad = i;
    }
    return lastBad + step;
  };
  const westEnd = path.points.findIndex((p) => p.x === -94 && p.z === -7);
  const eastStart = path.points.findIndex((p) => Math.abs(p.x - 274) < .001 && Math.abs(p.z - 1) < .001);
  const naturalWestIndex = portalIndex(0, westEnd + 1, 1), naturalEastIndex = portalIndex(path.points.length - 1, eastStart - 1, -1);
  const westIndex = path.points.findIndex((p) => p.x === URBAN_RAIL.westEntranceX && p.z === -7);
  const eastIndex = path.points.findIndex((p) => p.x === URBAN_RAIL.eastEntranceX && p.z === 1);
  const westPoint = path.points[westIndex]!, eastPoint = path.points[eastIndex]!;
  if (!westPoint || !eastPoint || !path.points[naturalWestIndex] || !path.points[naturalEastIndex] ||
    !(westIndex < naturalWestIndex && naturalWestIndex < naturalEastIndex && naturalEastIndex < eastIndex))
    return { ...base, path: null, parts: [], report: { ...base.report, mode: "unavailable", issues: ["No sustained tunnel cover."] } };
  const westernSurface = path.points.slice(0, naturalWestIndex + 1), easternSurface = path.points.slice(naturalEastIndex);
  for (const line of [westernSurface.filter((p) => p.z < 0), easternSurface]) for (const hit of railConflicts(line, buildings, 1.6)) issues.push(`Parcel obstruction: ${hit.id}`);
  let maxGrade = 0, minCover = Infinity;
  for (let i = 1; i < path.points.length; i++) {
    const p = path.points[i]!, a = path.points[i - 1]!, span = Math.hypot(p.x - a.x, p.z - a.z);
    maxGrade = Math.max(maxGrade, Math.abs(p.y - a.y) / span);
    const yaw = Math.atan2(p.x - a.x, p.z - a.z);
    const covered = i >= naturalWestIndex && i <= naturalEastIndex;
    if (covered) for (const g of sampleGround(p, yaw)) {
      const cover = (g?.height ?? -Infinity) - p.y - 1.75; minCover = Math.min(minCover, cover);
      if (!g || cover < .3) issues.push(`Insufficient underground cover at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
    }
    // Continuous segment/AABB intersection at the full works width and height.
    const existingBridge = p.x >= 68 && p.x <= 146 && p.z > -1 && a.z > -1;
    if (existingBridge) continue; // Full train/deck sweep checked by unchanged base planner.
    const relevant = solids.filter((s) => Math.max(p.y, a.y) + 1.75 > s.low && Math.min(p.y, a.y) - .36 < s.high &&
      s.x > Math.min(a.x, p.x) - s.width / 2 - 1.6 && s.x < Math.max(a.x, p.x) + s.width / 2 + 1.6 &&
      s.z > Math.min(a.z, p.z) - s.depth / 2 - 1.6 && s.z < Math.max(a.z, p.z) + s.depth / 2 + 1.6);
    if (relevant.length && railConflicts([a, p], relevant, 1.6).length) issues.push(`Full-height obstruction at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
  }
  if (maxGrade > RIVERSIDE_RAIL.maxGrade) issues.push("Grade exceeds 4.5%.");
  const tileAt = (x: number, z: number) => streets.tiles.get(`${Math.floor(x / .25)}:${Math.floor(z / .25)}`);
  // Existing urban canal bridge remains exactly as validated by the base planner.
  // All new approaches must be dry, and cannot occupy or obstruct existing paving.
  const extension = [...westernSurface.filter((p) => p.z < 0), ...easternSurface.filter((p) => p.x > 146)];
  for (const p of extension) for (const g of sampleGround(p)) if (!g || g.wet) issues.push("New approach crosses water or unknown terrain.");
  for (const tile of streets.tiles.values()) {
    const obstacle = { id: "paving", x: (tile.x + .5) * .25, z: (tile.z + .5) * .25, width: .25, depth: .25 };
    if (obstacle.z > 2.8 || obstacle.z < -8.8) continue;
    for (const line of [westernSurface.filter((p) => p.z < 0), easternSurface]) {
      if (line.length < 2) continue;
      const hit = railConflicts(line, [obstacle], 1.6)[0];
      if (hit?.segments.some((i) => Math.min(line[i]!.y, line[i + 1]!.y) - .36 - tile.level - .17 < 1.65)) issues.push("New works obstruct paving.");
    }
  }
  const cuts: RailCut[] = [];
  for (const [line, portal, west] of [[path.points.slice(0, naturalWestIndex + 1).filter((p) => p.z === -7), path.points[naturalWestIndex]!, true],
    [path.points.slice(naturalEastIndex), path.points[naturalEastIndex]!, false]] as const) {
    const cutting = line.filter((p) => sampleGround(p).some((g) => g && p.y - .36 < g.height + .08));
    if (!cutting.length) { issues.push("Missing cutting transition."); continue; }
    cuts.push({ minX: west ? portal.x - .6 : Math.min(...cutting.map((p) => p.x)),
      maxX: west ? Math.max(...cutting.map((p) => p.x)) : portal.x + .6,
      minZ: portal.z - 1.32, maxZ: portal.z + 1.32 });
  }
  const parts = base.parts.filter((p) => !["rail-sleeper", "rail-buffer", "rail-fill"].includes(p.role ?? "") &&
    !(p.role === "rail-pier" && p.position[0] < 68));
  const newParts: Part[] = [];
  const box = (color: string, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0) => {
    if (h > .001) newParts.push({ geometry: "box", color, position: [x, y, z], scale: [w, h, d], rotation: [0, yaw, 0] });
  };
  const p = new THREE.Vector3(), tangent = new THREE.Vector3();
  const galleries: UndergroundRoute["galleries"] = [];
  // Real cut-and-cover galleries enclose the long graded approaches. Visible
  // rail ends at urban entrances; the continuous, gently graded route remains
  // underneath solid roofs and earth shoulders, never hidden in open terrain.
  for (const [from, to] of [[westIndex, naturalWestIndex + 8], [naturalEastIndex - 8, eastIndex]]) {
    const gallery: UndergroundRoute["galleries"][number] = [];
    for (let i = from!; i < to!; i += 2) {
      const a = path.points[i]!, b = path.points[Math.min(i + 2, to!)]!;
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2, y = Math.max(a.y, b.y);
      const length = Math.abs(b.x - a.x) + .012;
      box("#c4b89d", x, y + .57, z - 1.45, length, 1.86, .28);
      box("#c4b89d", x, y + .57, z + 1.45, length, 1.86, .28);
      box("#d4c6aa", x, y + 1.625, z, length, .25, 3.2);
      box("#c8d0ae", x, y + 1.765, z, length, .03, 3.2);
      const section = { x, y: y + 1.795, z, left: 1.6, right: 1.6,
        leftY: y + 1.795, rightY: y + 1.795 };
      // Only the dry, unobstructed flanks receive earth. This geometry is
      // checked below against full-height scenery, paving and persisted lots.
      for (const side of [-1, 1]) {
        const edgeZ = z + side * 2.9, groundLevel = ground(x, edgeZ);
        if (!groundLevel || groundLevel.wet) { issues.push(`Gallery bank meets water at ${x},${edgeZ}`); continue; }
        const h = y + 1.78 - groundLevel.height;
        if (h > .03) {
          const bank: Part = { geometry: "shed", color: "#cdd2b2",
            position: [x, groundLevel.height, edgeZ], scale: [2.6, h, length], rotation: [0, side * Math.PI / 2, 0] };
          let paving = false;
          for (let px = x - length / 2; px <= x + length / 2 + .25; px += .25)
            for (let pz = edgeZ - 1.3; pz <= edgeZ + 1.55; pz += .25) paving ||= !!tileAt(px, pz);
          if (!paving && !overlaps(bank) && !buildings.some((b) => Math.abs(b.x - x) < (b.width + length) / 2 + .1 &&
            Math.abs(b.z - edgeZ) < (b.depth + 2.6) / 2 + .1)) {
            const outerZ = z + side * 4.2, outerGround = ground(x, outerZ);
            if (outerGround && !outerGround.wet) {
              if (side < 0) { section.left = 4.2; section.leftY = outerGround.height + .012; }
              else { section.right = 4.2; section.rightY = outerGround.height + .012; }
            }
          }
        }
      }
      gallery.push(section);
    }
    galleries.push(gallery);
  }
  // Render only the connected exposed part, east portal -> city -> west portal.
  // Extend under each roof so rails never terminate visibly at a portal face.
  const surface = railPath([...path.points.slice(eastIndex - 8, -1), ...path.points.slice(0, westIndex + 9)]);
  let supportCount = 0, lastSupport = 0;
  for (let distance = 0; distance < surface.length; distance += .65) {
    sampleRail(surface, distance, p, tangent);
    const yaw = Math.atan2(tangent.x, tangent.z), g = ground(p.x, p.z)!;
    box("#a58c6c", p.x, p.y - .075, p.z, 1.14, .08, .16, yaw);
    if (p.x >= 68 && p.x <= 146 && p.z > -1) continue; // validated existing bridge supports
    const top = p.y - .36;
    if (top > g.height + .65) {
      if (distance - lastSupport < 4.5) continue;
      const safe = [-.3, 0, .3].every((dx) => [-.3, 0, .3].every((dz) => { const t = ground(p.x + dx, p.z + dz);
        return t && !t.wet && !tileAt(p.x + dx, p.z + dz); }));
      if (safe) { box("#c4b593", p.x, (top + g.height - .06) / 2, p.z, .42, top - g.height + .06, .42); supportCount++; lastSupport = distance; }
      if (distance - lastSupport > 8.5) issues.push("No clear support within 8.5 units.");
    } else if (top > g.height) box("#cbbb9f", p.x, (top + g.height) / 2, p.z, 1.8, top - g.height, .65, yaw);
    else {
      box("#b4a98e", p.x, p.y - .4, p.z, 2.64, .08, .65, yaw);
      for (const side of [-1.45, 1.45]) {
        const x = p.x + Math.cos(yaw) * side, z = p.z - Math.sin(yaw) * side, level = ground(x, z)?.height ?? g.height;
        const h = level + .08 - top;
        box("#c9b99b", x, top + h / 2, z, .26, h, .65, yaw);
        box("#e4d6b8", x, level + .105, z, .32, .05, .65, yaw);
      }
    }
  }
  for (const portal of [westPoint, eastPoint]) {
    for (const side of [-1.45, 1.45]) box("#c7b697", portal.x, portal.y + .57, portal.z + side, 1.2, 1.86, .28);
    box("#e2d2b2", portal.x, portal.y + 1.625, portal.z, 1.2, .25, 3.2);
    // Covered bore continues beneath undisturbed terrain; no opaque fake entrance panel.
    const direction = portal === westPoint ? -1 : 1;
    for (const side of [-1.44, 1.44]) box("#8c897c", portal.x + direction * 3, portal.y + .55, portal.z + side, 6, 1.8, .22);
    box("#aaa08a", portal.x + direction * 3, portal.y + 1.625, portal.z, 6, .25, 3.1);
    for (const side of [-.9, .9]) box("#e8c681", portal.x - direction * .61, portal.y + 1.2, portal.z + side, .04, .12, .12);
  }
  // Small presentation-only through-platform. The original depot buildings stay intact.
  const stationIndex = path.points.findIndex((p) => p.x === 56 && p.z === -7), stationPoint = path.points[stationIndex]!;
  const level = stationPoint.y + .16;
  box("#d3c1a0", 56, level - .12, -5, 6, .24, 2);
  box("#eee0be", 56, level + .025, -5.93, 6, .05, .12);
  for (const x of [53.5, 58.5]) for (const z of [-5.7, -4.3]) {
    const terrain = ground(x, z)!;
    box("#c4b593", x, (level + terrain.height) / 2, z, .24, level - terrain.height, .24);
    box("#698578", x, level + .8, z, .08, 1.6, .08);
  }
  box("#799b8c", 56, level + 1.67, -5, 6.3, .15, 2.2);
  box("#9d886e", 56, level + .4, -4.65, 1.5, .14, .35);
  // Stairs on the platform's outer/south face: no access path crosses live rails.
  for (let i = 0; i < 14; i++) {
    const z = -3.8 + i * .4, terrain = ground(56, z)!, top = terrain.height + (level - terrain.height) * (14 - i) / 14;
    box("#c9b99b", 56, (top + terrain.height) / 2, z, 1.2, top - terrain.height, .4);
  }
  const landing = ground(56, 2.2)!;
  box("#ded0b0", 56, landing.height + .04, 2.2, 1.2, .08, .8);
  for (const part of newParts) {
    if (overlaps(part)) issues.push(`Earthwork/station obstruction at ${part.position[0].toFixed(2)},${part.position[2].toFixed(2)}`);
    const yaw = part.rotation?.[1] ?? 0;
    const width = Math.abs(Math.cos(yaw)) * part.scale[0] + Math.abs(Math.sin(yaw)) * part.scale[2];
    const depth = Math.abs(Math.sin(yaw)) * part.scale[0] + Math.abs(Math.cos(yaw)) * part.scale[2];
    if (buildings.some((b) => Math.abs(b.x - part.position[0]) < (b.width + width) / 2 + .02 &&
      Math.abs(b.z - part.position[2]) < (b.depth + depth) / 2 + .02)) issues.push(`Works enter a parcel at ${part.position[0]},${part.position[2]}`);

  }
  const route: UndergroundRoute = { surface, cuts, galleries,
    west: { ...westPoint, distance: path.distances[westIndex]! }, east: { ...eastPoint, distance: path.distances[eastIndex]! },
    station: path.distances[stationIndex]!, hiddenStart: path.distances[westIndex]! + 6.5,
    hiddenEnd: path.distances[eastIndex]! - 1.3, minCover, maxGrade, supports: supportCount };
  const report = { ...base.report, issues: [...new Set(issues)], maxGrade, length: path.length,
    visibleLength: surface.length,
    previousVisibleLength: railPath([...path.points.slice(naturalEastIndex - 8, -1), ...path.points.slice(0, naturalWestIndex + 9)]).length,
    tunnel: { west: route.west, east: route.east, hiddenSeconds: UNDERGROUND_RAIL.hiddenSeconds, minCover,
      station: { x: 56, z: -5 }, continuous: true, originalDepotPreserved: true, cuts, supports: supportCount } };
  // Fail closed rather than silently restore the exposed old service on a changed world.
  return issues.length ? { path: null, parts: [], report: { ...report, mode: "unavailable" } }
    : { path, parts: [...parts, ...newParts], report, underground: route };
}

/** Forward-only arc-length state machine. Hidden interval is exactly 120 elapsed seconds. */
export function undergroundService(time: number, path: RailPath, route: UndergroundRoute) {
  const v = RIVERSIDE_RAIL.speed, acceleration = RIVERSIDE_RAIL.acceleration, ramp = v / acceleration, rampDistance = v * ramp / 2;
  const toHidden = route.hiddenStart - route.station, hiddenLength = route.hiddenEnd - route.hiddenStart;
  const firstCruise = (toHidden - rampDistance) / v, lastCruise = (path.length - (route.hiddenEnd - route.station) - rampDistance) / v;
  const hiddenAt = RIVERSIDE_RAIL.dwell + ramp + firstCruise, emergesAt = hiddenAt + UNDERGROUND_RAIL.hiddenSeconds;
  const period = emergesAt + lastCruise + ramp, t = ((time % period) + period) % period;
  let relative = 0, speed = 0;
  if (t < RIVERSIDE_RAIL.dwell) { /* station dwell */ }
  else if (t < RIVERSIDE_RAIL.dwell + ramp) { const s = t - RIVERSIDE_RAIL.dwell; relative = acceleration * s * s / 2; speed = acceleration * s; }
  else if (t < hiddenAt) { relative = rampDistance + (t - RIVERSIDE_RAIL.dwell - ramp) * v; speed = v; }
  else if (t < emergesAt) {
    const s = t - hiddenAt, u = s / UNDERGROUND_RAIL.hiddenSeconds, extra = hiddenLength - v * UNDERGROUND_RAIL.hiddenSeconds;
    relative = toHidden + v * s + extra * u * u * (3 - 2 * u);
    speed = v + extra * 6 * u * (1 - u) / UNDERGROUND_RAIL.hiddenSeconds;
  } else if (t < emergesAt + lastCruise) { relative = route.hiddenEnd - route.station + (t - emergesAt) * v; speed = v; }
  else { const left = period - t; relative = path.length - acceleration * left * left / 2; speed = acceleration * left; }
  const unwrapped = route.station + relative, distance = unwrapped % path.length;
  const emergedDistance = (distance - route.hiddenEnd + path.length) % path.length;
  const state = t >= hiddenAt && t < emergesAt ? "underground" : distance >= route.west.distance - 1.3 && distance < route.hiddenStart
    ? "entering-tunnel" : t >= emergesAt && emergedDistance < 7.8 ? "emerging-tunnel" : "surface";
  return { distance, speed, state, period, hiddenAt, emergesAt, hiddenSeconds: UNDERGROUND_RAIL.hiddenSeconds, elapsed: t, dwelling: t < RIVERSIDE_RAIL.dwell };
}
export function railCarHidden(distance: number, path: RailPath, route: UndergroundRoute) {
  const d = ((distance % path.length) + path.length) % path.length;
  return d - UNDERGROUND_RAIL.halfLength > route.west.distance && d + UNDERGROUND_RAIL.halfLength < route.east.distance;
}
