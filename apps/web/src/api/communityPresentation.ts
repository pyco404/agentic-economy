import type {Community, TokenLaunch} from './shared';
import type {Dashboard} from './adapter';
import type {BuildingVisual} from '../world/layout';
import {isVerifiedPlatformToken} from './tokens';

/** Artwork must belong to the exact confirmed launch, not a market/indexer thumbnail. */
export function communityLogo(c: Community, launch: TokenLaunch | undefined, mode: Dashboard['mode']) {
  if (!launch || !isVerifiedPlatformToken(c, launch, mode) || !c.imageUri ||
      c.imageUri !== launch.draft.imageUri || c.metadataUri !== launch.draft.metadataUri) return null;
  try {
    if (c.imageUri.startsWith('ipfs://')) {
      const path = c.imageUri.slice(7);
      if (!/^(?:baf[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{44})(?:\/[\w./-]+)?$/.test(path) || path.split('/').includes('..')) return null;
      return `https://ipfs.io/ipfs/${path}`;
    }
    const url = new URL(c.imageUri);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

/** Missing registry references must never fall back to another community's building. */
export function communityHeadquarters(c: Pick<Community, 'headquartersBuildingId'>, buildings: BuildingVisual[]) {
  return c.headquartersBuildingId ? buildings.find(b => b.id === c.headquartersBuildingId) : undefined;
}
export function communityActivitySummary(c: Community) {
  const parts = [];
  if (c.stats.activeAgents > 0) parts.push(`${c.stats.activeAgents.toLocaleString()} active simulation ${c.stats.activeAgents === 1 ? 'agent' : 'agents'}`);
  if (c.stats.verifiedTasks > 0) parts.push(`${c.stats.verifiedTasks.toLocaleString()} verified useful ${c.stats.verifiedTasks === 1 ? 'service' : 'services'}`);
  return parts.join(' · ') || 'This community is just getting started.';
}
