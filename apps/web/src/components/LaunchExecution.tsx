import bs58 from 'bs58';
import {routeUrl} from "../navigation/routes";
import {useEffect,useRef,useState} from 'react';
import {LaunchResponse,PrepareLaunchResponse,type SavedLaunchDraft,type TokenLaunch} from '../api/shared';
import {ApiResponseError,SessionExpired,jsonRequest,launchpadRequest,useWalletSession} from '../api/walletSession';
import {devBuyNeedsAcceptance,formatSol,formatTokens,percentFromBps} from '../api/devBuy';
const encoded=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const decoded=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
/** Mounted only after an explicit Create Coin action and enabled backend review. */
export function LaunchExecution({draft,reviewedMaxDevBuyCost=null,autoPrepare=false,onBusyChange,onLockChange,onEdit,onConfirmed,onNewCoin}:{draft:SavedLaunchDraft;
 /** The Developer Buy maximum the creator saw in the form; a higher prepared maximum needs explicit acceptance. */
 reviewedMaxDevBuyCost?:string|null;autoPrepare?:boolean;onBusyChange?:(busy:boolean)=>void;onLockChange?:(locked:boolean)=>void;onEdit?:()=>void;onConfirmed?:(created:boolean)=>void;onNewCoin?:()=>void}){
 const session=useWalletSession(),[launch,setLaunch]=useState<TokenLaunch|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[restoring,setRestoring]=useState(true),[submissionUncertain,setSubmissionUncertain]=useState(false),[signingStage,setSigningStage]=useState('');
 const [acceptedMax,setAcceptedMax]=useState<string|null>(null);
 const scope=`aeco:launch:${draft.wallet}:${draft.id}:${draft.version}`,alive=useRef(true),lock=useRef(false),automatic=useRef(false),savedId=useRef('');
 const requestKey=useRef(''),unresolvedSubmission=useRef(false);
 const walletSignature=useRef('');
 const remember=(l:TokenLaunch)=>{
  if(!alive.current)return;
  if(l.launcherWallet!==draft.wallet||l.execution?.draftId!==draft.id||l.execution.draftVersion!==draft.version||l.fees.platformLaunchFeeLamports!=='50000000')throw new Error('This launch does not match your saved token. Reload the correct draft.');
  if(l.signature||['confirmed','failed'].includes(l.status))unresolvedSubmission.current=false;
  setSubmissionUncertain(unresolvedSubmission.current);savedId.current=l.id;setLaunch(l);try{localStorage.setItem(scope,JSON.stringify({key:requestKey.current,id:l.id,submissionUncertain:unresolvedSubmission.current,walletSignature:walletSignature.current}));}catch{/* The server remains authoritative. */}
 };
 const rememberRef=useRef(remember);rememberRef.current=remember;
 useEffect(()=>{
  alive.current=true;const abort=new AbortController();
  const restore=async()=>{
   try{const saved=JSON.parse(localStorage.getItem(scope)??'null') as {key?:string;id?:string;submissionUncertain?:boolean;walletSignature?:string}|null;
    if(saved?.key)requestKey.current=saved.key;
    unresolvedSubmission.current=saved?.submissionUncertain===true;walletSignature.current=saved?.walletSignature??'';setSubmissionUncertain(unresolvedSubmission.current);
    if(saved?.id){savedId.current=saved.id;const r=await launchpadRequest(`/api/v1/launchpad/launches/${encodeURIComponent(saved.id)}`,LaunchResponse,{signal:abort.signal});rememberRef.current(r.launch);}
   }catch{if(alive.current&&!abort.signal.aborted)setError('Could not restore this launch. Retry checking before preparing another attempt.');}
   finally{if(alive.current&&!abort.signal.aborted)setRestoring(false);}
  };void restore();
  return()=>{alive.current=false;abort.abort();};
 },[scope]);
 useEffect(()=>{onBusyChange?.(busy||restoring);return()=>onBusyChange?.(false);},[busy,restoring,onBusyChange]);
 useEffect(()=>{if(launch?.status==='confirmed')onConfirmed?.(true);},[launch?.status,onConfirmed]);
 const locked=!!launch&&!['failed','expired','confirmed'].includes(launch.status);
 useEffect(()=>{onLockChange?.(locked);return()=>onLockChange?.(false);},[locked,onLockChange]);
 useEffect(()=>{
  if(!launch||(!submissionUncertain&&(!launch.signature||!['submitted','recovery_needed'].includes(launch.status))))return;
  const abort=new AbortController();let polling=false;
  const timer=setInterval(()=>{if(polling)return;polling=true;void launchpadRequest(`/api/v1/launchpad/launches/${launch.id}`,LaunchResponse,{signal:abort.signal}).then(r=>{if(alive.current){rememberRef.current(r.launch);if(!unresolvedSubmission.current)setError('');}}).catch(()=>{if(alive.current&&!abort.signal.aborted)setError('Confirmation is temporarily unavailable. Your submission remains pending; do not create another launch.');}).finally(()=>{polling=false;});},2500);
  return()=>{clearInterval(timer);abort.abort();};
 },[launch,submissionUncertain]);
 const run=async(work:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await work();}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Launch preparation failed. Retry safely.');}finally{lock.current=false;if(alive.current){setBusy(false);setSigningStage('');}}};
 const prepare=()=>void run(async()=>{
  if(!requestKey.current){requestKey.current=crypto.randomUUID();try{localStorage.setItem(scope,JSON.stringify({key:requestKey.current}));}catch{/* Retry key is retained in memory. */}}
  const r=await launchpadRequest(`/api/v1/launchpad/drafts/${draft.id}/launch`,PrepareLaunchResponse,jsonRequest('POST',{version:draft.version},requestKey.current));
  if(r.demoTransaction||!r.launch.execution)throw new Error('Backend did not return a valid safe-network launch');remember(r.launch);
 });
 const prepareRef=useRef(prepare);prepareRef.current=prepare;
 useEffect(()=>{if(autoPrepare&&!restoring&&!launch&&!error&&!automatic.current){automatic.current=true;prepareRef.current();}},[autoPrepare,restoring,launch,error]);
 const check=()=>void run(async()=>{const id=launch?.id||savedId.current;if(!id)throw new Error('No saved launch attempt was found.');remember((await launchpadRequest(`/api/v1/launchpad/launches/${encodeURIComponent(id)}`,LaunchResponse)).launch);});
 const sign=()=>void run(async()=>{
  if(!launch?.execution||session.identity?.wallet!==launch.launcherWallet)throw new Error('Connect the verified creator wallet first');
  setSigningStage('Awaiting wallet approval…');
  const signed=await session.signLaunch(decoded(launch.execution.transaction),launch.execution.network);
  if(!alive.current)return;
  const {VersionedTransaction}=await import('@solana/web3.js');
  const signature=VersionedTransaction.deserialize(signed).signatures[0];
  if(!signature||signature.every(b=>b===0))throw new Error('Wallet did not return a creator signature. Nothing was submitted.');
  walletSignature.current=bs58.encode(signature);
  unresolvedSubmission.current=true;setSubmissionUncertain(true);
  try{localStorage.setItem(scope,JSON.stringify({key:requestKey.current,id:launch.id,submissionUncertain:true,walletSignature:walletSignature.current}));}catch{/* Keep the unresolved submission blocked in memory. */}
  setSigningStage('Submitting signed transaction…');
  try{const r=await launchpadRequest(`/api/v1/launchpad/launches/${launch.id}/submit`,LaunchResponse,jsonRequest('POST',{transaction:encoded(signed)}));remember(r.launch);}
  catch(e){const reason=e instanceof ApiResponseError?`The API returned HTTP ${e.status}: ${e.message}.`:e instanceof SessionExpired?e.message:'Submission response was interrupted.';throw new Error(`${reason} Check this launch’s status before retrying. Do not create another coin or pay again.`);}
 });
 const dev=launch?.fees.developerBuy??null;
 // Never silently raise what the creator agreed to: a higher (or unseen) maximum must be accepted again.
 const needsAcceptance=devBuyNeedsAcceptance(dev?.maxQuoteCost??null,reviewedMaxDevBuyCost,acceptedMax);
 const total=(extra:string)=>launch?formatSol((BigInt(launch.fees.platformLaunchFeeLamports)+BigInt(launch.fees.estimatedNetworkFeesLamports)+BigInt(launch.fees.estimatedAccountRentLamports)+BigInt(extra)).toString()):'';
 return <section aria-label="Launch execution"><h3>Review fees and approve</h3><p className="small">Testing networks only. Mainnet launches remain disabled.</p>
  {!launch?<>{(busy||restoring)&&<p role="status">Preparing your launch transaction…</p>}{!busy&&!restoring&&!error&&<button className="secondary wide" onClick={prepare}>Prepare transaction</button>}</>:<>
   <p role="status">Launch status: {launch.status.replaceAll('_',' ')}</p>
   <dl className="fee-list"><div><dt>Network</dt><dd>{launch.execution?.network}</dd></div><div><dt>Trading pair</dt><dd>{launch.draft.symbol}/{launch.execution?.quoteAsset??"SOL"}</dd></div><div><dt>Platform charge</dt><dd>0.05 SOL{launch.execution?.quoteAsset==="USDC"&&" (paid in SOL)"}</dd></div><div><dt>Treasury destination</dt><dd><code className="ui-select-text">{launch.fees.platformTreasury}</code></dd></div><div><dt>Estimated network fee</dt><dd>{Number(launch.fees.estimatedNetworkFeesLamports)/1e9} SOL</dd></div><div><dt>Estimated account rent</dt><dd>{Number(launch.fees.estimatedAccountRentLamports)/1e9} SOL</dd></div>
    {dev&&<><div><dt>Developer Buy</dt><dd>{formatTokens(dev.tokenAmount)} {launch.draft.symbol} ({percentFromBps(dev.bps)}% of supply)</dd></div>
     <div><dt>Developer Buy cost (simulated)</dt><dd>{formatSol(dev.estimatedQuoteCost)}</dd></div><div><dt>Includes Pump.fun fees</dt><dd>{formatSol(dev.pumpFees)}</dd></div>
     <div><dt>Developer Buy maximum</dt><dd>{formatSol(dev.maxQuoteCost)}</dd></div><div><dt>Price impact</dt><dd>{(dev.priceImpactBps/100).toFixed(2)}%</dd></div></>}
    <div><dt>Total estimated SOL</dt><dd>{total(dev?.estimatedQuoteCost??'0')}{dev&&` (at most ${total(dev.maxQuoteCost)})`}</dd></div></dl>
   {launch.status==='awaiting_signature'&&needsAcceptance&&<div className="launch-quote-change" role="alert"><p className="small">{reviewedMaxDevBuyCost===null?'Review the Developer Buy amounts above before approving.':`The Developer Buy maximum changed from ${formatSol(reviewedMaxDevBuyCost)} to ${formatSol(dev!.maxQuoteCost)}.`} Your wallet will be asked to approve exactly this transaction.</p><button className="secondary" onClick={()=>setAcceptedMax(dev!.maxQuoteCost)}>Accept these amounts</button></div>}
   <p className="small">Your wallet pays network fees and account rent separately. The 0.05 SOL platform charge is in the same transaction as token creation and fee sharing; a failed transaction can still incur network fees.</p>
   {launch.status==='awaiting_signature'&&!submissionUncertain&&<button className="primary wide" disabled={busy||needsAcceptance} onClick={sign}>{busy?signingStage||'Preparing…':'Approve in wallet'}</button>}
   {['submitted','recovery_needed'].includes(launch.status)&&<p role="status">{launch.status==='submitted'?'Confirming your coin on-chain…':'Checking your saved transaction…'}</p>}
   {signingStage&&<p role="status">{signingStage}</p>}{submissionUncertain&&!signingStage&&<p role="status">Checking your signed transaction. Keep this saved attempt.</p>}
   {onEdit&&!busy&&!submissionUncertain&&((!launch.signature&&['awaiting_signature','expired'].includes(launch.status))||launch.status==='failed')&&<button className="text-button" onClick={onEdit}>Edit token details</button>}
   <button className="secondary" disabled={busy} onClick={check}>Check launch status</button>
   {!submissionUncertain&&['expired','failed'].includes(launch.status)&&<button className="secondary" disabled={busy} onClick={()=>{requestKey.current='';savedId.current='';setLaunch(null);automatic.current=false;try{localStorage.removeItem(scope);}catch{/* Local hint only. */}}}>Prepare a new attempt</button>}
   {launch.status==='confirmed'&&<><p>Token creation verified. <a href={routeUrl("explore", launch.mint)}>View in Explore</a></p>{launch.devBuyResult&&<p className="small" role="status">Developer Buy verified on-chain: {formatTokens(launch.devBuyResult.tokenAmount)} {launch.draft.symbol} ({Number(launch.devBuyResult.allocationBps)/100}% of supply) for {formatSol(launch.devBuyResult.quoteSpent)}.</p>}<p className="small ui-select-text">Mint: {launch.mint}</p>{launch.execution?.network==='devnet'&&<a href={`https://explorer.solana.com/tx/${launch.signature}?cluster=devnet`} target="_blank" rel="noreferrer">Confirmed transaction</a>}{onNewCoin&&<button className="secondary" onClick={onNewCoin}>Create another coin</button>}</>}
   {launch.status==='recovery_needed'&&<p role="alert">The transaction landed, but platform verification needs recovery. Do not launch or pay again.</p>}
  </>}
  {error&&<><p role="alert">{error}</p><button className="secondary" disabled={busy} onClick={launch||savedId.current?check:prepare}>{launch||savedId.current?'Retry status check':'Retry preparation'}</button></>}
 </section>;
}
