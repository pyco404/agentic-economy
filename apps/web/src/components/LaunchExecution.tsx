import {useEffect,useRef,useState} from 'react';
import {LaunchResponse,PrepareLaunchResponse,type SavedLaunchDraft,type TokenLaunch} from '../api/shared';
import {jsonRequest,launchpadRequest,useWalletSession} from '../api/walletSession';
const encoded=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const decoded=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
/** Mounted only when the backend explicitly permits safe-network execution. */
export function LaunchExecution({draft}:{draft:SavedLaunchDraft}){
 const session=useWalletSession(),[launch,setLaunch]=useState<TokenLaunch|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const scope=`aeco:launch:${draft.wallet}:${draft.id}:${draft.version}`,alive=useRef(true),lock=useRef(false);
 const requestKey=useRef('');
 const remember=(l:TokenLaunch)=>{if(!alive.current)return;setLaunch(l);try{localStorage.setItem(scope,JSON.stringify({key:requestKey.current,id:l.id}));}catch{/* The server remains authoritative. */}};
 useEffect(()=>{
  alive.current=true;const abort=new AbortController();
  try{const saved=JSON.parse(localStorage.getItem(scope)??'null') as {key?:string;id?:string}|null;if(saved?.key)requestKey.current=saved.key;if(saved?.id)void launchpadRequest(`/api/v1/launchpad/launches/${encodeURIComponent(saved.id)}`,LaunchResponse,{signal:abort.signal}).then(r=>{if(alive.current&&r.launch.launcherWallet===draft.wallet&&r.launch.execution?.draftId===draft.id&&r.launch.execution.draftVersion===draft.version)setLaunch(r.launch);}).catch(()=>{if(alive.current)setError('Could not restore this launch. Retry checking before preparing another attempt.');});}catch{/* Malformed local hints never confer ownership. */}
  return()=>{alive.current=false;abort.abort();};
 },[scope,draft.wallet,draft.id,draft.version]);
 useEffect(()=>{
  if(!launch?.signature||!['submitted','recovery_needed'].includes(launch.status))return;
  const abort=new AbortController();const timer=setInterval(()=>{void launchpadRequest(`/api/v1/launchpad/launches/${launch.id}`,LaunchResponse,{signal:abort.signal}).then(r=>{if(alive.current)setLaunch(r.launch);}).catch(()=>{if(alive.current&&!abort.signal.aborted)setError('Confirmation is temporarily unavailable. Your submission remains pending; do not create another launch.');});},2500);
  return()=>{clearInterval(timer);abort.abort();};
 },[launch?.id,launch?.signature,launch?.status]);
 const run=async(work:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await work();}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Launch preparation failed. Retry safely.');}finally{lock.current=false;if(alive.current)setBusy(false);}};
 const prepare=()=>void run(async()=>{
  if(!requestKey.current){requestKey.current=crypto.randomUUID();try{localStorage.setItem(scope,JSON.stringify({key:requestKey.current}));}catch{/* Retry key is retained in memory. */}}
  const r=await launchpadRequest(`/api/v1/launchpad/drafts/${draft.id}/launch`,PrepareLaunchResponse,jsonRequest('POST',{version:draft.version},requestKey.current));
  if(r.demoTransaction||!r.launch.execution||r.launch.launcherWallet!==draft.wallet||r.launch.fees.platformLaunchFeeLamports!=='50000000')throw new Error('Backend did not return a valid safe-network launch');remember(r.launch);
 });
 const check=()=>void run(async()=>{if(launch)remember((await launchpadRequest(`/api/v1/launchpad/launches/${launch.id}`,LaunchResponse)).launch);else{let saved:{id?:string}|null=null;try{saved=JSON.parse(localStorage.getItem(scope)??'null');}catch{/* No trusted local state. */}if(saved?.id)remember((await launchpadRequest(`/api/v1/launchpad/launches/${encodeURIComponent(saved.id)}`,LaunchResponse)).launch);else throw new Error('No saved launch attempt was found.');}});
 const sign=()=>void run(async()=>{
  if(!launch?.execution||session.identity?.wallet!==launch.launcherWallet)throw new Error('Connect the verified creator wallet first');
  const signed=await session.signLaunch(decoded(launch.execution.transaction),launch.execution.network);
  if(!alive.current)return;
  const r=await launchpadRequest(`/api/v1/launchpad/launches/${launch.id}/submit`,LaunchResponse,jsonRequest('POST',{transaction:encoded(signed)}));remember(r.launch);
 });
 return <section aria-label="Launch execution"><p className="small">Testing networks only. Mainnet launches remain disabled.</p>
  {!launch?<button className="primary wide" disabled={busy} onClick={prepare}>Review launch fees</button>:<>
   <p role="status">Launch status: {launch.status.replaceAll('_',' ')}</p>
   <dl className="fee-list"><div><dt>Network</dt><dd>{launch.execution?.network}</dd></div><div><dt>Platform charge</dt><dd>0.05 SOL</dd></div><div><dt>Treasury destination</dt><dd><code className="ui-select-text">{launch.fees.platformTreasury}</code></dd></div><div><dt>Estimated network fee</dt><dd>{Number(launch.fees.estimatedNetworkFeesLamports)/1e9} SOL</dd></div><div><dt>Estimated account rent</dt><dd>{Number(launch.fees.estimatedAccountRentLamports)/1e9} SOL</dd></div></dl>
   <p className="small">Your wallet pays network fees and account rent separately. The 0.05 SOL platform charge is in the same transaction as token creation and fee sharing; a failed transaction can still incur network fees.</p>
   {launch.status==='awaiting_signature'&&<button className="primary wide" disabled={busy} onClick={sign}>{busy?'Awaiting wallet…':'Sign launch transaction'}</button>}
   <button className="secondary" disabled={busy} onClick={check}>Check launch status</button>
   {['expired','failed'].includes(launch.status)&&<button className="secondary" disabled={busy} onClick={()=>{requestKey.current='';setLaunch(null);try{localStorage.removeItem(scope);}catch{/* Local hint only. */}}}>Prepare a new attempt</button>}
   {launch.status==='confirmed'&&<><p>Token creation verified. <a href="/explore">View in Explore</a></p><p className="small ui-select-text">Mint: {launch.mint}</p>{launch.execution?.network==='devnet'&&<a href={`https://explorer.solana.com/tx/${launch.signature}?cluster=devnet`} target="_blank" rel="noreferrer">Confirmed transaction</a>}</>}
   {launch.status==='recovery_needed'&&<p role="alert">The transaction landed, but platform verification needs recovery. Do not launch or pay again.</p>}
  </>}
  {error&&<><p role="alert">{error}</p><button className="secondary" disabled={busy} onClick={check}>Retry status check</button></>}
 </section>;
}
