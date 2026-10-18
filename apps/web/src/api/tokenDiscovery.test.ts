import { describe,expect,it } from 'vitest';
import { Community,LaunchResponse,type TokenMarket } from './shared';
import type { VerifiedToken } from './tokens';
import { orderTokens } from './tokenDiscovery';
import communities from '../../../../packages/shared/fixtures/communities.json';
import launch from '../../../../packages/shared/fixtures/launch.json';
function token(mint:string,name:string,activeAgents:number,services:number,createdAt:string):VerifiedToken {
 const community=Community.parse(communities.items[0]);
 return {community:{...community,mint,name,stats:{...community.stats,activeAgents,verifiedTasks:services}},launch:{...LaunchResponse.parse(launch).launch,mint,createdAt}};
}
const tokens=[token('C','Cedar',2,18,'2026-10-16T00:00:00Z'),token('A','Aster',5,3,'2026-10-17T00:00:00Z'),token('B','Birch',5,7,'2026-10-17T00:00:00Z')];
describe('verified discovery rankings',()=>{
 it('orders new launches by the actual recorded date with stable mint ties',()=>{expect(orderTokens(tokens,'newest').map(t=>t.community.mint)).toEqual(['A','B','C']);});
 it('orders active agents independently from useful work, never claiming trading volume',()=>{
  expect(orderTokens(tokens,'agents').map(t=>t.community.mint)).toEqual(['A','B','C']);
  expect(orderTokens(tokens,'services').map(t=>t.community.mint)).toEqual(['C','B','A']);
 });
 it('preserves input order and records and supports name sorting and empty results',()=>{
  const before=structuredClone(tokens);expect(orderTokens(tokens,'name').map(t=>t.community.name)).toEqual(['Aster','Birch','Cedar']);expect(tokens).toEqual(before);expect(orderTokens([],'newest')).toEqual([]);
 });
});

it('ranks available provider metrics with stable ties, excluding stale data from market rank values',()=>{
 const items=tokens.map((t,i)=>({...t,market:{status:i===0?'stale':'available',volume24hUsd:i===0?9999:10,marketCapUsd:i===1?null:100} as TokenMarket}));
 expect(orderTokens(items,'volume').map(t=>t.community.mint)).toEqual(['A','B','C']);
 expect(orderTokens(items,'marketCap').map(t=>t.community.mint)[0]).toBe('B');
 expect(orderTokens(items,'holders').map(t=>t.community.mint)).toEqual(['A','B','C']);
});
