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
  { title: "Autonomous agents", icon: Blocks, text: "Common Agents represent qualifying $AECO holders and take part in basic virtual city activities. Other virtual city residents keep the city working." },
  { title: "Communities", icon: Users, text: "Groups participate through agents, headquarters and virtual city activity in one shared environment." },
  { title: "Economic activity", icon: Workflow, text: "Virtual city work and activities shape the shared world. City Credits are virtual and cannot be withdrawn or spent from your wallet." },
  { title: "Solana infrastructure", icon: Network, text: "Tokens are created through our TOKEN/SOL Launchpad with personal wallet approval. $AECO is live on Mainnet, and the Launchpad is open to authenticated wallets." },
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
        <p className="about-deck">Agentic Economy is a Solana-based digital economy combining token launches, a persistent living city, and agents that perform useful work. $AECO is live, and each qualifying holder wallet automatically receives one persistent Common Agent for basic virtual city activities, without registration or wallet connection. Phase 3 expands these same agents with advanced behavior and economic capabilities. Super Agents are a separate class planned for Phase 5.</p>
        <div className="about-actions">{link("world", "Explore the World", true)}{link("communities", "Discover Communities")}{link("roadmap", "View Roadmap")}</div>
        <p className="about-hero-footnote">A World That Works. $AECO connects holders to our shared city.<br />Public TOKEN/SOL launching is live. Treasury payouts remain disabled.</p><ProjectLinks /><p className="small"><a href={project.website} target="_blank" rel="noopener noreferrer">Official website · useaeco.xyz</a></p>
      </div>
      <div className="about-world-window" aria-label="A view into the same procedural city behind this page">
        <span className="about-coordinate"><Globe2 size={15} aria-hidden="true" />One living world.<br /><small>Every page belongs to it.</small></span>
        {import.meta.env.DEV && <div className="about-connection"><span className={`about-signal ${source === "http" && connected ? "is-connected" : ""}`} aria-hidden="true" />
          <div><strong>{connection.label}</strong><p>{connection.detail}</p></div></div>}
      </div>
    </section>

    <section className="about-concept about-paper" aria-labelledby="about-concept-title">
      <div><p className="about-kicker">01 <span aria-hidden="true">/</span> The idea</p>
        <h2 id="about-concept-title">Imagine a city that doesn’t stop when you close your browser.</h2></div>
      <div className="about-prose"><p>Buildings produce resources. Agents perform tasks. Communities organize activity. Services are exchanged, and the world changes as economic decisions take effect.</p>
        <p>Agentic Economy brings these systems together in one persistent, observable digital environment. Your browser is a window into the same world everyone shares.</p>
        <p className="about-caption"><Radio size={15} aria-hidden="true" />The shared city continues when you close your browser. Your Common Agent’s identity persists as your holdings change.</p>
      </div>
    </section>

    <section id="about-how-it-works" className="about-paper about-systems" aria-labelledby="about-systems-title">
      {heading("02", "How it works", "One world. Connected systems.", "Token launches, communities and city activity come together in one place.")}
      <ol className="about-system-grid" aria-labelledby="about-systems-title">
        {systems.map(({ title, icon: Icon, text }, i) => <li key={title}><span className="about-system-icon"><Icon size={23} strokeWidth={1.4} aria-hidden="true" /></span>
          <span className="about-system-number">0{i + 1}</span><h3>{title}</h3><p>{text}</p></li>)}
      </ol>
      <div className="about-truth-note"><ShieldCheck size={19} aria-hidden="true" /><p><strong>A living city, with clear limits.</strong> Common Agents currently move and perform basic virtual city activities. Scenery and movement do not represent investment returns or payments.</p></div>
    </section>

    <section id="about-agents" className="about-paper" aria-labelledby="about-agents-title">
      {heading("03", "Agents today and tomorrow", "Two classes. Different possibilities.")}
      <AgentClasses />
      <p className="about-caption">The future model allows several Common-Agent positions and one or more Super-Agent rentals at the same time. These are roadmap entitlements, not enabled production activation.</p>
      <details className="ecosystem-page-note"><summary>Common-Agent holding example — planned</summary><p>Eligible holdings of $AECO, $DOG, and $CAT could qualify for three Common-Agent positions, subject to at least $20 per qualifying token and the additional AECO holding requirement once finalized. DOG and CAT are illustrative tickers, not verified platform listings.</p></details>
      <p className="about-identity-note">$AECO-linked Common Agents are distinct from the city’s other virtual residents. Additional purchases do not create duplicates. A full exit pauses your Common Agent; returning holders restore the same identity. Appearance does not grant wallet control or financial permissions.</p>
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
      {heading("05", "A transparent economic model", "Clear rules. Separate streams.", "The official $AECO launch has verified creator-fee routing and finalized treasury receipts on Solana Mainnet. Fees support the wider economy; distributions are distinct from payouts or rewards to holders.")}
      <div className="about-fee-layout"><div className="about-launch-charge"><span className="about-kicker">Platform token-launch charge</span>
        <div className="about-fee-number">{aboutFees.launchSol}<small>SOL</small></div><strong>100% to Platform Treasury</strong>
        <p>New launches use TOKEN/SOL. The fixed 0.05 SOL platform launch charge is separate from creator fees. No real payment is initiated here.</p></div>
        <div className="about-creator-allocation"><p className="about-kicker">Human-launched token · creator-fee allocation</p>
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
      {heading("06", "Built to be observable", "From persistent state to a living city.", "A persistent city connects verified token launches with visible community activity.")}
      <ol className="about-architecture" aria-label="City state flows from storage to the visible world">
        <li><Database size={23} aria-hidden="true" /><h3>Persistent state</h3><p>The shared world and economic records are preserved.</p><span>Shared history</span></li>
        <li><Workflow size={23} aria-hidden="true" /><h3>Shared city engine</h3><p>City activity and verified holder changes keep the world up to date.</p><span>Ongoing activity</span></li>
        <li><Radio size={23} aria-hidden="true" /><h3>A connected application</h3><p>Live updates bring the same city activity to everyone.</p><span>Live updates</span></li>
        <li><Box size={23} aria-hidden="true" /><h3>The visible world</h3><p>Explore the city, its agents and connected infrastructure.</p><span>One shared city</span></li>
      </ol>
      <div className="about-chain-layer"><Network size={20} aria-hidden="true" /><div><strong>Solana integration layer</strong><p>$AECO launched through Agentic Economy. Qualifying holders are represented automatically, while transaction approval remains in your own wallet.</p></div><span className="about-tag">Verified $AECO launch</span></div>
    </section>

    <section id="about-status" className="about-paper about-status" aria-labelledby="about-status-title">
      {heading("07", "Where we are", "Built in the open. Clear about what’s next.", "$AECO, holder Common Agents and public TOKEN/SOL launching are live. Phase 2 public-release acceptance is complete; Phase 3 has not started.")}
      <div className="about-status-grid">{aboutStatus.map((group) => <div key={group.id} className={`about-status-column about-status-${group.id}`}>
        <span className="about-status-mark" aria-hidden="true">{group.id === "demo" ? <Check size={17} /> : group.id === "local" ? <Sparkles size={17} /> : <LockKeyhole size={17} />}</span>
        <h3>{group.title}</h3><p>{group.note}</p><ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul></div>)}</div>
      {import.meta.env.DEV && <p className="about-status-context"><Radio size={14} aria-hidden="true" /><strong>{connection.label}.</strong> {connection.detail}</p>}
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
