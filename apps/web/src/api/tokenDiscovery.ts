import type { VerifiedToken } from './tokens';
export type DiscoveryOrder = 'newest' | 'agents' | 'services' | 'name';
/** Rankings use confirmed launch/community records, never proxy market figures. */
export function orderTokens(tokens: readonly VerifiedToken[], order: DiscoveryOrder) {
 return [...tokens].sort((a,b)=>{
  const comparison = order==='agents' ? b.community.stats.activeAgents-a.community.stats.activeAgents :
   order==='services' ? b.community.stats.verifiedTasks-a.community.stats.verifiedTasks :
   order==='name' ? a.community.name.localeCompare(b.community.name) : Date.parse(b.launch.createdAt)-Date.parse(a.launch.createdAt);
  return comparison || a.community.mint.localeCompare(b.community.mint);
 });
}
