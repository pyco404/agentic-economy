import { describe, expect, it } from "vitest";
import { generateFrontier } from "./frontier";
import { planOutskirts, OUTSKIRTS } from "./outskirts";
import { railTerrain } from "./railTerrain";
import type { ChunkVisual } from "./layout";
import type { Part } from "./geometry";
const chunk:ChunkVisual={id:"0:0",x:0,z:0,seed:42,terrain:"g".repeat(1024),elevation:"0".repeat(1024),buildings:[],trees:[]};
describe("decorative outer town parcels",()=>{
  it("creates deterministic varied groups without economic entities or input mutation",()=>{
    const frontier=generateFrontier(42,[chunk]),before=JSON.stringify({chunk,frontier});
    const a=planOutskirts([chunk],frontier,42),b=planOutskirts([chunk],frontier,42);
    expect(a).toEqual(b);expect(JSON.stringify({chunk,frontier})).toBe(before);
    expect(a.sites.length).toBeGreaterThan(10);expect(a.sites.length).toBeLessThanOrEqual(OUTSKIRTS.maxSites);
    expect(new Set(a.sites.map(s=>s.theme)).size).toBeGreaterThanOrEqual(3);
    expect(a.parts.some(p=>p.geometry==="cone")).toBe(true);
    expect(a.parts.some(p=>p.geometry==="roof")).toBe(true);
    expect(a.parts.every(p=>!p.buildingId&&p.position.every(Number.isFinite)&&p.scale.every(v=>v>0))).toBe(true);
    expect(a.parts.length).toBeLessThan(OUTSKIRTS.maxParts);
    expect(planOutskirts([chunk],frontier,43)).not.toEqual(a);
  });
  it("reserves complete occupied catalogs including unloaded and newly developed chunks",()=>{
    const catalog=[{cx:0,cy:0},{cx:1,cy:0},{cx:-1,cy:1}];
    const frontier=generateFrontier(42,[chunk],catalog);
    const plan=planOutskirts([chunk],frontier,42,catalog);
    expect(plan).toEqual(planOutskirts([chunk],frontier,42,[...catalog].reverse()));
    for(const p of plan.parts)expect(catalog.some(c=>p.position[0]>=c.cx*32&&p.position[0]<(c.cx+1)*32&&
      p.position[2]>=c.cy*32&&p.position[2]<(c.cy+1)*32)).toBe(false);
    expect(planOutskirts([],generateFrontier(42,[]),42).parts).toEqual([]);
  });
  it("leaves actual rail sweeps, rotated portal infrastructure and approach roads clear",()=>{
    const codes=chunk.terrain!.split("");for(let x=14;x<18;x++)codes[x]="r";
    const chunks=[{...chunk,terrain:codes.join("")}],frontier=generateFrontier(42,chunks);
    const rail={points:[{x:-40,z:-12},{x:70,z:-12}]};
    const portal:Part={geometry:"box",position:[-12,1,16],scale:[8,3,4],rotation:[0,Math.PI/4,0],color:"#ccc"};
    const plan=planOutskirts(chunks,frontier,42,undefined,[rail],[portal]);
    expect(plan.sites.length).toBeGreaterThan(0);
    for(const site of plan.sites){
      expect(Math.abs(site.z+12)).toBeGreaterThanOrEqual(3+OUTSKIRTS.railClearance);
      expect(Math.abs(site.x-portal.position[0])>=3+Math.SQRT1_2*6+OUTSKIRTS.infrastructureMargin||
        Math.abs(site.z-portal.position[2])>=3+Math.SQRT1_2*6+OUTSKIRTS.infrastructureMargin).toBe(true);
      if(site.z<0&&site.z>-29)expect(site.x<10||site.x>22).toBe(true);
    }
  });
  it("keeps full site footprints dry beside connected water and follows sampled ground height",()=>{
    const codes=chunk.terrain!.split("");for(let z=0;z<32;z++)for(let x=14;x<18;x++)codes[z*32+x]="w";
    const chunks=[{...chunk,terrain:codes.join("")}],frontier=generateFrontier(42,chunks),ground=railTerrain(chunks,frontier);
    const plan=planOutskirts(chunks,frontier,42);
    for(const s of plan.sites)for(const dx of [-3,0,3])for(const dz of [-3,0,3])expect(ground(s.x+dx,s.z+dz)?.wet).toBe(false);
    for(const s of plan.sites)for(const p of s.parts) {
      // Keep every motif inside its 8m scenic tile, so stepped clipping removes
      // complete groups rather than leaving canopy or roof fragments.
      expect(Math.abs(p.position[0]-s.x)+p.scale[0]/2).toBeLessThanOrEqual(4);
      expect(Math.abs(p.position[2]-s.z)+p.scale[2]/2).toBeLessThanOrEqual(4);
    }
  });
  it("allocates its budget inside the retained footprint and builds denser coherent stands",()=>{
    const frontier=generateFrontier(42,[chunk]);
    const footprint={contains:(x:number,z:number)=>x>=-16&&x<48&&z>=-16&&z<48};
    const plan=planOutskirts([chunk],frontier,42,undefined,[],[],footprint);
    expect(plan.report.footprintAware).toBe(true);
    expect(plan.sites.length).toBeGreaterThan(10);
    expect(plan.report.trees).toBeGreaterThanOrEqual(plan.report.groves*5);
    for(const site of plan.sites)for(const dx of [-3.5,0,3.5])for(const dz of [-3.5,0,3.5])
      expect(footprint.contains(site.x+dx,site.z+dz)).toBe(true);
    for(const part of plan.parts)expect(footprint.contains(part.position[0],part.position[2])).toBe(true);
    expect(plan).toEqual(planOutskirts([chunk],frontier,42,undefined,[],[],footprint));
    const empty=planOutskirts([chunk],frontier,42,undefined,[],[],{contains:()=>false});
    expect(empty.sites).toEqual([]);expect(empty.parts).toEqual([]);
  });

});
