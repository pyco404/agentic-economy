import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { railConflicts } from "../src/world/railClearance.ts";

// Node 24's native TS support; no server writes or additional dependencies.
// Input is { bootstrap, chunks: ChunkVisual[] }; optional second file contains
// { obstacles: [{ id, x, z, w, d }] } from generated architecture/vegetation.
const [snapshotPath, physicalPath] = process.argv.slice(2);
if (!snapshotPath) throw new Error("Usage: node scripts/audit-railway-corridors.mjs snapshot.json [physical-obstacles.json]");
const { bootstrap, chunks } = JSON.parse(readFileSync(snapshotPath, "utf8"));
const buildings = chunks.flatMap((chunk) => chunk.buildings);
const physical = physicalPath ? JSON.parse(readFileSync(physicalPath, "utf8")).obstacles.map((o) =>
  ({ id: o.id, x: o.x, z: o.z, width: o.w, depth: o.d })) : [];
const northernCurve = [];
for (let x = 136; x >= 68; x -= 0.25) {
  // Gentle northern deviations around existing rocks and vegetation, not removals.
  const z = 1 - 1.6 * Math.exp(-((x - 109.5) ** 2) / 25)
    - 1.6 * Math.exp(-((x - 94) ** 2) / 30) - Math.exp(-((x - 90) ** 2) / 10);
  northernCurve.push({ x, z });
}
for (let i = 1; i <= 40; i++) {
  const angle = -Math.PI / 2 - i / 40 * Math.PI / 2;
  northernCurve.push({ x: 68 + 4 * Math.cos(angle), z: 5 + 4 * Math.sin(angle) });
}
northernCurve.push({ x: 64, z: 16 });
const candidates = [
  { id: "civic-industrial-seam-study", points: [{ x: 56.5, z: -8 }, { x: 56.5, z: 16 }, { x: 56.5, z: 59.5 }] },
  { id: "northern-works-canal-study", points: [{ x: 136, z: 6 }, { x: 94, z: 6 }, { x: 64, z: 6 }, { x: 64, z: 16 }] },
  { id: "northern-works-short-spur-study", points: northernCurve },
];
const station = { x: 61, z: 16, width: 5, depth: 6 };
const stationConflicts = (obstacles) => railConflicts([
  { x: station.x - station.width / 2, z: station.z },
  { x: station.x + station.width / 2, z: station.z },
], obstacles.map((o) => ({ ...o, depth: o.depth + station.depth })), 0.1);
console.log(JSON.stringify({
  worldId: bootstrap.worldId, seed: bootstrap.seed, chunkCount: chunks.length, buildingCount: buildings.length,
  envelopeHalfWidth: 0.95,
  parcelGeometryDigest: createHash("sha256").update(JSON.stringify([...buildings].sort((a, b) => a.id.localeCompare(b.id))
    .map((b) => [b.id, b.x, b.z, b.width, b.depth, b.height, b.rotation, b.status]))).digest("hex"),
  scope: "Planning alignments only. No station, grade, bridge, terrain, pedestrian or traffic approval. Not imported by the renderer.",
  depotFootprintStudy: { ...station, extraClearance: 0.1, parcelConflicts: stationConflicts(buildings),
    physicalConflicts: physicalPath ? stationConflicts(physical) : null, placementAllowed: false },
  candidates: candidates.map((candidate) => {
    const parcelConflicts = railConflicts(candidate.points, buildings, 0.95).map((conflict) => {
      const b = buildings.find((building) => building.id === conflict.id);
      return { ...conflict, name: b.name, x: b.x, z: b.z };
    });
    return { ...candidate, parcelConflicts,
      physicalConflicts: physicalPath ? railConflicts(candidate.points, physical, 0.95) : null,
      placementAllowed: false };
  }),
}, null, 2));
