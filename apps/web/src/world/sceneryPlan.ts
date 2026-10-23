import { planGroundCover } from "./groundCover";
import * as THREE from "three";
import { shapeLandmass, type LandmassData } from "./landmass";
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
type PreparedEnvironment = Extract<SceneryMessage,{kind:"scenery"}>;
/** One geometry revision, owned by the worker. Camera visibility changes still
 * prepare missing chunk batches but do not regenerate unchanged navigation. */
export function createSceneryPreparer(prepare:typeof prepareScenery=prepareScenery) {
  let cached:{key:string;scene:PreparedEnvironment;roads:Extract<SceneryMessage,{kind:"roads"}>|undefined}|null=null;
  return (request:SceneryRequest,send:(message:SceneryMessage)=>void)=>{
    const key=JSON.stringify([request.seed,request.style,request.catalog,
      [...request.chunks].sort((a,b)=>a.id.localeCompare(b.id)).map(c=>[c.id,c.geometryKey??JSON.stringify(c)])]);
    let roads:Extract<SceneryMessage,{kind:"roads"}>|undefined;
    prepare(request,message=>{
      if(message.kind==="roads")roads=message;
      if(message.kind==="scenery")cached={key,scene:message,roads};
      send(message);
    },cached?.key===key?cached.scene:undefined,cached?.key===key?cached.roads:undefined);
  };
}
export function prepareScenery(request: SceneryRequest, send: (message: SceneryMessage) => void, reusable?:PreparedEnvironment, reusableRoads?:Extract<SceneryMessage,{kind:"roads"}>) {
  const { seed, revision } = request;
  const { channel } = planLakeChannel(request.chunks);
  const chunks = channel ? channelChunks(request.chunks,channel) : request.chunks;
  const pathNetwork = reusableRoads?.pathNetwork ?? buildPathNetwork(chunks, seed);
  const streets = reusableRoads?.streets ?? planStreets(chunks, seed);
  send({ kind: "roads", revision, pathNetwork, streets, channel:channel?{start:channel.start,end:channel.end,width:channel.width,crossings:channel.crossings}:null });
  const ordered = [...chunks].sort((a, b) => Math.hypot(a.x * 32 + 16 - request.center.x, a.z * 32 + 16 - request.center.z) -
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
  if(reusable){send({...reusable,revision});return;}
  const frontier = generateFrontier(seed, chunks, request.catalog, request.style);
  const ambient = planAmbient(chunks, frontier, buildPathNetwork(chunks, seed, true), seed, streets);
  const railways = [ambient.railway, ambient.mirroredRail?.source].filter(p => !!p);
  const paths = railways.flatMap((p,i) => {
    const path=p.underground?.surface??p.path;
    return path ? [{points:path.points.map(point=>({x:point.x,z:i===1?ambient.mirroredRail!.reflectionZ-point.z:point.z}))}] : [];
  });
  const mirror=ambient.mirroredRail?.report.mode==="mirrored"?ambient.mirroredRail:null;
  const infrastructure=[...(ambient.railway?.parts??[]),...(mirror?.source.parts??[]).map(p=>({...p,
    position:[p.position[0],p.position[1],mirror!.reflectionZ-p.position[2]] as Part["position"],
    rotation:[p.rotation?.[0]??0,-(p.rotation?.[1]??0),p.rotation?.[2]??0] as Part["rotation"]}))];
  const landmass=shapeLandmass(chunks,frontier,seed,request.catalog,paths,infrastructure,[],
    new Set(ambient.mirroredRail?.clearedFrontierParts??[]));
  // Allocate scenery only to retained land, rather than spending its budget
  // on plots that the irregular mask would discard later.
  const footprint={contains:(x:number,z:number)=>landmass.cells.has(`${Math.floor(x/8)}:${Math.floor(z/8)}`)};
  const composition=composeCityEdges(chunks,frontier,seed,ambient.railway,request.catalog,ambient.mirroredRail,footprint);
  const clearedSupport = new Set(composition.clearedFrontierParts.map(index=>frontier.parts[index]));
  landmass.frontier.parts = landmass.frontier.parts.filter(p=>!clearedSupport.has(p));
  landmass.frontier.parts.push(...composition.parts.filter(p=>p.role!=="city-edge"&&footprint.contains(p.position[0],p.position[2])));
  const cover = planGroundCover(chunks, landmass.frontier, seed, footprint, paths,
    [...infrastructure, ...composition.parts], streets.tiles, request.catalog);
  landmass.frontier.parts.push(...cover.parts);
  send({ kind: "scenery", revision, frontier, ambient, composition, landmass });
}
export type SceneryMessage = { kind: "roads"; revision: number; pathNetwork: ReturnType<typeof buildPathNetwork>; streets: ReturnType<typeof planStreets>; channel: Pick<LakeChannel,"start"|"end"|"width"|"crossings"> | null } |
  { kind: "chunk"; revision: number; chunk: PreparedChunk } |
  { kind: "scenery"; revision: number; frontier: ReturnType<typeof generateFrontier>; ambient: ReturnType<typeof planAmbient>;
    composition: ReturnType<typeof composeCityEdges>; landmass: LandmassData } |
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
