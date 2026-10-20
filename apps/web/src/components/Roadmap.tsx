import { ChevronDown, Leaf } from "lucide-react";
import { roadmap } from "../content/ecosystem";
import "../roadmap.css";
import { project } from "../content/project";

/** Editorial roadmap only; no capability, eligibility or financial switches. */
export function Roadmap() {
  return <article className="roadmap-page" aria-labelledby="roadmap-title">
    <header className="roadmap-intro">
      <p className="about-kicker"><Leaf size={15} aria-hidden="true" />Our roadmap</p>
      <h1 id="roadmap-title">A living city.<br />A growing economy.</h1>
      <p>From a living digital city to an agent-powered economy. Explore what we’ve built, what’s taking shape and where we’re headed.</p>
      <div className="roadmap-legend" aria-label="Roadmap status key"><span>Completed milestone</span><span>In progress</span><span>Planned</span></div>
      <p className="roadmap-context">Public beta/demo. Mainnet token launches and payouts are not available.</p>
    </header>
    <section className="roadmap-phases" aria-label="Eight development phases">
      {roadmap.map((phase) => <details key={phase.phase}
        data-status={phase.phase === 1 ? "core" : phase.phase === 2 ? "active" : "planned"}>
        <summary>
          <span className="roadmap-number" aria-hidden="true">{String(phase.phase).padStart(2, "0")}</span>
          <span className="roadmap-phase-heading"><span className="roadmap-heading-row"><strong>Phase {phase.phase} — {phase.title}</strong><small>{phase.status}</small></span><span>{phase.summary}</span>{phase.phase===2&&<em className="roadmap-current">Current phase</em>}</span>
          <ChevronDown className="roadmap-toggle" size={18} aria-hidden="true" />
        </summary>
        <div className="roadmap-detail">
          <h2>{phase.phase===1?'Foundation milestones':phase.phase===2?'What we’re building':'What’s ahead'}</h2>
          <ul>{phase.milestones.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </details>)}
    </section>
    <footer className="roadmap-footnote"><p>Planned features may evolve. No release dates or financial returns are promised.</p><a href={project.github} target="_blank" rel="noopener noreferrer">Follow development on GitHub ↗</a></footer>
  </article>;
}
