import {z} from 'zod';
import bs58 from 'bs58';
import '../launch-review.css';
import {eraseSignedLaunch,readSignedLaunch,saveSignedLaunch} from '../api/signedLaunch';
import {routeUrl} from "../navigation/routes";
import {useEffect,useRef,useState} from 'react';
import {LaunchResponse,PrepareLaunchResponse,LocalMintReview,type SavedLaunchDraft,type TokenLaunch} from '../api/shared';
import {ApiResponseError,SessionExpired,launchpadApiOrigin,jsonRequest,launchpadRequest,useWalletSession} from '../api/walletSession';
import {devBuyNeedsAcceptance,formatSol,formatTokens,percentFromBps} from '../api/devBuy';
const encoded=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const decoded=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
/** New execution needs enabled review; existing saved attempts also support read-only recovery. */
export function LaunchExecution({draft,reviewedMaxDevBuyCost=null,autoPrepare=false,executionAllowed=true,preparationAllowed=executionAllowed,onBusyChange,onLockChange,onEdit,onConfirmed,onNewCoin}:{draft:SavedLaunchDraft;
 /** The Developer Buy maximum the creator saw in the form; a higher prepared maximum needs explicit acceptance. */
 reviewedMaxDevBuyCost?:string|null;autoPrepare?:boolean;executionAllowed?:boolean;preparationAllowed?:boolean;onBusyChange?:(busy:boolean)=>void;onLockChange?:(locked:boolean)=>void;onEdit?:()=>void;onConfirmed?:(created:boolean)=>void;onNewCoin?:()=>void}){
 const session=useWalletSession(),[launch,setLaunch]=useState<TokenLaunch|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[restoring,setRestoring]=useState(true),[submissionUncertain,setSubmissionUncertain]=useState(false),[signingStage,setSigningStage]=useState('');
 const [acceptedMax,setAcceptedMax]=useState<string|null>(null),[canResume,setCanResume]=useState(false);
 const [copyMessage,setCopyMessage]=useState('');
 const [localMintSignature,setLocalMintSignature]=useState<{id:string;hash:string;transaction:string}|null>(null);
 const binding=(l:TokenLaunch)=>({wallet:draft.wallet,id:l.id,mint:l.mint,network:l.execution!.network});
 const received=(r:{launch:TokenLaunch;recovery?:{signature:string;canResume:boolean}})=>{
  let local:ReturnType<typeof readSignedLaunch>=null;
  try{if(r.launch.execution)local=readSignedLaunch(sessionStorage,launchpadApiOrigin(),binding(r.launch));}catch{/* Backend copy remains authoritative. */}
  const known=r.launch.signature??r.recovery?.signature;
  if(local&&known&&local.signature!==known)throw new Error('The saved wallet signature conflicts with the API. Keep this attempt for reconciliation.');
  if(local&&!r.launch.signature&&!['confirmed','failed'].includes(r.launch.status))unresolvedSubmission.current=true;
  rememberRef.current(r.launch);setCanResume(!!r.recovery?.canResume||!!local);
 };
 const scope=`aeco:launch:${draft.wallet}:${draft.id}:${draft.version}`,alive=useRef(true),lock=useRef(false),automatic=useRef(false),savedId=useRef('');
 const requestKey=useRef(''),unresolvedSubmission=useRef(false);
 const walletSignature=useRef('');
 const remember=(l:TokenLaunch)=>{
  if(!alive.current)return;
  if(l.launcherWallet!==draft.wallet||l.execution?.draftId!==draft.id||l.execution.draftVersion!==draft.version||l.fees.platformLaunchFeeLamports!=='50000000')throw new Error('This launch does not match your saved token. Reload the correct draft.');
  if(['confirmed','failed'].includes(l.status)){try{if(l.execution)eraseSignedLaunch(sessionStorage,launchpadApiOrigin(),binding(l));}catch{/* Tab-scoped copy expires automatically. */}}
  if(l.signature||['confirmed','failed'].includes(l.status))unresolvedSubmission.current=false;
  setSubmissionUncertain(unresolvedSubmission.current);savedId.current=l.id;setLaunch(l);try{localStorage.setItem(scope,JSON.stringify({key:requestKey.current,id:l.id,submissionUncertain:unresolvedSubmission.current,walletSignature:walletSignature.current}));}catch{/* The server remains authoritative. */}
 };
 const rememberRef=useRef(remember);rememberRef.current=remember;
 const receivedRef=useRef(received);receivedRef.current=received;
 useEffect(()=>{
  alive.current=true;const abort=new AbortController();
  const restore=async()=>{
   try{const saved=JSON.parse(localStorage.getItem(scope)??'null') as {key?:string;id?:string;submissionUncertain?:boolean;walletSignature?:string}|null;
    if(saved?.key)requestKey.current=saved.key;
    unresolvedSubmission.current=saved?.submissionUncertain===true;walletSignature.current=saved?.walletSignature??'';setSubmissionUncertain(unresolvedSubmission.current);
    if(saved?.id){savedId.current=saved.id;const r=await launchpadRequest(`/api/v1/launchpad/launches/${encodeURIComponent(saved.id)}`,LaunchResponse,{signal:abort.signal});receivedRef.current(r);}
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
  const timer=setInterval(()=>{if(polling)return;polling=true;void launchpadRequest(`/api/v1/launchpad/launches/${launch.id}`,LaunchResponse,{signal:abort.signal}).then(r=>{if(alive.current){receivedRef.current(r);if(!unresolvedSubmission.current)setError('');}}).catch(()=>{if(alive.current&&!abort.signal.aborted)setError('Confirmation is temporarily unavailable. Your submission remains pending; do not create another launch.');}).finally(()=>{polling=false;});},2500);
  return()=>{clearInterval(timer);abort.abort();};
 },[launch,submissionUncertain]);
 const run=async(work:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await work();}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Launch preparation failed. Retry safely.');}finally{lock.current=false;if(alive.current){setBusy(false);setSigningStage('');}}};
 const prepare=()=>void run(async()=>{
  if(!preparationAllowed)throw new Error('New launch execution is disabled. Check the existing saved attempt.');
  if(!requestKey.current){requestKey.current=crypto.randomUUID();try{localStorage.setItem(scope,JSON.stringify({key:requestKey.current}));}catch{/* Retry key is retained in memory. */}}
  const r=await launchpadRequest(`/api/v1/launchpad/drafts/${draft.id}/launch`,PrepareLaunchResponse,jsonRequest('POST',{version:draft.version},requestKey.current));
  if(r.demoTransaction||!r.launch.execution)throw new Error('Backend did not return a valid safe-network launch');remember(r.launch);
 });
 const prepareRef=useRef(prepare);prepareRef.current=prepare;
 useEffect(()=>{if(preparationAllowed&&autoPrepare&&!restoring&&!launch&&!error&&!automatic.current){automatic.current=true;prepareRef.current();}},[preparationAllowed,autoPrepare,restoring,launch,error]);
 const check=()=>void run(async()=>{const id=launch?.id||savedId.current;if(!id)throw new Error('No saved launch attempt was found.');receivedRef.current(await launchpadRequest(`/api/v1/launchpad/launches/${encodeURIComponent(id)}`,LaunchResponse));});
 const renewMintReview=()=>void run(async()=>{
  if(!preparationAllowed||!launch?.execution?.localMintReview||submissionUncertain||canResume||launch.signature)throw new Error('Reconcile this saved attempt before renewing its review.');
  const r=await launchpadRequest(`/api/v1/launchpad/launches/${launch.id}/mint-review/renew`,PrepareLaunchResponse,jsonRequest('POST',{messageSha256:launch.execution.localMintReview.messageSha256}));
  setLocalMintSignature(null);setAcceptedMax(null);remember(r.launch);
 });
 const downloadMintReview=()=>void run(async()=>{
  if(!launch?.execution?.localMintReview)throw new Error('No local mint signing review is available');
  const review=await launchpadRequest(`/api/v1/launchpad/launches/${launch.id}/mint-review`,LocalMintReview);
  const blob=new Blob([JSON.stringify(review,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download=`${launch.id}-public-mint-review.json`;link.click();URL.revokeObjectURL(url);
 });
 const importMintSignature=(file:File)=>void run(async()=>{
  if(!launch?.execution?.localMintReview)throw new Error('No saved local mint attempt');
  if(file.size>10_000)throw new Error('Select only the small public mint-signature artifact, never a keypair file');
  // Reject keypair arrays and unexpected fields locally, before sending anything to the API.
  const artifact=z.object({launchId:z.string(),mint:z.string(),messageSha256:z.string().regex(/^[a-f0-9]{64}$/),transaction:z.string().max(1644)}).strict().parse(JSON.parse(await file.text()));
  const result=await launchpadRequest(`/api/v1/launchpad/launches/${launch.id}/mint-signature`,z.object({transaction:z.string().max(1644),messageSha256:z.string()}),jsonRequest('POST',artifact));
  if(alive.current)setLocalMintSignature({id:launch.id,hash:result.messageSha256,transaction:result.transaction});
 });
 const sign=()=>void run(async()=>{
  if(!executionAllowed)throw new Error('Wallet signing is disabled for this deployment. Existing status checks remain available.');
  if(!launch?.execution||session.identity?.wallet!==launch.launcherWallet)throw new Error('Connect the verified creator wallet first');
  const latest=await launchpadRequest(`/api/v1/launchpad/launches/${launch.id}`,LaunchResponse);receivedRef.current(latest);
  if(latest.launch.status!=='awaiting_signature'||latest.launch.signature||latest.recovery?.canResume||unresolvedSubmission.current)throw new Error('This saved attempt is not ready for a new signature. Check its status before continuing.');
  const execution=latest.launch.execution!;
  const localReview=execution.localMintReview;
  if(localReview&&(!localMintSignature||localMintSignature.id!==launch.id||localMintSignature.hash!==localReview.messageSha256))throw new Error('Complete local mint signing for this exact saved attempt before Phantom approval');
  setSigningStage('Awaiting wallet approval…');
  const signed=await session.signLaunch(decoded(localReview?localMintSignature!.transaction:execution.transaction),execution.network);
  if(!alive.current)return;
  const {VersionedTransaction}=await import('@solana/web3.js');
  const signature=VersionedTransaction.deserialize(signed).signatures[0];
  if(!signature||signature.every(b=>b===0))throw new Error('Wallet did not return a creator signature. Nothing was submitted.');
  walletSignature.current=bs58.encode(signature);
  try{saveSignedLaunch(sessionStorage,launchpadApiOrigin(),{...binding(launch),signature:walletSignature.current,transaction:encoded(signed)});}catch{throw new Error('Browser recovery storage is unavailable. Nothing was submitted. Keep this page open.');}
  setCanResume(true);
  unresolvedSubmission.current=true;setSubmissionUncertain(true);
  try{localStorage.setItem(scope,JSON.stringify({key:requestKey.current,id:launch.id,submissionUncertain:true,walletSignature:walletSignature.current}));}catch{/* Keep the unresolved submission blocked in memory. */}
  setSigningStage('Submitting signed transaction…');
  try{const r=await launchpadRequest(`/api/v1/launchpad/launches/${launch.id}/submit`,LaunchResponse,jsonRequest('POST',{transaction:encoded(signed)}));receivedRef.current(r);}
  catch(e){const reason=e instanceof ApiResponseError?`The API returned HTTP ${e.status}: ${e.message}.`:e instanceof SessionExpired?e.message:'Submission response was interrupted.';throw new Error(`${reason} Check this launch’s status before retrying. Do not create another coin or pay again.`);}
 });
 const resume=()=>void run(async()=>{
  if(!executionAllowed)throw new Error('Submission is disabled for this deployment. Keep checking the existing transaction.');
  if(!launch?.execution)throw new Error('No saved launch to recover');
  const status=await launchpadRequest(`/api/v1/launchpad/launches/${launch.id}`,LaunchResponse);receivedRef.current(status);
  if(['confirmed','failed'].includes(status.launch.status))return;
  let local;try{local=readSignedLaunch(sessionStorage,launchpadApiOrigin(),binding(launch));}catch{/* Use only an already persisted backend payload. */}
  if(!local&&!status.recovery?.canResume)throw new Error('Signed transaction is unavailable. Keep checking the original launch; do not sign again.');
  unresolvedSubmission.current=true;setSubmissionUncertain(true);
  const result=await launchpadRequest(`/api/v1/launchpad/launches/${launch.id}/resume`,LaunchResponse,jsonRequest('POST',local?{transaction:local.transaction}:{}));receivedRef.current(result);
 });
 const dev=launch?.fees.developerBuy??null;
 // Never silently raise what the creator agreed to: a higher (or unseen) maximum must be accepted again.
 const needsAcceptance=devBuyNeedsAcceptance(dev?.maxQuoteCost??null,reviewedMaxDevBuyCost,acceptedMax);
 const total=(extra:string)=>launch?formatSol((BigInt(launch.fees.platformLaunchFeeLamports)+BigInt(launch.fees.estimatedNetworkFeesLamports)+BigInt(launch.fees.estimatedAccountRentLamports)+BigInt(extra)).toString()):'';
 const localReview=launch?.execution?.localMintReview;
 const localMintReady=!localReview||(localMintSignature?.id===launch?.id&&localMintSignature.hash===localReview.messageSha256);
 const confirmed=launch?.status==='confirmed';
 const terminal=!!launch&&['failed','expired'].includes(launch.status);
 const interrupted=submissionUncertain&&!confirmed;
 const pending=!!launch&&['submitted','recovery_needed'].includes(launch.status);
 const safeRetry=executionAllowed&&!localReview&&!submissionUncertain&&terminal;
 const canEdit=onEdit&&!localReview&&!busy&&!submissionUncertain&&launch&&((!launch.signature&&['awaiting_signature','expired'].includes(launch.status))||launch.status==='failed');
 const short=(value:string)=>`${value.slice(0,6)}…${value.slice(-6)}`;
 const copyMint=async()=>{if(!launch)return;try{await navigator.clipboard.writeText(launch.mint);setCopyMessage('Mint copied');}catch{setCopyMessage('Could not copy. Select the full mint in Technical details.');}};
 const token=<div className="launch-review-token">
  {draft.image?<img src={draft.image.gatewayUrl} alt={`${draft.fields.name} logo`}/>:<span className="launch-review-monogram" aria-hidden="true">{draft.fields.symbol.slice(0,2)}</span>}
  <div><h4>{draft.fields.name} <span>{draft.fields.symbol}</span></h4><p className="small muted">{draft.fields.symbol}/{launch?.execution?.quoteAsset??draft.fields.quoteAsset}{launch?.execution?.network&&` · ${launch.execution.network}`}</p></div>
 </div>;
 return <section className={`launch-execution${confirmed?' launch-result-success':''}`} aria-label="Launch execution">
  <p className="launch-stage-label">{confirmed||pending||interrupted||terminal?'3 · Result':'2 · Review'}</p>
  <h3 aria-live="polite">{confirmed?'Coin created successfully':interrupted?'We lost connection while checking your launch':pending?'Launch in progress':terminal?'This launch attempt did not complete':'Review before wallet approval'}</h3>
  {!launch?<>{(busy||restoring)&&<p role="status">Preparing your launch transaction…</p>}{preparationAllowed&&!busy&&!restoring&&!error&&<button className="secondary wide" onClick={prepare}>Prepare transaction</button>}</>:<>
   {token}
   {!executionAllowed&&!confirmed&&<p className="small muted">{preparationAllowed?'Review preparation only. Wallet approval remains locked.':'Status checks only. Wallet approval is unavailable in this environment.'}</p>}
   {confirmed?<>
    <p className="small">Your coin is now live and visible in Explore.</p>
    <dl className="launch-summary"><div><dt>Mint</dt><dd><code className="ui-select-text">{short(launch.mint)}</code></dd></div>
     {launch.devBuyResult&&<div><dt>Developer Buy received</dt><dd>{formatTokens(launch.devBuyResult.tokenAmount)} {launch.draft.symbol} <span className="muted">({Number(launch.devBuyResult.allocationBps)/100}%)</span></dd></div>}
     <div><dt>Transaction</dt><dd>{launch.execution&&launch.execution.network!=='localnet'?<a href={`https://explorer.solana.com/tx/${launch.signature}${launch.execution.network==='devnet'?'?cluster=devnet':''}`} target="_blank" rel="noreferrer">Confirmed transaction ↗</a>:<span>Confirmed</span>}</dd></div>
    </dl>
    <div className="launch-review-actions"><a className="primary launch-action-link" href={routeUrl('explore',launch.mint)}>View in Explore</a><button className="secondary" onClick={()=>void copyMint()}>Copy mint</button>{executionAllowed&&onNewCoin&&<button className="text-button" onClick={onNewCoin}>Create another coin</button>}</div>
    {copyMessage&&<p className="small" role="status">{copyMessage}</p>}
   </>:pending||interrupted||terminal?<>
    <p role="status">{interrupted?'Your wallet approval may still have succeeded. Check the launch status before trying again.':pending?'We’re checking your transaction and confirming the result on-chain.':'No completed launch was verified for this attempt. You can prepare a new attempt once its status is resolved.'}</p>
    {launch.status==='recovery_needed'&&<p className="small muted">Your transaction needs an additional verification check. Keep this attempt; do not launch or pay again.</p>}
    {terminal&&!submissionUncertain&&<p className="small muted">{localReview?'Check this attempt before renewing its expired signing review. The mint and previous review stay saved.':'A new attempt is available. Any network fees from an earlier failed transaction may still apply.'}</p>}
    {localReview&&launch.status==='expired'&&!submissionUncertain&&!canResume&&!launch.signature&&preparationAllowed&&<button className="secondary" disabled={busy} onClick={renewMintReview}>Refresh signing review</button>}
    <div className="launch-review-actions"><button className={safeRetry?'secondary':'primary'} disabled={busy} onClick={check}>Check launch status</button>
     {safeRetry&&<button className="primary" disabled={busy} onClick={()=>{requestKey.current='';savedId.current='';setLaunch(null);automatic.current=false;try{localStorage.removeItem(scope);}catch{/* Local hint only. */}}}>Prepare new attempt</button>}
     {canEdit&&<button className="text-button" onClick={onEdit}>Back to edit</button>}
    </div>
   </>:<>
    {draft.fields.description&&<p className="launch-review-description">{draft.fields.description}</p>}
    <div className="launch-review-heading"><h4>Launch summary</h4><span className="launch-network-label">{launch.execution?.network}</span></div>
    <dl className="launch-summary"><div><dt>Platform charge</dt><dd>0.05 SOL</dd></div><div><dt>Estimated network fee</dt><dd>{Number(launch.fees.estimatedNetworkFeesLamports)/1e9} SOL</dd></div><div><dt>Estimated account rent</dt><dd>{Number(launch.fees.estimatedAccountRentLamports)/1e9} SOL</dd></div>
     {dev&&<div><dt>Developer Buy <span className="muted">({percentFromBps(dev.bps)}%)</span></dt><dd>{formatSol(dev.estimatedQuoteCost)}<small>{formatTokens(dev.tokenAmount)} {launch.draft.symbol}</small></dd></div>}
     <div className="launch-summary-total"><dt>Total estimated SOL</dt><dd>{total(dev?.estimatedQuoteCost??'0')} SOL{dev&&<small>At most {total(dev.maxQuoteCost)} SOL</small>}</dd></div>
    </dl>
    <p className="launch-fee-sharing">Creator fees: 60% Agent Rewards / 40% Platform / 0% Launcher</p>
    <p className="small muted">{launch.execution?.network==='devnet'?'Devnet test SOL only. ':''}A failed transaction may still incur network fees.</p>
    {launch.status==='awaiting_signature'&&needsAcceptance&&<div className="launch-quote-change" role="alert"><p className="small">{reviewedMaxDevBuyCost===null?'Review the Developer Buy amounts before approving.':`The Developer Buy maximum changed from ${formatSol(reviewedMaxDevBuyCost)} to ${formatSol(dev!.maxQuoteCost)}.`}</p><button className="secondary" onClick={()=>setAcceptedMax(dev!.maxQuoteCost)}>Accept these amounts</button></div>}
    {localReview&&launch.status==='awaiting_signature'&&!submissionUncertain&&<details className="launch-technical"><summary>Prepared mint signing</summary>
     <p className="small">This reserved mint is signed locally first. Download the public review and use the approved local signing tool. Import only its public signature file. Never select or upload your mint keypair. Renewed reviews require fresh approval of the new hash and the preceding hash shown in the download.</p>
     <button className="secondary" disabled={busy} onClick={downloadMintReview}>Download public review</button>
     <label>Public mint-signature file<input type="file" accept="application/json,.json" disabled={busy||!executionAllowed} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)importMintSignature(file);}}/></label>
     {localMintReady&&<p className="small" role="status">Mint signature verified. Phantom approval is still required.</p>}
    </details>}
    {executionAllowed&&launch.status==='awaiting_signature'&&!submissionUncertain&&<button className="primary wide" disabled={busy||needsAcceptance||!localMintReady} onClick={sign}>{busy?signingStage||'Preparing…':'Approve in wallet'}</button>}
    {signingStage&&<p className="small" role="status">{signingStage}</p>}
    {canEdit&&<button className="text-button" onClick={onEdit}>Back to edit</button>}
   </>}
   <details className="launch-technical"><summary>Technical details</summary>
    <dl className="launch-summary"><div><dt>Launch protocol</dt><dd><a href="https://pump.fun" target="_blank" rel="noopener noreferrer">Pump.fun · external protocol ↗</a></dd></div><div><dt>Attempt status</dt><dd>{launch.status.replaceAll('_',' ')}</dd></div><div><dt>Network</dt><dd>{launch.execution?.network}</dd></div><div><dt>Mint</dt><dd><code className="ui-select-text">{launch.mint}</code></dd></div><div><dt>Creator wallet</dt><dd><code className="ui-select-text">{launch.launcherWallet}</code></dd></div><div><dt>Platform treasury</dt><dd><code className="ui-select-text">{launch.fees.platformTreasury}</code></dd></div>
     <div><dt>Platform charge</dt><dd>0.05 SOL</dd></div><div><dt>Estimated network fee</dt><dd>{Number(launch.fees.estimatedNetworkFeesLamports)/1e9} SOL</dd></div><div><dt>Estimated account rent</dt><dd>{Number(launch.fees.estimatedAccountRentLamports)/1e9} SOL</dd></div><div><dt>Total estimated SOL</dt><dd>{total(dev?.estimatedQuoteCost??'0')} SOL{dev&&<small>At most {total(dev.maxQuoteCost)} SOL</small>}</dd></div>
     {dev&&<div><dt>Developer Buy allocation</dt><dd>{formatTokens(dev.tokenAmount)} {launch.draft.symbol} ({percentFromBps(dev.bps)}%)</dd></div>}
     {launch.signature&&<div><dt>Transaction signature</dt><dd><code className="ui-select-text">{launch.signature}</code></dd></div>}
     {dev&&<><div><dt>Developer Buy maximum</dt><dd>{formatSol(dev.maxQuoteCost)}</dd></div><div><dt>Includes protocol fees</dt><dd>{formatSol(dev.pumpFees)}</dd></div><div><dt>Price impact</dt><dd>{(dev.priceImpactBps/100).toFixed(2)}%</dd></div></>}
     {launch.devBuyResult&&<div><dt>Verified Developer Buy cost</dt><dd>{formatSol(launch.devBuyResult.quoteSpent)}</dd></div>}
     <div><dt>Description</dt><dd className="ui-select-text">{draft.fields.description||'Not provided'}</dd></div><div><dt>Image IPFS URI</dt><dd><code className="ui-select-text">{draft.image?.ipfsUri??'Not uploaded'}</code></dd></div><div><dt>Metadata IPFS URI</dt><dd><code className="ui-select-text">{draft.metadata?.ipfsUri??'Not prepared'}</code></dd></div>
    </dl>
    {launch.errors.map((issue,i)=><p className="small ui-select-text" key={i}>{issue.message}</p>)}
    {error&&<p className="small ui-select-text">{error}</p>}
    {!pending&&!interrupted&&!terminal&&!confirmed&&<button className="secondary" disabled={busy} onClick={check}>Check launch status</button>}
    {confirmed&&<button className="secondary" disabled={busy} onClick={check}>Check launch status</button>}
    {executionAllowed&&canResume&&!['confirmed','failed','expired'].includes(launch.status)&&<button className="secondary" disabled={busy} onClick={resume}>Resume same transaction</button>}
   </details>
  </>}
  {error&&!interrupted&&!pending&&<div className="launch-inline-error" role="alert"><p>{interrupted?'Check your launch status before trying again.':launch?(/reject|cancel|declin/i.test(error)?'Wallet approval was cancelled. Your saved attempt is preserved.':'We couldn’t complete this step. Your saved attempt is preserved.'):'We couldn’t prepare your launch. Please try again.'}</p>{!launch&&<details><summary>Technical details</summary><p className="small ui-select-text">{error}</p></details>}{!interrupted&&<button className="secondary" disabled={busy} onClick={launch||savedId.current?check:prepare}>{launch||savedId.current?'Retry status check':'Retry preparation'}</button>}</div>}
 </section>;
}
