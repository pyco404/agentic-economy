import * as THREE from "three";
import { generateFrontier, type FrontierStyle } from "./frontier";
import { buildPathNetwork } from "./agentMotion";
import { planStreets } from "./streets";
import { planAmbient } from "./ambient";
import { composeCityEdges } from "./composition";
import { generateBuilding, generateLandscape, type Part } from "./geometry";
import type { ChunkVisual } from "./layout";
import { channelChunks, channelDetails, planLakeChannel, type LakeChannel } from "./lakeChannel";

export interface SceneryRequest { revision: number; chunks: ChunkVisual[]; seed: number;
  catalog?: { cx: number; cy: number }[]; style: FrontierStyle;
  center: { x: number; z: number }; wanted?: string[]; known: Record<string, string> }
export const chunkSignature = (chunk: ChunkVisual, all: ChunkVisual[]) => JSON.stringify([chunk.geometryKey,
  ...all.filter((c) => Math.abs(c.x - chunk.x) <= 1 && Math.abs(c.z - chunk.z) <= 1)
    .sort((a, b) => a.id.localeCompare(b.id)).flatMap((c) => [c.id, c.geometryKey])]);
export interface PreparedChunk { data: ChunkVisual; signature: string; rank: number; landscape: Part[]; architecture: Part[] }
export function prepareScenery(request: SceneryRequest, send: (message: SceneryMessage) => void) {
  const { seed, revision } = request;
  const { channel } = planLakeChannel(request.chunks);
  const chunks = channel ? channelChunks(request.chunks, channel) : request.chunks;
  const pathNetwork = buildPathNetwork(chunks, seed), streets = planStreets(chunks, seed);
  send({ kind: "roads", revision, pathNetwork, streets, channel: channel ? { start:channel.start,end:channel.end,width:channel.width,crossings:channel.crossings } : null });
  const ordered = [...request.chunks].sort((a, b) => Math.hypot(a.x * 32 + 16 - request.center.x, a.z * 32 + 16 - request.center.z) -
    Math.hypot(b.x * 32 + 16 - request.center.x, b.z * 32 + 16 - request.center.z) || a.id.localeCompare(b.id));
  ordered.forEach((data, index) => {
    if (request.wanted && !request.wanted.includes(data.id)) return;
    const signature = JSON.stringify([chunkSignature(data, request.chunks),channel?.points]);
    if (request.known[data.id] === signature) return;
    const renderData = chunks.find(c => c.id === data.id)!;
    const landscape = [...generateLandscape(renderData, seed, chunks, channel ?? undefined), ...(channel ? channelDetails(channel, data) : [])].filter((part) => part.role !== "field-row" ||
      ![-1, 0, 1].some((side) => streets.tiles.has(`${Math.floor((part.position[0] + side * part.scale[0] / 2) / .25)}:${Math.floor((part.position[2] + side * part.scale[2] / 2) / .25)}`)));
    send({ kind: "chunk", revision, chunk: { data, signature, rank: index / Math.max(1, ordered.length - 1),
      landscape, architecture: data.buildings.flatMap(generateBuilding) } });
  });
  const frontier = generateFrontier(seed, chunks, request.catalog, request.style);
  const ambient = planAmbient(chunks, frontier, buildPathNetwork(chunks, seed, true), seed, streets);
  const composition = composeCityEdges(chunks, frontier, seed, ambient.railway, request.catalog, ambient.mirroredRail);
  send({ kind: "scenery", revision, frontier, ambient, composition });
}
export type SceneryMessage = { kind: "roads"; revision: number; pathNetwork: ReturnType<typeof buildPathNetwork>; streets: ReturnType<typeof planStreets>; channel: Pick<LakeChannel,"start"|"end"|"width"|"crossings"> | null } |
  { kind: "chunk"; revision: number; chunk: PreparedChunk } |
  { kind: "scenery"; revision: number; frontier: ReturnType<typeof generateFrontier>; ambient: ReturnType<typeof planAmbient>;
    composition: ReturnType<typeof composeCityEdges> } |
  { kind: "error"; revision: number; error: string };
/** Structured cloning keeps Maps but drops vector prototypes. Restore only
 * mathematical helpers; no scene, material or WebGL object crosses threads. */
export function reviveScenery(message: SceneryMessage): SceneryMessage {
  if (message.kind === "roads") {
    for (const [key, p] of message.pathNetwork) message.pathNetwork.set(key, new THREE.Vector2(p.x, p.y));
    for (const [key, p] of message.streets.vehicles) message.streets.vehicles.set(key, new THREE.Vector2(p.x, p.y));
    for (const node of message.streets.nodes.values()) node.point = new THREE.Vector2(node.point.x, node.point.y);
  }
  if (message.kind === "scenery") {
    const plan = message.ambient;
    const path = (p: { points: THREE.Vector3[] }) => { p.points = p.points.map((v) => new THREE.Vector3(v.x, v.y, v.z)); };
    if (plan.railway?.path) { path(plan.railway.path); plan.rail = plan.railway.path; }
    if (plan.railway?.underground) path(plan.railway.underground.surface);
    if (plan.mirroredRail) {
      plan.mirroredRail.source.path = plan.rail;
      if (plan.mirroredRail.source.underground && plan.railway?.underground)
        plan.mirroredRail.source.underground = plan.railway.underground;
    }
    plan.cars.forEach(path); plan.center = new THREE.Vector3(plan.center.x, plan.center.y, plan.center.z);
  }
  return message;
}
