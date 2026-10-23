import {SolUsdReference} from './sol-usd.js';
import {MarketJournal} from './market-journal.js';
import {bondingCurvePda} from '../chain/pump.js';
import {z} from 'zod';
import {TokenMarket,TokenHistory,TokenTrades,WRAPPED_SOL_MINT,type TokenMarket as Snapshot,type TokenHistory as History,type TokenTrades as Trades} from '@agentic-economy/shared';
import {USDC_QUOTE_MINTS} from '../config.js';
import type {Store} from '../store/types.js';
import type {ChainGateway} from '../chain/types.js';
import {verifyLaunch} from '../chain/verify.js';
import {sharingConfigPda} from '../chain/pump.js';
import {AppError} from '../util/errors.js';
const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const n=z.number().finite().nonnegative().nullish();
const pair=z.object({chainId:z.string(),dexId:z.string(),pairAddress:z.string(),baseToken:z.object({address:z.string()}),quoteToken:z.object({address:z.string()}),priceUsd:z.string().nullish(),volume:z.object({h24:n}).nullish(),marketCap:n,fdv:n,liquidity:z.object({usd:n}).nullish(),priceChange:z.object({h24:z.number().finite().nullish()}).nullish(),txns:z.object({h24:z.object({buys:z.number().int().nonnegative(),sells:z.number().int().nonnegative()})}).nullish()});
export function unavailableMarket(mint:string,network:Snapshot['network'],reason:string):Snapshot{return {mint,network,status:'unavailable',reason,fetchedAt:null,sourceAsOf:null,source:null,sourceUrl:null,pairAddress:null,quoteAsset:null,priceUsd:null,volume24hUsd:null,marketCapUsd:null,liquidityUsd:null,priceChange24h:null,holders:null,buys24h:null,sells24h:null,graduation:'unknown',graduationProgress:null,holdersLowerBound:false,chain:null};}
const USDC_MINTS:readonly string[]=Object.values(USDC_QUOTE_MINTS);
/** Read-only fixed provider hosts. No API keys, execution, arbitrary URLs or mock-market fallback. */
export class TokenMarketService{
 private cache=new Map<string,{at:number;value:Snapshot}>();private tradeCache=new Map<string,{at:number;value:Trades}>();private tradeJobs=new Map<string,Promise<Trades>>();private histories=new Map<string,{at:number;value:History}>();private jobs=new Map<string,Promise<Snapshot>>();private historyJobs=new Map<string,Promise<History>>();
 private timer:NodeJS.Timeout|null=null;private background:Promise<void>|null=null;private indexJobs=new Map<string,Promise<void>>();private usd:SolUsdReference;
 private budget={dex:[] as number[],gecko:[] as number[]};private active=0;
 constructor(private store:Store,private chain:ChainGateway,private network:Snapshot['network'],private fetcher:typeof fetch=fetch,private now=()=>Date.now(),private journal=new MarketJournal(),private options={indexEnabled:true,refreshMs:60000,pageSize:8},private report:(message:string)=>void=()=>{}) {this.usd=new SolUsdReference(fetcher,now);}
 start(){if(this.timer||this.network!=='mainnet-beta')return;const tick=()=>{if(this.background)return;this.background=(async()=>{for(const c of await this.store.allCommunities()){try{await this.snapshot(c.mint);await this.indexJobs.get(c.mint);}catch{/* One token must not block the rest. */}}})().catch(()=>{this.report('Market refresh temporarily unavailable');}).finally(()=>{this.background=null;});};tick();this.timer=setInterval(tick,this.options.refreshMs);this.timer.unref();}
 async stop(){if(this.timer)clearInterval(this.timer);this.timer=null;await this.background;await Promise.allSettled(this.indexJobs.values());}
 private async json(url:string,kind:'dex'|'gecko'){
  const now=this.now();this.budget[kind]=this.budget[kind].filter(t=>now-t<60000);
  if(this.active>=4||this.budget[kind].length>=(kind==='dex'?240:25))throw new Error('Market provider budget reached');
  this.budget[kind].push(now);this.active++;try{const r=await this.fetcher(url,{signal:AbortSignal.timeout(5000),redirect:'error',headers:{accept:'application/json'}});if(!r.ok)throw new Error('Market provider temporarily unavailable');const text=await r.text();if(text.length>2_000_000)throw new Error('Market response too large');return JSON.parse(text) as unknown;}finally{this.active--;}
 }
 async snapshot(mint:string):Promise<Snapshot>{
  const cached=this.cache.get(mint);if(cached&&this.now()-cached.at<30000)return cached.value;
  const running=this.jobs.get(mint);if(running)return running;
  const job=this.load(mint).then(value=>{if(this.cache.size>=500)this.cache.delete(this.cache.keys().next().value!);this.cache.set(mint,{at:this.now(),value});return value;}).catch(e=>{if(e instanceof AppError)throw e;return cached&&this.now()-cached.at<90000?{...cached.value,status:'stale' as const,reason:'Refresh unavailable. Excluded from market rankings.'}:unavailableMarket(mint,this.network,'Market data temporarily unavailable.');}).finally(()=>this.jobs.delete(mint));this.jobs.set(mint,job);return job;
 }
 private async load(mint:string):Promise<Snapshot>{
  const c=(await this.store.allCommunities()).find(c=>c.mint===mint),l=c?await this.store.getLaunch(c.launchId):null;
  if(!c||!l||l.launch.status!=='confirmed'||l.launch.mint!==mint||l.launch.communityId!==c.id||l.launch.signature!==c.launchSignature)throw new AppError('not_found','Verified platform token not found');
  const blank=unavailableMarket(mint,this.network,'No supported indexed market is available.');
  if(this.chain.source!=='solana_rpc'||l.launch.mode==='demo')return {...blank,reason:'Public market providers do not cover this demo or testing-network launch.'};
  if(l.launch.execution&&l.launch.execution.network!=='mainnet-beta'){
   // Verified testing-network launch: no public price market, but its on-chain state is authoritative.
   if(await this.chain.getGenesisHash?.()!==l.launch.execution.genesisHash)return {...blank,reason:'On-chain read source does not match the launch network.'};
   return TokenMarket.parse({...blank,...await this.chainMetrics(mint),reason:'Public market providers do not cover testing-network launches. On-chain holders and graduation progress are shown.'});
  }
  if(this.network!=='mainnet-beta')return {...blank,reason:'Public market providers do not cover this demo or testing-network launch.'};
  if(await this.chain.getGenesisHash?.()!==MAINNET)return {...blank,reason:'Mainnet read-source identity could not be verified.'};
  const routing=await this.chain.getFeeRoutingState(mint),tx=await this.chain.getTransaction(c.launchSignature);
  if(verifyLaunch({launcherWallet:l.launch.launcherWallet,mint,platformTreasury:l.launch.fees.platformTreasury,agentRewardsTreasury:l.launch.fees.creatorFeeSplit.agentRewardsTreasury,sharingConfig:sharingConfigPda(mint),draft:l.launch.draft,...(l.launch.execution?{quoteMint:l.launch.execution.quoteAsset==='USDC'?l.launch.execution.quoteMint:WRAPPED_SOL_MINT,quoteRequired:l.launch.execution.quoteAsset==='USDC'}:{}),...(l.launch.execution?.devBuy&&l.launch.fees.developerBuy?{devBuy:{tokenAmount:BigInt(l.launch.execution.devBuy.tokenAmount),maxQuoteCost:BigInt(l.launch.execution.devBuy.maxQuoteCost),totalSupply:BigInt(l.launch.fees.developerBuy.totalSupply)}}:{})},tx,routing).outcome!=='confirmed')return {...blank,reason:'Platform launch evidence could not be reverified.'};
  blank.graduation=routing.bondingCurveComplete===true?'curve_complete':routing.bondingCurveComplete===false?'bonding_curve':'unknown';
  Object.assign(blank,await this.chainMetrics(mint).catch(()=>({})));
  const state=await this.chain.getMarketState?.(mint).catch(()=>null);
  const usd=state?await this.usd.read():null;
  if(state){
   const priceSol=BigInt(state.baseReserveRaw)>0n?Number(state.quoteReserveRaw)/Number(state.baseReserveRaw)*10**state.decimals/1e9:null;
   const priceUsd=priceSol!==null&&usd?priceSol*usd.price:null;
   Object.assign(blank,{chain:blank.chain??{source:'solana_rpc',network:'mainnet-beta',slot:state.slot,asOf:null,fetchedAt:new Date(this.now()).toISOString()},status:'available',source:'solana_rpc',reason:null,pairAddress:state.address,quoteAsset:'SOL',fetchedAt:new Date(this.now()).toISOString(),priceSol,priceUsd,
    marketCapUsd:priceUsd===null?null:priceUsd*Number(state.supplyRaw)/10**state.decimals,fdvUsd:priceUsd===null?null:priceUsd*Number(state.totalSupplyRaw)/10**state.decimals,
    liquidityUsd:usd&&state.venue!=='migration_pending'?(Number(state.realQuoteRaw)/1e9+(state.venue==='pumpswap'&&priceSol!==null?Number(state.realBaseRaw)/10**state.decimals*priceSol:0))*usd.price:null,
    graduation:state.venue==='pumpswap'?'graduated':state.venue==='migration_pending'?'curve_complete':'bonding_curve',graduationProgress:state.progressPct,
    usdReference:usd,valuationBasis:'Spot price × current minted supply; FDV uses the launch supply.',liquidityBasis:state.venue==='pumpswap'?'Actual vault TVL; virtual reserves excluded.':'Real SOL backing on the bonding curve; virtual reserves and unsold tokens excluded.',
    metricSources:{priceSol:'solana_rpc',priceUsd:usd?'solana_rpc + coinbase':'unavailable',marketCapUsd:usd?'solana_rpc + coinbase':'unavailable',fdvUsd:usd?'solana_rpc + coinbase':'unavailable',liquidityUsd:usd?'solana_rpc + coinbase':'unavailable',holders:blank.holderIndex?'helius_das':'solana_rpc',graduationProgress:'solana_rpc'}});
   const addresses=[bondingCurvePda(mint),...(state.venue==='pumpswap'?[state.address]:[])];
   if(this.options.indexEnabled&&this.chain.getMarketTradePage&&this.indexJobs.size===0){
    const task=this.journal.sync(this.network,mint,addresses,(address,before,until)=>this.chain.getMarketTradePage!(mint,address,before,until,this.options.pageSize)).catch(()=>{this.report('Market history page unavailable; cursor retained for retry');}).finally(()=>this.indexJobs.delete(mint));this.indexJobs.set(mint,task);
   }
   const activity=await this.journal.activity(this.network,mint,addresses).catch(()=>null);
   if(activity){blank.activityCoverage={complete:activity.complete,durable:activity.durable,through:activity.through,reason:activity.reason};
    if(activity.complete){Object.assign(blank,{volume24hSol:activity.volumeSol,volume24hUsd:usd&&activity.volumeSol!==null?activity.volumeSol*usd.price:null,buys24h:activity.buys,sells24h:activity.sells,transactions24h:activity.transactions,sourceAsOf:activity.through,volumeBasis:'Finalized trade notional, fees excluded. USD values use the current SOL/USD reference.'});Object.assign(blank.metricSources!,{volume24hUsd:usd?'solana_rpc + coinbase':'unavailable',buys24h:'solana_rpc',sells24h:'solana_rpc',transactions24h:'solana_rpc'});}
   }
  }
  let raw:unknown[];
  try{raw=z.array(z.unknown()).max(1000).parse(await this.json(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`,'dex'));}catch(e){if(!state)throw e;return TokenMarket.parse({...blank,reason:blank.priceUsd===null?'USD reference unavailable. Verified on-chain values are shown.':null});}
  const candidates=raw.flatMap(x=>{const p=pair.safeParse(x);return p.success?[p.data]:[];}).filter(p=>p.chainId==='solana'&&['pumpswap','pumpfun'].includes(p.dexId)&&p.baseToken.address===mint&&[WRAPPED_SOL_MINT,USDC].includes(p.quoteToken.address)).sort((a,b)=>(b.liquidity?.usd??-1)-(a.liquidity?.usd??-1)||a.pairAddress.localeCompare(b.pairAddress));
  for(const p of candidates.slice(0,5)){
   if(!await this.chain.verifyMarketPool?.(p.pairAddress,mint,p.quoteToken.address))continue;
   const price=p.priceUsd&&/^\d+(\.\d+)?$/.test(p.priceUsd)?Number(p.priceUsd):null;
   // Do not mix a newly graduated pool with an old curve listing. The canonical state wins.
   if(state&&p.pairAddress!==state.address)continue;
   const availablePrice=price!==null&&Number.isFinite(price)?price:null;
   if(state){
    const supplements={priceUsd:availablePrice,marketCapUsd:p.marketCap??null,fdvUsd:p.fdv??null,liquidityUsd:p.liquidity?.usd??null,volume24hUsd:p.volume?.h24??null,buys24h:p.txns?.h24.buys??null,sells24h:p.txns?.h24.sells??null};
    for(const [field,value] of Object.entries(supplements)){if((blank as unknown as Record<string,unknown>)[field]==null&&value!==null){(blank as unknown as Record<string,unknown>)[field]=value;blank.metricSources![field]='dexscreener';}}
    return TokenMarket.parse({...blank,sourceUrl:`https://dexscreener.com/solana/${p.pairAddress}`,priceChange24h:p.priceChange?.h24??null,volumeBasis:blank.activityCoverage?.complete?blank.volumeBasis:'DEX Screener reported USD trading volume.'});
   }
   return TokenMarket.parse({...blank,status:'available',reason:null,source:'dexscreener',sourceUrl:`https://dexscreener.com/solana/${p.pairAddress}`,pairAddress:p.pairAddress,quoteAsset:p.quoteToken.address===USDC?'USDC':'SOL',fetchedAt:new Date(this.now()).toISOString(),priceUsd:availablePrice,volume24hUsd:p.volume?.h24??null,marketCapUsd:p.marketCap??null,fdvUsd:p.fdv??null,liquidityUsd:p.liquidity?.usd??null,priceChange24h:p.priceChange?.h24??null,buys24h:p.txns?.h24.buys??null,sells24h:p.txns?.h24.sells??null,graduation:p.dexId==='pumpswap'?'graduated':blank.graduation});
  }return blank;
 }
/** Holders, graduation progress and their freshness, read directly from Solana. Throws on RPC failure. */
 private async chainMetrics(mint:string):Promise<Partial<Snapshot>>{
  const network=this.network==='demo'?null:this.network;
  if(!network||!this.chain.getCurveProgress||!this.chain.getHolderCount)return {};
  // Each metric fails independently: public RPCs often rate-limit holder enumeration but still serve the curve.
  const [curveRead,holdersRead,metadataRead]=await Promise.allSettled([this.chain.getCurveProgress(mint),this.chain.getHolderCount(mint),this.chain.getIndexedMetadata?.(mint)]);
  if(curveRead.status==='rejected'&&holdersRead.status==='rejected')throw curveRead.reason;
  const curve=curveRead.status==='fulfilled'?curveRead.value:null,holders=holdersRead.status==='fulfilled'?holdersRead.value:null;
  const slot=Math.max(curve?.slot??0,holders?.slot??0),blockTime=await this.chain.getBlockTime?.(slot).catch(()=>null)??null;
  return {...(holders?.index?{holderIndex:holders.index}:{}),...(metadataRead.status==='fulfilled'&&metadataRead.value?{indexedMetadata:metadataRead.value}:{}),holders:holders?.holders??null,holdersLowerBound:!!holders&&holders.holders!==null&&!holders.exact,
   ...(curve?{graduation:curve.complete?'curve_complete' as const:'bonding_curve' as const,graduationProgress:curve.progressPct}:{}),
   chain:{source:'solana_rpc',network,slot,asOf:blockTime===null?null:new Date(blockTime*1000).toISOString(),fetchedAt:new Date(this.now()).toISOString()}};
 }
 /** Recent bonding-curve trades for a verified platform token, from Pump's own events. Never synthesized. */
 async trades(mint:string):Promise<Trades>{
  const cached=this.tradeCache.get(mint);if(cached&&this.now()-cached.at<30000)return cached.value;
  const running=this.tradeJobs.get(mint);if(running)return running;
  const job=this.loadTrades(mint).then(value=>{if(this.tradeCache.size>=200)this.tradeCache.delete(this.tradeCache.keys().next().value!);this.tradeCache.set(mint,{at:this.now(),value});return value;})
   .catch(e=>{if(e instanceof AppError)throw e;return cached&&this.now()-cached.at<300000?{...cached.value,status:'stale' as const,reason:'Solana read temporarily unavailable; showing the last verified trades.'}:this.noTrades(mint,'Solana read temporarily unavailable. Retry shortly.');})
   .finally(()=>this.tradeJobs.delete(mint));this.tradeJobs.set(mint,job);return job;
 }
 private noTrades(mint:string,reason:string):Trades{return {mint,network:this.network,status:'unavailable',reason,source:null,slot:null,complete:false,fetchedAt:null,trades:[]};}
 private async loadTrades(mint:string):Promise<Trades>{
  const c=(await this.store.allCommunities()).find(c=>c.mint===mint),l=c?await this.store.getLaunch(c.launchId):null;
  if(!c||!l||l.launch.status!=='confirmed'||l.launch.mint!==mint||l.launch.communityId!==c.id||l.launch.signature!==c.launchSignature)throw new AppError('not_found','Verified platform token not found');
  if(this.chain.source!=='solana_rpc'||l.launch.mode==='demo'||(!this.chain.getRecentTrades&&!this.chain.getMarketState))return this.noTrades(mint,'Trades are not available for demo launches.');
  const expected=l.launch.execution?.genesisHash??MAINNET;
  if(await this.chain.getGenesisHash?.()!==expected)return this.noTrades(mint,'On-chain read source does not match the launch network.');
  const snapshot=await this.snapshot(mint);
  if(this.chain.getMarketState&&snapshot.pairAddress){
   const addresses=[bondingCurvePda(mint),...(snapshot.graduation==='graduated'?[snapshot.pairAddress]:[])];
   const activity=await this.journal.activity(this.network,mint,addresses);
   return TokenTrades.parse({mint,network:this.network,status:activity.trades.length?'available':'unavailable',reason:activity.trades.length?activity.reason:activity.reason??'No verified trades in the indexed history.',source:'solana_rpc',slot:activity.trades.length?Math.max(...activity.trades.map(t=>t.slot)):snapshot.chain?.slot??null,complete:activity.complete,fetchedAt:new Date(this.now()).toISOString(),trades:activity.trades.map(t=>({signature:t.signature,eventIndex:t.eventIndex,venue:t.venue,slot:t.slot,blockTime:t.blockTime===null?null:new Date(t.blockTime*1000).toISOString(),side:t.side,user:t.user,tokenAmount:t.tokenAmount,tokenDecimals:6,quoteAmount:t.quoteAmount,quoteAsset:'SOL',quoteDecimals:9,creatorFee:t.creatorFee}))});
  }
  const read=await this.chain.getRecentTrades!(mint,20);
  const trades=read.trades.flatMap(t=>{
   const quote=t.quoteMint===WRAPPED_SOL_MINT?{quoteAsset:'SOL' as const,quoteDecimals:9 as const}:USDC_MINTS.includes(t.quoteMint)?{quoteAsset:'USDC' as const,quoteDecimals:6 as const}:null;
   if(!quote)return [];
   return [{signature:t.signature,slot:t.slot,blockTime:t.blockTime===null?null:new Date(t.blockTime*1000).toISOString(),side:t.side,user:t.user,tokenAmount:t.tokenAmount,tokenDecimals:6 as const,quoteAmount:t.quoteAmount,...quote,creatorFee:t.creatorFee}];
  });
  return TokenTrades.parse({mint,network:this.network,status:'available',reason:trades.length?null:'No bonding-curve trades yet.',source:'solana_rpc',slot:read.slot,complete:read.complete,fetchedAt:new Date(this.now()).toISOString(),trades});
 }
 async history(mint:string):Promise<History>{
  const old=this.histories.get(mint);if(old&&this.now()-old.at<60000)return old.value;
  const pending=this.historyJobs.get(mint);if(pending)return pending;
  const work=this.loadHistory(mint).then(value=>{if(this.histories.size>=100)this.histories.delete(this.histories.keys().next().value!);this.histories.set(mint,{at:this.now(),value});return value;}).finally(()=>this.historyJobs.delete(mint));this.historyJobs.set(mint,work);return work;
 }
 private async loadHistory(mint:string):Promise<History>{
  const m=await this.snapshot(mint),empty:History={mint,pairAddress:m.pairAddress,source:'geckoterminal',fetchedAt:null,reason:'Historical data unavailable for this market.',candles:[]};
  if(m.status!=='available'||!m.pairAddress)return empty;
  try{const response=z.object({data:z.object({attributes:z.object({ohlcv_list:z.array(z.tuple([z.number().int().nonnegative(),z.number().finite().nonnegative(),z.number().finite().nonnegative(),z.number().finite().nonnegative(),z.number().finite().nonnegative(),z.number().finite().nonnegative()])).max(48)})})}).parse(await this.json(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${m.pairAddress}/ohlcv/hour?aggregate=1&limit=48&currency=usd&token=${mint}`,'gecko'));
   const candles=response.data.attributes.ohlcv_list.map(([time,open,high,low,close,volume])=>({time,open,high,low,close,volume})).filter(c=>c.time<=this.now()/1000&&c.low<=Math.min(c.open,c.close)&&c.high>=Math.max(c.open,c.close)).sort((a,b)=>a.time-b.time);
   return TokenHistory.parse({...empty,reason:candles.length?null:empty.reason,fetchedAt:new Date(this.now()).toISOString(),candles});
  }catch{return empty;}
 }
}
