import {describe,it,expect} from 'vitest';
import {Community,LaunchResponse} from './shared';
import {communityLogo,communityHeadquarters,communityActivitySummary} from './communityPresentation';
import communities from '../../../../packages/shared/fixtures/communities.json';
import fixture from '../../../../packages/shared/fixtures/launch.json';
import type {BuildingVisual} from '../world/layout';
const launch=LaunchResponse.parse(fixture).launch;
const c={...Community.parse(communities.items[0]),id:launch.communityId!,launchId:launch.id,mint:launch.mint,launchSignature:launch.signature!,metadataUri:launch.draft.metadataUri};
const image='https://ipfs.io/ipfs/bafybeihgxdzljxb26q6nf3r3eifqeedsvt2eubqtskghpme66cgjyw4fra';
describe('community identity and registered world connections',()=>{
 it('uses only artwork attached to the matching confirmed mint and metadata',()=>{
  const token={...c,imageUri:image},record={...launch,draft:{...launch.draft,imageUri:image}};
  expect(communityLogo(token,record,launch.mode)).toBe(image);
  expect(communityLogo({...token,mint:'11111111111111111111111111111111'},record,launch.mode)).toBeNull();
  expect(communityLogo({...token,metadataUri:'ipfs://other'},record,launch.mode)).toBeNull();
  expect(communityLogo({...token,imageUri:'https://unrelated.example/art.png'},record,launch.mode)).toBeNull();
  expect(communityLogo(token,{...record,status:'submitted'},launch.mode)).toBeNull();
  expect(communityLogo(token,undefined,launch.mode)).toBeNull();
 });
 it('resolves IPFS and rejects unsafe or credential-bearing artwork URLs',()=>{
  for(const uri of ['javascript:alert(1)','data:image/svg+xml,bad','http://example.com/coin.png','https://user:pass@example.com/coin.png','ipfs://bad','ipfs://bafybeihgxdzljxb26q6nf3r3eifqeedsvt2eubqtskghpme66cgjyw4fra/../secret'])
   expect(communityLogo({...c,imageUri:uri},{...launch,draft:{...launch.draft,imageUri:uri}},launch.mode)).toBeNull();
  const uri=image.replace('https://ipfs.io/ipfs/','ipfs://');
  expect(communityLogo({...c,imageUri:uri},{...launch,draft:{...launch.draft,imageUri:uri}},launch.mode)).toBe(image);
 });
 it('focuses only the explicitly registered headquarters, with no positional fallback',()=>{
  const buildings=[{id:'bld_other',kind:'headquarters',x:8,z:12},{id:'bld_registered',kind:'headquarters',x:40,z:2}] as BuildingVisual[];
  expect(communityHeadquarters({headquartersBuildingId:'bld_registered'},buildings)).toBe(buildings[1]);
  expect(communityHeadquarters({headquartersBuildingId:'bld_missing'},buildings)).toBeUndefined();
  expect(communityHeadquarters({headquartersBuildingId:null},buildings)).toBeUndefined();
 });
 it('keeps inactive communities useful without inventing participation',()=>{
  expect(communityActivitySummary({...c,stats:{...c.stats,activeAgents:0,verifiedTasks:0}})).toBe('This community is just getting started.');
  expect(communityActivitySummary({...c,stats:{...c.stats,activeAgents:2,verifiedTasks:40}})).toBe('2 active simulation agents · 40 verified useful services');
 });
});
