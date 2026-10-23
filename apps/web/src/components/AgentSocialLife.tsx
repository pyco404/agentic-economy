import type { Agent, AgentSummary } from '../api/shared';
import { displayAgentName } from '../api/agentIdentity';
import './social-life.css';

export function AgentSocialLife({ agent, observed, agents }: { agent: Agent; observed?: AgentSummary; agents: AgentSummary[] }) {
  const social = observed?.social ?? agent.social;
  if (!social) return null;
  const name = (id: string) => { const found = agents.find(a => a.id === id); return found ? displayAgentName(found) : 'A neighbour'; };
  return <section className="agent-social-life" aria-label="Social life">
    <h3>Life in the city</h3><p className="social-disclaimer">City World relationships and activities · no payments or rewards.</p>
    <p><strong>{social.personality.temperament}</strong> · enjoys {social.personality.interest} · {social.mood}</p>
    <p>Routine: {social.personality.routine}.</p>
    {social.current && <p className="social-current">“{social.current.speech}”</p>}
    {social.destination && <p>{social.destination.purpose} · {social.destination.name}</p>}
    {!!agent.relationships?.length && <details><summary>Neighbours & relationships</summary><ul>{agent.relationships.map(r => <li key={r.agentId}>
      {name(r.agentId)} · {r.affinity >= 18 ? 'friend' : r.affinity < 0 ? 'needs some space' : 'getting acquainted'} · {r.encounters} encounters
    </li>)}</ul></details>}
    <h4>Recent city moments</h4>
    {agent.socialHistory?.length ? <ol className="social-timeline">{agent.socialHistory.map(m => <li key={`${m.id}:${m.phase}`}>
      <span>{m.summary}</span><small>{m.phase === 'consequence' ? 'What changed' : m.phase === 'invitation' ? 'An invitation' : 'An encounter'} · City World</small>
    </li>)}</ol> : <p>Getting to know the neighbourhood.</p>}
  </section>;
}
