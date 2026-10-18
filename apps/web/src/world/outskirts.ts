import { hashSeed, random, type ChunkVisual } from "./layout";
import type { Part } from "./geometry";
import type { FrontierData } from "./frontier";
import { railTerrain } from "./railTerrain";
import { generateTreeParts } from "./vegetationGeometry";
import type { TreeSpecies } from "./vegetation";
import { turfColor } from "./terrainSurface";

/** Scenic parcels only: no buildings, tasks, inventories or navigable roads. */
export const OUTSKIRTS = { tile: 8, reach: 32, maxSites: 144, occupancy: .82,
  railClearance: 3.2, roadClearance: 2.6, infrastructureMargin: .7 } as const;
export type OutskirtsTheme = "grove" | "orchard" | "meadow" | "utility" | "bank";
export interface ScenicRail { points: readonly { x: number; z: number }[] }
export interface OutskirtsSite { x: number; z: number; theme: OutskirtsTheme; parts: Part[] }
export interface OutskirtsPlan { parts: Part[]; sites: OutskirtsSite[]; report: {
  plannedSites: number; groves: number; orchards: number; meadows: number; utilities: number; banks: number; parts: number } }

export function planOutskirts(chunks: ChunkVisual[], frontier: FrontierData, seed: number,
  catalog?: { cx: number; cy: number }[], rails: readonly ScenicRail[] = [], infrastructure: readonly Part[] = []): OutskirtsPlan {
  const coords = [...(catalog?.length ? catalog : chunks.map(c => ({ cx: c.x, cy: c.z })))]
    .sort((a,b) => a.cx-b.cx || a.cy-b.cy);
  const result: OutskirtsPlan = { parts: [], sites: [], report: {
    plannedSites: 0, groves: 0, orchards: 0, meadows: 0, utilities: 0, banks: 0, parts: 0 } };
  if (!coords.length) return result;
  const occupied = new Set(coords.map(c => `${c.cx}:${c.cy}`));
  const inside = (x:number,z:number) => occupied.has(`${Math.floor(x/32)}:${Math.floor(z/32)}`);
  const ground = railTerrain(chunks,frontier);
  const roads: { x:number; z:number }[] = [];
  // Continue the clearance of actual boundary roads/sidewalks into their approach.
  for (const c of chunks) for(const [nx,nz] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
    if(occupied.has(`${c.x+nx}:${c.z+nz}`))continue;
    for(let i=0;i<32;i++) {
      const x=nx ? nx<0?0:31 : i, z=nz ? nz<0?0:31 : i;
      if(!"rpb".includes(c.terrain?.[z*32+x]??""))continue;
      for(let d=0;d<=28;d+=2) roads.push({x:c.x*32+x+.5+nx*d,z:c.z*32+z+.5+nz*d});
    }
  }
  const obstacles = infrastructure.filter(p => p.position[1]+p.scale[1]/2>-.3).map(p => {
    const yaw=p.rotation?.[1]??0;
    return {x:p.position[0],z:p.position[2],w:Math.abs(Math.cos(yaw))*p.scale[0]+Math.abs(Math.sin(yaw))*p.scale[2],
      d:Math.abs(Math.sin(yaw))*p.scale[0]+Math.abs(Math.cos(yaw))*p.scale[2]};
  });
  const waterPoints = Array.from({length:frontier.water.length/9},(_,i)=>({
    x:(frontier.water[i*9]!+frontier.water[i*9+3]!+frontier.water[i*9+6]!)/3,
    z:(frontier.water[i*9+2]!+frontier.water[i*9+5]!+frontier.water[i*9+8]!)/3 }));
  const vegetation = frontier.parts.filter(p=>p.role==="tree-trunk");
  const clear = (x:number,z:number,radius:number) => {
    if(roads.some(p=>Math.hypot(p.x-x,p.z-z)<radius+OUTSKIRTS.roadClearance))return false;
    if(obstacles.some(p=>Math.abs(x-p.x)<radius+p.w/2+OUTSKIRTS.infrastructureMargin &&
      Math.abs(z-p.z)<radius+p.d/2+OUTSKIRTS.infrastructureMargin))return false;
    if(vegetation.some(p=>Math.hypot(p.position[0]-x,p.position[2]-z)<radius+1.5))return false;
    for(const path of rails) for(let i=1;i<path.points.length;i++) {
      const a=path.points[i-1]!,b=path.points[i]!,dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
      if(Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<radius+OUTSKIRTS.railClearance)return false;
    }
    for(let dx=-radius;dx<=radius;dx+=.5) for(let dz=-radius;dz<=radius;dz+=.5) {
      const px=x+dx,pz=z+dz,g=ground(px,pz);
      if(inside(px,pz)||!g||g.wet)return false;
    }
    return true;
  };
  const candidates = new Map<string,{x:number;z:number;rank:number}>();
  for(const c of coords) for(let x=c.cx*32-OUTSKIRTS.reach+4;x<(c.cx+1)*32+OUTSKIRTS.reach;x+=8)
    for(let z=c.cy*32-OUTSKIRTS.reach+4;z<(c.cy+1)*32+OUTSKIRTS.reach;z+=8) {
      if(inside(x,z))continue;
      const distance=Math.min(...coords.map(c=>Math.hypot(Math.max(c.cx*32-x,0,x-(c.cx+1)*32),Math.max(c.cy*32-z,0,z-(c.cy+1)*32))));
      if(distance>OUTSKIRTS.reach)continue;
      const rank=hashSeed(seed+709,x,z);
      if(rank/0xffffffff<OUTSKIRTS.occupancy)candidates.set(`${x}:${z}`,{x,z,rank});
    }
  let utilities = 0;
  for(const {x,z} of [...candidates.values()].sort((a,b)=>a.rank-b.rank||a.x-b.x||a.z-b.z)) {
    if(result.sites.length>=OUTSKIRTS.maxSites)break;
    if(!clear(x,z,3.5))continue;
    const level=ground(x,z)!.height;
    const heights=[[-2,-2],[-2,2],[2,-2],[2,2]].map(([dx,dz])=>ground(x+dx!,z+dz!)!.height);
    const flat=Math.max(...heights)-Math.min(...heights)<.075;
    const rng=random(hashSeed(seed+911,x,z));
    const belt=hashSeed(seed+129,Math.floor(x/24),Math.floor(z/24))%10;
    const nearWater=waterPoints.some(p=>Math.hypot(p.x-x,p.z-z)<10);
    const theme:OutskirtsTheme=nearWater?"bank":belt<4?"grove":belt<6&&flat?"orchard":belt>=8&&flat&&utilities<8?"utility":"meadow";
    const parts:Part[]=[];
    const box=(color:string,dx:number,y:number,dz:number,w:number,h:number,d:number,geometry="box")=>
      parts.push({geometry,color,position:[x+dx,level+y,z+dz],scale:[w,h,d]});
    // A shallow lens blends into rolling ground rather than floating above it.
    if(theme==="bank" || theme==="grove" && rng()>.45)
      box(`#${turfColor(seed,x,z).getHexString()}`,0,-.025,0,4.8+rng()*1.5,.12,3.8+rng()*1.7,"round");
    const tree=(dx:number,dz:number,kind:TreeSpecies,scale:number)=>{
      const px=x+dx,pz=z+dz;
      parts.push(...generateTreeParts({x:px,z:pz,scale,elevation:ground(px,pz)!.height,kind,zone:"natural",placement:"natural"}));
    };
    if(theme==="grove") {
      const species:TreeSpecies[]=["evergreen","layered","broadleaf","columnar"];
      tree(-1.45,-1.25,species[Math.floor(rng()*4)]!,.85+rng()*.4);
      tree(1.4,.5,species[Math.floor(rng()*4)]!,1+rng()*.35);
      if(rng()>.35)tree(-.9,1.6,"ornamental",.75+rng()*.25);
    } else if(theme==="orchard") {
      box("#d8c7a6",0,.04,0,5.8,.045,5.6);
      for(const dx of [-1.55,1.55])for(const dz of [-1.55,1.55])tree(dx,dz,"ornamental",.72+rng()*.12);
      box("#b3bd8d",0,.075,0,.65,.05,5.5);
    } else if(theme==="utility") {
      utilities++;
      box("#dfd1b6",-.45,.57,-.3,2.1,1.1,1.85);
      box("#9cae9d",-.45,1.22,-.3,2.4,.24,2.1,"roof");
      box("#718071",-.45,.42,.65,.6,.78,.06);
      box("#c6b798",.9,.08,1.65,3.8,.09,.55);
      box("#bba387",1.45,.25,-1.05,.6,.45,.7);
      tree(1.6,1,"shrub",.8);
    } else if(theme==="bank") {
      tree(-1.3,-.8,"layered",.85);
      tree(1.4,.8,"shrub",1);
      box("#b7b7a5",1.2,.16,-1.5,.85,.35,.65,"round");
      box("#c1c7a4",-1.6,.22,1.5,.7,.5,.6,"cone");
    } else {
      const variety=Math.floor(rng()*4);
      if(variety===0&&flat) {
        box("#e2d8ba",0,.025,0,5.7,.04,4.8);
        for(const dx of [-1.8,-.6,.6,1.8])box("#bcc798",dx,.09,0,.22,.1,4.4);
      } else if(variety===1) {
        tree(-1.7,-1.3,"shrub",.85);
        tree(1.4,.8,"ornamental",.8+rng()*.25);
      } else if(variety===2) {
        box("#c6c7b4",-.9,.13,.9,.8,.3,.65,"round");
        box("#d0cebc",.4,.1,1.4,.6,.23,.7,"round");
        tree(1.6,-1.5,"shrub",.72);
      } else {
        box("#e1d8bf",0,.045,-.2,5.6,.04,.45);
        tree(-1.8,1.3,"ornamental",.72);
      }
    }
    if(parts.some(p=>ground(p.position[0],p.position[2])?.wet!==false))continue;
    result.sites.push({x,z,theme,parts});result.parts.push(...parts);
  }
  const count=(theme:OutskirtsTheme)=>result.sites.filter(s=>s.theme===theme).length;
  result.report={plannedSites:result.sites.length,groves:count("grove"),orchards:count("orchard"),meadows:count("meadow"),
    utilities:count("utility"),banks:count("bank"),parts:result.parts.length};
  return result;
}
