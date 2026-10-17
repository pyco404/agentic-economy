import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { DraftReview, LaunchpadCapabilities, SavedLaunchDraft, launchpadPaths, type DraftFields as Fields, type SavedLaunchDraft as Draft } from '../api/shared';
import { jsonRequest, launchpadApiOrigin, launchpadRequest, useWalletSession } from '../api/walletSession';
import { useDraftField } from '../navigation/drafts';
import type { LaunchMediaAdapter } from '../api/launchMedia';
import { LaunchLogoUpload } from './LaunchLogoUpload';
import { LaunchQuotePicker } from './LaunchQuotePicker';
import { PageHeading } from './Pages';
const empty:Fields={name:'',symbol:'',description:'',quoteAsset:'SOL',website:null,twitter:null,telegram:null};
export function LaunchWorkspace(){
 const session=useWalletSession();const owner=session.identity?.wallet??'';
 const [draft,setDraft]=useState<Draft|null>(null),[items,setItems]=useState<Draft[]>([]),[fields,setFields]=useState<Fields>(empty),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[review,setReview]=useState<z.infer<typeof DraftReview>|null>(null),[uploads,setUploads]=useState(false),[maxBytes,setMaxBytes]=useState(5_000_000);
 const [legacyName]=useDraftField('launchpad:name',''),[legacySymbol]=useDraftField('launchpad:symbol',''),[legacyDescription]=useDraftField('launchpad:description','');
 const createKey=useRef<{content:string;key:string}|null>(null);
 const current=useRef(draft),form=useRef(fields),generation=useRef(0),running=useRef(false);current.current=draft;form.current=fields;
 const base=launchpadPaths.drafts;
 const accept=(d:Draft)=>{createKey.current=null;current.current=d;setDraft(d);setFields(d.fields);setItems(list=>[d,...list.filter(x=>x.id!==d.id)]);setReview(null);};
 const activeOwner=useRef(owner);activeOwner.current=owner;
 useEffect(()=>{
  const version=++generation.current;setDraft(null);current.current=null;setItems([]);setFields(empty);setReview(null);setError('');setMessage('');
  if(!owner)return;
  void launchpadRequest(base,z.object({items:z.array(SavedLaunchDraft)})).then(result=>{if(version===generation.current)setItems(result.items);}).catch(e=>{if(version===generation.current)setError(e.message);});
  void launchpadRequest(launchpadPaths.capabilities,LaunchpadCapabilities).then(c=>{if(version===generation.current){setUploads(c.uploads);setMaxBytes(c.maxBytes);}}).catch(()=>{});
 },[owner,base]);
 const run=async(work:()=>Promise<void>)=>{if(running.current)return;running.current=true;setBusy(true);setError('');setMessage('');try{await work();}catch(e){setError(e instanceof Error?e.message:'The request failed. Retry.');}finally{running.current=false;setBusy(false);}};
 const save=async()=>{
  const expectedOwner=owner;let result:Draft;
  if(current.current)result=await launchpadRequest(`${base}/${current.current.id}`,SavedLaunchDraft,jsonRequest('PATCH',{version:current.current.version,fields:form.current}));
  else {const content=JSON.stringify({owner,fields:form.current});if(createKey.current?.content!==content)createKey.current={content,key:crypto.randomUUID()};result=await launchpadRequest(base,SavedLaunchDraft,jsonRequest('POST',form.current,createKey.current.key));}
  if(activeOwner.current!==expectedOwner)throw new Error('Wallet changed. Authenticate again.');accept(result);return result;
 };
 const media=useMemo<LaunchMediaAdapter>(()=>({available:!!owner&&uploads,unavailableReason:!owner?'Connect and authenticate to upload.':'Pinata is not configured on this backend. Draft saving remains available.',
  uploadLogo:async(file,options)=>{
   if(!current.current||JSON.stringify(current.current.fields)!==JSON.stringify(form.current))throw new Error('Save the latest draft details before uploading');
   const d=current.current,expectedOwner=owner;
   const result=await new Promise<Draft>((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open('POST',`${launchpadApiOrigin()}${base}/${d.id}/logo?version=${d.version}`);xhr.withCredentials=true;xhr.timeout=60000;
    xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.setRequestHeader('Idempotency-Key',options.requestId);
    xhr.upload.onprogress=e=>{if(e.lengthComputable)options.onProgress(e.loaded/e.total*95);};
    const aborted=()=>xhr.abort();options.signal.addEventListener('abort',aborted,{once:true});
    const done=()=>options.signal.removeEventListener('abort',aborted);
    xhr.onload=()=>{done();try{if(xhr.status===401)window.dispatchEvent(new Event('aeco:session-expired'));const body=JSON.parse(xhr.responseText);if(xhr.status<200||xhr.status>=300)throw new Error(body.error?.message??'Upload rejected');resolve(SavedLaunchDraft.parse(body));}catch(e){reject(e);}};
    xhr.onerror=()=>{done();reject(new Error('Upload interrupted'));};xhr.ontimeout=()=>{done();reject(new Error('Upload timed out'));};xhr.onabort=()=>{done();reject(new DOMException('Cancelled','AbortError'));};
    if(options.signal.aborted){reject(new DOMException('Cancelled','AbortError'));return;}xhr.send(file);
   });
   if(activeOwner.current!==expectedOwner)throw new Error('Wallet changed');accept(result);options.onProgress(100);return result.image!;
  },
  // Metadata is an explicit, versioned workspace action. The legacy widget does not auto-pin.
  prepareMetadata:async()=>{throw new Error('Use Generate metadata after saving your draft');}
 }),[owner,uploads,base]);
 const dirty=!!draft&&JSON.stringify(fields)!==JSON.stringify(draft.fields);
 const edit=(key:keyof Fields,value:string)=>{setFields(f=>({...f,[key]:value||(['website','twitter','telegram'].includes(key)?null:'')}));setReview(null);};
 return <><PageHeading eyebrow="BUILD A PRESENCE" title="Give your community a home." description="Save a wallet-owned draft, upload your logo, and prepare verified IPFS metadata. No token launches or payments."/>
 {!owner?<section className="surface"><h2>Your launch workspace</h2><p>Connect your Solana wallet and sign a fee-free authentication message to access your own drafts.</p><button className="primary" onClick={session.open}>Connect wallet</button>{session.error&&<p role="alert">{session.error}</p>}</section>:<div className="two-column launch-workspace"><section className="surface">
 <div className="launch-draft-toolbar"><h2>Token details</h2><select aria-label="Saved launch drafts" disabled={busy} value={draft?.id??''} onChange={e=>{const id=e.target.value;if(!id)return;void run(async()=>{const d=await launchpadRequest(`${base}/${id}`,SavedLaunchDraft);if(d.wallet!==activeOwner.current)return;accept(d);setMessage('Draft loaded from the backend.');});}}><option value="">Choose a saved draft</option>{items.map(d=><option key={d.id} value={d.id}>{d.fields.name||'Untitled draft'}</option>)}</select><button className="secondary" disabled={busy} onClick={()=>{setDraft(null);current.current=null;setFields(empty);setReview(null);}}>New draft</button></div>
 {draft&&<button className="text-button" disabled={busy} onClick={()=>void run(async()=>{const d=await launchpadRequest(`${base}/${current.current!.id}`,SavedLaunchDraft);if(d.wallet===activeOwner.current){accept(d);setMessage('Latest draft loaded from the backend.');}})}>Reload saved draft</button>}
 <p className="small ui-select-text">Verified creator: {owner}</p><button className="text-button" onClick={()=>void session.logout()}>Sign out</button>
 {(legacyName||legacySymbol||legacyDescription)&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setDraft(null);current.current=null;setFields({...empty,name:legacyName,symbol:legacySymbol,description:legacyDescription});setReview(null);setMessage('Browser draft copied into the form. Save to import it; unverified image URLs were not imported.');}}>Import browser-saved text draft</button>}
 <form onSubmit={e=>{e.preventDefault();void run(async()=>{await save();setMessage('Draft saved to the backend.');});}}><fieldset disabled={busy} style={{border:0,padding:0,margin:0}}>
 <label>Token name<input value={fields.name} maxLength={32} onChange={e=>edit('name',e.target.value)}/></label><label>Symbol<input value={fields.symbol} maxLength={13} pattern="[A-Za-z0-9$_.\-]+" onChange={e=>edit('symbol',e.target.value)}/></label><label>Description<textarea value={fields.description} maxLength={1000} rows={4} onChange={e=>edit('description',e.target.value)}/></label>
 <details><summary>Project links (optional)</summary>{(['website','twitter','telegram']as const).map(key=><label key={key}>{key==='twitter'?'X profile':key}<input type="url" value={fields[key]??''} placeholder="https://…" onChange={e=>edit(key,e.target.value)}/></label>)}</details>
 <LaunchQuotePicker value={fields.quoteAsset} symbol={fields.symbol} onChange={()=>{}}/><button className="primary wide" type="submit">{busy?'Saving…':draft?'Save draft':'Create draft'}</button></fieldset></form>
 {draft&&!dirty?<LaunchLogoUpload key={`${owner}:${draft.id}`} name={fields.name} symbol={fields.symbol} description={fields.description} quoteAsset={fields.quoteAsset} imageUrl={draft.image?.ipfsUri??''} scope={`launchpad:${owner}:${draft.id}`} onImage={uri=>{if(!uri&&current.current?.image)void run(async()=>{const d=current.current!;const result=await launchpadRequest(`${base}/${d.id}/logo`,SavedLaunchDraft,jsonRequest('DELETE',{version:d.version}));if(result.wallet===activeOwner.current)accept(result);});}} adapter={media} maxBytes={maxBytes} automaticMetadata={false} trustedImage={draft.image} />:<p className="small muted">Save the draft before uploading its logo.</p>}
 <div className="launch-draft-toolbar"><button className="secondary" disabled={busy||!draft?.image||dirty||!uploads} onClick={()=>void run(async()=>{const d=current.current!;const result=await launchpadRequest(`${base}/${d.id}/metadata`,SavedLaunchDraft,jsonRequest('POST',{version:d.version},crypto.randomUUID()));if(result.wallet!==activeOwner.current)return;accept(result);setMessage('Metadata pinned and saved by the backend.');})}>Generate metadata</button>
 <button className="secondary" disabled={busy||!draft||dirty} onClick={()=>void run(async()=>{const result=await launchpadRequest(`${base}/${draft!.id}/review`,DraftReview);if(result.draft.wallet!==activeOwner.current)return;setReview(result);})}>Review saved draft</button>
 <button className="text-button" disabled={busy||!draft} onClick={()=>void run(async()=>{if(!window.confirm('Delete this saved draft? Pinned IPFS content may remain public.'))return;const d=current.current!;await launchpadRequest(`${base}/${d.id}`,z.object({ok:z.literal(true)}),jsonRequest('DELETE',{version:d.version}));if(d.wallet!==activeOwner.current)return;setItems(list=>list.filter(x=>x.id!==d.id));setDraft(null);current.current=null;setFields(empty);setReview(null);setMessage('Draft deleted.');})}>Delete draft</button></div>
 {draft?.metadata&&<p className="small">Pinned metadata: <code className="ui-select-text">{draft.metadata.ipfsUri}</code></p>}{dirty&&<p className="small">Unsaved changes. Save before upload, metadata generation, or review.</p>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 {review&&<section className="launch-review" aria-label="Launch draft review"><h3>Backend draft review</h3>{review.draft.image&&<img src={review.draft.image.gatewayUrl} alt="Verified token logo"/>}<h4>{review.draft.fields.name} ({review.draft.fields.symbol})</h4><p>{review.draft.fields.description}</p><dl className="fee-list"><div><dt>Trading pair</dt><dd>{review.draft.fields.symbol}/SOL</dd></div><div><dt>Creator wallet</dt><dd><code className="ui-select-text">{review.draft.wallet}</code></dd></div><div><dt>Image IPFS URI</dt><dd><code className="ui-select-text">{review.draft.image?.ipfsUri??'Not uploaded'}</code></dd></div><div><dt>Metadata IPFS URI</dt><dd><code className="ui-select-text">{review.draft.metadata?.ipfsUri??'Not prepared'}</code></dd></div><div><dt>Planned launch charge</dt><dd>{review.launchChargeSol} SOL · not charged</dd></div></dl>{review.issues.length?<ul>{review.issues.map(i=><li key={i}>{i}</li>)}</ul>:<p>Draft assets are ready for the next milestone. Token launching remains disabled.</p>}<button className="secondary wide" disabled>Token launch unavailable</button></section>}
 </section><aside><section className="surface"><h2>A clear fee structure</h2><p>The planned one-time launch charge is 0.05 SOL, allocated entirely to the Platform Treasury.</p><div className="split-bar"><span>60% agent rewards</span><span>40% platform</span></div><p className="small muted">Eligible verified human-launch creator fees follow the approved allocation. No fee is collected in this workspace.</p><p className="small">Images and metadata pinned to public IPFS may remain publicly accessible after deleting a draft.</p><button className="secondary wide" disabled>No transactions in this milestone</button></section></aside></div>}</>;
}
