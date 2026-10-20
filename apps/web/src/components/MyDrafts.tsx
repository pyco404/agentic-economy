import {useEffect,useRef} from 'react';
import type {SavedLaunchDraft} from '../api/shared';
import './my-drafts.css';
export function MyDrafts({items,busy,memory,onClose,onResume,onNew,onDelete}:{items:SavedLaunchDraft[];busy:boolean;memory:boolean;onClose:()=>void;onResume:(id:string)=>void;onNew:()=>void;onDelete:(draft:SavedLaunchDraft)=>void}){
 const panel=useRef<HTMLElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;panel.current?.querySelector<HTMLButtonElement>('button')?.focus();return()=>previous?.focus();},[]);
 return <div className="wallet-dialog-backdrop" onClick={()=>{if(!busy)onClose();}}><section ref={panel} className="surface my-drafts" role="dialog" aria-modal="true" aria-labelledby="my-drafts-title" onClick={e=>e.stopPropagation()} onKeyDown={e=>{
  if(e.key==='Escape'){e.stopPropagation();if(!busy)onClose();}
  if(e.key==='Tab'){const nodes=Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}><div className="my-drafts-heading"><h2 id="my-drafts-title">My Drafts</h2><button className="text-button" disabled={busy} onClick={onClose} aria-label="Close My Drafts">Close</button></div>
 <button className="secondary" disabled={busy} onClick={onNew}>Start a new token</button>
 {memory&&<p className="small muted">This demo saves drafts temporarily. They may be lost when its server restarts.</p>}
 {!items.length?<p>No saved drafts yet. Your details save automatically as you type.</p>:<ul className="my-drafts-list">{[...items].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(d=><li key={d.id}>
 <div className="my-drafts-identity">{d.image?<img src={d.image.gatewayUrl} alt=""/>:<span aria-hidden="true">{d.fields.symbol.slice(0,2)||'—'}</span>}<div><strong>{d.fields.name||'Untitled token'}</strong><p className="small muted">{d.fields.symbol||'No ticker'} · <time dateTime={d.updatedAt}>{new Date(d.updatedAt).toLocaleString()}</time></p></div></div>
 <div className="my-drafts-actions"><button className="secondary" disabled={busy} onClick={()=>onResume(d.id)}>Resume {d.fields.name||'draft'}</button><button className="text-button" disabled={busy} onClick={()=>onDelete(d)}>Delete {d.fields.name||'draft'}</button></div>
 </li>)}</ul>}
 </section></div>;
}
