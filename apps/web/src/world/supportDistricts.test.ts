import { describe, expect, it } from "vitest";
import { planSupportDistricts, SUPPORT_DISTRICTS } from "./supportDistricts";
import type { ChunkVisual } from "./layout";
import type { FrontierData } from "./frontier";

const terrain=Array.from({length:1024},(_,i)=>Math.floor(i/32)%30===1||i%32%30===1?"r":"g").join("");
const chunk:ChunkVisual={id:"0:0",x:0,z:0,seed:42,terrain,elevation:"0".repeat(1024),buildings:[],trees:[]};
const frontier:FrontierData={positions:[-40,0,-40,72,0,-40,72,0,72,-40,0,-40,72,0,72,-40,0,72],colors:[],water:[],waterColors:[],parts:[],shimmer:[],style:"frontier"};
const footprint={contains:(x:number,z:number)=>x>=-32&&x<64&&z>=-32&&z<64};
describe("planned scenic expansion compounds",()=>{
 it("creates deterministic themed compounds connected to canonical roads, without mutating inputs",()=>{
  const before=JSON.stringify({chunk,frontier});
  const a=planSupportDistricts([chunk],frontier,42,undefined,[],[],footprint);
  expect(a).toEqual(planSupportDistricts([chunk],frontier,42,undefined,[],[],footprint));
  expect(JSON.stringify({chunk,frontier})).toBe(before);
  expect(new Set(a.report.sites.map(s=>s.theme))).toEqual(new Set(["aviation","transport","agriculture","service","wetland","woodland"]));
  expect(a.report.parkedAircraft).toBe(2);expect(a.report.parkedCars).toBe(5);
  expect(a.parts.length).toBeLessThanOrEqual(SUPPORT_DISTRICTS.maxParts);
  expect(a.parts.every(p=>!p.buildingId&&p.position.every(Number.isFinite)&&p.scale.every(v=>v>0))).toBe(true);
  for(const s of a.report.sites){
   if(s.theme==="woodland")continue;
   expect(s.access.length).toBeGreaterThan(0);
   for(const p of s.access)expect(p.x<0||p.x>=32||p.z<0||p.z>=32).toBe(true);
   const end=s.access.at(-1)!;
   expect(end.x===-1||end.x===33||end.z===-1||end.z===33).toBe(true);
   for(let i=1;i<s.access.length;i++)expect(Math.hypot(s.access[i]!.x-s.access[i-1]!.x,s.access[i]!.z-s.access[i-1]!.z)).toBe(2);
  }
 });
 it("gives authoritative expansion and void/water exclusions priority over scenery",()=>{
  const catalog=Array.from({length:9},(_,i)=>({cx:i%3-1,cy:Math.floor(i/3)-1}));
  expect(planSupportDistricts([chunk],frontier,42,catalog,[],[],footprint).report.sites).toEqual([]);
  expect(planSupportDistricts([chunk],frontier,42,undefined,[],[],{contains:()=>false}).parts).toEqual([]);
  const wet={...frontier,positions:[],water:frontier.positions};
  expect(planSupportDistricts([chunk],wet,42,undefined,[],[],footprint).parts).toEqual([]);
 });
 it("keeps compounds and their access clear of a ground-level rail corridor",()=>{
  const rail={points:[{x:-40,y:0,z:-12},{x:72,y:0,z:-12}]};
  const plan=planSupportDistricts([chunk],frontier,42,undefined,[rail],[],footprint);
  expect(plan.report.sites.length).toBeGreaterThan(0);
  for(const s of plan.report.sites){
   expect(Math.abs(s.z+12)).toBeGreaterThanOrEqual(Math.hypot(s.width,s.depth)/2+SUPPORT_DISTRICTS.railMargin);
   for(const p of s.access)expect(Math.abs(p.z+12)).toBeGreaterThanOrEqual(Math.SQRT2+SUPPORT_DISTRICTS.railMargin);
  }
 });
 it("treats rendered water over a dry substrate as unnavigable for access paths",()=>{
  const bank={...frontier,water:[35,.02,-40,39,.02,-40,39,.02,72,35,.02,-40,39,.02,72,35,.02,72]};
  const plan=planSupportDistricts([chunk],bank,42,undefined,[],[],footprint);
  expect(plan.report.sites.length).toBeGreaterThan(0);
  for(const site of plan.report.sites)if(site.theme!=="woodland"){
   expect(site.x+site.width/2).toBeLessThan(35);
   for(const tile of site.access)expect(tile.x).toBeLessThan(35);
  }
 });
});
