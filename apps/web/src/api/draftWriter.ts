import type {DraftFields,SavedLaunchDraft} from './shared';
export const draftFingerprint=(fields:DraftFields)=>JSON.stringify(fields);
export const hasDraftContent=(f:DraftFields)=>!!(f.name.trim()||f.symbol.trim()||f.description.trim()||f.website||f.twitter||f.telegram);
export interface DraftPort {
 create(fields:DraftFields,key:string,signal:AbortSignal):Promise<SavedLaunchDraft>;
 patch(draft:SavedLaunchDraft,fields:DraftFields,signal:AbortSignal):Promise<SavedLaunchDraft>;
 get(id:string,signal:AbortSignal):Promise<SavedLaunchDraft>;
}
const conflict=()=>new Error('This draft changed elsewhere. Open My Drafts and resume it before editing again.');
/** One editor/owner scope. Serializes autosave and explicit preparation; never accepts a stale or foreign response. */
export class DraftWriter {
 private abort=new AbortController();private tail:Promise<unknown>=Promise.resolve();
 private current:SavedLaunchDraft|null;private creation:{fields:DraftFields;key:string}|null=null;
 private uncertain:DraftFields|null=null;
 constructor(private owner:string,initial:SavedLaunchDraft|null,private port:DraftPort,private saved:(draft:SavedLaunchDraft)=>void){this.current=initial;}
 dispose(){this.abort.abort();}
 idle(){return this.tail.catch(()=>{});}
 private accept(d:SavedLaunchDraft,signal:AbortSignal){signal.throwIfAborted();if(d.wallet!==this.owner||(this.current&&d.id!==this.current.id))throw Error('Saved draft does not belong to this editor.');this.current=d;this.saved(d);return d;}
 save(fields:DraftFields,external?:AbortSignal):Promise<SavedLaunchDraft>{
  const snapshot=structuredClone(fields),signal=external?AbortSignal.any([this.abort.signal,external]):this.abort.signal;
  const job=this.tail.catch(()=>{}).then(async()=>{
   signal.throwIfAborted();
   if(!this.current){
    // Keep the same first payload/key if a create response is lost, even when the user has typed newer fields.
    this.creation??={fields:snapshot,key:crypto.randomUUID()};
    this.accept(await this.port.create(this.creation.fields,this.creation.key,signal),signal);
   }
   if(this.uncertain){
    const latest=await this.port.get(this.current!.id,signal);
    if(latest.wallet!==this.owner)throw Error('Saved draft belongs to another wallet.');
    if(draftFingerprint(latest.fields)===draftFingerprint(this.uncertain))this.accept(latest,signal);
    else if(latest.version!==this.current!.version)throw conflict();
    this.uncertain=null;
   }
   const previous=this.current!;
   if(draftFingerprint(previous.fields)===draftFingerprint(snapshot))return previous;
   this.uncertain=snapshot;
   try{const d=await this.port.patch(previous,snapshot,signal);this.accept(d,signal);this.uncertain=null;return d;}
   catch(error){
    signal.throwIfAborted();
    let latest:SavedLaunchDraft;
    try{latest=await this.port.get(previous.id,signal);}catch{throw error;}
    if(latest.wallet!==this.owner)throw Error('Saved draft belongs to another wallet.');
    if(draftFingerprint(latest.fields)===draftFingerprint(snapshot)){this.accept(latest,signal);this.uncertain=null;return latest;}
    if(latest.version!==previous.version)throw conflict();
    this.uncertain=null;throw error;
   }
  });
  this.tail=job;return job;
 }
}
