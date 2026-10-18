import type pg from 'pg';
import type { SavedLaunchDraft } from '@agentic-economy/shared';
import { AppError } from '../util/errors.js';
type Operation={hash:string;status:string;result:unknown;attempts:number;created:number;lease:number};
/** Same atomic semantics in memory and Postgres. Wallet lock serializes quota and operation claims across replicas. */
export class LaunchpadStore {
 private drafts=new Map<string,SavedLaunchDraft>();private operations=new Map<string,Operation>();
 constructor(private pool?:pg.Pool){}
 async list(wallet:string){if(this.pool)return(await this.pool.query('SELECT doc FROM launchpad_drafts WHERE wallet=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100',[wallet])).rows.map(r=>r.doc as SavedLaunchDraft);return structuredClone([...this.drafts.values()].filter(d=>d.wallet===wallet).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100));}
 async get(wallet:string,id:string){const draft=this.pool?(await this.pool.query('SELECT doc FROM launchpad_drafts WHERE id=$1 AND wallet=$2 AND deleted_at IS NULL',[id,wallet])).rows[0]?.doc:this.drafts.get(id);if(!draft||draft.wallet!==wallet)throw new AppError('not_found','Draft not found');return structuredClone(draft) as SavedLaunchDraft;}
 async create(draft:SavedLaunchDraft){if(this.pool)await this.pool.query('INSERT INTO launchpad_drafts(id,wallet,doc) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[draft.id,draft.wallet,draft]);else if(!this.drafts.has(draft.id))this.drafts.set(draft.id,structuredClone(draft));}
 async save(draft:SavedLaunchDraft,expected:number){if(this.pool){const r=await this.pool.query('UPDATE launchpad_drafts SET doc=$1,version=version+1,updated_at=now() WHERE id=$2 AND wallet=$3 AND version=$4 AND deleted_at IS NULL',[draft,draft.id,draft.wallet,expected]);if(r.rowCount!==1)throw new AppError('conflict','Draft changed. Reload before saving.');}else{const current=this.drafts.get(draft.id);if(!current||current.wallet!==draft.wallet)throw new AppError('not_found','Draft not found');if(current.version!==expected)throw new AppError('conflict','Draft changed. Reload before saving.');this.drafts.set(draft.id,structuredClone(draft));}}
 async remove(wallet:string,id:string,version:number){await this.get(wallet,id);if(this.pool){const r=await this.pool.query('UPDATE launchpad_drafts SET deleted_at=now(),version=version+1 WHERE id=$1 AND wallet=$2 AND version=$3 AND deleted_at IS NULL',[id,wallet,version]);if(r.rowCount!==1)throw new AppError('conflict','Draft changed. Reload before deleting.');}else{if(this.drafts.get(id)?.version!==version)throw new AppError('conflict','Draft changed. Reload before deleting.');this.drafts.delete(id);}}
 async claim(wallet:string,key:string,kind:string,hash:string):Promise<{replayed:boolean;result?:unknown}>{
  if(this.pool){const client=await this.pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,4242010))',[wallet]);
   const r=await client.query('SELECT hash,status,result,attempts,created_at,lease_until FROM launchpad_operations WHERE wallet=$1 AND key=$2 AND kind=$3',[wallet,key,kind]);const row=r.rows[0];
   const prior=row?{hash:row.hash,status:row.status,result:row.result,attempts:row.attempts,created:+new Date(row.created_at),lease:+new Date(row.lease_until)}:undefined;
   const replay=this.check(prior,hash,kind);if(replay){await client.query('COMMIT');return{replayed:true,result:prior!.result};}
   const count=await client.query("SELECT coalesce(sum(attempts),0)::int AS n FROM launchpad_operations WHERE wallet=$1 AND kind=$2 AND created_at > now()-interval '24 hours'",[wallet,kind]);this.quota(count.rows[0].n,kind);
   await client.query("INSERT INTO launchpad_operations(wallet,key,kind,hash,status,lease_until) VALUES($1,$2,$3,$4,'running',now()+interval '2 minutes') ON CONFLICT(wallet,key,kind) DO UPDATE SET status='running',attempts=launchpad_operations.attempts+1,lease_until=now()+interval '2 minutes'",[wallet,key,kind,hash]);await client.query('COMMIT');return{replayed:false};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
  const k=`${wallet}:${kind}:${key}`,prior=this.operations.get(k);if(this.check(prior,hash,kind))return{replayed:true,result:structuredClone(prior!.result)};
  this.quota([...this.operations.entries()].filter(([k,v])=>k.startsWith(`${wallet}:${kind}:`)&&v.created>Date.now()-86400000).reduce((n,[,v])=>n+v.attempts,0),kind);
  this.operations.set(k,{hash,status:'running',result:null,attempts:(prior?.attempts??0)+1,created:prior?.created??Date.now(),lease:Date.now()+120000});return{replayed:false};
 }
 private quota(n:number,kind:string){if(kind==='launch')return;if(n>=(kind==='create'?100:20))throw new AppError('forbidden','Daily operation quota reached. Try again later.');}
 private check(prior:Operation|undefined,hash:string,kind:string){if(!prior)return false;if(prior.hash!==hash)throw new AppError('idempotency_conflict','Request key already used for different content');if(prior.status==='done')return true;if(prior.status==='running'&&prior.lease>Date.now())throw new AppError('conflict','This operation is already in progress');if(prior.attempts>=3&&kind!=='launch')throw new AppError('forbidden','Retry limit reached; start a new operation');return false;}
 async finish(wallet:string,key:string,kind:string,result:unknown,failed=false){if(this.pool)await this.pool.query('UPDATE launchpad_operations SET status=$1,result=$2 WHERE wallet=$3 AND key=$4 AND kind=$5',[failed?'failed':'done',result,wallet,key,kind]);else{const r=this.operations.get(`${wallet}:${kind}:${key}`);if(r){r.status=failed?'failed':'done';r.result=structuredClone(result);}}}
}
