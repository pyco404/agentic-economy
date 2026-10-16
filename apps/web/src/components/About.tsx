import { ArrowRight, ArrowUpRight, Blocks, Box, Building2, Check, Database, Globe2, Leaf,
  LockKeyhole, Network, Radio, ShieldCheck, Sparkles, Users, Workflow } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
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
  { title: "Autonomous agents", icon: Blocks, text: "Software-driven participants perform the tasks supported by the simulation, with identifiable roles and state." },
  { title: "Communities", icon: Users, text: "Groups participate through agents, headquarters and useful economic activity in one shared environment." },
  { title: "Economic activity", icon: Workflow, text: "Production, inventory and services come from authoritative backend records. Simulation transactions are distinct from blockchain transactions." },
  { title: "Solana infrastructure", icon: Network, text: "The integration layer is intended for verified launches, wallet-based identity and supported financial operations. Live actions remain disabled." },
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
        <p className="about-deck">Agentic Economy is a shared digital world where autonomous agents, communities, and businesses participate in a living economy. Every action contributes to a city that continues to operate, evolve, and grow.</p>
        <div className="about-actions">{link("world", "Explore the World", true)}{link("communities", "Discover Communities")}</div>
        <p className="about-hero-footnote">A Solana-oriented economy in development.<br />Explore the simulation today. Live financial operations are not enabled.</p>
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

    <section id="about-agents" className="about-identities" aria-labelledby="about-agents-title">
      <div className="about-paper about-identity-intro">{heading("03", "Identity & participation", "Two kinds of citizens.")}
        <p>Simulation identity and verified wallet identity serve different purposes. They stay distinct throughout the world.</p></div>
      <div className="about-agent-pair">
        <div className="about-agent-card about-house"><span className="about-tag"><Blocks size={13} aria-hidden="true" />Simulation participant</span>
          <div className="about-name-samples" aria-label="Example house-agent names"><span>Fern_108</span><span>Bow_194</span></div>
          <h3>House-generated agents</h3><p>Created by the city simulation, with unique, stable, readable names. House agents operate without invented blockchain wallets.</p>
          <div className="about-agent-caption"><Check size={15} aria-hidden="true" />Their work is represented by supported simulation state.</div></div>
        <div className="about-agent-card about-token"><span className="about-tag"><LockKeyhole size={13} aria-hidden="true" />Activation in development</span>
          <div className="about-wallet-example"><span>CMYx...6Wec</span><small>Illustrative shortened-wallet format</small></div>
          <h3>Token-linked agents</h3><p>Designed around <strong>one eligible token, one token-linked agent, one verified activating wallet</strong>. Identity and activation must be verified by the backend.</p>
          <div className="about-agent-caption"><LockKeyhole size={15} aria-hidden="true" />Real activation is unavailable until implemented and enabled.</div></div>
      </div>
      <p className="about-identity-note">Token holdings alone do not establish exclusive agent ownership. No rewards or ownership rights are implied by these example names.</p>
    </section>

    <section id="about-communities" className="about-paper about-participation" aria-labelledby="about-participation-title">
      {heading("04", "A shared place to build", "Communities give the world purpose.", "Discovery, launching and participation are connected experiences—not interchangeable claims of verification.")}
      <ol className="about-participation-flow" aria-label="Intended community participation pathway">
        {["Community", "Platform-launched token", "Verified token-linked agent", "Economic participation"].map((label, i) => <li key={label}><span>0{i + 1}</span><strong>{label}</strong>{i < 3 && <ArrowRight size={15} aria-hidden="true" />}</li>)}
      </ol>
      <div className="about-participation-bottom"><p>This is the intended pathway. Only tokens launched through Agentic Economy are eligible for its verified launch directory; externally launched tokens cannot be imported as platform launches. Demo records remain clearly separate. Launching and activation depend on backend readiness and blockchain verification.</p>
        <nav aria-label="Explore participation">{link("communities", "Meet the communities")}{link("explore", "Explore platform tokens")}{link("launchpad", "Visit the Launchpad")}</nav></div>
    </section>

    <section id="about-economic-model" className="about-paper about-economics" aria-labelledby="about-economics-title">
      {heading("05", "A transparent economic model", "Clear rules. Separate streams.", "The intended allocations below describe the product rules. Live settlement and fee sharing remain disabled pending verification.")}
      <div className="about-fee-layout"><div className="about-launch-charge"><span className="about-kicker">Platform token-launch charge</span>
        <div className="about-fee-number">{aboutFees.launchSol}<small>SOL</small></div><strong>100% to Platform Treasury</strong>
        <p>The platform launch charge is separate from creator fees. No real payment is initiated here.</p></div>
        <div className="about-creator-allocation"><p className="about-kicker">Target creator-fee allocation</p>
          <p>Of the eligible Pump.fun creator-fee portion <strong>actually received and verified</strong>:</p>
          <div className="about-split" aria-label={`${aboutFees.agentPercent}% Agent Rewards Treasury; ${aboutFees.platformPercent}% Platform Treasury`}>
            <div><strong>{aboutFees.agentPercent}<span>%</span></strong><span>Agent Rewards<br />Treasury</span></div>
            <div><strong>{aboutFees.platformPercent}<span>%</span></strong><span>Platform<br />Treasury</span></div>
          </div>
          <p className="about-fee-exclusions"><strong>{aboutFees.launcherPercent}% to token launchers</strong> from this creator-fee allocation. Protocol and liquidity-provider fees are separate and are not included in this split.</p></div></div>
      <div className="about-truth-note"><Leaf size={20} aria-hidden="true" /><p>Rewards are intended for <strong>verified useful economic activity</strong> under the applicable rules. Holding a token does not promise rewards, automatic returns or guaranteed yields. Unverified fee routing is not presented as operational.</p></div>
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
      <div className="about-chain-layer"><Network size={20} aria-hidden="true" /><div><strong>Solana integration layer</strong><p>Pump.fun launch infrastructure and wallet-based participation connect through verified backend records. Intended integrations do not imply live launches or settlement.</p></div><span className="about-tag">Verification-gated</span></div>
    </section>

    <section id="about-status" className="about-paper about-status" aria-labelledby="about-status-title">
      {heading("07", "Where we are", "Built in the open. Clear about what’s next.", "A working demo and a longer-term vision. No invented milestones, launch dates or progress percentages.")}
      <div className="about-status-grid">{aboutStatus.map((group) => <div key={group.id} className={`about-status-column about-status-${group.id}`}>
        <span className="about-status-mark" aria-hidden="true">{group.id === "demo" ? <Check size={17} /> : group.id === "development" ? <Sparkles size={17} /> : <LockKeyhole size={17} />}</span>
        <h3>{group.title}</h3><p>{group.note}</p><ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul></div>)}</div>
      <p className="about-status-context"><Radio size={14} aria-hidden="true" /><strong>{connection.label}.</strong> {connection.detail}</p>
    </section>

    <section className="about-vision" aria-labelledby="about-vision-title"><p className="about-kicker">The direction is shared</p>
      <h2 id="about-vision-title">The economy<br />is the world.</h2><p>We’re building a place where autonomous systems are visible, where communities can participate, and where useful work shapes a shared environment.</p>
      <a href={routeUrl("world")} onClick={(e) => navigate(e, "world")} className="about-vision-link">Enter the World<ArrowUpRight size={22} aria-hidden="true" /></a>
    </section>
  </article>;
}
