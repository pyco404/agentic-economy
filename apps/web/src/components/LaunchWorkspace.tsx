import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { DESCRIPTION_MAX, DraftReview, LaunchpadCapabilities, PUMP_NAME_MAX, PUMP_SYMBOL_MAX, SavedLaunchDraft, launchpadPaths, tokenFieldIssues, utf8Length, type DraftFields as Fields, type SavedLaunchDraft as Draft, type TokenFieldIssue } from '../api/shared';
import { useDevBuyQuote } from '../api/devBuy';
import { LaunchDevBuy, type DevBuyAvailability } from './LaunchDevBuy';
import { jsonRequest, launchpadApiOrigin, launchpadRequest, useWalletSession } from '../api/walletSession';
import { DraftWriter, draftFingerprint, hasDraftContent } from '../api/draftWriter';
import { NewLaunchDraftFields as DraftFieldsSchema } from '../api/shared';
import { MyDrafts } from './MyDrafts';
import { prepareLaunchDraft, type PreparationStage } from '../api/prepareLaunchDraft';
import { LaunchExecution } from './LaunchExecution';
import { LaunchTokenPreview } from './LaunchTokenPreview';
import { LaunchLogoUpload } from './LaunchLogoUpload';
import { LaunchQuotePicker } from './LaunchQuotePicker';
import { LaunchProjectLinks } from './LaunchProjectLinks';
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
 const [localFile,setLocalFile]=useState<File|null>(null),[preparationEnabled,setPreparationEnabled]=useState(false),[executionBusy,setExecutionBusy]=useState(false),[executionLocked,setExecutionLocked]=useState(false),[logoValidating,setLogoValidating]=useState(false),[created,setCreated]=useState(false),[devBuyAvailability,setDevBuyAvailability]=useState<DevBuyAvailability|null>(null),[attempted,setAttempted]=useState(false);
 const [devBuyValid,setDevBuyValid]=useState(true),[reviewedDevBuyMax,setReviewedDevBuyMax]=useState<string|null>(null);
 const [recoveryOnly,setRecoveryOnly]=useState(false);
 const flowActive=!!review&&(review.launchEnabled||review.preparationEnabled||recoveryOnly);
 const [phase,setPhase] = useState<PreparationStage|null>(null), [progress,setProgress] = useState<number|null>(null), [removed,setRemoved] = useState(false);
 const [draftsOpen,setDraftsOpen]=useState(false),[restoring,setRestoring]=useState(false),[saveState,setSaveState]=useState<{phase:'idle'|'saving'|'saved'|'error';fingerprint:string;error?:string}>({phase:'idle',fingerprint:''}),[retrySave,setRetrySave]=useState(0),[imageReselect,setImageReselect]=useState(false);
 const writer=useRef<DraftWriter|null>(null),editorEpoch=useRef(0);
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
 const activeKey=(wallet:string)=>`aeco:launchpad:active:${launchpadApiOrigin()}:${wallet}`;
 const imageKey=(id:string)=>`aeco:launchpad:local-image:${launchpadApiOrigin()}:${owner}:${id}`;
 const localGet=(key:string)=>{try{return localStorage.getItem(key);}catch{return null;}};
 const localSet=(key:string,value:string|null)=>{try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch{/* Backend data remains authoritative. */}};
 const remember=(value:Draft)=>{current.current=value;setDraft(value);setItems(list=>[value,...list.filter(x=>x.id!==value.id)]);localSet(activeKey(owner),value.id);if(selected.current)localSet(imageKey(value.id),'local');};
 const beginEditor=(initial:Draft|null)=>{
  writer.current?.dispose();const epoch=++editorEpoch.current,expectedOwner=owner;
  writer.current=owner?new DraftWriter(owner,initial,{
   create:(values,key,signal)=>launchpadRequest(base,SavedLaunchDraft,{...jsonRequest('POST',values,key),signal}),
   patch:(previous,values,signal)=>launchpadRequest(`${base}/${previous.id}`,SavedLaunchDraft,{...jsonRequest('PATCH',{version:previous.version,fields:values}),signal}),
   get:(id,signal)=>launchpadRequest(`${base}/${id}`,SavedLaunchDraft,{signal}),
  },value=>{if(editorEpoch.current===epoch&&activeOwner.current===expectedOwner)remember(value);}):null;
  setSaveState({phase:initial?'saved':'idle',fingerprint:initial?draftFingerprint(initial.fields):''});
 };
 const accept=(value:Draft)=>{remember(value);setFields(value.fields);setReview(null);};
 const restoreAttempt=async(d:Draft,check:()=>void)=>{
  if(!d.image||!d.metadata)return;
  const hint=localGet(`aeco:launch:${owner}:${d.id}:${d.version}`);if(!hint)return;
  let hasSavedAttempt=false;
  try{const saved=JSON.parse(hint) as {key?:string;id?:string};if(!saved?.key&&!saved?.id)return;hasSavedAttempt=!!saved.id;}catch{return;}
  const r=await launchpadRequest(`${base}/${d.id}/review`,DraftReview);check();
  if(r.draft.wallet!==owner||r.draft.id!==d.id||r.draft.version!==d.version)throw Error('Saved launch details changed. Resume the correct draft.');
  if(hasSavedAttempt||(r.launchEnabled||r.preparationEnabled)&&r.readyForNextMilestone){setRecoveryOnly(!r.launchEnabled||!r.readyForNextMilestone);setExecutionBusy(true);setReview(r);}
 };

 const reset=()=>{setRecoveryOnly(false);beginEditor(null);localSet(activeKey(owner),'new');setAttempted(false);setCreated(false);keys.current.clear();selected.current=null;setLocalFile(null);current.current=null;setDraft(null);setFields(empty);setReview(null);setRemoved(false);setImageReselect(false);setLogoScope(newScope());setError('');setMessage('');setDraftsOpen(false);};
 useEffect(()=>{
  const version=++generation.current;
  if(previousOwner.current&&previousOwner.current!==owner){selected.current=null;setLocalFile(null);form.current=empty;setFields(empty);setRemoved(false);setLogoScope(newScope());}
  previousOwner.current=owner;setRecoveryOnly(false);beginEditor(null);keys.current.clear();current.current=null;setDraft(null);setItems([]);setReview(null);setDraftsOpen(false);setImageReselect(false);setError('');setMessage('');setUploads(null);setPreparationEnabled(false);setDevBuyAvailability(null);setCreated(false);setExecutionBusy(false);setExecutionLocked(false);setMemoryStorage(false);setRestoring(!!owner);
  void launchpadRequest(launchpadPaths.capabilities,LaunchpadCapabilities).then(c=>{if(version===generation.current){setUploads(c.uploads);setPreparationEnabled(!!(c.preparationEnabled||c.launchEnabled));setDevBuyAvailability(c.devBuy?{status:c.devBuy.status,reason:c.devBuy.reason}:null);setMaxBytes(c.maxBytes);setMemoryStorage(c.storage==='memory');}}).catch(()=>{if(version===generation.current)setUploads(false);});
  if(owner){const before=draftFingerprint(form.current),hadContent=hasDraftContent(form.current);void (async()=>{
   try{const result=await launchpadRequest(base,z.object({items:z.array(SavedLaunchDraft)}));if(version!==generation.current)return;setItems(result.items.filter(d=>d.wallet===owner));
    const active=localGet(activeKey(owner));if(active==='new'||hadContent||draftFingerprint(form.current)!==before)return;
    const id=active??[...result.items].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]?.id;
    if(id){const d=await launchpadRequest(`${base}/${id}`,SavedLaunchDraft);if(version!==generation.current||draftFingerprint(form.current)!==before)return;if(d.wallet!==owner)throw Error('Draft belongs to another wallet');beginEditor(d);accept(d);const missing=localGet(imageKey(d.id));setRemoved(!!missing);setImageReselect(missing==='local');await restoreAttempt(d,()=>{if(version!==generation.current||activeOwner.current!==owner)throw new DOMException('Wallet changed','AbortError');});}
   }catch(e){if(version===generation.current)setError(friendlyError(e));}finally{if(version===generation.current)setRestoring(false);}
  })();}
  return()=>{generation.current++;editorEpoch.current++;controller.current?.abort();writer.current?.dispose();};
 // Every editor is scoped to the authenticated wallet; mutable refs protect in-flight responses.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[owner,base]);
 useEffect(()=>{
  if(!owner||restoring||busy||executionBusy||flowActive||created||!devBuyValid||!hasDraftContent(fields)||!DraftFieldsSchema.safeParse(fields).success)return;
  const fingerprint=draftFingerprint(fields),epoch=editorEpoch.current,w=writer.current;if(!w)return;
  if(current.current&&draftFingerprint(current.current.fields)===fingerprint)return;
  const timer=setTimeout(()=>{setSaveState({phase:'saving',fingerprint});void w.save(fields).then(()=>{if(epoch===editorEpoch.current)setSaveState({phase:'saved',fingerprint});}).catch(e=>{if(epoch===editorEpoch.current)setSaveState({phase:'error',fingerprint,error:friendlyError(e)});});},900);
  return()=>clearTimeout(timer);
 },[owner,fields,restoring,busy,executionBusy,flowActive,created,devBuyValid,retrySave]);
 const run = async(work:(signal:AbortSignal,check:()=>void)=>Promise<void>) => {
  if(running.current)return;
  const version=generation.current, expectedOwner=owner, abort=new AbortController();controller.current=abort;
  const check=()=>{abort.signal.throwIfAborted();if(version!==generation.current||activeOwner.current!==expectedOwner)throw new DOMException('Wallet changed','AbortError');};
  running.current=true;setBusy(true);setError('');setMessage('');
  try{await work(abort.signal,check);}catch(e){if(version===generation.current)setError(friendlyError(e));}
  finally{running.current=false;if(version===generation.current){setPhase(null);setProgress(null);}setBusy(false);}
 };
 const save=(values:Fields,signal:AbortSignal)=>{if(!writer.current)throw Error('Connect your wallet first.');return writer.current.save(values,signal);};
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
  if(restoring||form.current.quoteAsset!=='SOL'||tokenFieldIssues(form.current,true).length||!DraftFieldsSchema.safeParse(form.current).success||devBuyBlocked||!devBuyValid){setError('Fix the highlighted details before creating your coin.');return;}
  setReviewedDevBuyMax(!devQuote.loading&&devQuote.quote?.status==='available'&&devQuote.quote.bps===form.current.devBuyBps?devQuote.quote.maxQuoteCost:null);
  void run(async(signal,check)=>{
   if(uploads===null)throw new Error('Token preparation is still loading. Please try again in a moment.');
   if(!preparationEnabled)throw new Error('Coin creation is unavailable in this demo. You can preview your coin and save a draft.');
   const result=await prepareLaunchDraft({fields:{...form.current},draft:current.current,file:selected.current?.file??null,removeImage:removed,uploads,devBuyAvailable:devBuyQuoteEnabled}, {
    check,stage:value=>{setPhase(value);setProgress(null);},save:values=>save(values,signal),
    removeImage:d=>launchpadRequest(`${base}/${d.id}/logo`,SavedLaunchDraft,{...jsonRequest('DELETE',{version:d.version}),signal}),
    upload:(d,file)=>upload(d,file,signal),
    metadata:d=>launchpadRequest(`${base}/${d.id}/metadata`,SavedLaunchDraft,{...jsonRequest('POST',{version:d.version},keyFor(`metadata:${owner}:${d.id}:${d.version}`)),signal}),
    review:d=>launchpadRequest(`${base}/${d.id}/review`,DraftReview,{signal}),
    accept:d=>{accept(d);setRemoved(false);},uploaded:()=>{if(current.current)localSet(imageKey(current.current.id),null);selected.current=null;setLocalFile(null);setImageReselect(false);setLogoScope(newScope());setProgress(null);},
   });
   check();setRecoveryOnly(false);setReview(result.review);setMessage(result.notice);
  });
 };
 const edit = (key:keyof Fields,value:string|number) => {setFields(f=>({...f,[key]:typeof value==='number'?value:value||(['website','twitter','telegram'].includes(key)?null:'')}));setReview(null);setError('');setMessage('');};
 const leaveEditor=async(signal:AbortSignal)=>{if(selected.current&&!window.confirm('Your selected image is local to this tab. Switching tokens will discard it. Continue?'))return false;if(saveState.phase==='error'&&hasDraftContent(form.current)&&(!current.current||draftFingerprint(form.current)!==draftFingerprint(current.current.fields)))return window.confirm('Some changes have not been saved. Discard them and switch tokens?');if(hasDraftContent(form.current)&&DraftFieldsSchema.safeParse(form.current).success&&devBuyValid)await save({...form.current},signal);else if(hasDraftContent(form.current)&&!window.confirm('Some details are invalid and cannot be saved. Discard those changes?'))return false;return true;};
 const openDrafts=()=>void run(async(signal,check)=>{const result=await launchpadRequest(base,z.object({items:z.array(SavedLaunchDraft)}),{signal});check();setItems(result.items.filter(d=>d.wallet===owner));setDraftsOpen(true);});
 const load = (id:string) => void run(async(signal,check)=>{if(!await leaveEditor(signal))return;const d=await launchpadRequest(`${base}/${id}`,SavedLaunchDraft,{signal});check();if(d.wallet!==owner)throw new Error('This draft belongs to another wallet.');selected.current=null;setLocalFile(null);setCreated(false);keys.current.clear();setRemoved(false);setLogoScope(newScope());beginEditor(d);accept(d);const missing=localGet(imageKey(d.id));setRemoved(!!missing);setImageReselect(missing==='local');await restoreAttempt(d,check);setDraftsOpen(false);});
 return <>
  {!flowActive&&<PageHeading eyebrow="BUILD A PRESENCE" title="Give your community a home." description="Preview your coin as you build it. Create Coin prepares everything, then you review the fees and approve in your wallet."/>}
  <div className="two-column launch-workspace"><section className="surface">
   <div className="launch-draft-summary"><h2>{flowActive?created?'Your coin':'Create Coin':'Token details'}</h2>{owner&&<button className="text-button" disabled={busy||executionBusy||executionLocked||restoring} onClick={openDrafts}>My Drafts</button>}</div>
   {owner&&!flowActive&&<div className="launch-save-status" title="Draft details only. Selected artwork stays local until Create Coin." role="status" aria-live="polite">{restoring?'Loading saved details…':saveState.phase==='error'?<>Couldn't save — <button className="text-button" onClick={()=>setRetrySave(n=>n+1)}>Retry</button><span> {saveState.error}</span></>:saveState.phase==='saving'?'Saving…':saveState.phase==='saved'&&devBuyValid&&saveState.fingerprint===draftFingerprint(fields)?'Saved':''}</div>}
   {owner&&!flowActive&&memoryStorage&&<p className="small muted">Demo saves are temporary and may be lost when the server restarts.</p>}
   {!owner&&<p className="small muted">Explore the form first. Connect your wallet when you’re ready to continue.</p>}
   <form hidden={flowActive} noValidate={!owner} onSubmit={e=>{e.preventDefault();prepare();}} aria-busy={busy}>
    <fieldset disabled={busy||executionBusy||flowActive||restoring}>
     <TokenTextField id="name" label="Token name" value={fields.name} max={PUMP_NAME_MAX} placeholder="Your token name" issues={fieldIssues('name')} onChange={v=>edit('name',v)}/>
     <TokenTextField id="symbol" label="Symbol" value={fields.symbol} max={PUMP_SYMBOL_MAX} placeholder="e.g. MOSS" issues={fieldIssues('symbol')} onChange={v=>edit('symbol',v)}/>
     <div className="launch-field"><label htmlFor="launch-description">Description</label><textarea id="launch-description" rows={4} value={fields.description} placeholder="What are you building?" aria-invalid={fieldIssues('description').length>0} aria-describedby="description-meta" onChange={e=>edit('description',e.target.value)}/>
      <p className="launch-field-meta" id="description-meta"><span>Optional · maximum {DESCRIPTION_MAX} characters.</span><span data-over={fields.description.length>DESCRIPTION_MAX}>{fields.description.length}/{DESCRIPTION_MAX}</span></p>
      {fieldIssues('description').length>0&&<p className="launch-field-error" role="alert">{fieldIssues('description')[0]!.message}</p>}</div>
     <LaunchProjectLinks key={logoScope} fields={fields} onChange={edit}/>
     <LaunchQuotePicker value={fields.quoteAsset} symbol={fields.symbol} onChange={quote=>{if(quote==='SOL')edit('quoteAsset',quote);}}/>
     <LaunchDevBuy onValidityChange={setDevBuyValid} bps={fields.devBuyBps} onChange={bps=>edit('devBuyBps',bps)} availability={devBuyAvailability} quoteAsset={fields.quoteAsset} symbol={fields.symbol} quote={devQuote.quote} loading={devQuote.loading} error={devQuote.error}/>
     <LaunchLogoUpload key={logoScope} selectionOnly disabled={busy||executionBusy||flowActive} onValidationChange={setLogoValidating} automaticMetadata={false} name={fields.name} symbol={fields.symbol} description={fields.description} quoteAsset={fields.quoteAsset}
      imageUrl={removed?'':draft?.image?.ipfsUri??''} trustedImage={removed?null:draft?.image??null} scope={logoScope} maxBytes={maxBytes}
      onFileChange={file=>{setImageReselect(false);if(current.current)localSet(imageKey(current.current.id),file?'local':removed?'removed':null);setLocalFile(file);selected.current=file?{file,key:crypto.randomUUID()}:null;setReview(null);setError('');setMessage('');}}
      onImage={()=>{setRemoved(true);setImageReselect(false);if(current.current)localSet(imageKey(current.current.id),'removed');setReview(null);}}/>
     {imageReselect&&<p className="small muted" role="note">Your previous image was local to the browser. Please select it again before creating your coin.</p>}
     <button className="primary wide" type="submit" disabled={!!owner&&(uploads===null||!preparationEnabled||executionBusy||flowActive||logoValidating||!devBuyValid||restoring)}>{!owner?'Connect wallet':uploads===null?'Loading token preparation…':created?'Coin created':phase??(busy?'Preparing…':logoValidating?'Checking logo…':executionBusy?'Preparing transaction…':flowActive?'Continue below':'Create Coin')}</button>
    </fieldset>
   </form>
   {owner&&!flowActive&&uploads!==null&&!preparationEnabled&&<p className="small muted" role="note">Coin creation is unavailable in this demo. Your preview and saved drafts remain available; no images are uploaded.</p>}
   <ol hidden={flowActive} className="launch-creation-steps" aria-label="Coin creation steps"><li aria-current={!flowActive?'step':undefined}>Token details</li><li aria-current={flowActive&&!created?'step':undefined}>Review</li><li aria-current={created?'step':undefined}>Result</li></ol>
   {progress!==null&&<progress max={100} value={progress} aria-label="Logo upload progress"/>}
   {busy&&<><p className="small" role="status">{phase??'Preparing…'}</p><button className="text-button" onClick={()=>controller.current?.abort()}>Cancel preparation</button></>}
   {(error||session.error)&&<p role="alert">{error||session.error}</p>}{message&&!flowActive&&<p role="status">{message}</p>}
   {review&&<section className="launch-review" aria-label="Token review">
    {((review.launchEnabled||review.preparationEnabled)&&review.readyForNextMilestone)||recoveryOnly?<LaunchExecution key={`${review.draft.id}:${review.draft.version}`} draft={review.draft} reviewedMaxDevBuyCost={reviewedDevBuyMax} executionAllowed={review.launchEnabled&&!recoveryOnly} preparationAllowed={!!(review.preparationEnabled||review.launchEnabled)} autoPrepare={!recoveryOnly} onConfirmed={setCreated} onNewCoin={reset} onBusyChange={setExecutionBusy} onLockChange={setExecutionLocked} onEdit={()=>{setReview(null);setError('');setMessage('Update your details, then choose Create Coin.');}}/>:<><h3>Token preparation</h3><p>Your draft is saved. Coin creation is not available yet.</p><button className="secondary wide" disabled>Token launch unavailable</button></>}
   </section>}
   {draftsOpen&&<MyDrafts items={items} busy={busy} memory={memoryStorage} onClose={()=>setDraftsOpen(false)} onResume={load}
    onNew={()=>void run(async(signal,check)=>{if(!await leaveEditor(signal))return;check();reset();})}
    onDelete={d=>{if(!window.confirm(`Delete “${d.fields.name||'Untitled token'}”? This cannot be undone.`))return;void run(async(signal,check)=>{if(d.id===current.current?.id){await writer.current?.idle();beginEditor(current.current);}const latest=await launchpadRequest(`${base}/${d.id}`,SavedLaunchDraft,{signal});check();await launchpadRequest(`${base}/${d.id}`,z.object({ok:z.literal(true)}),{...jsonRequest('DELETE',{version:latest.version}),signal});check();setItems(list=>list.filter(x=>x.id!==d.id));localSet(imageKey(d.id),null);if(d.id===current.current?.id)reset();});}}/>}
  </section><aside hidden={flowActive}><LaunchTokenPreview fields={fields} file={localFile} imageUrl={removed?'':draft?.image?.gatewayUrl??''} devBuyQuote={devQuote.quote}/><section className="surface"><h2>A clear fee structure</h2><p>The planned one-time launch charge is 0.05 SOL, allocated entirely to Platform Treasury.</p><div className="split-bar"><span>60% agent rewards</span><span>40% platform</span></div><p className="small muted">Eligible verified human-launch creator fees follow this allocation. Preparing your token does not charge a fee.</p><p className="small">Images are uploaded only after Create Coin. Once uploaded, they may remain public even if you cancel wallet approval.</p></section></aside></div>
 </>;
}
