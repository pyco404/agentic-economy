import { useState } from "react";
import { ArrowRight, Building2, Search, Users } from "lucide-react";
import type { ApiAdapter, Dashboard } from "../api/adapter";
import { OverlayClose } from "./OverlayClose";
import { CommunityLogo } from "./CommunityLogo";
import { TokenSocialLinks } from "./TokenSocialLinks";
import { useTokens } from "../api/tokens";
import { communityLogo, communityHeadquarters, communityActivitySummary } from "../api/communityPresentation";
import { displayAgentName, displayActivity } from "../api/agentIdentity";

export function Communities({ api, data, selectedId, onSelect, onExplore, onAgent, onToken, onCloseWorld }: {
  api: ApiAdapter; data: Dashboard; selectedId: string | null; onSelect: (id: string | null) => void; onExplore: (id: string) => void; onAgent: (id: string) => void;
  onToken: (mint: string) => void; onCloseWorld: () => void;
}) {
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("services");
  const {tokens, loading, error, retry} = useTokens(api, data);
  const tokenFor = (id: string) => tokens.find(t => t.community.id === id);
  const logoFor = (c: Dashboard["communities"][number]) => communityLogo(c, tokenFor(c.id)?.launch, data.mode);
  const selected = data.communities.find((c) => c.id === selectedId);
  const buildings = data.chunks?.flatMap((c) => c.buildings) ?? [];
  const hq = (c: Dashboard["communities"][number]) => communityHeadquarters(c, buildings);
  const results = data.communities.filter((c) => `${c.name} ${c.symbol} ${c.description}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (filter !== "active" || c.stats.activeAgents > 0) && (filter !== "headquarters" || !!c.headquartersBuildingId))
    .sort((a, b) => sort === "services" ? b.stats.verifiedTasks - a.stats.verifiedTasks || a.name.localeCompare(b.name)
      : sort === "newest" ? Date.parse(b.registeredAt) - Date.parse(a.registeredAt) : a.name.localeCompare(b.name));
  const number = (n: number) => n.toLocaleString();
  return <div className="discovery communities-discovery">
    <header className="discovery-hero"><div><span className="eyebrow">COMMUNITIES IN ONE WORLD</span>
      <h1 aria-label="Different communities. One world.">Different communities.<br />One world.</h1><p>Every token has an identity and a place in the city. Explore its headquarters, associated simulation agents and verified contributions.</p>
      <span className="source-pill">{data.mode === "demo" ? "Demo communities · simulated economy" : "Registered communities"}</span></div>
      <div className="discovery-hero-plan" aria-hidden="true"><span /><span /><span /><span /><span /><b>GENESIS<br />A shared place to build.</b></div>
    </header>
    <p className="small muted">Platform updates from Agentic Economy. Each token community retains its own identity and social accounts.</p>
    <div className="discovery-summary"><div><b>{number(data.communities.length)}</b><span>Registered communities</span></div>
      <div><b>{number(data.communities.reduce((n, c) => n + c.stats.activeAgents, 0))}</b><span>Active simulation agents</span></div>
      <div><b>{number(data.communities.reduce((n, c) => n + c.stats.verifiedTasks, 0))}</b><span>Verified useful services</span></div>
      <p>Small decisions.<br />A world built together.</p></div>
    <div className="discovery-toolbar"><label className="search"><Search size={17}/><input aria-label="Search communities" placeholder="Find a name, symbol or purpose…" value={query} onChange={(e) => setQuery(e.target.value)}/></label>
      <label>Show<select aria-label="Filter communities" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All communities</option><option value="active">With active agents</option><option value="headquarters">With headquarters</option></select></label>
      <label>Sort by<select aria-label="Sort communities" value={sort} onChange={(e) => setSort(e.target.value)}><option value="services">Useful services</option><option value="newest">Newest registered</option><option value="name">Name A–Z</option></select></label></div>
    <div className="discovery-section-label"><h2>Find your people.</h2><span aria-live="polite">{results.length} communities · useful services are backend-verified tasks</span></div>
    {error && <p className="discovery-error" role="status">Token verification is temporarily incomplete. Community records remain available. <button className="text-button" onClick={retry}>Retry verification</button></p>}
    <div className="discovery-grid">{results.map((c) => <article key={c.id} className="discovery-card community-card" aria-label={`${c.name} community`}>
      <CommunityLogo name={c.name} symbol={c.symbol} src={logoFor(c)}/>
      <div className="discovery-card-body"><span className="card-kicker">${c.symbol}<span>{tokenFor(c.id)?.launch.execution ? "Verified platform launch" : data.mode === "demo" ? "Demo community" : "Registered community"}</span></span>
        <h3><button className="community-title" onClick={() => onSelect(c.id)}>{c.name}</button></h3><p className="discovery-purpose">{c.description || "This community hasn’t added a description yet."}</p>
        <p className="community-activity-summary">{communityActivitySummary(c)}</p>
        <span className="community-location"><Building2 size={14}/>{hq(c)?.name ?? (c.headquartersBuildingId ? "Headquarters location unavailable" : "Headquarters not assigned")}</span>
        <div className="community-card-actions"><button className="primary" onClick={() => onSelect(c.id)}>Explore Community <ArrowRight size={14}/></button><button className="secondary" disabled={!tokenFor(c.id)} onClick={() => onToken(c.mint)}>View Token</button><button className="text-button" disabled={!hq(c)} onClick={() => onExplore(c.id)}>View Headquarters</button></div>
      </div></article>)}</div>
    {loading && <p className="small muted" role="status">Verifying token identities…</p>}
    {!results.length && <div className="discovery-empty"><Users size={30}/><h2>{data.communities.length ? "No communities match this view." : "The next chapter starts here."}</h2><p>{data.communities.length ? "Try another name or broaden your filters." : "Registered communities will appear when the backend publishes them."}</p><button className="secondary" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button></div>}
    {selected && <div className="modal-backdrop" onClick={() => onSelect(null)}><section className="modal community-dialog" role="dialog" aria-modal="true" aria-label={`${selected.name} community`}
      onKeyDown={(e) => { if (e.key === "Escape") onSelect(null); }} onClick={(e) => e.stopPropagation()}>
      <OverlayClose autoFocus className="close" onClose={onCloseWorld} />
      <button className="text-button" onClick={() => onSelect(null)}>Back to communities</button>
      <div className="community-identity"><CommunityLogo name={selected.name} symbol={selected.symbol} src={logoFor(selected)}/><div><span className="eyebrow">${selected.symbol} / {tokenFor(selected.id)?.launch.execution ? "VERIFIED PLATFORM LAUNCH" : data.mode === "demo" ? "DEMO COMMUNITY" : "REGISTERED COMMUNITY"}</span><h2>{selected.name}</h2><p>{selected.description || "Description unavailable."}</p></div></div>
      <div className="community-mint"><span>{tokenFor(selected.id) ? "Verified token mint" : "Registered mint · verification pending"}{data.mode === "demo" && " (mock chain)"}</span><code className="ui-select-text">{selected.mint}</code></div>
      <TokenSocialLinks {...selected.links}/>
      <div className="discovery-dialog-actions"><button className="primary" disabled={!tokenFor(selected.id)} onClick={() => { onToken(selected.mint); onSelect(null); }}>View Token</button></div>
      <section className="community-detail-section"><h3>Headquarters</h3><p>{hq(selected)?.name ?? (selected.headquartersBuildingId ? "Registered; location unavailable in this view." : "A headquarters has not been assigned yet.")}</p>{hq(selected) && <p className="small muted">{data.bootstrap.regions.find(r => { const b=hq(selected)!; return b.x>=r.bounds.minX && b.x<r.bounds.maxX && b.z>=r.bounds.minY && b.z<r.bounds.maxY; })?.name ?? "Genesis"}</p>}<button className="secondary" disabled={!hq(selected)} onClick={() => { onExplore(selected.id); onSelect(null); }}>View Headquarters</button></section>
      <section className="community-detail-section"><h3>Community activity</h3><p>{communityActivitySummary(selected)}</p><p className="small muted">These are city simulation contributions. Common Agents, holder eligibility and AECO rewards are not active here.</p>
      <div className="compact-list">{data.agents.filter((a) => a.communityId === selected.id).map((a) => <button key={a.id} onClick={() => onAgent(a.id)}><span>{displayAgentName(a)}</span><small>{a.profession.replaceAll("_", " ")} · {a.state}{a.work?.task ? ` · ${a.work.task.kind.replaceAll("_", " ")}` : ""}</small></button>)}</div>
      {!data.agents.some((a) => a.communityId === selected.id) && <p className="small muted">No associated agents in the current public snapshot.</p>}</section>
      <section className="community-detail-section"><h3>Recent events</h3>{data.activities.filter((e) => e.communityId === selected.id).slice(0, 6).map((e) => <p className="community-event" key={e.id}>{displayActivity(e, data.agents)}</p>)}
      {!data.activities.some((e) => e.communityId === selected.id) && <p className="small muted">No recent community events. New activity will appear as it happens.</p>}</section>
      <details className="community-technical"><summary>Technical details</summary><dl className="detail-list"><div><dt>Registration</dt><dd>{new Date(selected.registeredAt).toLocaleString()}</dd></div><div><dt>Launch ID</dt><dd className="mint ui-select-text">{selected.launchId}</dd></div><div><dt>Registered building</dt><dd className="mint ui-select-text">{selected.headquartersBuildingId ?? "Not assigned"}</dd></div></dl>{data.activities.filter(e => e.communityId === selected.id).slice(0,6).map(e => <p className="small" key={e.id}>{e.type} · simulation tick {e.tick}</p>)}</details>
    </section></div>}
  </div>;
}
