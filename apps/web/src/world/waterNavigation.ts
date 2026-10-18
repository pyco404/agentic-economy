import type { ChunkVisual } from "./layout";
import { isLand } from "./layout";
import type { FrontierData } from "./frontier";
import { generateBuilding, generateLandscape, type Part } from "./geometry";
import { railTerrain } from "./railTerrain";
import { gridGraph, navKey, type NavPoint } from "./navigation";
import { buildPathNetwork } from "./agentMotion";

export const WATER_NAV = { step: .5, radius: 1.12, height: 1.12, margin: .08, maxBoats: 4,
  speed: { cargo: 1.05, ferry: 1.3, service: 1.5 }, acceleration: .38, dwellMin: 5, dwellVariation: 8, dockSpacing: 5.5 } as const;
export interface Dock { id: string; node: string; component: number; x: number; z: number; shore: NavPoint; access: NavPoint; heading: number; }
export interface WaterPlan { graph: ReturnType<typeof gridGraph>; docks: Dock[]; parts: Part[];
  report: { waterSamples: number; clearanceSamples: number; blockedBridgeCells: number; dockCandidates: number; issues: string[] } }
/** Rasterizes the actual persisted water cells and rendered frontier triangles.
 * A conservative disc covers the entire hull during any turn. Low bridge cells
 * remain barriers; no invisible water or automatic bridge raising is invented. */
export function waterNavigation(chunks: ChunkVisual[], frontier: FrontierData, seed: number, infrastructure: Part[] = []): WaterPlan {
  const ground = railTerrain(chunks, frontier), candidates = new Map<string, NavPoint>();
  const wet = (x: number, z: number) => {
    const g = ground(x, z); if (g?.wet) return g.height;
    const chunk = chunks.find(c => !c.terrain && x >= c.x * 32 && x < (c.x + 1) * 32 && z >= c.z * 32 && z < (c.z + 1) * 32);
    return chunk && !isLand(x, z, seed) ? -.25 : null;
  };
  const add = (x: number, z: number) => { const y = wet(x, z); if (y !== null) candidates.set(navKey(x, z, .5), { x, y, z }); };
  for (const c of chunks) for (let z = c.z * 32; z < (c.z + 1) * 32; z += .5)
    for (let x = c.x * 32; x < (c.x + 1) * 32; x += .5) add(x, z);
  for (let i = 0; i < frontier.water.length; i += 9) {
    const t = frontier.water.slice(i, i + 9), xs = [t[0]!, t[3]!, t[6]!], zs = [t[2]!, t[5]!, t[8]!];
    for (let x = Math.ceil(Math.min(...xs) * 2) / 2; x <= Math.max(...xs); x += .5)
      for (let z = Math.ceil(Math.min(...zs) * 2) / 2; z <= Math.max(...zs); z += .5) add(x, z);
  }
  type Solid = { minX: number; maxX: number; minZ: number; maxZ: number; low: number; high: number };
  const solids = new Map<string, Solid[]>();
  const obstacles = [...chunks.flatMap(c => [...c.buildings.flatMap(generateBuilding), ...generateLandscape(c, seed, chunks)]), ...frontier.parts, ...infrastructure];
  for (const part of obstacles) {
    if (part.scale[1] <= .25 || part.position[1] - part.scale[1] / 2 > WATER_NAV.height) continue;
    const a = part.rotation?.[1] ?? 0, w = Math.abs(Math.cos(a)) * part.scale[0] + Math.abs(Math.sin(a)) * part.scale[2];
    const d = Math.abs(Math.sin(a)) * part.scale[0] + Math.abs(Math.cos(a)) * part.scale[2];
    const solid = { minX: part.position[0] - w / 2, maxX: part.position[0] + w / 2,
      minZ: part.position[2] - d / 2, maxZ: part.position[2] + d / 2, low: part.position[1] - part.scale[1] / 2, high: part.position[1] + part.scale[1] / 2 };
    for (let x = Math.floor((solid.minX - WATER_NAV.radius) / 4); x <= Math.floor((solid.maxX + WATER_NAV.radius) / 4); x++)
      for (let z = Math.floor((solid.minZ - WATER_NAV.radius) / 4); z <= Math.floor((solid.maxZ + WATER_NAV.radius) / 4); z++) {
        const key = `${x}:${z}`, list = solids.get(key) ?? []; list.push(solid); solids.set(key, list);
      }
  }
  const blocked = (x: number, z: number, y: number, radius: number) => (solids.get(`${Math.floor(x / 4)}:${Math.floor(z / 4)}`) ?? [])
    .some(s => s.high > y + .03 && s.low < y + WATER_NAV.height && x + radius > s.minX && x - radius < s.maxX && z + radius > s.minZ && z - radius < s.maxZ);
  const clearance = (p: NavPoint) => {
    const radius = WATER_NAV.radius + WATER_NAV.margin;
    for (let dx = -1.5; dx <= 1.5; dx += .25) for (let dz = -1.5; dz <= 1.5; dz += .25) {
      if (Math.hypot(dx, dz) > radius) continue;
      if (wet(p.x + dx, p.z + dz) === null) return false;
    }
    return !blocked(p.x, p.z, p.y, radius);
  };
  const nodes = new Map([...candidates].filter(([,p]) => clearance(p)));
  const graph = gridGraph("water", nodes, .5, true), docks: Dock[] = [], parts: Part[] = [];
  const paths = buildPathNetwork(chunks, seed);
  const accessNodes = new Map([...paths].map(([id,p]) => [id,{x:p.x,y:0,z:p.y}]));
  for(const p of frontier.paths??[])accessNodes.set(`${Math.floor(p.x)}:${Math.floor(p.z)}`,p);
  const accessGraph = gridGraph("pedestrian",accessNodes);
  // Dock access has a four-unit limit. Query nearby indexed nodes rather than
  // scanning the entire pedestrian network for every water/shore sample.
  const accessBuckets=new Map<string,{id:string;p:NavPoint;order:number}[]>();
  let accessOrder=0;
  for(const[id,p]of accessGraph.nodes){const key=`${Math.floor(p.x/4)}:${Math.floor(p.z/4)}`,list=accessBuckets.get(key)??[];list.push({id,p,order:accessOrder++});accessBuckets.set(key,list);}
  const nearestAccess=(point:NavPoint)=>{
    let best:string|null=null,span=16,bestOrder=Infinity;
    for(let x=Math.floor(point.x/4)-1;x<=Math.floor(point.x/4)+1;x++)for(let z=Math.floor(point.z/4)-1;z<=Math.floor(point.z/4)+1;z++)
      for(const {id,p,order}of accessBuckets.get(`${x}:${z}`)??[]){const d=(p.x-point.x)**2+(p.z-point.z)**2;if(d<span||d===span&&order<bestOrder){best=id;span=d;bestOrder=order;}}
    return best;
  };
  const dryBank=(x:number,z:number)=>{
    if(wet(x,z)!==null)return false;
    const chunk=chunks.find(c=>x>=c.x*32&&x<(c.x+1)*32&&z>=c.z*32&&z<(c.z+1)*32);
    const code=chunk?.terrain?.[(Math.floor(z)-chunk.z*32)*32+Math.floor(x)-chunk.x*32];
    // A dock must join an actual bank, never occupy a vehicle lane, bridge,
    // productive field or reserved building parcel.
    return (!code||"gsp".includes(code))&&!chunks.some(c=>c.buildings.some(b=>Math.abs(x-b.x)<b.width/2+.5&&Math.abs(z-b.z)<b.depth/2+.5));
  };
  const dockCandidates: Omit<Dock,"id">[] = [];
  for (const [id, point] of nodes) {
    if (graph.components[graph.component.get(id)!]!.length < 24) continue;
    for (const [nx,nz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      let shore: NavPoint | null = null;
      for (let d = 1.5; d <= 3; d += .5) {
        const x = point.x + nx! * d, z = point.z + nz! * d, g = ground(x,z);
        if (g && [[0,0],[.3,0],[-.3,0],[0,.3],[0,-.3]].every(([dx,dz])=>dryBank(x+dx!,z+dz!)) && !blocked(x,z,g.height,.45)) { shore = {x,y:g.height,z}; break; }
      }
      if (!shore) continue;
      const aid = nearestAccess(shore), access = aid ? accessGraph.nodes.get(aid)! : null;
      if (!access || Math.hypot(access.x-shore.x,access.z-shore.z)>4) continue;
      let safe = true;
      for (let i=0;i<=8;i++) {const t=i/8,x=shore.x+(access.x-shore.x)*t,z=shore.z+(access.z-shore.z)*t,g=ground(x,z);
        if (!g || wet(x,z)!==null || blocked(x,z,g.height,.25) || chunks.some(c=>c.buildings.some(b=>Math.abs(x-b.x)<b.width/2+.3&&Math.abs(z-b.z)<b.depth/2+.3))) {safe=false;break;}}
      if (!safe) continue;
      dockCandidates.push({node:id,component:graph.component.get(id)!,x:point.x,z:point.z,shore,access,heading:Math.atan2(nx!,nz!)});break;
    }
  }
  // Farthest-point placement creates waterfront destinations along each reachable
  // component; not a cluster of identical piers at the first available cell.
  const components = [...graph.components.keys()].sort((a,b)=>graph.components[b]!.length-graph.components[a]!.length);
  for (const component of components.slice(0,8)) {
    const options = dockCandidates.filter(d=>d.component===component), chosen: typeof options = [];
    if(frontier.westernRiver){
      const western=options.filter(d=>d.x<frontier.westernRiver!.cityEdgeX-2).sort((a,b)=>a.z-b.z||a.x-b.x);
      if(western.length)chosen.push(western[0]!);
      const other=western.at(-1);
      if(other&&chosen.every(d=>Math.hypot(d.x-other.x,d.z-other.z)>WATER_NAV.dockSpacing))chosen.push(other);
      const inland=western.reduce<typeof western[number]|undefined>((best,d)=>!best||d.x<best.x?d:best,undefined);
      if(inland&&chosen.every(d=>Math.hypot(d.x-inland.x,d.z-inland.z)>WATER_NAV.dockSpacing))chosen.push(inland);
      for(const d of chosen){const i=options.indexOf(d);if(i>=0)options.splice(i,1);}
    }
    for (let i=chosen.length;i<(frontier.westernRiver?7:5)&&options.length;i++) {
      options.sort((a,b)=> {
        const score=(p:typeof a)=>chosen.length?Math.min(...chosen.map(d=>Math.hypot(d.x-p.x,d.z-p.z))):p.x+p.z;
        return score(b)-score(a)||a.node.localeCompare(b.node);
      });
      const next=options.shift()!;
      if (chosen.some(d=>Math.hypot(d.x-next.x,d.z-next.z)<WATER_NAV.dockSpacing)) continue;
      chosen.push(next);
    }
    if (chosen.length<3) continue;
    for (const candidate of chosen) {
      const dock={...candidate,id:`dock-${candidate.node}`};docks.push(dock);
      const nx=Math.sin(dock.heading),nz=Math.cos(dock.heading), end={x:dock.x+nx*1.5,z:dock.z+nz*1.5};
      const length=Math.hypot(dock.shore.x-end.x,dock.shore.z-end.z)+.3;
      parts.push({geometry:"box",color:"#c4aa82",position:[(dock.shore.x+end.x)/2,dock.shore.y+.1,(dock.shore.z+end.z)/2],scale:[.45,.12,Math.max(.45,length)],rotation:[0,dock.heading,0]});
      const postTop=dock.shore.y+.4,postBottom=graph.nodes.get(dock.node)!.y-.35;
      for (const side of [-1,1]) parts.push({geometry:"cylinder",color:"#789071",position:[end.x+Math.cos(dock.heading)*side*.2,(postTop+postBottom)/2,end.z-Math.sin(dock.heading)*side*.2],scale:[.1,postTop-postBottom,.1]});
      const span=Math.hypot(dock.shore.x-dock.access.x,dock.shore.z-dock.access.z);
      if(span>.2)parts.push({geometry:"box",color:"#e3d7bd",position:[(dock.shore.x+dock.access.x)/2,dock.shore.y+.02,(dock.shore.z+dock.access.z)/2],scale:[.65,.025,span],rotation:[0,Math.atan2(dock.access.x-dock.shore.x,dock.access.z-dock.shore.z),0]});
      parts.push({geometry:"box",color:"#567863",position:[dock.shore.x,dock.shore.y+.6,dock.shore.z],scale:[.45,.16,.25]});
    }
  }
  return {graph,docks,parts,report:{waterSamples:candidates.size,clearanceSamples:nodes.size,
    blockedBridgeCells:chunks.reduce((n,c)=>n+[...(c.terrain??"")].filter(t=>t==="b").length,0),dockCandidates:dockCandidates.length,
    issues:docks.length?[]:["No connected component has three clear, pedestrian-accessible docking sites."]}};
}
