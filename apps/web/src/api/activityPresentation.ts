import type { Community, EconomicEvent, WorldStats } from './shared';
import { officialToken } from '../content/project';

/** Presentation only: an event name (including trade.executed) is not chain evidence. */
export function activityCategory(event: EconomicEvent, communities: Community[], mode: WorldStats['mode']) {
  if (event.type !== 'launch.confirmed') return { label: 'City World', detail: 'Virtual city activity; not a blockchain transaction or paid economic service.' };
  const community = communities.find(c => c.id === event.communityId);
  if (mode !== 'demo' && community?.provenance && community.provenance.network !== 'localnet' &&
    event.data.mint === community.mint && event.data.signature === community.launchSignature) {
    return { label: 'On-chain', detail: `Verified platform launch on ${community.provenance.network === 'mainnet-beta' ? 'Solana Mainnet' : 'Solana Devnet (test network)'}.` };
  }
  return { label: mode === 'demo' ? 'Demo record' : 'Verification pending', detail: 'This record does not provide matched on-chain launch evidence in this view.' };
}

/** Unknown/stale indexing is distinct from a verified empty holder snapshot. */
export function cityPopulation(stats: WorldStats) {
  const p = stats.aecoPopulation;
  const observed = stats.mode !== 'demo' && p?.mint === officialToken.mint && p.network === 'mainnet-beta' &&
    p.indexedSlot !== null && p.checkedAt !== null && (p.status === 'current' || p.status === 'stale');
  return { holders: observed ? p.holders : null, commonAgents: observed ? p.commonAgents : null,
    cityGroupResidents: stats.simulation?.groups.reduce((n, group) => n + group.activeAgents, 0) ?? null,
    virtualResidents: stats.population, stale: observed && p.status === 'stale' };
}
