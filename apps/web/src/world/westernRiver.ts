import type { ChunkVisual } from './layout';
import { hashSeed } from './layout';
import type { FrontierData } from './frontier';
import type { Part } from './geometry';
import { railTerrain } from './railTerrain';
import { generateTreeParts } from './vegetationGeometry';

export const WESTERN_RIVER = { reach: 58, islandRadius: 4.5,
  waterLevel: -.25, pathWidth: .85, accessCount: 3, maxTrees: 52 } as const;
export interface WesternOutlet { x:number; z:number; nx:number; nz:number; width:number; water:boolean }
export interface WesternRiverReport {
  cityEdgeX:number; minZ:number; maxZ:number; bounds:{minX:number;maxX:number;minZ:number;maxZ:number};
  islands:{x:number;z:number;radius:number}[]; waterArea:number; accessPaths:number; pathNodes:number;
  landings:{x:number;z:number}[]; trees:number; shorelineProps:number;
}
export function planWesternRiver(seed:number, bounds:{minX:number;maxX:number;minZ:number;maxZ:number}, outlets:WesternOutlet[]){
  const west=outlets.filter(e=>e.water&&e.nx===-1&&e.width>=6).sort((a,b)=>a.z-b.z);
  // Do not invent a link through canonical terrain. A real pair of developed
  // canal outlets is required; existing narrow-water worlds stay unchanged.
  if(west.length<2||west.at(-1)!.z-west[0]!.z<24)return null;
  const edge=bounds.minX,start=Math.max(bounds.minZ+9,west[0]!.z-26),end=Math.min(bounds.maxZ-9,west.at(-1)!.z+28);
  const phase=(hashSeed(seed,11,71)%100)/100;
  const islands=[{x:edge-37,z:start+(end-start)*.43,radius:WESTERN_RIVER.islandRadius},
    {x:edge-42,z:start+(end-start)*.78,radius:3.8}];
  const east=(z:number)=>edge-7-17*Math.exp(-(((z-(start+end)/2)/11)**2))-
    8*Math.exp(-(((z-start-8)/7)**2))+Math.sin(z/8+phase)*1.6;
  const outer=(z:number)=>edge-14-(WESTERN_RIVER.reach-14)*Math.pow(Math.max(0,Math.sin(Math.PI*(z-start)/(end-start))),.38)+Math.sin(z/7+phase)*2.4;
  const contains=(x:number,z:number)=>{
    if(x>=edge||z<start||z>=end||x>=east(z)||x<=outer(z))return false;
    return !islands.some(p=>Math.hypot((x-p.x)*1.08,z-p.z)<p.radius+(hashSeed(seed,Math.floor(x/2),Math.floor(z/2))%3)*.15);
  };
  const report:WesternRiverReport={cityEdgeX:edge,minZ:start,maxZ:end,bounds:{minX:edge-WESTERN_RIVER.reach-4,maxX:edge,minZ:start,maxZ:end},
    islands,waterArea:0,accessPaths:0,pathNodes:0,landings:[],trees:0,shorelineProps:0};
  return {contains,east,report,near:(x:number,z:number)=>x<edge+2&&x>=edge-WESTERN_RIVER.reach-8&&z>=start-4&&z<=end+4};
}

/** Actual paths and landscaping on sampled mesh ground; never canonical edits.
 * The scenic pedestrian links are used only to validate dock access. Backend
 * citizens continue following their authoritative terrain/path network. */
export function landscapeWesternRiver(data:FrontierData,chunks:ChunkVisual[],seed:number,plan:NonNullable<ReturnType<typeof planWesternRiver>>){
  const ground=railTerrain(chunks,data),report=plan.report,edge=report.cityEdgeX;
  const cellKey=(x:number,z:number)=>`${Math.floor(x)}:${Math.floor(z)}`;
  const lookup=new Map(chunks.map(c=>[`${c.x}:${c.z}`,c]));
  const code=(x:number,z:number)=>{const cx=Math.floor(x/32),cz=Math.floor(z/32),c=lookup.get(`${cx}:${cz}`);return c?.terrain?.[(Math.floor(z)-cz*32)*32+Math.floor(x)-cx*32];};
  const buildings=chunks.flatMap(c=>c.buildings);
  const dry=(x:number,z:number,radius=.45)=>{
    if(buildings.some(b=>Math.abs(x-b.x)<b.width/2+radius+.5&&Math.abs(z-b.z)<b.depth/2+radius+.5))return false;
    for(const [dx,dz]of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]]){
      const px=x+dx!,pz=z+dz!,c=code(px,pz),g=ground(px,pz);
      if(!g||g.wet||g.height<WESTERN_RIVER.waterLevel+.06||c!==undefined&&!'gsrp'.includes(c))return false;
    }return true;
  };
  // Multi-source BFS connects each promenade to a genuine existing street.
  // Landlocked islands deliberately receive no invented pedestrian connection.
  const parent=new Map<string,string|null>(),points=new Map<string,{x:number;y:number;z:number}>(),queue:string[]=[];
  for(const c of chunks)for(let z=0;z<32;z++)for(let x=0;x<32;x++){
    const px=c.x*32+x+.5,pz=c.z*32+z+.5;
    if(px<edge||px>edge+10||pz<report.minZ||pz>report.maxZ||!'rp'.includes(c.terrain?.[z*32+x]??'')||!dry(px,pz))continue;
    const id=cellKey(px,pz);parent.set(id,null);points.set(id,{x:px,y:ground(px,pz)!.height,z:pz});queue.push(id);
  }
  for(let head=0;head<queue.length;head++){
    const id=queue[head]!,p=points.get(id)!;
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const x=p.x+dx!,z=p.z+dz!,key=cellKey(x,z);
      if(parent.has(key)||x<edge-32||x>edge+10||z<report.minZ||z>report.maxZ||!dry(x,z))continue;
      parent.set(key,id);points.set(key,{x,y:ground(x,z)!.height,z});queue.push(key);
    }
  }
  const used=new Map<string,{x:number;y:number;z:number}>();
  for(const wantedZ of [report.minZ+10,(report.minZ+report.maxZ)/2,report.maxZ-10]){
    let best:string|undefined,score=Infinity;
    for(const[id,p]of points){
      if(p.x>=edge-2||![-2,2].some(dx=>ground(p.x+dx,p.z)?.wet))continue;
      const s=Math.abs(p.z-wantedZ)*3+Math.abs(p.x-plan.east(p.z));
      if(s<score){best=id;score=s;}
    }
    if(!best)continue;
    const landing=points.get(best)!;
    if(report.landings.some(p=>Math.hypot(p.x-landing.x,p.z-landing.z)<10))continue;
    report.landings.push({x:landing.x,z:landing.z});report.accessPaths++;
    let id:string|null=best;
    while(id!==null){used.set(id,points.get(id)!);id=parent.get(id)??null;}
  }
  data.paths=[...used.values()];report.pathNodes=data.paths.length;
  // Existing scenic props yield to the real promenade footprint. Authoritative
  // building/prop records are untouched, and inaccessible docks are rejected later.
  data.parts=data.parts.filter(p=>!data.paths!.some(n=>Math.abs(n.x-p.position[0])<p.scale[0]/2+.6&&Math.abs(n.z-p.position[2])<p.scale[2]/2+.6));
  const parts:Part[]=[],put=(color:string,x:number,y:number,z:number,w:number,h:number,d:number,geometry='box')=>parts.push({geometry,color,position:[x,y,z],scale:[w,h,d]});
  for(const p of data.paths)put('#e2d9bd',p.x,p.y+.035,p.z,WESTERN_RIVER.pathWidth,.045,WESTERN_RIVER.pathWidth);
  const clear=(x:number,z:number,r:number)=>x<edge-1&&dry(x,z,r)&&!data.paths!.some(p=>Math.hypot(p.x-x,p.z-z)<r+.7)&&!parts.some(p=>Math.hypot(p.position[0]-x,p.position[2]-z)<r+.7);
  // Preserve and furnish dry headlands and islands. These are scenery, not farms,
  // inventories, passenger counts, or simulated commercial cargo transactions.
  for(let z=Math.ceil(report.minZ/3)*3;z<report.maxZ;z+=3)for(let x=edge-56;x<edge-1;x+=3){
    const h=hashSeed(seed+931,x,z),g=ground(x,z);if(!g||g.wet||!clear(x,z,.8))continue;
    const shore=[[-2,0],[2,0],[0,-2],[0,2]].some(([dx,dz])=>ground(x+dx!,z+dz!)?.wet);
    if(shore&&h%3===0){
      put('#d9cfb3',x,g.height+.008,z,1.2,.035,1.15,'round');
      put('#aeb6a4',x+.1,g.height+.18,z,.65,.35,.55,'round');
      for(const d of [-.3,.15])put('#9eaf86',x+d,g.height+.3,z-.5,.13,.62,.13,'cone');report.shorelineProps++;
    }else if(report.trees<WESTERN_RIVER.maxTrees&&h%3!==0&&clear(x,z,1.1)){
      parts.push(...generateTreeParts({x,z,elevation:g.height,scale:.85+(h%25)/100,kind:h%3===0?'evergreen':h%3===1?'layered':'broadleaf',zone:'natural',placement:'natural'}));report.trees++;
    }
  }
  for(const p of report.landings){
    // Benches and a quiet lookout stay behind the path, on verified land.
    for(const side of [-1,1]){
      const x=p.x+1.7,z=p.z+side*1.4,g=ground(x,z);if(!g||!clear(x,z,.6))continue;
      put('#bca68a',x,g.height+.36,z,.4,.12,1.1);put('#80937b',x+.2,g.height+.59,z,.08,.4,1.1);report.shorelineProps++;
    }
  }
  report.landings.forEach((p,i)=>{
    const x=p.x+3,z=p.z+2,g=ground(x,z);
    if(!g||!clear(x,z,1))return;
    if(i===1){
      for(const side of [-1,1])put(side<0?'#ba886c':'#91a386',x+side*.3,g.height+.22,z,.5,.44,.6);
      put('#c9b491',x,g.height+.05,z,1.5,.06,1.35);
    }else{
      put('#ece2c8',x,g.height+1.4,z,1.6,.12,1.2);
      for(const side of [-1,1])put('#62806c',x+side*.65,g.height+.72,z,.08,1.4,.08);
    }
    report.shorelineProps++;
  });
  data.parts.push(...parts);data.westernRiver=report;
}
