/** Read-only study; nothing from this module is imported by the world renderer. */
import { writeFileSync } from "node:fs";
import { worldChunkToVisual, numericSeed } from "../src/api/adapter.ts";
import { generateFrontier } from "../src/world/frontier.ts";
import { railTerrain } from "../src/world/railTerrain.ts";
import { railConflicts } from "../src/world/railClearance.ts";
import { buildPathNetwork } from "../src/world/agentMotion.ts";

const root = "http://127.0.0.1:8787/api/v1";
async function get(path: string) {
  const response = await fetch(root + path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}
const bootstrap = await get("/world/bootstrap");
const payload = await get("/world/chunks?x=1&y=1&radius=4");
const chunks = payload.chunks.map(worldChunkToVisual), seed = numericSeed(bootstrap.seed);
const frontier = generateFrontier(seed, chunks, bootstrap.chunks), heightAt = railTerrain(chunks, frontier);
const buildings = chunks.flatMap((c: ReturnType<typeof worldChunkToVisual>) => c.buildings);
const roads = [...buildPathNetwork(chunks, seed).values()].map((p, i) => ({ id: `road:${i}`, x: p.x, z: p.y, width: 1, depth: 1 }));
const scenery = frontier.parts.filter((p) => p.scale[1] > 0.25).map((p, i) => ({
  id: `frontier:${i}`, x: p.position[0], z: p.position[2], width: p.scale[0], depth: p.scale[2],
}));
const points: { x: number; y: number; z: number }[] = [];
for (let x = 146; x <= 274; x += 0.25) {
  const t = (x - 146) / 128;
  points.push({ x, y: 1.05 - 3.05 * t * t * (3 - 2 * t), z: 1 });
}
let maxGrade = 0, waterSamples = 0, unknownSamples = 0;
let firstCut: number | null = null, coveredPortal: number | null = null;
let minTerrain = Infinity, maxTerrain = -Infinity;
for (let i = 0; i < points.length; i++) {
  const p = points[i]!;
  if (i) maxGrade = Math.max(maxGrade, Math.abs(p.y - points[i - 1]!.y) / 0.25);
  const ground = [-1.6, -0.95, 0, 0.95, 1.6].map((side) => heightAt(p.x, p.z + side));
  for (const g of ground) {
    if (!g) { unknownSamples++; continue; }
    if (g.wet) waterSamples++;
    minTerrain = Math.min(minTerrain, g.height); maxTerrain = Math.max(maxTerrain, g.height);
  }
  if (firstCut === null && ground.some((g) => g && !g.wet && p.y - 0.36 < g.height)) firstCut = p.x;
  if (coveredPortal === null && ground.every((g) => g && !g.wet && p.y + 1.5 + 0.3 <= g.height)) coveredPortal = p.x;
}
const parcelConflicts = railConflicts(points, buildings, 1.6);
const roadConflicts = railConflicts(points, roads, 1.6);
const scenicConflicts = railConflicts(points, scenery, 1.6);
const advertisedConflicts = bootstrap.chunks.filter((c: { cx: number; cy: number }) =>
  railConflicts(points, [{ id: "catalog", x: c.cx * 32 + 16, z: c.cy * 32 + 16, width: 32, depth: 32 }], 1.6).length);
const westernBlocker = buildings.find((b: { id: string }) => b.id === "bld_0p3nc76");
if (!westernBlocker) throw new Error("Western blocker changed; repeat the western survey instead of assuming the old result.");
const westernContact = westernBlocker.z - westernBlocker.depth / 2 - 0.95 - 18;
const report = {
  source: "Live local demo backend; read-only GET requests", worldId: bootstrap.worldId,
  seed: bootstrap.seed, chunks: chunks.length, buildings: buildings.length,
  alignment: { start: points[0], end: points.at(-1), sample: 0.25, excavationHalfWidth: 1.6,
    trainHeightEnvelope: 1.25, tunnelInternalHeight: 1.5, minimumCover: 0.3 },
  maxGrade, waterSamples, unknownSamples, terrainRange: [minTerrain, maxTerrain], firstCutX: firstCut,
  possibleCoveredPortalX: coveredPortal, parcelConflicts, roadConflicts, scenicConflicts, advertisedConflicts,
  westEnd: { constructed: false, blockedParcel: westernBlocker.id, name: westernBlocker.name,
    x: westernBlocker.x, z: westernBlocker.z, width: westernBlocker.width, depth: westernBlocker.depth,
    envelopeContactAfter: westernContact,
    straightExtensionConflicts: railConflicts([{ x: 64, z: 18 }, { x: 64, z: 32 }], buildings, 0.95),
    reference: "RIVERSIDE_TUNNEL_REVIEW.md" },
  completeCycleApproved: false,
  note: "An eastern candidate alone cannot complete a west-entry/east-exit cycle. Portal walls, terrain cutting and underground connection are not constructed or validated by this centerline study.",
};
writeFileSync(new URL("../reviews/eastern-tunnel-study.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
