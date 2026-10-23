import {useEffect,useState} from 'react';
import {TokenMarket,type TokenMarket as Snapshot} from './shared';
import {HttpAdapter,type ApiAdapter} from './adapter';
import type {VerifiedToken} from './tokens';
export function useTokenMarkets(api:ApiAdapter,tokens:VerifiedToken[]){
 const [markets,setMarkets]=useState<Record<string,Snapshot>>({});
 // Verified testing-network launches have no price market, but their on-chain holders and graduation are real.
 const key=tokens.filter(t=>t.launch.mode!=='demo').map(t=>t.community.mint).sort().join(',');
 useEffect(()=>{
  setMarkets({});if(!(api instanceof HttpAdapter)||!key)return;
  const abort=new AbortController();let running=false;
  const load=async()=>{if(running)return;running=true;try{const mints=key.split(',');for(let i=0;i<mints.length&&!abort.signal.aborted;i+=4){await Promise.all(mints.slice(i,i+4).map(async mint=>{try{const m=await api.request(`/api/v1/token-markets/${mint}`,TokenMarket,{signal:abort.signal});if(!abort.signal.aborted)setMarkets(old=>({...old,[mint]:m}));}catch{if(!abort.signal.aborted)setMarkets(old=>{const next={...old};delete next[mint];return next;});}}));}}finally{running=false;}};
  void load();const timer=setInterval(()=>void load(),60000);return()=>{abort.abort();clearInterval(timer);};
 },[api,key]);return markets;
}
export const marketNumber=(n:number|null|undefined)=>n==null?'Unavailable':new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumSignificantDigits:6}).format(n);
/** Raw base units to a decimal string without floating-point rounding. */
export function baseUnits(amount:string,decimals:number){const v=amount.padStart(decimals+1,'0'),whole=v.slice(0,-decimals)||'0',frac=v.slice(-decimals).replace(/0+$/,'');return frac?`${BigInt(whole).toLocaleString()}.${frac}`:BigInt(whole).toLocaleString();}
export const explorerTx=(signature:string,network:string)=>`https://explorer.solana.com/tx/${signature}${network==='mainnet-beta'?'':`?cluster=${network==='localnet'?'custom':network}`}`;

/** Attribution belongs to the metric, not to whichever supplementary provider responded. */
export function marketSource(market:Snapshot|undefined,field?:string){
 const source=(field?market?.metricSources?.[field]:null)??market?.source;
 if(source==='dexscreener')return 'DEX Screener';
 if(source?.includes('coinbase'))return 'Solana · Coinbase';
 if(source==='helius_das')return 'Helius';
 return source==='solana_rpc'?'Solana':'Market data';
}
