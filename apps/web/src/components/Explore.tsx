import { activityCategory } from "../api/activityPresentation";
import {routeUrl} from "../navigation/routes";
import {TokenSocialLinks} from './TokenSocialLinks';
import {useTokenMarkets,marketNumber} from '../api/tokenMarkets';
import {TokenMarketPanel} from './TokenMarketPanel';
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

function TokenArt({token,building}:{token:VerifiedToken;building?:BuildingVisual}){
 const {community:c,launch}=token;let logo='';
 try{const url=new URL(c.imageUri??'');if(launch.execution&&url.protocol==='https:'&&!url.username&&!url.password)logo=url.href;}catch{/* Legacy records use the existing artwork. */}
 return logo?<div className="discovery-art token-logo"><img src={logo} alt={`${c.name} token logo`}/><span>Token logo</span></div>:<CommunityArt id={c.id} name={c.name} building={building}/>;
}
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
export function Explore({ api, data, mint, onToken, onBack, onWorld, onAgent, onCommunity }: {
  api: ApiAdapter; data: Dashboard; mint: string | null; onToken: (mint: string) => void;
  onBack: () => void; onWorld: (id: string) => void; onAgent: (id: string) => void; onCommunity: (id: string) => void;
}) {
  const { tokens:verifiedTokens, loading, error, retry } = useTokens(api, data);
  const markets=useTokenMarkets(api,verifiedTokens);
  const tokens=verifiedTokens.map(t=>({...t,market:markets[t.community.mint]}));
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("newest"),
    [sort, setSort] = useState<DiscoveryOrder>("newest"), [page, setPage] = useState(0), [quote,setQuote] = useState("all");
  const allHeading = useRef<HTMLHeadingElement>(null);
  const seeAll = (order: DiscoveryOrder) => {
    setSort(order); setFilter("newest"); setPage(0);
    allHeading.current?.focus({preventScroll:true});
    allHeading.current?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
  };
  const selected = tokens.find((t) => t.community.mint === mint);
  const buildings = data.chunks?.flatMap((c) => c.buildings) ?? [];
  const hq = (id: string | null) => api.kind === "http" ? buildings.find((b) => b.id === id) : undefined;
  const source = api.kind === "demo" ? "Demo tokens · no live transactions" : data.mode === "demo" ? "Demo tokens · no live transactions" : "Verified platform launches";
  if (mint) return <div className="discovery"><button className="secondary" onClick={onBack}><ArrowLeft size={15}/> All tokens</button>
    {loading ? <div className="discovery-skeleton" role="status" aria-label="Verifying token launch"/> : selected ?
      <TokenDetail token={selected} api={api} data={data} source={source} building={hq(selected.community.headquartersBuildingId)} onWorld={onWorld} onAgent={onAgent} onCommunity={onCommunity}/> :
      <div className="discovery-empty"><h1>Verified token not found.</h1><p>{error || "This mint has no matching confirmed platform launch in the registered community records."}</p><button className="secondary" onClick={retry}>Retry verification</button></div>}</div>;
  const results = orderTokens(tokens.filter(({ community: c }) => `${c.name} ${c.symbol} ${c.mint}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (filter !== "active" || c.stats.activeAgents > 0)), sort).filter(t=>(filter!=="graduated"||t.market?.graduation==="graduated")&&(filter!=="trending"||t.market?.status==="available"&&t.market.volume24hUsd!==null)&& (quote==="all"||(t.market?.quoteAsset??t.launch.execution?.quoteAsset)===quote));
  const pageCount = Math.max(1, Math.ceil(results.length / 6)), current = Math.min(page, pageCount - 1);
  return <div className="discovery explore-discovery"><header className="discovery-hero"><div><span className="eyebrow">EXPLORE AGENTIC ECONOMY</span><h1 aria-label="Discover what's being built.">Discover what's<br/>being built.</h1>
    <p>Tokens with a place in the city. Discover verified Launchpad communities and the virtual agents taking part in city life.</p><span className="source-pill">{source}</span></div>
    <div className="discovery-hero-plan" aria-hidden="true"><span/><span/><span/><span/><b>LAUNCHED HERE.<br/>BUILDING TOGETHER.</b></div></header>
    <div className="discovery-summary"><div><b>{loading ? "…" : tokens.length}</b><span>Verified token listings</span></div><div><b>{loading ? "…" : tokens.reduce((n, t) => n + t.community.stats.activeAgents, 0)}</b><span>Community agents active</span></div><div><b>{loading ? "…" : tokens.reduce((n, t) => n + t.community.stats.verifiedTasks, 0).toLocaleString()}</b><span>Completed city activities</span></div><p>Discovery grounded<br/>in a shared world.</p></div>
    <div className="discovery-toolbar"><label className="search"><Search size={17}/><input aria-label="Search tokens" placeholder="Search name, ticker or mint address…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }}/></label>
      <label>Quote asset<select aria-label="Filter quote asset" disabled={!tokens.some(t=>t.launch.execution||t.market?.quoteAsset)} value={quote} onChange={e=>{setQuote(e.target.value);setPage(0);}} aria-describedby="quote-data-note"><option value="all">{tokens.some(t=>t.launch.execution||t.market?.quoteAsset)?"All quotes":"Quote data unavailable"}</option>{tokens.some(t=>t.launch.execution?.quoteAsset==="SOL"||t.market?.quoteAsset==="SOL")&&<option value="SOL">SOL</option>}{tokens.some(t=>t.launch.execution?.quoteAsset==="USDC"||t.market?.quoteAsset==="USDC")&&<option value="USDC">USDC</option>}</select></label>
      <label>Sort by<select aria-label="Sort tokens" value={sort} onChange={(e) => { setSort(e.target.value as DiscoveryOrder); setPage(0); }}><option value="newest">Newest recorded launch</option><option value="agents">Most active agents</option><option value="services">Community city activities</option><option value="name">Name A–Z</option><option value="volume">24h volume · available markets</option><option value="marketCap">Market cap · available markets</option></select></label>
      <p id="quote-data-note" className="small muted">Quote filters use verified execution records or on-chain-checked market pools. Unsupported pairs remain unavailable.</p>
    </div>
    {!query.trim()&&<ExploreSpotlights tokens={tokens} loading={loading} error={error} onToken={onToken} onAll={seeAll}/>}
    <div className="discovery-section-label"><h2 id="explore-all-tokens" className="explore-all-heading" ref={allHeading} tabIndex={-1}>{query.trim()?"Search results":"All launches"}</h2><span>{loading?"Verifying listings…":`${results.length} verified listings`}</span></div>
    <div className="discovery-tabs" aria-label="Token filters"><button aria-pressed={filter === "newest"} onClick={() => { setFilter("newest"); setSort("newest"); setPage(0); }}>Newest</button><button aria-pressed={filter === "active"} onClick={() => { setFilter("active"); setPage(0); }}>Active communities</button><button disabled={!tokens.some(t=>t.market?.status==="available"&&t.market.volume24hUsd!==null)} onClick={()=>{setFilter("trending");setSort("volume");setPage(0);}}>Hot volume</button><button disabled={!tokens.some(t=>t.market?.graduation==="graduated")} onClick={()=>{setFilter("graduated");setPage(0);}}>Graduated</button></div>
    <p className="small muted">PLATFORM, HUMAN, and SUPER-AGENT origin tags require backend-verified provenance; legacy records without provenance remain unverified. Newest uses the recorded launch time. Active means at least one active community agent. City activities ranks completed virtual work tasks, not economic-service receipts or trading volume.</p>
    {error && <div className="discovery-error" role="alert">{error} <button className="secondary" onClick={retry}>Retry</button></div>}
    {loading ? <div className="discovery-grid" role="status" aria-label="Verifying platform launches">{[0, 1, 2].map((i) => <div className="discovery-skeleton" key={i}/>)}</div> :
      <div className="discovery-grid">{results.slice(current * 6, current * 6 + 6).map(({ community: c, launch,market }) => <a className="discovery-card" key={c.mint} href={routeUrl("explore", c.mint)} onClick={(e) => { if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return; e.preventDefault(); onToken(c.mint); }}>
        <TokenArt token={{community:c,launch}} building={hq(c.headquartersBuildingId)}/><div className="discovery-card-body"><span className="card-kicker">${c.symbol}<span>{launch.mode === "demo" ? "Demo confirmed" : "Confirmed launch"}</span></span><LaunchOriginTag demo={launch.mode === "demo"} provenance={launch.execution?c.provenance:undefined}/><strong>{c.name}</strong><span className="small muted">{market?.quoteAsset?`${c.symbol}/${market.quoteAsset}`:launch.execution?`${c.symbol}/${launch.execution.quoteAsset}`:"Trading pair unavailable"}</span><span className="discovery-purpose">{c.description || "Description unavailable."}</span><span className="small muted">Launch recorded {date(launch.createdAt)}</span><span className="discovery-card-metrics"><span><b>{c.stats.activeAgents}</b> active agents</span><span><b>{c.stats.verifiedTasks.toLocaleString()}</b> city activities</span></span><span className="small muted">Price {marketNumber(market?.priceUsd)} · 24h volume {marketNumber(market?.volume24hUsd)}</span>{market?.fetchedAt&&<span className="small muted">Market data · Retrieved {new Date(market.fetchedAt).toLocaleTimeString()}{market.status==="stale"?" · Stale":""}</span>}<span className="discovery-card-cta">Explore token <ArrowRight size={16}/></span></div></a>)}</div>}
    {!loading && !results.length && <div className="discovery-empty"><ShieldCheck size={30}/><h2>{tokens.length ? "No tokens match this view." : "Only verified launches belong here."}</h2><p>{tokens.length ? "Try a different name, ticker, mint or filter." : "Confirmed platform launches will appear after their backend records can be verified. Pending and failed drafts are excluded."}</p><button className="secondary" onClick={() => { setQuery(""); setFilter("newest"); setQuote("all"); setPage(0); }}>Clear filters</button></div>}
    {!loading && results.length > 0 && <div className="discovery-pagination"><button className="secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button><span>Page {current + 1} of {pageCount} · {results.length} verified listings</span><button className="secondary" disabled={current + 1 >= pageCount} onClick={() => setPage(current + 1)}>Next</button></div>}
  </div>;
}
function TokenDetail({ token: { community: c, launch,market }, api,data, source, building, onWorld, onAgent, onCommunity }: {
  token: VerifiedToken; api:ApiAdapter; data: Dashboard; source: string; building?: BuildingVisual;
  onWorld: (id: string) => void; onAgent: (id: string) => void; onCommunity: (id: string) => void;
}) {
  const [copy, setCopy] = useState("");
  const validPump = (() => { try { const url = new URL(c.links.pumpFun); return url.protocol === "https:" && ["pump.fun", "www.pump.fun"].includes(url.hostname) && url.pathname.includes(c.mint); } catch { return false; } })();
  return <div className="token-detail"><header className="token-header"><div className="token-information"><span className="source-pill">{source}</span><h1>{c.name}</h1><span className="eyebrow">${c.symbol} / {launch.mode === "demo" ? "MOCK-CHAIN CONFIRMED" : "CONFIRMED PLATFORM LAUNCH"}</span><p className="token-description ui-select-text">{c.description || "Description unavailable."}</p><LaunchOriginTag demo={launch.mode === "demo"} provenance={launch.execution?c.provenance:undefined}/>
    <dl className="token-facts"><div><dt>Trading pair</dt><dd>{market?.quoteAsset?`${c.symbol}/${market.quoteAsset} · mainnet`:launch.execution?`${c.symbol}/${launch.execution.quoteAsset} · ${launch.execution.network}`:"Unavailable — the launch record contains no verified quote asset."}</dd></div><div><dt>Launch recorded</dt><dd>{date(launch.createdAt)}</dd></div></dl>
    <div className="token-copy-field"><span className="token-field-label">Mint address</span><div className="token-mint"><code className="ui-select-text">{c.mint}</code><button className="secondary" aria-label="Copy mint address" onClick={() => void navigator.clipboard.writeText(c.mint).then(() => setCopy("Mint copied.")).catch(() => setCopy("Clipboard unavailable; select the mint above to copy."))}><Copy size={16}/></button></div></div>
    {launch.signature&&launch.execution&&<div className="token-copy-field"><span className="token-field-label">Launch transaction</span><div className="token-transaction">{launch.execution.network==="devnet"?<a className="ui-select-text" href={`https://explorer.solana.com/tx/${launch.signature}?cluster=devnet`} target="_blank" rel="noreferrer">{launch.signature}</a>:<code className="ui-select-text">{launch.signature}</code>}<button className="secondary" aria-label="Copy launch transaction" onClick={()=>void navigator.clipboard.writeText(launch.signature!).then(()=>setCopy("Transaction signature copied.")).catch(()=>setCopy("Clipboard unavailable; select the transaction above to copy."))}><Copy size={16}/></button></div></div>}
    <p className="token-copy-status" role="status">{copy}</p>
    <div className="token-links">{validPump&&!launch.execution && <details><summary>Protocol details</summary><a href={c.links.pumpFun} target="_blank" rel="noopener noreferrer">Pump.fun · external protocol ↗</a></details>}{launch.mode !== "demo" && <a href={c.links.explorer} target="_blank" rel="noreferrer">Token explorer ↗</a>}</div><TokenSocialLinks {...c.links}/></div><TokenArt token={{community:c,launch}} building={building}/></header>
    <TokenMarketPanel market={market} mint={c.mint} api={api}/>
    <div className="token-panels"><section className="surface"><span className="eyebrow">IN THE SHARED WORLD</span><h2>{c.name}</h2><p>{c.stats.agents} agents · {c.stats.activeAgents} active · {c.stats.verifiedTasks.toLocaleString()} completed city activities</p><p>Headquarters: {building?.name ?? "Location unavailable in this view"}</p><div className="discovery-dialog-actions"><button className="primary" disabled={!building} onClick={() => onWorld(c.id)}>View in World <ArrowRight size={15}/></button><button className="secondary" onClick={() => onCommunity(c.id)}>Explore Community</button></div>
      <h3>Community agents</h3>{data.agents.filter((a) => a.communityId === c.id).slice(0, 5).map((a) => <p key={a.id}><button className="secondary" onClick={() => onAgent(a.id)}>{displayAgentName(a)} · {a.profession.replaceAll("_", " ")} · {a.state}</button></p>)}{!data.agents.some((a) => a.communityId === c.id) && <p>No associated agents in the loaded snapshot.</p>}</section>
      <section className="surface"><span className="eyebrow">CITY ACTIVITY</span><h2>Life in the city.</h2>{data.activities.filter((e) => e.communityId === c.id).slice(0, 6).map((e) => <p key={e.id}>{displayActivity(e, data.agents)}<span className="activity-category" title={activityCategory(e, data.communities, data.mode).detail}>{activityCategory(e, data.communities, data.mode).label}</span><br/>{import.meta.env.DEV && <small>Simulation tick {e.tick}</small>}</p>)}{!data.activities.some((e) => e.communityId === c.id) && <p>No associated events in the loaded activity feed.</p>}{import.meta.env.DEV && <p>Launch ID: <span className="mint">{launch.id}</span></p>}<p className="small muted">{launch.mode === "demo" ? "This launch was confirmed by the mock chain. It is not a real blockchain transaction." : "The confirmed launch record matches this community, mint and signature."}</p></section></div>
  </div>;
}
