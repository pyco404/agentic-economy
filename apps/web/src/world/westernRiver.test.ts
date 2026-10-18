import{describe,it,expect}from'vitest';
import{planWesternRiver}from'./westernRiver';
import{generateFrontier}from'./frontier';
import{railTerrain}from'./railTerrain';
import type{ChunkVisual}from'./layout';
const bounds={minX:0,maxX:128,minZ:0,maxZ:128};
const exits=[{x:0,z:40,nx:-1,nz:0,width:11,water:true},{x:0,z:85,nx:-1,nz:0,width:11,water:true}];
function fixture(){return Array.from({length:16},(_,i)=>{const cx=i%4,cz=Math.floor(i/4),t=Array(1024).fill('g');for(let z=0;z<32;z++)for(let x=0;x<32;x++){const wx=cx*32+x,wz=cz*32+z;if(Math.abs(wz-40)<6||Math.abs(wz-85)<6)t[z*32+x]='w';else if(wx===8||wz===24||wz===64||wz===104)t[z*32+x]='r';}return{id:`${cx}:${cz}`,x:cx,z:cz,seed:1,terrain:t.join(''),elevation:'3'.repeat(1024),buildings:[],trees:[]}as ChunkVisual;});}
describe('connected scenic western river',()=>{
 it('requires actual western outlets and never floods authoritative land',()=>{expect(planWesternRiver(7,bounds,[])).toBeNull();expect(planWesternRiver(7,bounds,exits.slice(0,1))).toBeNull();const p=planWesternRiver(7,bounds,exits)!;for(let x=0;x<=128;x+=2)for(let z=0;z<=128;z+=2)expect(p.contains(x,z)).toBe(false);expect(p.contains(-30,44)).toBe(true);expect(p.contains(-30,80)).toBe(true);});
 it('retains irregular green headlands and islands deterministically',()=>{const a=planWesternRiver(7,bounds,exits)!,b=planWesternRiver(7,bounds,exits)!;for(const island of a.report.islands)expect(a.contains(island.x,island.z)).toBe(false);expect(a.contains(-12,63)).toBe(false);const widths=new Set(Array.from({length:16},(_,i)=>Math.round(a.east(18+i*5))));expect(widths.size).toBeGreaterThan(6);for(let z=10;z<120;z+=3)for(let x=-64;x<0;x+=3)expect(a.contains(x,z)).toBe(b.contains(x,z));});
 it('uses one water level and creates dry connected access without editing canonical terrain',()=>{const chunks=fixture(),before=JSON.stringify(chunks),f=generateFrontier(7,chunks),ground=railTerrain(chunks,f);expect(JSON.stringify(chunks)).toBe(before);expect(f.westernRiver!.waterArea).toBeGreaterThan(3000);expect(f.westernRiver!.accessPaths).toBeGreaterThanOrEqual(2);expect(f.paths!.length).toBeGreaterThan(15);for(const p of f.paths!){expect(ground(p.x,p.z)?.wet).toBe(false);expect(f.paths!.some(q=>Math.abs(p.x-q.x)+Math.abs(p.z-q.z)===1)||chunks.some(c=>p.x>=c.x*32&&p.x<(c.x+1)*32)).toBe(true);}for(let i=1;i<f.water.length;i+=3)expect(f.water[i]).toBeCloseTo(-.25);expect(f.parts.every(p=>!p.buildingId)).toBe(true);});
 it('yields the basin to newly occupied western chunks',()=>{const chunks=fixture(),catalog=[...chunks.map(c=>({cx:c.x,cy:c.z})),{cx:-1,cy:1},{cx:-1,cy:2}];const f=generateFrontier(7,chunks,catalog);expect(f.westernRiver).toBeUndefined();});
});
