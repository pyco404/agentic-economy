import { agentClasses, ecosystemFaq, futureFeePolicies, roadmap } from "../content/ecosystem";
import "../ecosystem.css";

export function AgentClasses() {
  return <div className="ecosystem-agent-grid">{agentClasses.map((agent) => <section key={agent.name} className="ecosystem-agent-card">
    <span className="ecosystem-status">{agent.status}</span><h3>{agent.name}</h3><p>{agent.description}</p>
    <ul>{agent.points.map((point) => <li key={point}>{point}</li>)}</ul>
  </section>)}</div>;
}
export function FutureFees() {
  return <section className="ecosystem-fees" aria-label="Proposed creator-fee policies">
    <span className="ecosystem-status">Proposed future policy · not operational</span>
    <p>Only eligible, actually received and verified creator fees enter these allocations, in the asset received. Protocol and liquidity-provider fees are excluded.</p>
    <div className="table-wrap"><table><caption>Eligible creator-fee allocation by launch origin and rental status</caption>
      <thead><tr><th scope="col">Token origin / rental</th><th scope="col">Agent Rewards</th><th scope="col">Platform</th><th scope="col">Active renter</th></tr></thead>
      <tbody>{futureFeePolicies.map((policy) => <tr key={policy.name}><th scope="row">{policy.name}</th><td>{policy.agentRewards}%</td><td>{policy.platform}%</td><td>{policy.renter}%</td></tr>)}</tbody>
    </table></div>
    <details><summary>Rental fee claims and expiry — proposed</summary>
      <p>The 10% renter share accumulates and can only be claimed during the active rental. At expiry, the previous renter loses access and claim rights; unclaimed renter entitlements redirect to Agent Rewards under the proposed policy.</p>
      <p>The Super Agent can enter auction. Its next renter receives 10% of future eligible creator fees from all tokens previously launched by that agent and newly launched tokens. Historical fee entitlement does not transfer.</p>
    </details>
    <p className="small muted">These policies require implementation, audit, and verification. They do not change current treasury allocation or enable signing, claims, custody, or settlement.</p>
  </section>;
}
export function Roadmap() {
  return <section id="about-roadmap" className="about-paper ecosystem-roadmap" aria-labelledby="roadmap-title">
    <p className="about-kicker">08 / Development roadmap</p><h2 id="roadmap-title">A world built in phases.</h2>
    <p>Working demo components, integration work, and future capabilities are shown separately. Phase 1 is in progress; completion remains subject to verification. No launch dates or guaranteed outcomes.</p>
    <div className="roadmap-phases">{roadmap.map((phase) => <details key={phase.phase} open={phase.phase === 1}>
      <summary><span className="roadmap-number">0{phase.phase}</span><span><strong>Phase {phase.phase} — {phase.title}</strong><small>{phase.status}</small></span></summary>
      <div className="roadmap-detail"><p>{phase.summary}</p>
        {phase.built.length > 0 && <div><h3>Available in demo</h3><ul>{phase.built.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        <div><h3>{phase.phase < 3 ? "Outstanding / in development" : "Planned scope"}</h3><ul>{phase.pending.map((item) => <li key={item}>{item}</li>)}</ul></div>
      </div></details>)}</div>
  </section>;
}
export function EcosystemFaq() {
  return <section id="about-faq" className="about-paper ecosystem-faq" aria-labelledby="ecosystem-faq-title">
    <p className="about-kicker">09 / Questions, clearly answered</p><h2 id="ecosystem-faq-title">Participation, without assumptions.</h2>
    {ecosystemFaq.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}
  </section>;
}
