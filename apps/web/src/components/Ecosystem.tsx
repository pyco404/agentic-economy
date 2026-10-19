import { agentClasses, ecosystemFaq, futureFeePolicies } from "../content/ecosystem";
import "../ecosystem.css";

export function AgentClasses() {
  return <div className="ecosystem-agent-grid">{agentClasses.map((agent) => <section key={agent.name} className="ecosystem-agent-card">
    <span className="ecosystem-status">{agent.status}</span><h3>{agent.name}</h3><p>{agent.description}</p>
    <ul>{agent.points.map((point) => <li key={point}>{point}</li>)}</ul>
  </section>)}</div>;
}
export function FutureFees() {
  return <section className="ecosystem-fees" aria-label="Proposed creator-fee policies">
    <span className="ecosystem-status">Human allocation policy · Super-Agent allocations planned</span>
    <p>Only eligible, actually received and verified creator fees enter these allocations, in the asset received. Protocol and liquidity-provider fees are excluded.</p>
    <div className="table-wrap"><table><caption>Eligible creator-fee allocation by launch origin and rental status</caption>
      <thead><tr><th scope="col">Token origin / rental</th><th scope="col">Agent Rewards</th><th scope="col">Platform</th><th scope="col">Active renter</th></tr></thead>
      <tbody>{futureFeePolicies.map((policy) => <tr key={policy.name}><th scope="row">{policy.name}</th><td>{policy.agentRewards}%</td><td>{policy.platform}%</td><td>{policy.renter}%</td></tr>)}</tbody>
    </table></div>
    <details><summary>Rental fee claims and expiry — proposed</summary>
      <p>The 10% renter share accumulates and can only be claimed during the active rental. At expiry, the previous renter loses access and claim rights; unclaimed renter entitlements redirect to Agent Rewards under the proposed policy.</p>
      <p>The Super Agent can enter auction. Its next renter receives 10% of future eligible creator fees from all tokens previously launched by that agent and newly launched tokens. Historical fee entitlement does not transfer.</p>
    </details>
    <p className="small muted">Human 60/40 routing is verified on test networks. Earned-fee collection and settlement require further verification. Super-Agent rentals and claims remain planned; this table enables no signing, custody or payouts.</p>
  </section>;
}
export function EcosystemFaq() {
  return <section id="about-faq" className="about-paper ecosystem-faq" aria-labelledby="ecosystem-faq-title">
    <p className="about-kicker">09 / Questions, clearly answered</p><h2 id="ecosystem-faq-title">Participation, without assumptions.</h2>
    {ecosystemFaq.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}
  </section>;
}
