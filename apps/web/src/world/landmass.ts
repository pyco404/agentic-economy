import * as THREE from "three";
import type { FrontierData } from "./frontier";
import type { Part } from "./geometry";
import { hashSeed, type ChunkVisual } from "./layout";
import { cityPalette } from "./palette";
import { railTerrain } from "./railTerrain";
import type { RailCut } from "./railExcavation";

/** Scenic envelope only. Never changes canonical cells, parcels or navigation. */
export const LANDMASS = { tile: 8, band: 24, maxApron: 32, railMargin: 6, waterMargin: 4,
  bottom: -.49, trimWidth: .12 } as const;
export interface LandReserve { x: number; z: number; radius: number }
export interface LandMask { cells: Set<string>; contains: (x: number, z: number) => boolean;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number } }
const key = (x: number, z: number) => `${x}:${z}`;
/** Union of developed cells and attached, seeded terraces. It works for negative
 * coordinates and future nonrectangular chunk catalogs without screen assumptions. */
export function createLandMask(coords: { cx: number; cy: number }[], seed: number,
  reserves: readonly LandReserve[] = []): LandMask {
  const cells = new Set<string>(), occupied = new Set(coords.map(c => key(c.cx, c.cy)));
  const add = (x: number, z: number) => cells.add(key(Math.floor(x / LANDMASS.tile), Math.floor(z / LANDMASS.tile)));
  for (const c of coords) {
    for (let x = 0; x < 32; x += LANDMASS.tile) for (let z = 0; z < 32; z += LANDMASS.tile) add(c.cx * 32 + x, c.cy * 32 + z);
    for (const [nx,nz] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
      if (occupied.has(key(c.cx+nx,c.cy+nz))) continue;
      for (let along = 0; along < 32; along += LANDMASS.tile) {
        const x=c.cx*32+(nx ? nx<0 ? 0 : 32 : along+4), z=c.cy*32+(nz ? nz<0 ? 0 : 32 : along+4);
        const band=Math.floor((nx ? z : x)/LANDMASS.band);
        const depth=(hashSeed(seed+nx*17+nz*53,band,nx ? c.cx : c.cy)%5)*LANDMASS.tile;
        for(let outward=4;outward<depth;outward+=LANDMASS.tile) add(x+nx*outward,z+nz*outward);
      }
    }
  }
  // Protect real water and visible rail infrastructure, not a guessed rectangle.
  for(const p of reserves) for(let x=Math.floor((p.x-p.radius)/8);x<=Math.floor((p.x+p.radius)/8);x++)
    for(let z=Math.floor((p.z-p.radius)/8);z<=Math.floor((p.z+p.radius)/8);z++) {
      const dx=Math.max(x*8-p.x,0,p.x-(x+1)*8),dz=Math.max(z*8-p.z,0,p.z-(z+1)*8);
      if(Math.hypot(dx,dz)<=p.radius) cells.add(key(x,z));
    }
  const indices=[...cells].map(k=>k.split(":").map(Number));
  const bounds=indices.length ? {minX:Math.min(...indices.map(p=>p[0]!))*8,maxX:(Math.max(...indices.map(p=>p[0]!))+1)*8,
    minZ:Math.min(...indices.map(p=>p[1]!))*8,maxZ:(Math.max(...indices.map(p=>p[1]!))+1)*8} : {minX:0,maxX:0,minZ:0,maxZ:0};
  return {cells,bounds,contains:(x,z)=>cells.has(key(Math.floor(x/8),Math.floor(z/8)))};
}
export interface LandmassData { cells: Set<string>; frontier: FrontierData; report: { tiles: number; edgeSegments: number;
  bounds: LandMask["bounds"]; rectangleFill: number; retainedWaterTriangles: number; removedGroundTriangles: number } }
export function shapeLandmass(chunks: ChunkVisual[], frontier: FrontierData, seed: number,
  catalog: {cx:number;cy:number}[] | undefined, railPaths: readonly {points:readonly {x:number;z:number}[]}[],
  infrastructure: readonly Part[], composition: readonly Part[], cleared: ReadonlySet<number> = new Set()): LandmassData {
  const reserves:LandReserve[]=railPaths.flatMap(path=>path.points.map(p=>({...p,radius:LANDMASS.railMargin})));
  for(let i=0;i<frontier.water.length;i+=3)reserves.push({x:frontier.water[i]!,z:frontier.water[i+2]!,radius:LANDMASS.waterMargin});
  if(frontier.westernRiver){
    // Retain the dry headlands between the broad river and canonical land.
    // Water-only reserves would otherwise leave holes behind a recessed bank.
    const innerBanks=new Map<number,number>(),edge=frontier.westernRiver.cityEdgeX;
    for(let i=0;i<frontier.water.length;i+=3){const x=frontier.water[i]!,z=frontier.water[i+2]!;
      if(x>=edge||z<frontier.westernRiver.minZ||z>frontier.westernRiver.maxZ)continue;
      const row=Math.floor(z/8);innerBanks.set(row,Math.max(innerBanks.get(row)??-Infinity,x));
    }
    for(const[row,inner]of innerBanks)for(let x=inner;x<edge;x+=8)reserves.push({x,z:row*8+4,radius:4});
    for(const p of frontier.paths??[])reserves.push({...p,radius:2});
  }
  for(const p of infrastructure) {
    if(p.position[1]+p.scale[1]/2<-.45)continue;
    // Buried return galleries must not grow long scenic land fingers. Retain
    // the visible surface corridor, portal cover and station infrastructure.
    const nearSurface=railPaths.some(path=>path.points.some(point=>Math.hypot(point.x-p.position[0],point.z-p.position[2])<12+Math.max(p.scale[0],p.scale[2])/2));
    if(!nearSurface)continue;
    const a=p.rotation?.[1]??0,w=Math.abs(Math.cos(a))*p.scale[0]+Math.abs(Math.sin(a))*p.scale[2],
      d=Math.abs(Math.sin(a))*p.scale[0]+Math.abs(Math.cos(a))*p.scale[2];
    for(let x=p.position[0]-w/2;x<=p.position[0]+w/2+2;x+=4)
      for(let z=p.position[2]-d/2;z<=p.position[2]+d/2+2;z+=4)reserves.push({x,z,radius:2});
  }
  const mask=createLandMask(catalog?.length?catalog:chunks.map(c=>({cx:c.x,cy:c.z})),seed,reserves);
  const positions:number[]=[],colors:number[]=[];
  for(let i=0;i<frontier.positions.length;i+=9){
    const x=(frontier.positions[i]!+frontier.positions[i+3]!+frontier.positions[i+6]!)/3,
      z=(frontier.positions[i+2]!+frontier.positions[i+5]!+frontier.positions[i+8]!)/3;
    if(mask.contains(x,z)){positions.push(...frontier.positions.slice(i,i+9));colors.push(...frontier.colors.slice(i,i+9));}
  }
  const ground=railTerrain(chunks,frontier),trim:Part[]=[],side=new THREE.Color(cityPalette.sand).multiplyScalar(.86).toArray();
  let edgeSegments=0;
  for(const id of mask.cells){
    const [tx,tz]=id.split(":").map(Number);
    for(const [nx,nz]of [[-1,0],[1,0],[0,-1],[0,1]]as const){
      if(mask.cells.has(key(tx!+nx,tz!+nz)))continue;
      for(let along=0;along<8;along+=2){
        const x=tx!*8+(nx ? nx<0?0:8 : along),z=tz!*8+(nz ? nz<0?0:8 : along);
        const a={x,z},b={x:x+(nz?2:0),z:z+(nx?2:0)};
        const ga=ground(a.x-nx*.01,a.z-nz*.01),gb=ground(b.x-nx*.01,b.z-nz*.01);
        if(!ga||!gb||ga.wet||gb.wet)continue;
        const ay=ga.height,by=gb.height;
        const vertices=[[a.x,ay,a.z],[b.x,by,b.z],[a.x,LANDMASS.bottom,a.z],
          [a.x,LANDMASS.bottom,a.z],[b.x,by,b.z],[b.x,LANDMASS.bottom,b.z]];
        // Front-sided triangles face outward on every edge, including recesses.
        if(nx<0||nz>0)for(let n=0;n<6;n+=3)[vertices[n+1],vertices[n+2]]=[vertices[n+2]!,vertices[n+1]!];
        for(const v of vertices){positions.push(...v!);colors.push(...side);}
        if(Math.abs(ay-by)<.08)trim.push({geometry:"box",color:cityPalette.sand,
          position:[(a.x+b.x)/2-nx*.07,(ay+by)/2+.008,(a.z+b.z)/2-nz*.07],
          scale:[nx?LANDMASS.trimWidth:2,.016,nz?LANDMASS.trimWidth:2],role:"landmass-edge"});
        edgeSegments++;
      }
    }
  }
  const parts=[...frontier.parts.filter((p,i)=>!cleared.has(i)&&mask.contains(p.position[0],p.position[2])),
    ...composition.filter(p=>p.role!=="city-edge"&&mask.contains(p.position[0],p.position[2])),...trim];
  const area=(mask.bounds.maxX-mask.bounds.minX)*(mask.bounds.maxZ-mask.bounds.minZ);
  return {cells:mask.cells,frontier:{...frontier,positions,colors,parts,shimmer:frontier.shimmer.filter(p=>mask.contains(p.x,p.z))},
    report:{tiles:mask.cells.size,edgeSegments,bounds:mask.bounds,rectangleFill:area?mask.cells.size*64/area:0,
      retainedWaterTriangles:frontier.water.length/9,removedGroundTriangles:(frontier.positions.length-positions.length+edgeSegments*18)/9}};
}

/** Only scenic meshes are culled. The canonical underground path, carriage
 * spacing, portal cuts, state machine and travel interval remain unchanged. */
export function landmassParts(data: LandmassData, parts: readonly Part[], reflectionZ?: number): Part[] {
  return parts.filter(p=>data.cells.has(key(Math.floor(p.position[0]/8),Math.floor((reflectionZ===undefined?p.position[2]:reflectionZ-p.position[2])/8))));
}
/** The renderer also generates earth ribbons over buried galleries. Cull whole
 * contiguous ribbon sections whose full cross-section is outside the landmass;
 * filtering boxes alone would leave long, floating ground-colored strips. */
export function landmassGalleries<T extends {x:number;z:number;left:number;right:number}>(
  data:LandmassData,galleries:readonly (readonly T[])[],reflectionZ?:number):T[][] {
  const contains=(x:number,z:number)=>data.cells.has(key(Math.floor(x/8),Math.floor((reflectionZ===undefined?z:reflectionZ-z)/8)));
  const result:T[][]=[];
  for(const gallery of galleries){
    let run:T[]=[];
    const finish=()=>{if(run.length>1)result.push(run);run=[];};
    for(const p of gallery){
      if(contains(p.x,p.z)&&contains(p.x,p.z-p.left)&&contains(p.x,p.z+p.right))run.push(p);
      else finish();
    }
    finish();
  }
  return result;
}
/** Keep excavation openings in the infinite beige backdrop inside real land.
 * Otherwise a removed buried gallery leaves a bright slit across empty space. */
export function landmassCuts(data:LandmassData,cuts:readonly RailCut[]) {
  const output:RailCut[]=[];
  for(const cut of cuts)for(let z=Math.floor(cut.minZ/8);z<Math.ceil(cut.maxZ/8);z++){
    let start:number|null=null;
    const end=Math.ceil(cut.maxX/8);
    for(let x=Math.floor(cut.minX/8);x<=end;x++){
      const keep=x<end&&data.cells.has(key(x,z));
      if(keep&&start===null)start=x;
      if(!keep&&start!==null){output.push({minX:Math.max(cut.minX,start*8),maxX:Math.min(cut.maxX,x*8),
        minZ:Math.max(cut.minZ,z*8),maxZ:Math.min(cut.maxZ,(z+1)*8)});start=null;}
    }
  }
  return output;
}
