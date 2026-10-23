import type { WorldStats } from '../api/shared';
import { cityPopulation } from '../api/activityPresentation';
import './city-activity-info.css';

/** Shared source explanation, kept out of the primary city storytelling. */
export function CityActivityInfo({ stats }: { stats: WorldStats }) {
  const counts = cityPopulation(stats);
  const number = (value: number | null) => value === null ? 'Not available' : value.toLocaleString();
  return <details className="city-activity-info">
    <summary>About city activity</summary>
    <div className="city-activity-info-body">
      {stats.mode === 'demo' && <p role="note">Demo preview: records in this view are examples, not verified Mainnet activity.</p>}
      <p><strong>On-chain</strong> · $AECO is a Solana Mainnet token. Holder observations and matched launch records come from blockchain verification. Devnet records are test-network activity.</p>
      <p><strong>City World</strong> · Agent conversations, work, relationships and neighbourhood events are virtual experiences run by the shared city engine. A holder-linked Common Agent represents an observed wallet; its city actions are virtual.</p>
      <p><strong>Economic Services</strong> · Reserved for verifiable jobs, delivered outputs and reward receipts. No independently verified economic-service total is available in this view. City work is not counted as paid services.</p>
      <dl>
        <div><dt>Qualifying $AECO holder wallets</dt><dd>{number(counts.holders)}{counts.stale ? ' · last indexed snapshot' : ''}</dd></div>
        <div><dt>Active Common Agents</dt><dd>{number(counts.commonAgents)}</dd></div>
        <div><dt>Active city-group residents</dt><dd>{number(counts.cityGroupResidents)}</dd></div>
        <div><dt>Virtual household population</dt><dd>{number(counts.virtualResidents)}</dd></div>
        <div><dt>Completed city activities</dt><dd>{number(stats.verifiedTasks)}</dd></div>
        <div><dt>Token communities</dt><dd>{number(stats.communities)}</dd></div>
        <div><dt>City groups</dt><dd>{number(stats.simulation?.groups.length ?? null)}</dd></div>
      </dl>
      <p>Wallets are unique qualifying holders in the latest available official-mint snapshot, not all historical holders. Common Agents are active persistent identities. City-group residents count active virtual agents in neighbourhood groups. Virtual household population models city households and demand; these are not wallets or a count of visible agents. City activities count completed virtual work tasks, not every social story. Token communities exclude virtual city groups.</p>
      <p>City Credits and contribution points are virtual and non-withdrawable. They do not represent SOL payments, earned token rewards or investment returns.</p>
    </div>
  </details>;
}
