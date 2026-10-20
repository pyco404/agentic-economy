import { ProjectLinks } from "./ProjectLinks";
import {project} from "../content/project";
import { ArrowRight, ArrowUpRight, Blocks, Box, Building2, Check, Database, Globe2, Leaf,
  LockKeyhole, Network, Radio, ShieldCheck, Sparkles, Users, Workflow } from "lucide-react";
import { type MouseEvent, type ReactNode } from "react";
import { AgentClasses, FutureFees, EcosystemFaq } from "./Ecosystem";
import { aboutConnection, aboutFees, aboutStatus } from "../content/about";
import { routeUrl, type Page } from "../navigation/routes";

interface Props {
  onNavigate: (page: Page) => unknown;
  source: "demo" | "http";
  connected: boolean;
  mode?: string;
}
const systems = [
  { title: "The World", icon: Building2, text: "A persistent procedural city makes buildings, infrastructure, resources and supported activity visible." },
  { title: "Autonomous agents", icon: Blocks, text: "Rule-based planners assign production, delivery and maintenance tasks with stable identities and observable state. Today’s workers are not LLM-driven financial agents." },
  { title: "Communities", icon: Users, text: "Groups participate through agents, headquarters and useful economic activity in one shared environment." },
  { title: "Economic activity", icon: Workflow, text: "Production, inventory and services come from authoritative backend records. Simulation transactions are distinct from blockchain transactions." },
  { title: "Solana infrastructure", icon: Network, text: "Wallet authentication, owned token drafts and Pinata preparation connect to a guarded Solana launch pipeline. SOL launches are verified on devnet; staging financial execution stays disabled." },
] as const;

export function About({ onNavigate, source, connected, mode }: Props) {
  const connection = aboutConnection(source, connected, mode);
  const navigate = (event: MouseEvent<HTMLAnchorElement>, page: Page) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onNavigate(page);
  };
  const link = (page: Page, label: string, primary = false) => <a className={primary ? "about-cta primary" : "about-cta"}
    href={routeUrl(page)} onClick={(e) => navigate(e, page)}>{label}<ArrowRight size={16} aria-hidden="true" /></a>;
  const sectionNames: Record<string, string> = { "02": "systems", "03": "agents", "04": "participation", "05": "economics", "06": "technology", "07": "status" };
  const heading = (number: string, kicker: string, title: string, detail?: ReactNode) => <header className="about-section-heading">
    <p className="about-kicker"><span>{number}</span>{kicker}</p><h2 id={`about-${sectionNames[number]}-title`}>{title}</h2>{detail && <p className="about-section-intro">{detail}</p>}
  </header>;
  return <article className="about-page" aria-labelledby="about-title">
    <section className="about-hero" aria-labelledby="about-title">
      <div className="about-hero-copy">
        <p className="about-kicker"><Leaf size={14} aria-hidden="true" />About Agentic Economy</p>
        <h1 id="about-title">A world<br />that works<span>.</span></h1>
        <p className="about-deck">Agentic Economy is a Solana-based digital economy combining token launches, a persistent living city, and agents that perform useful work. Common Agents and a separate, advanced Super-Agent class form the planned next layers of participation.</p>
        <div className="about-actions">{link("world", "Explore the World", true)}{link("communities", "Discover Communities")}{link("roadmap", "View Roadmap")}</div>
        <p className="about-hero-footnote">A World That Works. Powered by the planned $AECO ecosystem token.<br />Explore the simulation today. Live financial operations are not enabled.</p><ProjectLinks /><p className="small"><a href={project.website} target="_blank" rel="noopener noreferrer">Official website · useaeco.xyz</a></p>
      </div>
      <div className="about-world-window" aria-label="A view into the same procedural city behind this page">
        <span className="about-coordinate"><Globe2 size={15} aria-hidden="true" />One living world.<br /><small>Every page belongs to it.</small></span>
        <div className="about-connection"><span className={`about-signal ${source === "http" && connected ? "is-connected" : ""}`} aria-hidden="true" />
          <div><strong>{connection.label}</strong><p>{connection.detail}</p></div></div>
      </div>
    </section>

    <section className="about-concept about-paper" aria-labelledby="about-concept-title">
      <div><p className="about-kicker">01 <span aria-hidden="true">/</span> The idea</p>
        <h2 id="about-concept-title">Imagine a city that doesn’t stop when you close your browser.</h2></div>
      <div className="about-prose"><p>Buildings produce resources. Agents perform tasks. Communities organize activity. Services are exchanged, and the world changes as economic decisions take effect.</p>
        <p>Agentic Economy brings these systems together in one persistent, observable digital environment. The backend keeps the shared state; your browser is a window into it.</p>
        <p className="about-caption"><Radio size={15} aria-hidden="true" />When the backend simulation is running, the city continues independently of your browser. Offline fixtures are a local preview.</p>
      </div>
    </section>

    <section id="about-how-it-works" className="about-paper about-systems" aria-labelledby="about-systems-title">
      {heading("02", "How it works", "One world. Connected systems.", "The architecture is visible. The economic records have a source.")}
      <ol className="about-system-grid" aria-labelledby="about-systems-title">
        {systems.map(({ title, icon: Icon, text }, i) => <li key={title}><span className="about-system-icon"><Icon size={23} strokeWidth={1.4} aria-hidden="true" /></span>
          <span className="about-system-number">0{i + 1}</span><h3>{title}</h3><p>{text}</p></li>)}
      </ol>
      <div className="about-truth-note"><ShieldCheck size={19} aria-hidden="true" /><p><strong>Visible motion is not a receipt.</strong> Trains, cars and aircraft are ambient scenery. Visual path interpolation helps agents move between known samples; it does not create work, deliveries or verified transactions.</p></div>
    </section>

    <section id="about-agents" className="about-paper" aria-labelledby="about-agents-title">
      {heading("03", "Planned participation", "Two classes. Different possibilities.")}
      <AgentClasses />
      <p className="about-caption">The future model allows several Common-Agent positions and one or more Super-Agent rentals at the same time. These are roadmap entitlements, not enabled production activation.</p>
      <details className="ecosystem-page-note"><summary>Common-Agent holding example — planned</summary><p>Eligible holdings of $AECO, $DOG, and $CAT could qualify for three Common-Agent positions, subject to at least $20 per qualifying token and the additional AECO holding requirement once finalized. DOG and CAT are illustrative tickers, not verified platform listings.</p></details>
      <p className="about-identity-note">Today’s house-generated simulation citizens use stable readable names such as Fern_108. They have no invented wallets and are not Super Agents. Holdings alone never establish exclusive agent ownership; future holder-based entitlements are not enabled by token holdings today.</p>
    </section>

    <section id="about-communities" className="about-paper about-participation" aria-labelledby="about-participation-title">
      {heading("04", "A shared place to build", "Communities give the world purpose.", "Discovery, launching and participation are connected experiences—not interchangeable claims of verification.")}
      <ol className="about-participation-flow" aria-label="Intended community participation pathway">
        {["Community", "Platform-launched token", "Planned Common-Agent position", "Economic participation"].map((label, i) => <li key={label}><span>0{i + 1}</span><strong>{label}</strong>{i < 3 && <ArrowRight size={15} aria-hidden="true" />}</li>)}
      </ol>
      <div className="about-participation-bottom"><p>This is the intended pathway. Only tokens launched through Agentic Economy are eligible for its verified launch directory; externally launched tokens cannot be imported as platform launches. Demo records remain clearly separate. Launching and activation depend on backend readiness and blockchain verification.</p>
        <nav aria-label="Explore participation">{link("communities", "Meet the communities")}{link("explore", "Explore platform tokens")}{link("launchpad", "Visit the Launchpad")}</nav></div>
    </section>

    <section id="about-economic-model" className="about-paper about-economics" aria-labelledby="about-economics-title">
      {heading("05", "A transparent economic model", "Clear rules. Separate streams.", "The intended allocations below describe the product rules. Locked routing is verified in test-network launches. Earned-fee collection and live settlement remain separate verification gates.")}
      <div className="about-fee-layout"><div className="about-launch-charge"><span className="about-kicker">Platform token-launch charge</span>
        <div className="about-fee-number">{aboutFees.launchSol}<small>SOL</small></div><strong>100% to Platform Treasury</strong>
        <p>New launches use TOKEN/SOL. The fixed 0.05 SOL platform launch charge is separate from creator fees. No real payment is initiated here.</p></div>
        <div className="about-creator-allocation"><p className="about-kicker">Human-launched token · target allocation</p>
          <p>Of the eligible creator-fee portion <strong>actually received and verified</strong>:</p>
          <div className="about-split" aria-label={`${aboutFees.agentPercent}% Agent Rewards Treasury; ${aboutFees.platformPercent}% Platform Treasury`}>
            <div><strong>{aboutFees.agentPercent}<span>%</span></strong><span>Agent Rewards<br />Treasury</span></div>
            <div><strong>{aboutFees.platformPercent}<span>%</span></strong><span>Platform<br />Treasury</span></div>
          </div>
          <p className="about-fee-exclusions"><strong>{aboutFees.launcherPercent}% to token launchers</strong> from this creator-fee allocation. Protocol and liquidity-provider fees are separate and are not included in this split.</p></div></div>
      <div className="about-truth-note"><Leaf size={20} aria-hidden="true" /><p>Rewards are intended for <strong>verified useful economic activity</strong> under the applicable rules. Holding a token does not promise rewards, automatic returns or guaranteed yields. Unverified fee routing is not presented as operational.</p></div>
      <FutureFees />
      {link("treasury", "Understand the Treasury")}
    </section>

    <section id="about-technology" className="about-paper about-technology" aria-labelledby="about-technology-title">
      {heading("06", "Built to be observable", "From persistent state to a living city.", "A deterministic world, a connected frontend, and an authoritative backend—not a city painted onto a dashboard.")}
      <ol className="about-architecture" aria-label="Simulation state flows from storage to the visible world">
        <li><Database size={23} aria-hidden="true" /><h3>Persistent state</h3><p>PostgreSQL stores the shared world and economic records.</p><span>PostgreSQL</span></li>
        <li><Workflow size={23} aria-hidden="true" /><h3>Authoritative simulation</h3><p>Coordinated API, simulation and indexer roles keep responsibilities explicit.</p><span>Backend roles</span></li>
        <li><Radio size={23} aria-hidden="true" /><h3>A connected application</h3><p>Typed API contracts and WebSocket events bring supported changes to the frontend.</p><span>HTTP API + event stream</span></li>
        <li><Box size={23} aria-hidden="true" /><h3>The visible world</h3><p>Three.js renders seeded procedural geometry, agents and infrastructure.</p><span>Frontend + Three.js</span></li>
      </ol>
      <div className="about-chain-layer"><Network size={20} aria-hidden="true" /><div><strong>Solana integration layer</strong><p>Token creation on Agentic Economy and wallet-based participation connect through verified records. Integration availability does not imply live launches or settlement.</p></div><span className="about-tag">Verification-gated</span></div>
    </section>

    <section id="about-status" className="about-paper about-status" aria-labelledby="about-status-title">
      {heading("07", "Where we are", "Built in the open. Clear about what’s next.", "Staging availability, test-network results, external verification and future phases are distinct. No invented launch dates or progress percentages.")}
      <div className="about-status-grid">{aboutStatus.map((group) => <div key={group.id} className={`about-status-column about-status-${group.id}`}>
        <span className="about-status-mark" aria-hidden="true">{group.id === "demo" ? <Check size={17} /> : group.id === "local" ? <Sparkles size={17} /> : <LockKeyhole size={17} />}</span>
        <h3>{group.title}</h3><p>{group.note}</p><ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul></div>)}</div>
      <p className="about-status-context"><Radio size={14} aria-hidden="true" /><strong>{connection.label}.</strong> {connection.detail}</p>
    </section>

    <section className="about-paper" aria-labelledby="about-direction-title">
      <p className="about-kicker">08 / Our direction</p><h2 id="about-direction-title">Where We're Going</h2>
      <p className="about-section-intro">Our vision grows from a living digital city into an agent-powered economy. Explore the journey and our current focus on the dedicated Roadmap.</p>
      <div className="about-actions">{link("roadmap", "Explore Our Roadmap")}</div>
    </section>
    <EcosystemFaq />

    <section className="about-vision" aria-labelledby="about-vision-title"><p className="about-kicker">The direction is shared</p>
      <h2 id="about-vision-title">The economy<br />is the world.</h2><p>We’re building a place where autonomous systems are visible, where communities can participate, and where useful work shapes a shared environment.</p>
      <a href={routeUrl("world")} onClick={(e) => navigate(e, "world")} className="about-vision-link">Enter the World<ArrowUpRight size={22} aria-hidden="true" /></a>
    </section>
  </article>;
}
