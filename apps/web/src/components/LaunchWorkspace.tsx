import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { DESCRIPTION_MAX, DraftReview, LaunchpadCapabilities, PUMP_NAME_MAX, PUMP_SYMBOL_MAX, SavedLaunchDraft, launchpadPaths, tokenFieldIssues, utf8Length, type DraftFields as Fields, type SavedLaunchDraft as Draft, type TokenFieldIssue } from '../api/shared';
import { useDevBuyQuote } from '../api/devBuy';
import { LaunchDevBuy, type DevBuyAvailability } from './LaunchDevBuy';
import { jsonRequest, launchpadApiOrigin, launchpadRequest, useWalletSession } from '../api/walletSession';
import { useDraftField } from '../navigation/drafts';
import { prepareLaunchDraft, type PreparationStage } from '../api/prepareLaunchDraft';
import { LaunchExecution } from './LaunchExecution';
import { LaunchTokenPreview } from './LaunchTokenPreview';
import { LaunchLogoUpload } from './LaunchLogoUpload';
import { LaunchQuotePicker } from './LaunchQuotePicker';
import { PageHeading } from './Pages';
const empty: Fields = {name:'',symbol:'',description:'',quoteAsset:'SOL',website:null,twitter:null,telegram:null,devBuyBps:0};
/** Name/symbol input with a live UTF-8 byte counter (the protocol's unit) and inline errors; never truncates. */
function TokenTextField({id,label,value,max,placeholder,issues,onChange}:{id:'name'|'symbol';label:string;value:string;max:number;placeholder:string;issues:TokenFieldIssue[];onChange:(value:string)=>void}){
 const used=utf8Length(value),multibyte=used!==value.length;
 // The label is the field's name only; limits, the live counter and errors are linked descriptions.
 return <div className="launch-field">
  <label htmlFor={`launch-${id}`}>{label}</label>
  <input id={`launch-${id}`} value={value} placeholder={placeholder} aria-invalid={issues.length>0} aria-describedby={`${id}-meta${issues.length?` ${id}-error`:''}`} autoComplete="off" spellCheck={false} onChange={e=>onChange(e.target.value)}/>
  <p className="launch-field-meta" id={`${id}-meta`}><span>{multibyte?`Maximum ${max} bytes. Accented letters and emoji use more than one.`:`Maximum ${max} UTF-8 bytes.`}</span><span data-over={used>max}>{used}/{max}</span></p>
  {issues.length>0&&<p className="launch-field-error" id={`${id}-error`} role="alert">{issues[0]!.message}</p>}
 </div>;
}
const newScope = () => `launchpad:workspace:${crypto.randomUUID()}`;
function friendlyError(error: unknown) {
 if (error instanceof DOMException && error.name === 'AbortError') return 'Preparation cancelled. Your saved details are safe.';
 const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
 return /Pinata|IPFS|metadata/i.test(message) ? 'Your token assets could not be prepared. Please try again later.' : message;
}
export function LaunchWorkspace() {
 const session = useWalletSession(), owner = session.identity?.wallet ?? '';
 const [draft,setDraft] = useState<Draft|null>(null), [items,setItems] = useState<Draft[]>([]);
 const [fields,setFields] = useState<Fields>(empty), [busy,setBusy] = useState(false), [error,setError] = useState(''), [message,setMessage] = useState('');
 const [review,setReview] = useState<z.infer<typeof DraftReview>|null>(null), [uploads,setUploads] = useState<boolean|null>(null);
 const [maxBytes,setMaxBytes] = useState(5_000_000), [memoryStorage,setMemoryStorage] = useState(false), [logoScope,setLogoScope] = useState(newScope);
 const [localFile,setLocalFile]=useState<File|null>(null),[launchEnabled,setLaunchEnabled]=useState(false),[executionBusy,setExecutionBusy]=useState(false),[executionLocked,setExecutionLocked]=useState(false),[logoValidating,setLogoValidating]=useState(false),[created,setCreated]=useState(false),[usdcEnabled,setUsdcEnabled]=useState(false),[devBuyAvailability,setDevBuyAvailability]=useState<DevBuyAvailability|null>(null),[attempted,setAttempted]=useState(false);
 const [devBuyValid,setDevBuyValid]=useState(true),[reviewedDevBuyMax,setReviewedDevBuyMax]=useState<string|null>(null);
 const flowActive=review?.launchEnabled===true;
 const [phase,setPhase] = useState<PreparationStage|null>(null), [progress,setProgress] = useState<number|null>(null), [removed,setRemoved] = useState(false);
 const [legacyName] = useDraftField('launchpad:name',''), [legacySymbol] = useDraftField('launchpad:symbol',''), [legacyDescription] = useDraftField('launchpad:description','');
 const current = useRef(draft), form = useRef(fields), activeOwner = useRef(owner), previousOwner = useRef(owner);
 current.current = draft; form.current = fields; activeOwner.current = owner;
 const generation = useRef(0), running = useRef(false), controller = useRef<AbortController|null>(null);
 const selected = useRef<{file: File; key: string}|null>(null), keys = useRef(new Map<string,string>());
 const base = launchpadPaths.drafts;
 const devBuyQuoteEnabled=devBuyAvailability?.status==='available'&&fields.quoteAsset==='SOL';
 const devQuote=useDevBuyQuote(fields.devBuyBps,devBuyQuoteEnabled&&devBuyValid);
 // Launch-readiness issues, computed with the same shared rules the server enforces. "Required" waits for an attempt.
 const issues=tokenFieldIssues(fields,true).filter(i=>attempted||i.code!=='required');
 const devBuyBlocked=fields.devBuyBps>0&&!devBuyQuoteEnabled;
 const fieldIssues=(field:TokenFieldIssue['field'])=>issues.filter(i=>i.field===field);
 const keyFor = (scope:string) => {let key=keys.current.get(scope);if(!key){key=crypto.randomUUID();keys.current.set(scope,key);}return key;};
 const accept = (value:Draft) => {current.current=value;setDraft(value);setFields(value.fields);setItems(list=>[value,...list.filter(x=>x.id!==value.id)]);setReview(null);};
 const reset = () => {setAttempted(false);setCreated(false);keys.current.clear();selected.current=null;setLocalFile(null);current.current=null;setDraft(null);setFields(empty);setReview(null);setRemoved(false);setLogoScope(newScope());setError('');setMessage('');};
 useEffect(() => {
  const version=++generation.current;
  if(previousOwner.current && previousOwner.current!==owner){selected.current=null;setLocalFile(null);setFields(empty);setRemoved(false);setLogoScope(newScope());}
  previousOwner.current=owner;keys.current.clear();current.current=null;setDraft(null);setItems([]);setReview(null);setError('');setMessage('');setUploads(null);setLaunchEnabled(false);setUsdcEnabled(false);setDevBuyAvailability(null);setCreated(false);setExecutionBusy(false);setExecutionLocked(false);setMemoryStorage(false);
  void launchpadRequest(launchpadPaths.capabilities,LaunchpadCapabilities).then(c=>{if(version===generation.current){setUploads(c.uploads);setLaunchEnabled(c.launchEnabled);setUsdcEnabled(c.quotes.USDC==='draft');setDevBuyAvailability(c.devBuy?{status:c.devBuy.status,reason:c.devBuy.reason}:null);setMaxBytes(c.maxBytes);setMemoryStorage(c.storage==='memory');}}).catch(()=>{if(version===generation.current)setUploads(false);});
  if(owner)void launchpadRequest(base,z.object({items:z.array(SavedLaunchDraft)})).then(result=>{if(version===generation.current)setItems(result.items);}).catch(e=>{if(version===generation.current)setError(friendlyError(e));});
  return()=>{controller.current?.abort();};
 },[owner,base]);
 const run = async(work:(signal:AbortSignal,check:()=>void)=>Promise<void>) => {
  if(running.current)return;
  const version=generation.current, expectedOwner=owner, abort=new AbortController();controller.current=abort;
  const check=()=>{abort.signal.throwIfAborted();if(version!==generation.current||activeOwner.current!==expectedOwner)throw new DOMException('Wallet changed','AbortError');};
  running.current=true;setBusy(true);setError('');setMessage('');
  try{await work(abort.signal,check);}catch(e){if(version===generation.current)setError(friendlyError(e));}
  finally{running.current=false;if(version===generation.current){setPhase(null);setProgress(null);}setBusy(false);}
 };
 const save = async(values:Fields,previous:Draft|null,signal:AbortSignal) => {
  if(previous && JSON.stringify(values)===JSON.stringify(previous.fields))return previous;
  const options=previous ? jsonRequest('PATCH',{version:previous.version,fields:values}) : jsonRequest('POST',values,keyFor(`create:${owner}:${JSON.stringify(values)}`));
  try{return await launchpadRequest(previous?`${base}/${previous.id}`:base,SavedLaunchDraft,{...options,signal});}
  catch(error){
   // A PATCH may have succeeded before its response was interrupted. Only accept
   // a recovered version if it belongs to this wallet and matches every field.
   if(previous&&!signal.aborted){try{const latest=await launchpadRequest(`${base}/${previous.id}`,SavedLaunchDraft,{signal});if(latest.wallet===owner&&latest.version>=previous.version&&JSON.stringify(latest.fields)===JSON.stringify(values))return latest;}catch{/* Preserve the original failure. */}}
   throw error;
  }
 };
 const upload = (d:Draft,file:File,signal:AbortSignal) => new Promise<Draft>((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open('POST',`${launchpadApiOrigin()}${base}/${d.id}/logo?version=${d.version}`);xhr.withCredentials=true;xhr.timeout=60000;
  xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.setRequestHeader('Idempotency-Key',keyFor(`image:${owner}:${d.id}:${d.version}:${selected.current?.key}`));
  xhr.upload.onprogress=e=>{if(e.lengthComputable)setProgress(Math.min(95,e.loaded/e.total*95));};
  const abort=()=>xhr.abort(),done=()=>signal.removeEventListener('abort',abort);signal.addEventListener('abort',abort,{once:true});
  xhr.onload=()=>{done();try{if(xhr.status===401)window.dispatchEvent(new Event('aeco:session-expired'));const body=JSON.parse(xhr.responseText);if(xhr.status<200||xhr.status>=300)throw new Error(body.error?.message??'Logo upload failed. Please try again.');resolve(SavedLaunchDraft.parse(body));}catch(e){reject(e);}};
  xhr.onerror=()=>{done();reject(new Error('Logo upload interrupted. Please try again.'));};xhr.ontimeout=()=>{done();reject(new Error('Logo upload timed out. Please try again.'));};xhr.onabort=()=>{done();reject(new DOMException('Cancelled','AbortError'));};
  if(signal.aborted){done();reject(new DOMException('Cancelled','AbortError'));return;}xhr.send(file);
 });
 const prepare = () => {
  if(!owner){session.open();return;}
  setAttempted(true);
  // Nothing is saved or uploaded while any detail is invalid.
  if(tokenFieldIssues(form.current,true).length||devBuyBlocked||!devBuyValid){setError('Fix the highlighted details before creating your coin.');return;}
  setReviewedDevBuyMax(!devQuote.loading&&devQuote.quote?.status==='available'&&devQuote.quote.bps===form.current.devBuyBps?devQuote.quote.maxQuoteCost:null);
  void run(async(signal,check)=>{
   if(uploads===null)throw new Error('Token preparation is still loading. Please try again in a moment.');
   if(!launchEnabled)throw new Error('Coin creation is unavailable in this demo. You can preview your coin and save a draft.');
   const result=await prepareLaunchDraft({fields:{...form.current},draft:current.current,file:selected.current?.file??null,removeImage:removed,uploads,devBuyAvailable:devBuyQuoteEnabled}, {
    check,stage:value=>{setPhase(value);setProgress(null);},save:(values,previous)=>save(values,previous,signal),
    removeImage:d=>launchpadRequest(`${base}/${d.id}/logo`,SavedLaunchDraft,{...jsonRequest('DELETE',{version:d.version}),signal}),
    upload:(d,file)=>upload(d,file,signal),
    metadata:d=>launchpadRequest(`${base}/${d.id}/metadata`,SavedLaunchDraft,{...jsonRequest('POST',{version:d.version},keyFor(`metadata:${owner}:${d.id}:${d.version}`)),signal}),
    review:d=>launchpadRequest(`${base}/${d.id}/review`,DraftReview,{signal}),
    accept:d=>{accept(d);setRemoved(false);},uploaded:()=>{selected.current=null;setLocalFile(null);setLogoScope(newScope());setProgress(null);},
   });
   check();setReview(result.review);setMessage(result.notice);
  });
 };
 const edit = (key:keyof Fields,value:string|number) => {setFields(f=>({...f,[key]:typeof value==='number'?value:value||(['website','twitter','telegram'].includes(key)?null:'')}));setReview(null);setError('');setMessage('');};
 const load = (id:string) => void run(async(signal,check)=>{const d=await launchpadRequest(`${base}/${id}`,SavedLaunchDraft,{signal});check();if(d.wallet!==owner)throw new Error('This draft belongs to another wallet.');selected.current=null;setLocalFile(null);setCreated(false);keys.current.clear();setRemoved(false);setLogoScope(newScope());accept(d);setMessage('Draft loaded.');});
 return <>
  <PageHeading eyebrow="BUILD A PRESENCE" title="Give your community a home." description="Preview your coin as you build it. Create Coin prepares everything, then you review the fees and approve in your wallet."/>
  <div className="two-column launch-workspace"><section className="surface">
   <h2>Token details</h2>
   {!owner&&<p className="small muted">Explore the form first. Connect your wallet when you’re ready to continue.</p>}
   <form noValidate={!owner} onSubmit={e=>{e.preventDefault();prepare();}} aria-busy={busy}>
    <fieldset disabled={busy||executionBusy||flowActive}>
     <TokenTextField id="name" label="Token name" value={fields.name} max={PUMP_NAME_MAX} placeholder="Your token name" issues={fieldIssues('name')} onChange={v=>edit('name',v)}/>
     <TokenTextField id="symbol" label="Symbol" value={fields.symbol} max={PUMP_SYMBOL_MAX} placeholder="e.g. MOSS" issues={fieldIssues('symbol')} onChange={v=>edit('symbol',v)}/>
     <div className="launch-field"><label htmlFor="launch-description">Description</label><textarea id="launch-description" rows={4} value={fields.description} placeholder="What are you building?" aria-invalid={fieldIssues('description').length>0} aria-describedby="description-meta" onChange={e=>edit('description',e.target.value)}/>
      <p className="launch-field-meta" id="description-meta"><span>Optional · maximum {DESCRIPTION_MAX} characters.</span><span data-over={fields.description.length>DESCRIPTION_MAX}>{fields.description.length}/{DESCRIPTION_MAX}</span></p>
      {fieldIssues('description').length>0&&<p className="launch-field-error" role="alert">{fieldIssues('description')[0]!.message}</p>}</div>
     <details><summary>Project links (optional)</summary>{(['website','twitter','telegram']as const).map(key=><label key={key}>{key==='twitter'?'X profile':key}<input type="url" value={fields[key]??''} placeholder="https://…" onChange={e=>edit(key,e.target.value)}/></label>)}</details>
     <LaunchQuotePicker value={fields.quoteAsset} symbol={fields.symbol} usdcEnabled={usdcEnabled} onChange={quote=>{if(quote==='SOL'||quote==='USDC')edit('quoteAsset',quote);}}/>
     <LaunchDevBuy onValidityChange={setDevBuyValid} bps={fields.devBuyBps} onChange={bps=>edit('devBuyBps',bps)} availability={devBuyAvailability} quoteAsset={fields.quoteAsset} symbol={fields.symbol} quote={devQuote.quote} loading={devQuote.loading} error={devQuote.error}/>
     <LaunchLogoUpload key={logoScope} selectionOnly disabled={busy||executionBusy||flowActive} onValidationChange={setLogoValidating} automaticMetadata={false} name={fields.name} symbol={fields.symbol} description={fields.description} quoteAsset={fields.quoteAsset}
      imageUrl={removed?'':draft?.image?.ipfsUri??''} trustedImage={removed?null:draft?.image??null} scope={logoScope} maxBytes={maxBytes}
      onFileChange={file=>{setLocalFile(file);selected.current=file?{file,key:crypto.randomUUID()}:null;setReview(null);setError('');setMessage('');}}
      onImage={()=>{setRemoved(true);setReview(null);}}/>
     <button className="primary wide" type="submit" disabled={!!owner&&(uploads===null||!launchEnabled||executionBusy||flowActive||logoValidating||!devBuyValid)}>{!owner?'Connect wallet':uploads===null?'Loading token preparation…':created?'Coin created':phase??(busy?'Preparing…':logoValidating?'Checking logo…':executionBusy?'Preparing transaction…':flowActive?'Continue below':'Create Coin')}</button>
    </fieldset>
   </form>
   {owner&&uploads!==null&&!launchEnabled&&<p className="small muted" role="note">Coin creation is unavailable in this demo. Your preview and saved drafts remain available; no images are uploaded.</p>}
   <ol className="launch-creation-steps" aria-label="Coin creation steps"><li>Prepare logo and token details</li><li>Review fees and approve in your wallet</li><li>Confirm creation and view in Explore</li></ol>
   {progress!==null&&<progress max={100} value={progress} aria-label="Logo upload progress"/>}
   {busy&&<><p className="small" role="status">{phase??'Preparing…'}</p><button className="text-button" onClick={()=>controller.current?.abort()}>Cancel preparation</button></>}
   {(error||session.error)&&<p role="alert">{error||session.error}</p>}{message&&<p role="status">{message}</p>}
   {review&&<section className="launch-review" aria-label="Token review"><h3>Review your token</h3>
    {review.draft.image&&<img src={review.draft.image.gatewayUrl} alt="Token logo"/>}
    <h4>{review.draft.fields.name} ({review.draft.fields.symbol})</h4><p>{review.draft.fields.description}</p>
    <dl className="fee-list"><div><dt>Trading pair</dt><dd>{review.draft.fields.symbol}/{review.draft.fields.quoteAsset}</dd></div><div><dt>Developer Buy</dt><dd>{review.draft.fields.devBuyBps?`${review.draft.fields.devBuyBps/100}% of supply`:'Off'}</dd></div><div><dt>Creator wallet</dt><dd><code className="ui-select-text">{review.draft.wallet}</code></dd></div><div><dt>{review.launchEnabled?"Platform launch charge":"Planned launch charge"}</dt><dd>{review.launchChargeSol} SOL{!review.launchEnabled&&" · not charged"}</dd></div></dl>
    <details><summary>Verified token assets</summary><dl className="fee-list">
     <div><dt>Image IPFS URI</dt><dd><code className="ui-select-text">{review.draft.image?.ipfsUri??'Not uploaded'}</code></dd></div>
     <div><dt>Metadata IPFS URI</dt><dd><code className="ui-select-text">{review.draft.metadata?.ipfsUri??'Not prepared'}</code></dd></div>
     <div><dt>Preparation checks</dt><dd>{review.readyForNextMilestone&&review.issues.length===0?'Backend checks passed':'Preparation incomplete'}</dd></div>
    </dl></details>
    <p>{review.launchEnabled?"Token details and logo are prepared. Launch status is shown below.":"Your token details and logo are ready. No token has been launched."}</p><>{review.launchEnabled&&review.readyForNextMilestone?<LaunchExecution key={`${review.draft.id}:${review.draft.version}`} draft={review.draft} reviewedMaxDevBuyCost={reviewedDevBuyMax} autoPrepare onConfirmed={setCreated} onNewCoin={reset} onBusyChange={setExecutionBusy} onLockChange={setExecutionLocked} onEdit={()=>{setReview(null);setError('');setMessage('Update your details, then choose Create Coin.');}}/>:<button className="secondary wide" disabled>Token launch unavailable</button>}</>
   </section>}
   <details className="launch-advanced"><summary>Manage drafts &amp; technical details</summary>
    {owner&&<p className="small ui-select-text">Verified creator: {owner}</p>}
    {memoryStorage&&<p className="small" role="note">Demo drafts are saved for this session, but may be lost when the demo server restarts.</p>}
    <div className="launch-draft-toolbar"><select aria-label="Saved launch drafts" disabled={busy||executionBusy||executionLocked||!owner} value={draft?.id??''} onChange={e=>{if(e.target.value)load(e.target.value);}}><option value="">Choose a saved draft</option>{items.map(d=><option key={d.id} value={d.id}>{d.fields.name||'Untitled draft'}</option>)}</select><button className="secondary" disabled={busy||executionBusy||executionLocked} onClick={reset}>New draft</button></div>
    <div className="launch-draft-toolbar"><button className="secondary" disabled={busy||executionBusy||executionLocked||!owner||!devBuyValid} onClick={()=>void run(async(signal,check)=>{const d=await save({...form.current},current.current,signal);check();accept(d);setMessage('Draft saved.');})}>Save draft</button>
     {draft&&<button className="text-button" disabled={busy||executionBusy||executionLocked} onClick={()=>load(draft.id)}>Reload draft</button>}
     <button className="text-button" disabled={busy||executionBusy||executionLocked||!draft} onClick={()=>void run(async(signal,check)=>{if(!window.confirm('Delete this draft? Uploaded images may remain public.'))return;const d=current.current!;await launchpadRequest(`${base}/${d.id}`,z.object({ok:z.literal(true)}),{...jsonRequest('DELETE',{version:d.version}),signal});check();setItems(list=>list.filter(x=>x.id!==d.id));reset();setMessage('Draft deleted.');})}>Delete draft</button>
    </div>
    {(legacyName||legacySymbol||legacyDescription)&&<button className="text-button" disabled={busy||executionBusy||executionLocked} onClick={()=>{reset();setFields({...empty,name:legacyName,symbol:legacySymbol,description:legacyDescription});}}>Import previous text draft</button>}
    {draft?.image&&<p className="small">Image reference: <code className="ui-select-text">{draft.image.ipfsUri}</code></p>}
    {draft?.metadata&&<p className="small">Metadata reference: <code className="ui-select-text">{draft.metadata.ipfsUri}</code></p>}
    {owner&&<button className="text-button" disabled={busy} onClick={()=>void session.logout()}>Sign out</button>}
   </details>
  </section><aside><LaunchTokenPreview fields={fields} file={localFile} imageUrl={removed?'':draft?.image?.gatewayUrl??''} devBuyQuote={devQuote.quote}/><section className="surface"><h2>A clear fee structure</h2><p>The planned one-time launch charge is 0.05 SOL, allocated entirely to Platform Treasury.</p><div className="split-bar"><span>60% agent rewards</span><span>40% platform</span></div><p className="small muted">Eligible verified human-launch creator fees follow this allocation. Preparing your token does not charge a fee.</p><p className="small">Images are uploaded only after Create Coin. Once uploaded, they may remain public even if you cancel wallet approval.</p></section></aside></div>
 </>;
}
