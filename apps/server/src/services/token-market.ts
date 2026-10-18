import {z} from 'zod';
import {TokenMarket,TokenHistory,WRAPPED_SOL_MINT,type TokenMarket as Snapshot,type TokenHistory as History} from '@agentic-economy/shared';
import type {Store} from '../store/types.js';
import type {ChainGateway} from '../chain/types.js';
import {verifyLaunch} from '../chain/verify.js';
import {sharingConfigPda} from '../chain/pump.js';
import {AppError} from '../util/errors.js';
const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const n=z.number().finite().nonnegative().nullish();
const pair=z.object({chainId:z.string(),dexId:z.string(),pairAddress:z.string(),baseToken:z.object({address:z.string()}),quoteToken:z.object({address:z.string()}),priceUsd:z.string().nullish(),volume:z.object({h24:n}).nullish(),marketCap:n,liquidity:z.object({usd:n}).nullish(),priceChange:z.object({h24:z.number().finite().nullish()}).nullish(),txns:z.object({h24:z.object({buys:z.number().int().nonnegative(),sells:z.number().int().nonnegative()})}).nullish()});
export function unavailableMarket(mint:string,network:Snapshot['network'],reason:string):Snapshot{return {mint,network,status:'unavailable',reason,fetchedAt:null,sourceAsOf:null,source:null,sourceUrl:null,pairAddress:null,quoteAsset:null,priceUsd:null,volume24hUsd:null,marketCapUsd:null,liquidityUsd:null,priceChange24h:null,holders:null,buys24h:null,sells24h:null,graduation:'unknown',graduationProgress:null};}
/** Read-only fixed provider hosts. No API keys, execution, arbitrary URLs or mock-market fallback. */
export class TokenMarketService{
 private cache=new Map<string,{at:number;value:Snapshot}>();private histories=new Map<string,{at:number;value:History}>();private jobs=new Map<string,Promise<Snapshot>>();private historyJobs=new Map<string,Promise<History>>();
 private budget={dex:[] as number[],gecko:[] as number[]};private active=0;
 constructor(private store:Store,private chain:ChainGateway,private network:Snapshot['network'],private fetcher:typeof fetch=fetch,private now=()=>Date.now()){}
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
  if(this.chain.source!=='solana_rpc'||this.network!=='mainnet-beta'||l.launch.mode==='demo'||l.launch.execution)return {...blank,reason:'Public market providers do not cover this demo or testing-network launch.'};
  if(await this.chain.getGenesisHash?.()!==MAINNET)return {...blank,reason:'Mainnet read-source identity could not be verified.'};
  const routing=await this.chain.getFeeRoutingState(mint),tx=await this.chain.getTransaction(c.launchSignature);
  if(verifyLaunch({launcherWallet:l.launch.launcherWallet,mint,platformTreasury:l.launch.fees.platformTreasury,agentRewardsTreasury:l.launch.fees.creatorFeeSplit.agentRewardsTreasury,sharingConfig:sharingConfigPda(mint),draft:l.launch.draft},tx,routing).outcome!=='confirmed')return {...blank,reason:'Platform launch evidence could not be reverified.'};
  blank.graduation=routing.bondingCurveComplete===true?'curve_complete':routing.bondingCurveComplete===false?'bonding_curve':'unknown';
  const raw=z.array(z.unknown()).max(1000).parse(await this.json(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`,'dex'));
  const candidates=raw.flatMap(x=>{const p=pair.safeParse(x);return p.success?[p.data]:[];}).filter(p=>p.chainId==='solana'&&['pumpswap','pumpfun'].includes(p.dexId)&&p.baseToken.address===mint&&[WRAPPED_SOL_MINT,USDC].includes(p.quoteToken.address)).sort((a,b)=>(b.liquidity?.usd??-1)-(a.liquidity?.usd??-1)||a.pairAddress.localeCompare(b.pairAddress));
  for(const p of candidates.slice(0,5)){
   if(!await this.chain.verifyMarketPool?.(p.pairAddress,mint,p.quoteToken.address))continue;
   const price=p.priceUsd&&/^\d+(\.\d+)?$/.test(p.priceUsd)?Number(p.priceUsd):null;
   return TokenMarket.parse({...blank,status:'available',reason:null,source:'dexscreener',sourceUrl:`https://dexscreener.com/solana/${p.pairAddress}`,pairAddress:p.pairAddress,quoteAsset:p.quoteToken.address===USDC?'USDC':'SOL',fetchedAt:new Date(this.now()).toISOString(),priceUsd:price!==null&&Number.isFinite(price)?price:null,volume24hUsd:p.volume?.h24??null,marketCapUsd:p.marketCap??null,liquidityUsd:p.liquidity?.usd??null,priceChange24h:p.priceChange?.h24??null,buys24h:p.txns?.h24.buys??null,sells24h:p.txns?.h24.sells??null,graduation:p.dexId==='pumpswap'?'graduated':blank.graduation});
  }return blank;
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
