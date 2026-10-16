// Read-only inspection of the existing depot-side terminus. Run with Node 24.
import { readFileSync } from "node:fs";
import { railConflicts } from "../src/world/railClearance.ts";

const fixture = JSON.parse(readFileSync(new URL("../src/world/fixtures/riverside-rail-world.json", import.meta.url), "utf8"));
const buildings = fixture.chunks.flatMap((c) => c.buildings);
const end = { x: 64, z: 18, y: 3 }, halfEnvelope = 0.95;
const station = buildings.find((b) => b.id === "bld_0p3nc76");
const parcelFront = station.z - station.depth / 2;
const distanceToEnvelopeContact = parcelFront - halfEnvelope - end.z;
const grade = 0.045, trainAboveRail = 1.25, cover = 0.3;
const ground = station.elevation;
const coveredRailHeight = ground - cover - trainAboveRail;
const minimumDescentLength = (end.y - coveredRailHeight) / grade;
const radius = 4;
const maximumLeftDisplacement = radius - Math.sqrt(radius ** 2 - distanceToEnvelopeContact ** 2);
const neededLeftDisplacement = end.x - (station.x - station.width / 2 - halfEnvelope);
console.log(JSON.stringify({
  source: "Committed structural fixture, not a fresh backend survey",
  endpoint: end, blockedParcel: { id: station.id, name: station.name, frontZ: parcelFront },
  distanceToEnvelopeContact, maximumDropBeforeConflict: distanceToEnvelopeContact * grade,
  minimumDescentLength, coveredRailHeight,
  turnStudy: { radius, maximumLeftDisplacement, neededLeftDisplacement,
    canTurnClearBeforeParcel: maximumLeftDisplacement >= neededLeftDisplacement },
  extensionConflicts: railConflicts([{ x: 64, z: 18 }, { x: 64, z: 32 }], buildings, halfEnvelope),
  decision: "Do not build a depot-end tunnel while preserving the current corridor and parcels.",
  limitation: "Tests this endpoint and its immediate smooth continuation; it does not prove that every future rerouted alignment is impossible.",
}, null, 2));
