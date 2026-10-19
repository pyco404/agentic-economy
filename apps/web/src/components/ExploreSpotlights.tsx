import {routeUrl} from "../navigation/routes";
import { ArrowRight, ChartNoAxesCombined, Flag, Sparkles, TrendingUp, Users, Wallet, type LucideIcon } from 'lucide-react';
import type { VerifiedToken } from '../api/tokens';
import { orderTokens, type DiscoveryOrder } from '../api/tokenDiscovery';
import {marketNumber} from '../api/tokenMarkets';
import '../explore-spotlights.css';
const SPOTLIGHT_COUNT=5;
const sections:{id:string;title:string;description:string;icon:LucideIcon;order?:DiscoveryOrder;unavailable?:string}[]=[
 {id:'new',title:'New launches',description:'The latest confirmed launches in the city.',icon:Sparkles,order:'newest'},
 {id:'volume',title:'Hot volume',description:'Selected verified pools ranked by 24-hour volume.',icon:TrendingUp,order:'volume',unavailable:'No current verified 24-hour volume is available.'},
 {id:'market-cap',title:'Top market cap',description:'The largest tokens by market capitalization.',icon:ChartNoAxesCombined,order:'marketCap',unavailable:'No current verified market-cap data is available.'},
 {id:'graduating',title:'Graduating soon',description:'Tokens approaching bonding-curve completion.',icon:Flag,order:'graduation',unavailable:'Verified percentage progress is unavailable from the configured sources.'},
 {id:'agents',title:'Most active agents',description:'Community agents active in the shared city.',icon:Users,order:'agents'},
 {id:'holders',title:'Most holders',description:'Tokens held by the most wallets.',icon:Wallet,order:'holders',unavailable:'Verified holder counts are unavailable from the configured sources.'},
];
export function ExploreSpotlights({tokens,loading,error,onToken,onAll}:{tokens:VerifiedToken[];loading:boolean;error:string;onToken:(mint:string)=>void;onAll:(order:DiscoveryOrder)=>void}) {
 return <div className="explore-spotlights" aria-label="Token discovery highlights">{sections.map(({id,title,description,icon:Icon,order,unavailable})=>{
  const field=order==='volume'?'volume24hUsd':order==='marketCap'?'marketCapUsd':order==='holders'?'holders':order==='graduation'?'graduationProgress':null;
  const eligible=field?tokens.filter(t=>t.market?.status==='available'&&t.market[field]!==null):tokens;
  const items=order?orderTokens(eligible,order).slice(0,SPOTLIGHT_COUNT):[];
  const missing=!!unavailable&&!items.length;
  return <section className="explore-spotlight" key={id} aria-labelledby={`spotlight-${id}`}>
   <header><div><h2 id={`spotlight-${id}`}><Icon size={17} aria-hidden="true"/>{title}</h2><p>{description}</p></div>
    {order&&!missing&&<button type="button" className="text-button" aria-label={`See all ${title.toLowerCase()}`} aria-controls="explore-all-tokens" onClick={()=>onAll(order)}>See all <ArrowRight size={13} aria-hidden="true"/></button>}
   </header>
   {missing?<div className="spotlight-unavailable"><span className="spotlight-state">Data unavailable</span><p>{unavailable}</p></div>:
    loading?<p className="spotlight-message" role="status">Verifying launches…</p>:
    !items.length?<p className="spotlight-message">{error?'Launch records could not be verified. Retry below.':'No confirmed launches yet.'}</p>:
    <ol>{items.map(({community:c,launch,market},i)=><li key={c.mint}><a href={routeUrl("explore", c.mint)} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();onToken(c.mint);}}>
     <span className="spotlight-rank" aria-hidden="true">{i+1}</span><span className="spotlight-monogram" aria-hidden="true">{c.symbol.slice(0,2)}</span>
     <span className="spotlight-identity"><strong>{c.name}</strong><span>${c.symbol}{launch.mode==='demo'&&<small>Demo</small>}</span></span>
     <span className="spotlight-value">{field?<><b>{field==='holders'?market?.holders?.toLocaleString():field==='graduationProgress'?`${market?.graduationProgress}%`:marketNumber(market?.[field])}</b><small>{field==='volume24hUsd'?'24h USD volume':field==='marketCapUsd'?'USD market cap':'verified data'}</small>{market?.fetchedAt&&<small>DEX Screener · {new Date(market.fetchedAt).toLocaleTimeString()}</small>}</>:order==='agents'?<><b>{c.stats.activeAgents.toLocaleString()}</b><small>active agents</small></>:<><time dateTime={launch.createdAt}>{new Date(launch.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time><small>recorded launch</small></>}</span>
    </a></li>)}</ol>}
  </section>;
 })}</div>;
}
