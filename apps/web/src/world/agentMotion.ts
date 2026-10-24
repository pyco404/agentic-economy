import * as THREE from "three";
import { gridGraph, findRoute, nearestNode, type NavigationGraph } from "./navigation";
import { isLand, random, type BuildingVisual, type ChunkVisual } from "./layout";

// Presentation only: never changes authoritative positions or simulation timing.
export const AGENT_MOTION = { visualSpeed: 0.8, demoMinSpeed: 1.1, demoSpeedVariation: 0.65,
  demoMinIdle: 1.5, demoIdleVariation: 3, liveMaxGap: 8, liveSearchBudget: 192,
  demoSearchBudget: 4096 } as const;
export type PathNetwork = Map<string, THREE.Vector2>;
const key = (x: number, z: number) => `${Math.floor(x)}:${Math.floor(z)}`;
export function agentSeed(id: string) {
  return [...id].reduce((seed, letter) => Math.imul(seed ^ letter.charCodeAt(0), 16777619) >>> 0, 2166136261);
}
export function buildPathNetwork(chunks: ChunkVisual[], seed: number, vehicleOnly = false): PathNetwork {
  const network: PathNetwork = new Map();
  for (const chunk of chunks) {
    const size = chunk.size ?? 32;
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      const wx = chunk.x * size + x, wz = chunk.z * size + z;
      const code = chunk.terrain?.[z * size + x];
      const fixtureRoad = !chunk.terrain && isLand(wx + 0.5, wz + 0.5, seed) &&
        (((wx % 16) + 16) % 16 < 2 || ((wz % 16) + 16) % 16 < 2);
      if ((code && (vehicleOnly ? "rb" : "rpb").includes(code)) || fixtureRoad)
        network.set(key(wx, wz), new THREE.Vector2(wx + 0.5, wz + 0.5));
    }
  }
  return network;
}
const graphCache = new WeakMap<PathNetwork, {size:number;graph:NavigationGraph}>();
export function pedestrianNavigation(network: PathNetwork) {
  let cached = graphCache.get(network);
  if (!cached || cached.size !== network.size) { cached = {size:network.size,graph:gridGraph("pedestrian", new Map([...network].map(([id,p])=>[id,{x:p.x,y:0,z:p.y}])))}; graphCache.set(network,cached); }
  return cached.graph;
}
/** Interpolate only between confirmed server samples. Destinations do not authorize
 * predicted economic movement; A* merely reconstructs the legal intervening cells. */
export function pathBetween(network: PathNetwork, from: THREE.Vector2, to: THREE.Vector2,
  budget: number = AGENT_MOTION.liveSearchBudget): THREE.Vector2[] | null {
  let route=findRoute(pedestrianNavigation(network),key(from.x,from.y),key(to.x,to.y),budget);
  // A caller may revise a network in place. Never interpolate through a removed cell.
  if(route?.some(p=>!network.get(key(p.x,p.z))?.equals(new THREE.Vector2(p.x,p.z)))) {
    graphCache.delete(network);route=findRoute(pedestrianNavigation(network),key(from.x,from.y),key(to.x,to.y),budget);
  }
  return route ? [from.clone(),...route.map(p=>new THREE.Vector2(p.x,p.z)),to.clone()]
    .filter((p,i,list)=>!i||!p.equals(list[i-1]!)) : null;
}
/** Reconnect recovery follows the same connected paths, at the published walking
 * rate, instead of snapping across buildings or water. Null means wait for terrain. */
export function observedJourney(network: PathNetwork, from: THREE.Vector2, to: THREE.Vector2, tickMs: number, assigned = false) {
  const path = pathBetween(network, from, to, Math.max(AGENT_MOTION.liveSearchBudget, network.size));
  if (!path) return null;
  const length = path.reduce((sum,p,i)=>sum+(i?p.distanceTo(path[i-1]!):0),0);
  // An assigned worker must catch up to confirmed state after reconnect, rather
  // than spending an entire short shift replaying old travel. Keep every legal
  // path segment; never predict a destination or interpolate through buildings.
  const duration = Math.max(tickMs, length / 2 * tickMs);
  return { path, duration: assigned ? Math.min(duration, tickMs * 2) : duration };
}
export function samplePath(path: THREE.Vector2[], progress: number, out: THREE.Vector2) {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += path[i]!.distanceTo(path[i - 1]!);
  let remaining = THREE.MathUtils.clamp(progress, 0, 1) * length;
  for (let i = 1; i < path.length; i++) {
    const span = path[i]!.distanceTo(path[i - 1]!);
    if (remaining <= span && span > 0) return out.lerpVectors(path[i - 1]!, path[i]!, remaining / span);
    remaining -= span;
  }
  return out.copy(path.at(-1) ?? out);
}

/** Destination visits are explicitly offline presentation, never simulated work.
 * Updating the world graph preserves journeys whose paths remain accessible. */
export function createDemoWalkers(initialNetwork: PathNetwork, initialBuildings: BuildingVisual[]) {
  let network=initialNetwork, graph=pedestrianNavigation(network), places:string[]=[], lastFrame=-1, requests=0;
  const walkers=new Map<string,{position:THREE.Vector2;route:THREE.Vector2[];next:number;idleUntil:number;speed:number;rng:()=>number;recent:string[];completed:number;destinations:string[]}>();
  const configure=(next:PathNetwork,buildings:BuildingVisual[])=>{
    network=next;graph=pedestrianNavigation(network);
    places=[...new Set(buildings.map(b=>nearestNode(graph,{x:b.entrance?.x??b.x,z:b.entrance?.z??b.z})).filter((id):id is string=>!!id))];
    if(places.length<4)places=[...network.keys()].filter((_,i)=>i%8===0);
  };
  configure(initialNetwork,initialBuildings);
  return {
    reconfigure:configure,
    position(id:string,x:number,z:number,time:number,dt:number,frozen:boolean){
      if(lastFrame!==time){lastFrame=time;requests=0;}
      let walker=walkers.get(id);
      if(!walker){const rng=random(agentSeed(id)),start=nearestNode(graph,{x,z}),p=start?graph.nodes.get(start)!:{x,z};
        walker={position:new THREE.Vector2(p.x,p.z),route:[],next:0,idleUntil:time+rng()*5,speed:AGENT_MOTION.demoMinSpeed+rng()*AGENT_MOTION.demoSpeedVariation,rng,recent:start?[start]:[],completed:0,destinations:[]};walkers.set(id,walker);}
      if(!frozen&&time>=walker.idleUntil){
        if(walker.next>=walker.route.length&&requests<2){
          requests++;const start=key(walker.position.x,walker.position.y),component=graph.component.get(start);
          const candidates=places.filter(target=>graph.component.get(target)===component&&!walker!.recent.slice(-4).includes(target));
          if(!candidates.length)walker.recent=walker.recent.slice(-1);
          const choices=candidates.map(target=>({target,span:walker!.position.distanceTo(new THREE.Vector2(graph.nodes.get(target)!.x,graph.nodes.get(target)!.z)),score:walker!.rng()}));
          choices.sort((a,b)=>b.span*(.35+b.score)-a.span*(.35+a.score));
          for(const choice of choices.slice(0,12)){
            const to=network.get(choice.target)!,route=pathBetween(network,walker.position,to,Math.max(network.size,AGENT_MOTION.demoSearchBudget));
            if(!route||route.length<5)continue;
            walker.route=route;walker.next=1;walker.recent.push(choice.target);walker.recent=walker.recent.slice(-6);walker.destinations.push(choice.target);walker.destinations=walker.destinations.slice(-16);break;
          }
        }
        let step=walker.speed*AGENT_MOTION.visualSpeed*dt;
        while(step>0&&walker.next<walker.route.length){const destination=walker.route[walker.next]!,span=walker.position.distanceTo(destination);
          if(step<span){walker.position.lerp(destination,step/span);step=0;}else{walker.position.copy(destination);step-=span;walker.next++;}}
        if(walker.route.length&&walker.next>=walker.route.length){walker.completed++;walker.route=[];walker.next=0;walker.idleUntil=time+AGENT_MOTION.demoMinIdle+walker.rng()*AGENT_MOTION.demoIdleVariation;}
      }
      return walker.position;
    },
    prune(ids:Set<string>){for(const id of walkers.keys())if(!ids.has(id))walkers.delete(id);},
    report:()=>({decorative:true,actors:[...walkers].map(([id,w])=>({id,x:w.position.x,z:w.position.y,completed:w.completed,destinations:[...w.destinations]}))}),
  };
}
