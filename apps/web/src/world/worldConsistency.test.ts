import {describe,it,expect} from 'vitest';
import {generateWorld,extractChunk} from '../../../../packages/world-spec/src/index';
import {worldChunkToVisual} from '../api/adapter';
import {WorldChunk} from '../api/shared';
import {planLakeChannel,channelChunks} from './lakeChannel';
import {generateFrontier} from './frontier';
import {buildPathNetwork} from './agentMotion';
import {planStreets} from './streets';
import {planAmbient} from './ambient';
import {numericSeed} from '../api/adapter';
const chunks=(seed:string)=>{const w=generateWorld(seed);return Array.from({length:16},(_,i)=>{
 const coord={cx:i%4,cy:Math.floor(i/4)},raw=extractChunk(w,coord);
 return worldChunkToVisual(WorldChunk.parse({...raw,version:1,buildings:raw.buildings.map(b=>({...b,chunk:coord,inventory:{},condition:100,communityId:null,ownerAgentId:null,branding:null}))}));
});};
describe('approved staging world input',()=>{
 it('reproduces the joined lake and both railways from the approved seed, not the production-only seed',()=>{
  const approved=chunks('agentic-economy-genesis'),previous=chunks('aeco-production-genesis');
  expect(planLakeChannel(previous).channel).toBeNull();
  const channel=planLakeChannel(approved).channel!;expect(channel).toBeTruthy();expect(channel.start).toEqual({x:23.5,z:111.5});expect(channel.crossings).toHaveLength(3);
  const rendered=channelChunks(approved,channel),seed=numericSeed('agentic-economy-genesis');
  const ambient=planAmbient(rendered,generateFrontier(seed,rendered),buildPathNetwork(rendered,seed,true),seed,planStreets(rendered,seed));
  expect(ambient.railway?.report.mode).toBe('riverside');expect(ambient.mirroredRail?.report.mode).toBe('mirrored');expect(ambient.mirroredRail?.report.offset).toBe(2);
 },60000);
});
