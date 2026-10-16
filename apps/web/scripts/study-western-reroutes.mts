/** Read-only route proposals. This script never changes the running railway. */
import { writeFileSync } from "node:fs";
import { numericSeed, worldChunkToVisual } from "../src/api/adapter.ts";
import { generateFrontier } from "../src/world/frontier.ts";
import { railTerrain } from "../src/world/railTerrain.ts";
import { railConflicts } from "../src/world/railClearance.ts";
import { generateBuilding, generateLandscape, type Part } from "../src/world/geometry.ts";
import { planStreets } from "../src/world/streets.ts";

const base = "http://127.0.0.1:8787/api/v1";
async function get(path: string) { const r = await fetch(base + path); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); }
const bootstrap = await get("/world/bootstrap"), payload = await get("/world/chunks?x=1&y=1&radius=4");
const chunks = payload.chunks.map(worldChunkToVisual), seed = numericSeed(bootstrap.seed);
const frontier = generateFrontier(seed, chunks, bootstrap.chunks), ground = railTerrain(chunks, frontier), streets = planStreets(chunks, seed);
const buildings = chunks.flatMap((c: ReturnType<typeof worldChunkToVisual>) => c.buildings);
const bounds = (part: Part, id: string) => {
  const yaw = part.rotation?.[1] ?? 0;
  return { id, x: part.position[0], z: part.position[2],
    width: Math.abs(Math.cos(yaw)) * part.scale[0] + Math.abs(Math.sin(yaw)) * part.scale[2],
    depth: Math.abs(Math.sin(yaw)) * part.scale[0] + Math.abs(Math.cos(yaw)) * part.scale[2],
    low: part.position[1] - part.scale[1] / 2, high: part.position[1] + part.scale[1] / 2 };
};
const solids = buildings.flatMap((b: typeof buildings[number]) => generateBuilding(b).map((p) => bounds(p, b.id)));
const scenery = [...chunks.flatMap((c: ReturnType<typeof worldChunkToVisual>) => generateLandscape(c, seed, chunks)), ...frontier.parts]
  .filter((p: Part) => p.scale[1] > 0.25 || p.role === "tree-trunk" || p.role === "tree-crown").map((p: Part, i: number) => bounds(p, `scenery:${i}`));
const overlap = (a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>) =>
  Math.abs(a.x - b.x) < (a.width + b.width) / 2 + .02 && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 + .02 && a.low < b.high && a.high > b.low;
const paving = [...streets.tiles.values()].map((t) => ({ id: `paving:${t.x}:${t.z}`, x: (t.x + .5) * .25,
  z: (t.z + .5) * .25, width: .25, depth: .25, top: t.level + .17 }));
type Point = { x: number; y: number; z: number };
function smoothGrade(t: number, length: number, start: number, end: number) {
  const d = t * length, ramp = 10, slope = (end - start) / (length - ramp);
  const area = d < ramp ? d * d / (2 * ramp) : d > length - ramp
    ? length - ramp - (length - d) ** 2 / (2 * ramp) : d - ramp / 2;
  return start + slope * area;
}
function proposal(radius: number) {
  const p: Point[] = [];
  for (let x = 68; x <= 72; x += .25) p.push({ x, y: 3, z: 1 });
  const count = Math.ceil(Math.PI * radius / .25);
  for (let i = 1; i <= count; i++) {
    const a = Math.PI / 2 - i / count * Math.PI;
    p.push({ x: 72 + radius * Math.cos(a), y: 3, z: 1 - radius + radius * Math.sin(a) });
  }
  for (let d = .25; d <= 154; d += .25) p.push({ x: 72 - d, y: smoothGrade(d / 154, 154, 3, -3), z: 1 - 2 * radius });
  return p;
}
function inspect(points: Point[]) {
  let grade = 0, unknown = 0, water = 0, portal: Point | null = null, firstCut: Point | null = null;
  const obstacles = new Set<string>(), groundCrossings = new Set<string>(), elevatedCrossings = new Set<string>();
  let minCrossingClearance = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, p = points[i]!, span = Math.hypot(p.x - a.x, p.z - a.z);
    grade = Math.max(grade, Math.abs(p.y - a.y) / span);
    const yaw = Math.atan2(p.x - a.x, p.z - a.z);
    const samples = [-1.6, -.95, 0, .95, 1.6].map((s) => ground(p.x + Math.cos(yaw) * s, p.z - Math.sin(yaw) * s));
    unknown += samples.filter((g) => !g).length; water += samples.filter((g) => g?.wet).length;
    if (!firstCut && samples.some((g) => g && p.y - .36 < g.height)) firstCut = p;
    if (!portal && samples.every((g) => g && !g.wet && p.y + 1.5 + .3 <= g.height)) portal = p;
    for (const o of [...solids, ...scenery]) {
      if (p.y + 1.5 < o.low || p.y - .36 > o.high) continue;
      if (Math.abs(p.x - o.x) < o.width / 2 + 1.6 && Math.abs(p.z - o.z) < o.depth / 2 + 1.6) obstacles.add(o.id);
    }
  }
  const minX = Math.min(...points.map((p) => p.x)) - 2, maxX = Math.max(...points.map((p) => p.x)) + 2;
  const minZ = Math.min(...points.map((p) => p.z)) - 2, maxZ = Math.max(...points.map((p) => p.z)) + 2;
  for (const tile of paving) {
    if (tile.x < minX || tile.x > maxX || tile.z < minZ || tile.z > maxZ) continue;
    const hits = railConflicts(points, [tile], 1.6)[0]; if (!hits) continue;
    for (const s of hits.segments) {
      const low = Math.min(points[s]!.y, points[s + 1]!.y) - .36;
      const clearance = low - tile.top;
      if (clearance >= 1.65) { elevatedCrossings.add(tile.id); minCrossingClearance = Math.min(minCrossingClearance, clearance); }
      else groundCrossings.add(tile.id);
    }
  }
  return { maxGrade: grade, unknownTerrainSamples: unknown, waterSamples: water, firstCut, possiblePortal: portal,
    parcelConflicts: railConflicts(points, buildings, 1.6), fullHeightConflicts: [...obstacles],
    elevatedPavingTiles: elevatedCrossings.size, unresolvedPavingTiles: [...groundCrossings], minCrossingClearance,
    constructionApproved: false };
}
const candidates = [4, 6].map((radius) => {
  const points = proposal(radius); return { id: `northern-return-radius-${radius}`, radius, points, report: inspect(points) };
});
// A separate forward-running idea avoids a depot reversal but must be rejected
// if its preserved parcel envelope is occupied. It is not silently substituted.
const direct: Point[] = [];
for (let z = 5; z <= 10; z += .25) direct.push({ x: 64, y: 3, z });
for (let i = 1; i <= 26; i++) { const a = i / 26 * Math.PI / 2; direct.push({ x: 60 + 4 * Math.cos(a), y: 3, z: 10 + 4 * Math.sin(a) }); }
for (let d = .25; d <= 154; d += .25) direct.push({ x: 60 - d, y: smoothGrade(d / 154, 154, 3, -3), z: 14 });
candidates.push({ id: "direct-west-through-depot-study", radius: 4, points: direct, report: inspect(direct) });
for (const direction of [-1, 1]) {
  const points: Point[] = [{ x: 64, y: 3, z: 18 }];
  for (let i = 1; i <= 26; i++) {
    const a = i / 26 * Math.PI / 2;
    points.push({ x: 64 + direction * 4 * (1 - Math.cos(a)), y: 3, z: 18 + 4 * Math.sin(a) });
  }
  candidates.push({ id: direction < 0 ? "forward-west-from-platform" : "forward-east-from-platform", radius: 4, points, report: inspect(points) });
}
// Smallest presentation-only alternative: a new through platform along a north
// connector. This would bypass the current depot stop, so it is a proposal only.
const northConnector: Point[] = [{ x: 68, y: 3, z: 1 }];
for (let i = 1; i <= 26; i++) {
  const a = Math.PI / 2 + i / 26 * Math.PI / 2;
  northConnector.push({ x: 68 + 4 * Math.cos(a), y: 3, z: -3 + 4 * Math.sin(a) });
}
for (let i = 1; i <= 26; i++) {
  const a = -i / 26 * Math.PI / 2;
  northConnector.push({ x: 60 + 4 * Math.cos(a), y: 3, z: -3 + 4 * Math.sin(a) });
}
for (let d = .25; d <= 154; d += .25) northConnector.push({ x: 60 - d, y: smoothGrade(d / 154, 154, 3, -3), z: -7 });
const northConnectorStudy = { points: northConnector, report: inspect(northConnector),
  serviceChange: "Would require a new north through-platform instead of stopping at the existing depot. Current depot/spur could remain untouched but unserved by the loop. Not authorized for construction.",
};

const underground: Point[] = [];
const undergroundWestX = northConnector.at(-1)!.x;
for (let i = 0; i <= 202; i++) {
  const a = -Math.PI / 2 - i / 202 * Math.PI;
  underground.push({ x: undergroundWestX + 16 * Math.cos(a), y: -3, z: 9 + 16 * Math.sin(a) });
}
for (let x = undergroundWestX + .25; x <= 274; x += .25) underground.push({ x, y: -3, z: 25 });
for (let i = 1; i <= 152; i++) {
  const a = Math.PI / 2 - i / 152 * Math.PI;
  underground.push({ x: 274 + 12 * Math.cos(a), y: -3, z: 13 + 12 * Math.sin(a) });
}
const east: Point[] = [];
for (let d = 0; d <= 128; d += .25) east.push({ x: 146 + d, y: smoothGrade(d / 128, 128, 1.05, -3), z: 1 });
function sustainedCoverPortal(points: Point[]) {
  let lastBad = -1;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if ([-1.6, -.95, 0, .95, 1.6].some((side) => {
      const g = ground(p.x, p.z + side); return !g || g.wet || g.height - p.y - 1.5 - .25 < .3;
    })) lastBad = i;
  }
  if (lastBad + 1 >= points.length) throw new Error("No sustained covered portal on this alignment.");
  return points[lastBad + 1]!;
}
const west = northConnector, westPortal = sustainedCoverPortal(west), eastPortal = sustainedCoverPortal(east);
const covered = [...west.slice(west.indexOf(westPortal)), ...underground.slice(1), ...east.slice(east.indexOf(eastPortal)).reverse().slice(1)];
let undergroundLength = 0, minimumCover = Infinity;
const coverIssues: Point[] = [], undergroundConflicts = new Set<string>();
for (let i = 0; i < covered.length; i++) {
  const p = covered[i]!;
  if (i) undergroundLength += Math.hypot(p.x - covered[i - 1]!.x, p.y - covered[i - 1]!.y, p.z - covered[i - 1]!.z);
  const before = covered[Math.max(0, i - 1)]!, after = covered[Math.min(covered.length - 1, i + 1)]!;
  const yaw = Math.atan2(after.x - before.x, after.z - before.z);
  for (const side of [-1.6, -.95, 0, .95, 1.6]) {
    const g = ground(p.x + Math.cos(yaw) * side, p.z - Math.sin(yaw) * side);
    const cover = (g?.height ?? -Infinity) - p.y - 1.5;
    minimumCover = Math.min(minimumCover, cover);
    if (cover < .3) coverIssues.push(p);
  }
  for (const o of solids) if (p.y + 1.5 > o.low && p.y - .36 < o.high &&
    Math.abs(p.x - o.x) < o.width / 2 + 1.6 && Math.abs(p.z - o.z) < o.depth / 2 + 1.6) undergroundConflicts.add(o.id);
}
const connection = { westPortal, eastPortal, easternApproach: inspect(east), underground,
  appliesTo: "North connector plus new through-platform alternative; does not serve the preserved existing depot platform.",
  undergroundLength, minimumCover, minimumCoverAboveRoof: minimumCover - .25, insufficientCoverSamples: coverIssues.length,
  generatedBuildingVolumeConflicts: [...undergroundConflicts],
  requestedHiddenSeconds: 120, fullyHiddenCenterTravel: undergroundLength - 7.8,
  averageHiddenSpeed: (undergroundLength - 7.8) / 120,
  unresolved: ["Pier foundations, portal/retaining-wall volumes, and excavated terrain mesh are not yet validated.",
    "Would bypass the existing depot stop and requires a new north through-platform service decision.",
    "Only generated building solids are available; no authoritative subsurface reservation/foundation data exists."],
};
// Dry, non-paved support footprints for the elevated part of recommended A.
// This is an independent planning check, not construction geometry.
const supports: { x: number; z: number; bottom: number; top: number }[] = [];
const supportIssues: string[] = [];
let lastSupportDistance = 0, distance = 0;
for (let i = 1; i < west.length; i++) {
  const p = west[i]!, a = west[i - 1]!;
  distance += Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z);
  const g = ground(p.x, p.z);
  if (!g || p.y - .36 - g.height < .7 || distance - lastSupportDistance < 4.5) continue;
  if (distance - lastSupportDistance > 8.5) { supportIssues.push(`No checked support within 8.5 units at ${p.x},${p.z}`); break; }
  const low = Math.min(...[-.3, 0, .3].flatMap((dx) => [-.3, 0, .3].map((dz) => ground(p.x + dx, p.z + dz)?.height ?? Infinity))) - .06;
  const pier = { id: "pier", x: p.x, z: p.z, width: .5, depth: .5, low, high: p.y - .36 };
  if ([...solids, ...scenery].some((b) => overlap(pier, b))) continue;
  if (paving.some((t) => Math.abs(t.x - p.x) < .5 && Math.abs(t.z - p.z) < .5)) continue;
  if ([-.3, 0, .3].some((dx) => [-.3, 0, .3].some((dz) => { const t = ground(p.x + dx, p.z + dz); return !t || t.wet; }))) continue;
  supports.push({ x: p.x, z: p.z, bottom: low, top: pier.high }); lastSupportDistance = distance;
}
const portalFrame = (portal: Point) => {
  const parts: Part[] = [];
  for (const side of [-1, 1]) parts.push({ geometry: "box", color: "#cbbb9a",
    position: [portal.x, portal.y + .65, portal.z + side * 1.125], scale: [1, 1.9, .25] });
  parts.push({ geometry: "box", color: "#cbbb9a", position: [portal.x, portal.y + 1.625, portal.z], scale: [1, .25, 2.5] });
  const conflicts = parts.flatMap((part) => {
    const frame = bounds(part, "frame"); return [...solids, ...scenery].filter((b) => overlap(frame, b)).map((b) => b.id);
  });
  return { internalWidth: 2, internalHeight: 1.5, roofThickness: .25, conflicts: [...new Set(conflicts)] };
};
const frames = { west: portalFrame(westPortal), east: portalFrame(eastPortal) };
const throughPlatformFootprint = { id: "proposed-north-platform", x: 56, z: -5, width: 6, depth: 2 };
const platformFootprintConflicts = [...buildings, ...scenery].filter((o) =>
  Math.abs(o.x - throughPlatformFootprint.x) < (o.width + throughPlatformFootprint.width) / 2 + .1 &&
  Math.abs(o.z - throughPlatformFootprint.z) < (o.depth + throughPlatformFootprint.depth) / 2 + .1).map((o) => o.id);
const escape = (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const polyline = (points: Point[], color: string, dashed = false) => `<polyline points="${points.map((p) => `${p.x},${p.z}`).join(" ")}" fill="none" stroke="${color}" stroke-width=".7"${dashed ? ' stroke-dasharray="2 1"' : ""}/>`;
let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-112 -30 420 180"><rect x="-112" y="-30" width="420" height="180" fill="#f4eddd"/>';
for (const c of chunks) {
  for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
    const code = c.terrain?.[z * 32 + x];
    if (code === "w" || code === "r" || code === "b") svg += `<rect x="${c.x * 32 + x}" y="${c.z * 32 + z}" width="1" height="1" fill="${code === "w" ? "#91c7ce" : "#b8bda9"}"/>`;
  }
}
for (const b of buildings) svg += `<rect x="${b.x - b.width / 2}" y="${b.z - b.depth / 2}" width="${b.width}" height="${b.depth}" fill="${b.id === "bld_0p3nc76" ? "#ac6555" : "#c9b798"}" stroke="#8a8c79" stroke-width=".1"><title>${escape(b.name)} (${b.id})</title></rect>`;
svg += polyline(candidates[0]!.points, "#47755c") + polyline(candidates[1]!.points, "#b48a4c", true) + polyline(direct, "#ac6555", true);
svg += polyline(northConnector, "#2c8194", true);
for (const c of candidates.slice(3)) svg += polyline(c.points, "#ac6555");
svg += polyline(underground, "#7a78a2", true) + polyline(east, "#537f9a");
// Existing northern urban spur, simplified for the planning diagram only.
svg += '<path d="M146 1 H68 A4 4 0 0 0 64 5 V18" fill="none" stroke="#344e47" stroke-width="1.1"/>';
for (const [p, label] of [[westPortal, `WEST (${westPortal.x},${westPortal.z})`], [eastPortal, `EAST (${eastPortal.x},${eastPortal.z})`]] as const) {
  svg += `<circle cx="${p.x}" cy="${p.z}" r="1.4" fill="#315747"/><text x="${p.x - 14}" y="${p.z - 4}" font-size="3" fill="#284739">${label}</text>`;
}
svg += '<text x="-105" y="113" font-size="4" fill="#284739">STUDY ONLY — no through-depot route approved</text><text x="-105" y="121" font-size="3" fill="#47755c">Green / amber: return options require a reversal (rejected by user). Red: forward options hit parcels.</text><text x="-105" y="129" font-size="3" fill="#537f9a">Blue: eastern descent. Purple: underground study. Teal dashes: possible north connector bypasses depot.</text><text x="-105" y="137" font-size="3" fill="#284739">North connector needs a new through-platform and full validation. Current railway and depot remain unchanged.</text></svg>';
writeFileSync(new URL("../reviews/western-railway-route-proposal.svg", import.meta.url), svg);
writeFileSync(new URL("../reviews/western-reroute-study.json", import.meta.url), JSON.stringify({
  source: "Live read-only backend survey", worldId: bootstrap.worldId, seed: bootstrap.seed, buildings: buildings.length,
  initialConnection: "Existing depot cannot be served by the tested forward continuations. Northern return options are rejected by user; north connector/new platform remains an alternative proposal only.",
  candidates,
  northConnectorStudy,
  connection,
  supportStudy: { supports, issues: supportIssues, finalSpanToEmbankmentUnchecked: true }, portalFrameStudy: frames,
  throughPlatformStudy: { footprint: throughPlatformFootprint, footprintConflicts: platformFootprintConflicts,
    fullyDesigned: false, note: "A presentation-only platform alternative, not a moved canonical depot or a fabricated backend building." },
  completeCycleApproved: false,
}, null, 2));
writeFileSync("/tmp/agentic-western-world.json", JSON.stringify({ bootstrap, chunks }));
console.log(JSON.stringify({ candidates: candidates.map((c) => ({ id: c.id, ...c.report })), northConnectorStudy: northConnectorStudy.report, connection: { ...connection, underground: undefined } }, null, 2));
