import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getWallets } from '@wallet-standard/app';
import bs58 from 'bs58';
import { WalletIdentity, ChallengeResponse, LaunchpadCapabilities, launchpadPaths, type WalletIdentity as Identity } from './shared';
import { z } from 'zod';
export function walletApiOrigin(configured:string,pageOrigin?:string){
 const value=configured.replace(/\/$/,'');
 if(!pageOrigin)return value;
 const api=new URL(value),page=new URL(pageOrigin),local=['localhost','127.0.0.1'];
 // Keep local authentication cookies same-site when a developer opens the
 // equivalent loopback alias. Never rewrite a remote API or its protocol/port.
 if(local.includes(api.hostname)&&local.includes(page.hostname)&&api.protocol===page.protocol){api.hostname=page.hostname;return api.toString().replace(/\/$/,'');}
 return value;
}
export const launchpadApiOrigin=()=>walletApiOrigin(String(import.meta.env.VITE_API_URL??'http://127.0.0.1:8787'),typeof location==='undefined'?undefined:location.origin);
export class SessionExpired extends Error{}
/** A received API rejection, distinct from a lost transport response. */
export class ApiResponseError extends Error{constructor(readonly status:number,message:string){super(message);this.name='ApiResponseError';}}
export async function launchpadRequest<S extends z.ZodType>(path:string,schema:S,options:RequestInit={}):Promise<z.infer<S>>{
 const response=await fetch(launchpadApiOrigin()+path,{...options,credentials:'include',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)});
 if(response.status===401){window.dispatchEvent(new Event('aeco:session-expired'));throw new SessionExpired('Your session expired. Connect and authenticate again.');}
 let body:unknown;try{body=await response.json();}catch{throw new Error('The API returned an invalid response. Please retry.');}
 if(!response.ok)throw new ApiResponseError(response.status,(body as {error?:{message?:string}})?.error?.message??`Request failed (${response.status})`);
 return schema.parse(body);
}
export const jsonRequest=(method:string,body:unknown,key?:string):RequestInit=>({method,headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(body)});
export function validateWalletChallenge(challenge:z.infer<typeof ChallengeResponse>,address:string,origin:string){
 const lines=challenge.message.split('\n'),uri=lines.find(l=>l.startsWith('URI: '))?.slice(5);
 const current=new URL(origin);
 if(!uri||new URL(uri).origin!==current.origin||lines[0]!==`${current.host} wants you to sign in with your Solana account:`||lines[1]!==address||!lines.includes(`Nonce: ${challenge.nonce}`)||Date.parse(challenge.expiresAt)<=Date.now())
  throw new Error(`Wallet sign-in must match this page (${current.origin}), including its port. Reload this page or use the configured website URL.`);
}
interface WalletChoice {name:string;connect():Promise<string>;sign(message:Uint8Array):Promise<Uint8Array>;signTransaction?(message:Uint8Array,network:"devnet"|"localnet"|"mainnet-beta"):Promise<Uint8Array>;disconnect():Promise<void>;listen(change:()=>void):()=>void;}
interface Injected {publicKey?:{toBase58():string};connect():Promise<{publicKey:{toBase58():string}}>;signMessage(m:Uint8Array,encoding?:string):Promise<{signature:Uint8Array}>;signTransaction?(transaction:unknown):Promise<{serialize():Uint8Array}>;disconnect():Promise<void>;on?(e:string,f:()=>void):void;removeListener?(e:string,f:()=>void):void;}
export function installedWallets():WalletChoice[]{
 const result:WalletChoice[]=[];
 const browser=window as unknown as {phantom?:{solana?:Injected};solflare?:Injected;backpack?:Injected};
 for(const wallet of getWallets().get()){
  const features=wallet.features as Record<string,unknown>;
  const connect=features['standard:connect'] as {connect():Promise<{accounts:readonly {address:string}[]}>}|undefined;
  const signing=features['solana:signMessage'] as {signMessage(input:{account:unknown;message:Uint8Array}):Promise<readonly {signature:Uint8Array;signedMessage:Uint8Array}[]>}|undefined;
  const signingTx=features['solana:signTransaction'] as {supportedTransactionVersions?:readonly (0|'legacy')[];signTransaction(input:{account:unknown;transaction:Uint8Array;chain:string}):Promise<readonly {signedTransaction:Uint8Array}[]>}|undefined;
  const disconnect=features['standard:disconnect'] as {disconnect():Promise<void>}|undefined;
  const events=features['standard:events'] as {on(e:string,f:()=>void):()=>void}|undefined;
  if(!connect||!signing)continue;
  let address=wallet.accounts[0]?.address??'';
  const injected=wallet.name==='Phantom'?browser.phantom?.solana:wallet.name==='Solflare'?browser.solflare:wallet.name==='Backpack'?browser.backpack:undefined;
  // Phantom can register message authentication via Wallet Standard while exposing
  // sign-only transactions exclusively on its injected provider. Do not let the
  // standard registration hide that capability, or fall back after a rejection.
  const signTransaction=signingTx?.supportedTransactionVersions?.includes(0)
   ? async(transaction:Uint8Array,network:"devnet"|"localnet"|"mainnet-beta")=>{const account=wallet.accounts.find(a=>a.address===address);const chain=network==="mainnet-beta"?"solana:mainnet":`solana:${network}` as const;if(!account||!account.chains.includes(chain))throw new Error('This wallet account does not support the selected Solana network');const result=(await signingTx.signTransaction({account,transaction,chain}))[0];if(!result)throw new Error('Wallet did not return a signed transaction');return result.signedTransaction;}
   : injected?.signTransaction
    ? async(transaction:Uint8Array)=>{if(injected.publicKey?.toBase58()!==address)throw new Error('Wallet account changed. Reconnect before signing.');const {VersionedTransaction}=await import('@solana/web3.js');const signed=await injected.signTransaction!(VersionedTransaction.deserialize(transaction));if(injected.publicKey?.toBase58()!==address)throw new Error('Wallet account changed during signing');return signed.serialize();}
    : undefined;
  result.push({name:wallet.name,connect:async()=>{const r=await connect.connect();const account=r.accounts.find(a=>wallet.accounts.find(w=>w.address===a.address)?.chains.some(c=>c.startsWith('solana:')));if(!account)throw new Error('No Solana account is available');address=account.address;return address;},
   sign:async(message)=>{const account=wallet.accounts.find(a=>a.address===address);if(!account)throw new Error('Wallet account changed');const r=(await signing.signMessage({account,message}))[0];if(!r||r.signedMessage.length!==message.length||!r.signedMessage.every((v,i)=>v===message[i]))throw new Error('Wallet signed a different message');return r.signature;},
   ...(signTransaction?{signTransaction}:{}),
   disconnect:async()=>{await disconnect?.disconnect();},listen:change=>events?.on('change',change)??(()=>{})});
 }
 for(const [name,provider] of [['Phantom',browser.phantom?.solana],['Solflare',browser.solflare],['Backpack',browser.backpack]] as const){if(!provider||result.some(w=>w.name===name))continue;result.push({name,connect:async()=>(await provider.connect()).publicKey.toBase58(),sign:async m=>(await provider.signMessage(m,'utf8')).signature,...(provider.signTransaction?{signTransaction:async(bytes:Uint8Array)=>{const {VersionedTransaction}=await import('@solana/web3.js');return(await provider.signTransaction!(VersionedTransaction.deserialize(bytes))).serialize();}}:{}),disconnect:()=>provider.disconnect(),listen:f=>{provider.on?.('accountChanged',f);provider.on?.('disconnect',f);return()=>{provider.removeListener?.('accountChanged',f);provider.removeListener?.('disconnect',f);};}});}
 return result;
}
interface SessionState {identity:Identity|null;busy:boolean;error:string;available:boolean;signLaunch(transaction:Uint8Array,network:"devnet"|"localnet"|"mainnet-beta"):Promise<Uint8Array>;open():void;logout():Promise<void>;}
const SessionContext=createContext<SessionState>({identity:null,busy:false,error:'',available:false,signLaunch:async()=>{throw new Error('Connect a transaction-signing wallet first');},open:()=>{},logout:async()=>{}});
export const useWalletSession=()=>useContext(SessionContext);
export function WalletSessionProvider({children}:{children:ReactNode}){
 const [identity,setIdentity]=useState<Identity|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[available,setAvailable]=useState(false),[dialog,setDialog]=useState(false),[wallets,setWallets]=useState<WalletChoice[]>([]);
 const active=useRef<WalletChoice|null>(null),unlisten=useRef<(()=>void)|null>(null),epoch=useRef(0),lock=useRef(false);
 const invalidate=useCallback(()=>{epoch.current++;setIdentity(null);unlisten.current?.();unlisten.current=null;},[]);
 const logout=useCallback(async()=>{invalidate();try{await launchpadRequest(launchpadPaths.logout,z.object({ok:z.literal(true)}),jsonRequest('POST',{}));await active.current?.disconnect();active.current=null;setError('');}catch(e){setError(e instanceof Error?e.message:'Sign out failed. Retry to revoke your session.');}},[invalidate]);
 useEffect(()=>{
  let alive=true;const controller=new AbortController();
  void launchpadRequest(launchpadPaths.capabilities,LaunchpadCapabilities,{signal:controller.signal}).then(async()=>{if(!alive)return;try{const session=await launchpadRequest(launchpadPaths.session,WalletIdentity,{signal:controller.signal});if(alive)setIdentity(session);}catch{/* A fresh visitor has no session. */}finally{if(alive)setAvailable(true);}}).catch(()=>{if(alive)setAvailable(false);});
  const expired=()=>{invalidate();};window.addEventListener('aeco:session-expired',expired);
  return()=>{alive=false;controller.abort();window.removeEventListener('aeco:session-expired',expired);unlisten.current?.();};
 },[invalidate]);
 useEffect(()=>{if(!identity)return;const timer=setTimeout(()=>{invalidate();setError('Your session expired. Connect again.');},Math.max(0,Date.parse(identity.sessionExpiresAt)-Date.now()));return()=>clearTimeout(timer);},[identity,invalidate]);
 useEffect(()=>{
  if(!identity||active.current)return;
  let name='';try{name=sessionStorage.getItem('aeco:wallet-provider')??'';}catch{/* Session itself is HttpOnly. */}
  const watch=()=>{if(active.current)return;const provider=installedWallets().find(w=>w.name===name);if(provider){active.current=provider;unlisten.current=provider.listen(()=>{void logout();});}};
  watch();const stop=getWallets().on('register',watch);return stop;
 },[identity,logout]);
 useEffect(()=>{
  if(!dialog)return;const previous=document.activeElement as HTMLElement|null;
  const section=document.querySelector<HTMLElement>('.wallet-dialog');section?.querySelector<HTMLElement>('button')?.focus();
  const trap=(event:KeyboardEvent)=>{if(event.key!=='Tab'||!section)return;const nodes=Array.from(section.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled)'));const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}};
  document.addEventListener('keydown',trap);return()=>{document.removeEventListener('keydown',trap);previous?.focus();};
 },[dialog]);
 const login=async(wallet:WalletChoice)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');const current=++epoch.current;let stopPending:(()=>void)|undefined;
  try{
   const address=await wallet.connect();
   // Subscribe before signing: a pending approval must not authenticate an
   // account that the user has already changed or disconnected.
   if(current!==epoch.current)return;
   stopPending=wallet.listen(()=>{invalidate();setError('Wallet changed during sign-in. Connect again.');});
   const challenge=await launchpadRequest('/api/v1/auth/challenge',ChallengeResponse,jsonRequest('POST',{wallet:address}));
   if(current!==epoch.current)return;
   validateWalletChallenge(challenge,address,location.origin);
   const signature=await wallet.sign(new TextEncoder().encode(challenge.message));if(current!==epoch.current)return;
   const verified=await launchpadRequest(launchpadPaths.verify,WalletIdentity,jsonRequest('POST',{wallet:address,nonce:challenge.nonce,signature:bs58.encode(signature)}));
   if(current!==epoch.current){await launchpadRequest(launchpadPaths.logout,z.object({ok:z.literal(true)}),jsonRequest('POST',{}));return;}
   if(verified.wallet!==address)throw new Error('Authenticated wallet mismatch');
   try{sessionStorage.setItem("aeco:wallet-provider",wallet.name);}catch{/* Provider hint contains no secret. */}
   stopPending?.();stopPending=undefined;active.current=wallet;unlisten.current?.();unlisten.current=wallet.listen(()=>{void logout();});setIdentity(verified);setDialog(false);
  }catch(e){setError(e instanceof Error?e.message:'Connection or signature was rejected. Please retry.');}finally{stopPending?.();lock.current=false;setBusy(false);}
 };
 const signLaunch=async(transaction:Uint8Array,network:"devnet"|"localnet"|"mainnet-beta")=>{
  const wallet=active.current,current=epoch.current;if(!identity||!wallet?.signTransaction)throw new Error('Reconnect a supported transaction-signing wallet to continue');
  const signed=await wallet.signTransaction(transaction,network);if(current!==epoch.current)throw new Error('Wallet changed during launch approval');return signed;
 };
 return <SessionContext.Provider value={{identity,busy,error,available,signLaunch,open:()=>{setWallets(installedWallets());setError('');setDialog(true);},logout}}>{children}{dialog&&<div className="wallet-dialog-backdrop" onClick={()=>{if(!busy)setDialog(false);}}><section role="dialog" aria-modal="true" aria-labelledby="wallet-title" className="surface wallet-dialog" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'&&!busy)setDialog(false);}}><button className="text-button" aria-label="Close wallet selection" onClick={()=>setDialog(false)} disabled={busy}>Close</button><h2 id="wallet-title">Connect your wallet</h2><p>Sign a message to authenticate. No transaction or fee.</p>{!available?<p>Wallet authentication is unavailable on this backend version. Please try later.</p>:wallets.length?wallets.map(w=><button key={w.name} className="secondary wide" disabled={busy} onClick={()=>void login(w)}>{busy?'Awaiting wallet approval…':w.name}</button>):<p>No supported wallet detected. Open this site in a Solana wallet’s in-app browser on mobile, or install a compatible browser wallet.</p>}{error&&<p role="alert">{error}</p>}</section></div>}</SessionContext.Provider>;
}
