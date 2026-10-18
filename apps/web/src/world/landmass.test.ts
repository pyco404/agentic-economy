import { describe, expect, it } from "vitest";
import { createLandMask, LANDMASS, shapeLandmass, landmassParts, landmassGalleries, landmassCuts } from "./landmass";
import { generateFrontier } from "./frontier";
import type { ChunkVisual } from "./layout";
import type { Part } from "./geometry";
const chunk:ChunkVisual={id:"0:0",x:0,z:0,seed:42,terrain:"g".repeat(1024),elevation:"0".repeat(1024),buildings:[],trees:[]};
describe("irregular scenic landmass",()=>{
  it("forms deterministic asymmetric terraces while retaining every developed cell",()=>{
    const coords=Array.from({length:16},(_,i)=>({cx:i%4,cy:Math.floor(i/4)}));
    const a=createLandMask(coords,42),b=createLandMask([...coords].reverse(),42);
    expect(a.cells).toEqual(b.cells);expect(a.bounds).toEqual(b.bounds);
    const {minX,maxX,minZ,maxZ}=a.bounds;
    expect(a.cells.size*64/((maxX-minX)*(maxZ-minZ))).toBeLessThan(.9);
    for(let x=0;x<128;x++)for(let z=0;z<128;z++)expect(a.contains(x+.5,z+.5)).toBe(true);
    const west=new Set<number>();
    for(let z=0;z<128;z+=8)for(let x=minX;x<0;x+=8)if(a.contains(x+4,z+4)){west.add(x);break;}
    expect(west.size).toBeGreaterThan(1);
    expect(createLandMask(coords,43).cells).not.toEqual(a.cells);
  });
  it("supports negative, stepped catalogs and expansion without rejecting canonical land",()=>{
    const coords=[{cx:-2,cy:-1},{cx:-1,cy:-1},{cx:-1,cy:0}],mask=createLandMask(coords,9);
    for(const c of coords)expect(mask.contains(c.cx*32+1,c.cy*32+1)).toBe(true);
    const expanded=createLandMask([...coords,{cx:0,cy:0}],9);
    expect(expanded.contains(16,16)).toBe(true);expect(expanded.contains(-48,-16)).toBe(true);
    expect(expanded.contains(1000,1000)).toBe(false);
  });
  it("clips the distant scenic slab and keeps waterways and rail foundations intact",()=>{
    const codes=chunk.terrain!.split("");for(let z=0;z<32;z++)for(let x=14;x<18;x++)codes[z*32+x]="w";
    const chunks=[{...chunk,terrain:codes.join("")}],frontier=generateFrontier(42,chunks);
    const infrastructure:Part[]=[{geometry:"box",color:"#aaa",position:[50,.2,-8],scale:[5,.4,10],rotation:[0,.6,0]}];
    const input=JSON.stringify({chunks,frontier,infrastructure});
    const result=shapeLandmass(chunks,frontier,42,undefined,[{points:[{x:28,z:-8},{x:36,z:-8},{x:50,z:-8}]}],infrastructure,[]);
    expect(JSON.stringify({chunks,frontier,infrastructure})).toBe(input);
    expect(result.frontier.water).toBe(frontier.water);expect(result.frontier.waterColors).toBe(frontier.waterColors);
    expect(result.report.removedGroundTriangles).toBeGreaterThan(1000);
    expect(result.report.rectangleFill).toBeLessThan(.95);expect(result.report.edgeSegments).toBeGreaterThan(20);
    expect(result.frontier.positions.every(Number.isFinite)).toBe(true);
    expect(result.frontier.positions).toHaveLength(result.frontier.colors.length);
    expect(result.frontier.parts.some(p=>p.role==="landmass-edge")).toBe(true);
    expect(result.frontier.positions.filter((_,i)=>i%3===0).every(x=>x>=result.report.bounds.minX&&x<=result.report.bounds.maxX)).toBe(true);
    expect(LANDMASS.bottom).toBeGreaterThan(-.5);
  });
  it("removes the old rectangular curb and clips planting without restoring cleared rail trees",()=>{
    const frontier=generateFrontier(42,[chunk]);
    frontier.parts=[{geometry:"box",color:"#aaa",position:[-4,.1,12],scale:[1,.2,1]},
      {geometry:"sphere",color:"#abc",position:[1000,1,1000],scale:[1,1,1]}];
    const obsolete:Part={geometry:"box",color:"#aaa",position:[0,.1,16],scale:[1,.1,1],role:"city-edge"};
    const result=shapeLandmass([chunk],frontier,42,undefined,[],[],[obsolete],new Set([0]));
    expect(result.frontier.parts.some(p=>p===frontier.parts[0]||p===frontier.parts[1]||p.role==="city-edge")).toBe(false);
  });
  it("retains portal-side cover but culls distant buried-gallery meshes without extending the land",()=>{
    const frontier=generateFrontier(42,[chunk]);
    const near:Part={geometry:"box",color:"#abc",position:[12,1,-5],scale:[1,.25,3]};
    const far:Part={...near,position:[-120,1,-5]};
    const paths=[{points:[{x:12,z:-5},{x:28,z:-5}]}];
    const result=shapeLandmass([chunk],frontier,42,undefined,paths,[near,far],[]);
    expect(result.report.bounds.minX).toBeGreaterThan(-120);
    expect(landmassParts(result,[near,far])).toEqual([near]);
    const reflected:Part={...near,position:[12,1,37]};
    expect(landmassParts(result,[reflected],32)).toEqual([reflected]);
    for(const p of paths[0]!.points)expect(result.cells.has(`${Math.floor(p.x/8)}:${Math.floor(p.z/8)}`)).toBe(true);
  });
  it("clips continuous gallery earth ribbons as well as boxes",()=>{
    const frontier=generateFrontier(42,[chunk]),result=shapeLandmass([chunk],frontier,42,undefined,[],[],[]);
    const points=[0,1,2,1000,10,11].map(x=>({x,z:16,left:1,right:1}));
    const before=JSON.stringify(points),runs=landmassGalleries(result,[points]);
    expect(runs.map(r=>r.map(p=>p.x))).toEqual([[0,1,2],[10,11]]);
    expect(JSON.stringify(points)).toBe(before);
    expect(landmassGalleries(result,[[{x:16,z:16,left:1000,right:1},{x:17,z:16,left:1000,right:1}]])).toEqual([]);
  });
  it("keeps backdrop excavation openings inside the finite ground envelope",()=>{
    const frontier=generateFrontier(42,[chunk]),result=shapeLandmass([chunk],frontier,42,undefined,[],[],[]);
    const cuts=[{minX:-200,maxX:200,minZ:10,maxZ:12}],before=JSON.stringify(cuts),clipped=landmassCuts(result,cuts);
    expect(clipped.length).toBeGreaterThan(0);expect(JSON.stringify(cuts)).toBe(before);
    for(const c of clipped)for(let x=c.minX+.01;x<c.maxX;x+=1)
      expect(result.cells.has(`${Math.floor(x/8)}:${Math.floor((c.minZ+c.maxZ)/16)}`)).toBe(true);
    expect(clipped.every(c=>c.minX>=result.report.bounds.minX&&c.maxX<=result.report.bounds.maxX)).toBe(true);
  });
});
