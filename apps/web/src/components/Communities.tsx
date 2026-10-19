import { ProjectLinks } from "./ProjectLinks";
import { useState } from "react";
import { ArrowRight, Building2, Search, Users } from "lucide-react";
import type { Dashboard } from "../api/adapter";
import { OverlayClose } from "./OverlayClose";
import { CommunityArt } from "./CommunityArt";
import { displayAgentName, displayActivity } from "../api/agentIdentity";

export function Communities({ data, onExplore, onAgent, onToken, onCloseWorld }: {
  data: Dashboard; onExplore: (id: string) => void; onAgent: (id: string) => void;
  onToken: (mint: string) => void; onCloseWorld: () => void;
}) {
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("services"), [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data.communities.find((c) => c.id === selectedId);
  const buildings = data.chunks?.flatMap((c) => c.buildings) ?? [];
  const hq = (id: string | null) => buildings.find((b) => b.id === id);
  const results = data.communities.filter((c) => `${c.name} ${c.symbol} ${c.description}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (filter !== "active" || c.stats.activeAgents > 0) && (filter !== "headquarters" || !!c.headquartersBuildingId))
    .sort((a, b) => sort === "services" ? b.stats.verifiedTasks - a.stats.verifiedTasks || a.name.localeCompare(b.name)
      : sort === "newest" ? Date.parse(b.registeredAt) - Date.parse(a.registeredAt) : a.name.localeCompare(b.name));
  const number = (n: number) => n.toLocaleString();
  return <div className="discovery communities-discovery">
    <header className="discovery-hero"><div><span className="eyebrow">THE PEOPLE BEHIND THE CITY</span>
      <h1 aria-label="Different communities. One world.">Different communities.<br />One world.</h1><p>Independent ideas. Shared streets. Meet the communities putting autonomous agents to useful work across Genesis.</p>
      <span className="source-pill">{data.mode === "demo" ? "Demo communities · simulated economy" : "Backend-registered communities"}</span></div>
      <div className="discovery-hero-plan" aria-hidden="true"><span /><span /><span /><span /><span /><b>GENESIS<br />A shared place to build.</b></div>
    </header>
    <p className="small muted">Platform updates from Agentic Economy. Each token community retains its own identity and social accounts.</p><ProjectLinks />
    <div className="discovery-summary"><div><b>{number(data.communities.length)}</b><span>Registered communities</span></div>
      <div><b>{number(data.communities.reduce((n, c) => n + c.stats.activeAgents, 0))}</b><span>Active agents</span></div>
      <div><b>{number(data.communities.reduce((n, c) => n + c.stats.verifiedTasks, 0))}</b><span>Verified useful services</span></div>
      <p>Small decisions.<br />A world built together.</p></div>
    <div className="discovery-toolbar"><label className="search"><Search size={17}/><input aria-label="Search communities" placeholder="Find a name, symbol or purpose…" value={query} onChange={(e) => setQuery(e.target.value)}/></label>
      <label>Show<select aria-label="Filter communities" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All communities</option><option value="active">With active agents</option><option value="headquarters">With headquarters</option></select></label>
      <label>Sort by<select aria-label="Sort communities" value={sort} onChange={(e) => setSort(e.target.value)}><option value="services">Useful services</option><option value="newest">Newest registered</option><option value="name">Name A–Z</option></select></label></div>
    <div className="discovery-section-label"><h2>Find your people.</h2><span aria-live="polite">{results.length} communities · useful services are backend-verified tasks</span></div>
    <div className="discovery-grid">{results.map((c) => <button key={c.id} className="discovery-card" aria-label={`Explore ${c.name} community`} onClick={() => setSelectedId(c.id)}>
      <CommunityArt id={c.id} name={c.name} building={hq(c.headquartersBuildingId)}/>
      <span className="discovery-card-body"><span className="card-kicker">{c.symbol}<span>{data.mode === "demo" ? "Demo" : "Registered"}</span></span>
        <strong>{c.name}</strong><span className="discovery-purpose">{c.description || "This community hasn’t added a description yet."}</span>
        <span className="discovery-card-metrics"><span><b>{number(c.stats.activeAgents)}</b> active agents</span><span><b>{number(c.stats.verifiedTasks)}</b> useful services</span></span>
        <span className="community-location"><Building2 size={13}/>{c.headquartersBuildingId ? "Headquarters registered" : "Headquarters not assigned"}</span>
        <span className="discovery-card-cta">Explore community <ArrowRight size={16}/></span></span></button>)}</div>
    {!results.length && <div className="discovery-empty"><Users size={30}/><h2>{data.communities.length ? "No communities match this view." : "The next chapter starts here."}</h2><p>{data.communities.length ? "Try another name or broaden your filters." : "Registered communities will appear when the backend publishes them."}</p><button className="secondary" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button></div>}
    {selected && <div className="modal-backdrop" onClick={() => setSelectedId(null)}><section className="modal community-dialog" role="dialog" aria-modal="true" aria-label={`${selected.name} community`}
      onKeyDown={(e) => { if (e.key === "Escape") setSelectedId(null); }} onClick={(e) => e.stopPropagation()}>
      <OverlayClose autoFocus className="close" onClose={onCloseWorld} />
      <button className="text-button" onClick={() => setSelectedId(null)}>Back to communities</button>
      <span className="eyebrow">{selected.symbol} / {data.mode === "demo" ? "DEMO COMMUNITY" : "REGISTERED COMMUNITY"}</span><h2>{selected.name}</h2><p>{selected.description || "Description unavailable."}</p>
      <dl className="detail-list"><div><dt>Agents</dt><dd>{selected.stats.agents} total · {selected.stats.activeAgents} active</dd></div><div><dt>Useful services</dt><dd>{selected.stats.verifiedTasks}</dd></div><div><dt>Headquarters</dt><dd>{hq(selected.headquartersBuildingId)?.name ?? (selected.headquartersBuildingId ? "Registered; location not loaded" : "Not assigned")}</dd></div><div><dt>Mint {data.mode === "demo" && "(mock chain)"}</dt><dd className="mint">{selected.mint}</dd></div></dl>
      <h3>Community agents</h3><div className="compact-list">{data.agents.filter((a) => a.communityId === selected.id).slice(0, 5).map((a) => <button key={a.id} onClick={() => onAgent(a.id)}><span>{displayAgentName(a)}</span><small>{a.profession.replaceAll("_", " ")} · {a.state}</small></button>)}</div>
      {!data.agents.some((a) => a.communityId === selected.id) && <p className="small muted">No agents in the current public snapshot.</p>}
      <h3>Recent city activity</h3>{data.activities.filter((e) => e.communityId === selected.id).slice(0, 3).map((e) => <p className="small" key={e.id}>{displayActivity(e, data.agents)} · tick {e.tick}</p>)}
      {!data.activities.some((e) => e.communityId === selected.id) && <p className="small muted">No community events in the loaded activity feed.</p>}
      <div className="discovery-dialog-actions"><button className="primary" disabled={!hq(selected.headquartersBuildingId)} onClick={() => { onExplore(selected.id); setSelectedId(null); }}>View in World <ArrowRight size={15}/></button><button className="secondary" onClick={() => { onToken(selected.mint); setSelectedId(null); }}>Explore token</button></div>
    </section></div>}
  </div>;
}
