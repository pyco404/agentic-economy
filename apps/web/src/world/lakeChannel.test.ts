import { describe, expect, it } from 'vitest';
import { generateWorld, extractChunk } from '../../../../packages/world-spec/src/index';
import { worldChunkToVisual } from '../api/adapter';
import { WorldChunk } from '../api/shared';
import { channelChunks, channelDistance, channelPassage, channelTile, LAKE_CHANNEL, planLakeChannel } from './lakeChannel';
import { buildPathNetwork } from './agentMotion';
import { planStreets } from './streets';
import { planAmbient } from './ambient';
import { generateFrontier } from './frontier';
const world = generateWorld('agentic-economy-genesis');
const chunks = Array.from({length:16}, (_, i) => {
 const coord={cx:i%4,cy:Math.floor(i/4)},raw=extractChunk(world,coord);
 return worldChunkToVisual(WorldChunk.parse({...raw,version:1,buildings:raw.buildings.map(b=>({...b,
  chunk:coord,inventory:{},condition:100,communityId:null,ownerAgentId:null,branding:null}))}));
});
describe('lake connector', () => {
 it('finds the actual lake and river, avoids parcels, and does not mutate authoritative geometry', () => {
  const before=JSON.stringify(chunks),result=planLakeChannel(chunks);
  expect(result.reason).toContain('Validated');const c=result.channel!;
  expect(c.start.x).toBeLessThan(30);expect(c.end.x).toBeGreaterThan(70);
  expect(c.crossings.length).toBe(3);expect(c.width).toBe(2.6);
  for(const p of c.points)for(const b of chunks.flatMap(c=>c.buildings))expect(Math.hypot(Math.max(0,Math.abs(p.x-b.x)-b.width/2),Math.max(0,Math.abs(p.z-b.z)-b.depth/2))).toBeGreaterThanOrEqual(LAKE_CHANNEL.radius+LAKE_CHANNEL.bank+LAKE_CHANNEL.clearance);
  const altered=channelChunks(chunks,c);
  const water=new Set<string>();
  for(const chunk of altered)for(let z=0;z<32;z++)for(let x=0;x<32;x++)if('wb'.includes(chunk.terrain![z*32+x]!))water.add(`${chunk.x*32+x}:${chunk.z*32+z}`);
  const start=`${Math.floor(c.start.x)}:${Math.floor(c.start.z)}`,end=`${Math.floor(c.end.x)}:${Math.floor(c.end.z)}`;
  const queue=[start],seen=new Set(queue);
  for(let i=0;i<queue.length;i++){const [x,z]=queue[i]!.split(':').map(Number) as [number,number];for(const n of [`${x+1}:${z}`,`${x-1}:${z}`,`${x}:${z+1}`,`${x}:${z-1}`])if(water.has(n)&&!seen.has(n)){seen.add(n);queue.push(n);}}
  expect(seen.has(end)).toBe(true);
  expect([...buildPathNetwork(altered,1).keys()].sort()).toEqual([...buildPathNetwork(chunks,1).keys()].sort());
  const oldStreets=planStreets(chunks,1),newStreets=planStreets(altered,1),oldVehicles=oldStreets.vehicles,newVehicles=newStreets.vehicles;
  expect([...oldVehicles.keys()].filter(k=>!newVehicles.has(k))).toEqual([]);
  expect(altered.flatMap(c=>c.buildings)).toEqual(chunks.flatMap(c=>c.buildings));
  expect(JSON.stringify(chunks)).toBe(before);
 });
 it('excavates ground and joins existing water at the same surface height, including under road decks',()=>{
  const c=planLakeChannel(chunks).channel!;
  for(const p of c.points){const parts=channelTile(c,Math.floor(p.x)+.5,Math.floor(p.z)+.5);if(!parts)continue;
   const water=parts.filter(p=>p.role==='channel-water');expect(water.length).toBeGreaterThan(0);
   for(const w of water){expect(w.position[1]+w.scale[1]/2).toBeCloseTo(-.25);expect(channelDistance(c,w.position[0],w.position[2])).toBeLessThanOrEqual(LAKE_CHANNEL.radius);}
   for(const bed of parts.filter(p=>p.role==='channel-bed'))if(channelDistance(c,bed.position[0],bed.position[2])<=LAKE_CHANNEL.radius)expect(bed.position[1]+bed.scale[1]/2).toBeLessThan(-.25);
  }
  expect(c.crossings.every(b=>b.clearance>.25)).toBe(true);
  expect(channelPassage(c,.6,.2)).toBe(true);expect(channelPassage(c,3,.2)).toBe(false);expect(channelPassage(c,.6,2)).toBe(false);expect(channelPassage(c,.6,.2,.12,.6)).toBe(false);
 });
 it('preserves the existing railway alignment and ambient vehicle paths',()=>{
  const channel=planLakeChannel(chunks).channel!,altered=channelChunks(chunks,channel),frontier=generateFrontier(1,chunks);
  const original=planAmbient(chunks,frontier,buildPathNetwork(chunks,1,true),1,planStreets(chunks,1));
  const updated=planAmbient(altered,frontier,buildPathNetwork(altered,1,true),1,planStreets(altered,1));
  expect(updated.rail?.points).toEqual(original.rail?.points);
  expect(updated.cars.map(p=>p.points)).toEqual(original.cars.map(p=>p.points));
 },30000);
 it('fails closed without both water bodies and produces the same route on repeated runs',()=>{
  expect(planLakeChannel([]).channel).toBeNull();
  expect(planLakeChannel(chunks).channel?.points).toEqual(planLakeChannel(chunks).channel?.points);
 });
});
