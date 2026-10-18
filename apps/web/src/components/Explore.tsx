import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Copy, Search, ShieldCheck } from "lucide-react";
import type { ApiAdapter, Dashboard } from "../api/adapter";
import { useTokens, type VerifiedToken } from "../api/tokens";
import { orderTokens, type DiscoveryOrder } from "../api/tokenDiscovery";
import { ExploreSpotlights } from "./ExploreSpotlights";
import { LaunchOriginTag } from "./LaunchOriginTag";
import { CommunityArt } from "./CommunityArt";
import { displayAgentName, displayActivity } from "../api/agentIdentity";
import type { BuildingVisual } from "../world/layout";

const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
export function Explore({ api, data, mint, onToken, onBack, onWorld, onAgent, onCommunity }: {
  api: ApiAdapter; data: Dashboard; mint: string | null; onToken: (mint: string) => void;
  onBack: () => void; onWorld: (id: string) => void; onAgent: (id: string) => void; onCommunity: () => void;
}) {
  const { tokens, loading, error, retry } = useTokens(api, data);
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("newest"),
    [sort, setSort] = useState<DiscoveryOrder>("newest"), [page, setPage] = useState(0);
  const allHeading = useRef<HTMLHeadingElement>(null);
  const seeAll = (order: DiscoveryOrder) => {
    setSort(order); setFilter("newest"); setPage(0);
    allHeading.current?.focus({preventScroll:true});
    allHeading.current?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
  };
  const selected = tokens.find((t) => t.community.mint === mint);
  const buildings = data.chunks?.flatMap((c) => c.buildings) ?? [];
  const hq = (id: string | null) => api.kind === "http" ? buildings.find((b) => b.id === id) : undefined;
  const source = api.kind === "demo" ? "Recorded demo fixtures · no live transactions" : data.mode === "demo" ? "Backend demo · mock-chain launches" : "Backend-verified platform launches";
  if (mint) return <div className="discovery"><button className="secondary" onClick={onBack}><ArrowLeft size={15}/> All tokens</button>
    {loading ? <div className="discovery-skeleton" role="status" aria-label="Verifying token launch"/> : selected ?
      <TokenDetail token={selected} data={data} source={source} building={hq(selected.community.headquartersBuildingId)} onWorld={onWorld} onAgent={onAgent} onCommunity={onCommunity}/> :
      <div className="discovery-empty"><h1>Verified token not found.</h1><p>{error || "This mint has no matching confirmed platform launch in the registered community records."}</p><button className="secondary" onClick={retry}>Retry verification</button></div>}</div>;
  const results = orderTokens(tokens.filter(({ community: c }) => `${c.name} ${c.symbol} ${c.mint}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (filter !== "active" || c.stats.activeAgents > 0)), sort);
  const pageCount = Math.max(1, Math.ceil(results.length / 6)), current = Math.min(page, pageCount - 1);
  return <div className="discovery explore-discovery"><header className="discovery-hero"><div><span className="eyebrow">EXPLORE AGENTIC ECONOMY</span><h1 aria-label="Discover what's being built.">Discover what's<br/>being built.</h1>
    <p>Tokens with a place in the city. Discover verified Launchpad communities and the autonomous agents putting their ideas to work.</p><span className="source-pill">{source}</span></div>
    <div className="discovery-hero-plan" aria-hidden="true"><span/><span/><span/><span/><b>LAUNCHED HERE.<br/>BUILDING TOGETHER.</b></div></header>
    <div className="discovery-summary"><div><b>{loading ? "…" : tokens.length}</b><span>Verified token listings</span></div><div><b>{loading ? "…" : tokens.reduce((n, t) => n + t.community.stats.activeAgents, 0)}</b><span>Community agents active</span></div><div><b>{loading ? "…" : tokens.reduce((n, t) => n + t.community.stats.verifiedTasks, 0).toLocaleString()}</b><span>Verified useful services</span></div><p>Discovery grounded<br/>in a shared world.</p></div>
    <div className="discovery-toolbar"><label className="search"><Search size={17}/><input aria-label="Search tokens" placeholder="Search name, ticker or mint address…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }}/></label>
      <label>Quote asset<select aria-label="Filter quote asset" disabled aria-describedby="quote-data-note"><option>Quote data unavailable</option></select></label>
      <label>Sort by<select aria-label="Sort tokens" value={sort} onChange={(e) => { setSort(e.target.value as DiscoveryOrder); setPage(0); }}><option value="newest">Newest recorded launch</option><option value="agents">Most active agents</option><option value="services">Community useful services</option><option value="name">Name A–Z</option></select></label></div>
    <p id="quote-data-note" className="small muted">Trading pair data is unavailable for these launch records. Quote filtering will be available when verified pair data is provided.</p>
    {!query.trim()&&<ExploreSpotlights tokens={tokens} loading={loading} error={error} onToken={onToken} onAll={seeAll}/>}
    <div className="discovery-section-label"><h2 id="explore-all-tokens" className="explore-all-heading" ref={allHeading} tabIndex={-1}>{query.trim()?"Search results":"All launches"}</h2><span>{loading?"Verifying listings…":`${results.length} verified listings`}</span></div>
    <div className="discovery-tabs" aria-label="Token filters"><button aria-pressed={filter === "newest"} onClick={() => { setFilter("newest"); setSort("newest"); setPage(0); }}>Newest</button><button aria-pressed={filter === "active"} onClick={() => { setFilter("active"); setPage(0); }}>Active communities</button><button disabled title="Trusted market data is unavailable">Trending · unavailable</button><button disabled title="Graduation status is not in the API">Graduated · unavailable</button></div>
    <p className="small muted">PLATFORM, HUMAN, and SUPER-AGENT origin tags require backend-verified provenance; origin is currently unverified. Newest uses the recorded launch time. Active means at least one active community agent. Useful services ranks backend-verified tasks, not trading volume.</p>
    {error && <div className="discovery-error" role="alert">{error} <button className="secondary" onClick={retry}>Retry</button></div>}
    {loading ? <div className="discovery-grid" role="status" aria-label="Verifying platform launches">{[0, 1, 2].map((i) => <div className="discovery-skeleton" key={i}/>)}</div> :
      <div className="discovery-grid">{results.slice(current * 6, current * 6 + 6).map(({ community: c, launch }) => <a className="discovery-card" key={c.mint} href={`#explore/${c.mint}`} onClick={(e) => { e.preventDefault(); onToken(c.mint); }}>
        <CommunityArt id={c.id} name={c.name} building={hq(c.headquartersBuildingId)}/><div className="discovery-card-body"><span className="card-kicker">${c.symbol}<span>{launch.mode === "demo" ? "Demo confirmed" : "Confirmed launch"}</span></span><LaunchOriginTag demo={launch.mode === "demo"}/><strong>{c.name}</strong><span className="small muted">Trading pair unavailable</span><span className="discovery-purpose">{c.description || "Description unavailable."}</span><span className="small muted">Launch recorded {date(launch.createdAt)}</span><span className="discovery-card-metrics"><span><b>{c.stats.activeAgents}</b> active agents</span><span><b>{c.stats.verifiedTasks.toLocaleString()}</b> useful services</span></span><span className="discovery-card-cta">Explore token <ArrowRight size={16}/></span></div></a>)}</div>}
    {!loading && !results.length && <div className="discovery-empty"><ShieldCheck size={30}/><h2>{tokens.length ? "No tokens match this view." : "Only verified launches belong here."}</h2><p>{tokens.length ? "Try a different name, ticker, mint or filter." : "Confirmed platform launches will appear after their backend records can be verified. Pending and failed drafts are excluded."}</p><button className="secondary" onClick={() => { setQuery(""); setFilter("newest"); }}>Clear filters</button></div>}
    {!loading && results.length > 0 && <div className="discovery-pagination"><button className="secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button><span>Page {current + 1} of {pageCount} · {results.length} verified listings</span><button className="secondary" disabled={current + 1 >= pageCount} onClick={() => setPage(current + 1)}>Next</button></div>}
  </div>;
}
function TokenDetail({ token: { community: c, launch }, data, source, building, onWorld, onAgent, onCommunity }: {
  token: VerifiedToken; data: Dashboard; source: string; building?: BuildingVisual;
  onWorld: (id: string) => void; onAgent: (id: string) => void; onCommunity: () => void;
}) {
  const [copy, setCopy] = useState("");
  const validPump = (() => { try { const url = new URL(c.links.pumpFun); return url.protocol === "https:" && ["pump.fun", "www.pump.fun"].includes(url.hostname) && url.pathname.includes(c.mint); } catch { return false; } })();
  return <><header className="token-header"><div><span className="source-pill">{source}</span><h1>{c.name}</h1><span className="eyebrow">${c.symbol} / {launch.mode === "demo" ? "MOCK-CHAIN CONFIRMED" : "CONFIRMED PLATFORM LAUNCH"}</span><p>{c.description || "Description unavailable."}</p><LaunchOriginTag demo={launch.mode === "demo"}/><div className="token-mint"><code>{c.mint}</code><button className="secondary" aria-label="Copy mint address" onClick={() => void navigator.clipboard.writeText(c.mint).then(() => setCopy("Mint copied.")).catch(() => setCopy("Clipboard unavailable; select the mint above to copy."))}><Copy size={14}/></button></div><p role="status">{copy}</p><p className="small muted">Launch recorded {date(launch.createdAt)} · Graduation status unavailable.</p><p>Trading pair unavailable — the launch record contains no verified quote asset.</p>
    <div className="token-links">{validPump && <a href={c.links.pumpFun} target="_blank" rel="noreferrer">Pump.fun ↗</a>}{launch.mode !== "demo" && <a href={c.links.explorer} target="_blank" rel="noreferrer">Token explorer ↗</a>}</div></div><CommunityArt id={c.id} name={c.name} building={building}/></header>
    <div className="market-metrics">{["Price", "Market cap", "Trading volume", "Liquidity"].map((name) => <div key={name}><span>{name}</span><b>Unavailable</b></div>)}</div><p className="small muted">Trusted market and chart data are not connected. City Credits and community services are simulation metrics, not token-market performance.</p>
    <div className="token-panels"><section className="surface"><span className="eyebrow">IN THE SHARED WORLD</span><h2>{c.name}</h2><p>{c.stats.agents} agents · {c.stats.activeAgents} active · {c.stats.verifiedTasks.toLocaleString()} verified useful services</p><p>Headquarters: {building?.name ?? "Location unavailable in this view"}</p><div className="discovery-dialog-actions"><button className="primary" disabled={!building} onClick={() => onWorld(c.id)}>View in World <ArrowRight size={15}/></button><button className="secondary" onClick={onCommunity}>Communities</button></div>
      <h3>Community agents</h3>{data.agents.filter((a) => a.communityId === c.id).slice(0, 5).map((a) => <p key={a.id}><button className="secondary" onClick={() => onAgent(a.id)}>{displayAgentName(a)} · {a.profession.replaceAll("_", " ")} · {a.state}</button></p>)}{!data.agents.some((a) => a.communityId === c.id) && <p>No associated agents in the loaded snapshot.</p>}</section>
      <section className="surface"><span className="eyebrow">ACTUAL SIMULATION EVENTS</span><h2>Life in the city.</h2>{data.activities.filter((e) => e.communityId === c.id).slice(0, 6).map((e) => <p key={e.id}>{displayActivity(e, data.agents)}<br/><small>Simulation tick {e.tick}</small></p>)}{!data.activities.some((e) => e.communityId === c.id) && <p>No associated events in the loaded activity feed.</p>}<p>Launch ID: <span className="mint">{launch.id}</span></p><p className="small muted">{launch.mode === "demo" ? "This launch was confirmed by the mock chain. It is not a real blockchain transaction." : "The confirmed launch record matches this community, mint and signature."}</p></section></div>
  </>;
}
