import { ChevronDown, Leaf } from "lucide-react";
import { roadmap } from "../content/ecosystem";
import "../roadmap.css";

/** Editorial roadmap only; no capability, eligibility or financial switches. */
export function Roadmap() {
  return <article className="roadmap-page" aria-labelledby="roadmap-title">
    <header className="roadmap-intro">
      <p className="about-kicker"><Leaf size={15} aria-hidden="true" />Our development roadmap</p>
      <h1 id="roadmap-title">A world built<br />in phases.</h1>
      <p>A persistent city is the foundation. Verified token preparation is the next step. Explore the eight phases shaping Agentic Economy, with a clear view of what works today and what comes next.</p>
      <div className="roadmap-legend" aria-label="Development status key"><span>Core staging milestone achieved</span><span>Currently in development</span><span>Planned</span></div>
      <p className="roadmap-context">Phase 2 is our current development and verification phase. Test-network results do not mean mainnet readiness. Later phases remain planned, with no promised dates or returns.</p>
    </header>
    <section className="roadmap-phases" aria-label="Eight development phases">
      {roadmap.map((phase) => <details key={phase.phase} open={phase.phase === 2}
        data-status={phase.phase === 1 ? "core" : phase.phase === 2 ? "active" : "planned"}>
        <summary>
          <span className="roadmap-number" aria-hidden="true">{String(phase.phase).padStart(2, "0")}</span>
          <span className="roadmap-phase-heading"><strong>Phase {phase.phase} — {phase.title}</strong><small>{phase.status}</small><span>{phase.summary}</span></span>
          <ChevronDown className="roadmap-toggle" size={18} aria-hidden="true" />
        </summary>
        <div className="roadmap-detail">
          {phase.built.length > 0 && <div><h2>Verified milestones · scope noted</h2><ul>{phase.built.map((item) => <li key={item}>{item}</li>)}</ul></div>}
          <div><h2>{phase.phase < 3 ? "Outstanding / in development" : "Planned scope"}</h2><ul>{phase.pending.map((item) => <li key={item}>{item}</li>)}</ul></div>
        </div>
      </details>)}
    </section>
    <p className="roadmap-footnote">This roadmap describes product direction. It enables no launches, payouts or agent entitlements. Simulation Credits are separate from cryptocurrency; any future AECO rewards depend on verified eligibility and a funded, capped pool.</p>
  </article>;
}
