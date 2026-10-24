import type pg from 'pg';
import {isDeepStrictEqual} from 'node:util';
import type {MarketPage,MarketTrade} from '../chain/market-types.js';
type Phase='live'|'history';
interface Cursor{v?:2;initialized?:boolean;head:string|null;before?:string;scanHead?:string;started:number;complete:boolean;through:number|null;floor:number|null;liveHead?:string;liveBefore?:string;liveScanHead?:string;liveStarted?:number;liveThrough?:number;progressAt?:number}
export interface Activity{complete:boolean;durable:boolean;through:string|null;reason:string|null;volumeSol:number|null;buys:number|null;sells:number|null;transactions:number|null;trades:MarketTrade[]}
type Reader=(address:string,before?:string,until?:string,phase?:Phase)=>Promise<MarketPage>;
/** Fetch outside transactions. Compare-and-swap the complete cursor under a short advisory lock;
 * only a fully validated contiguous page and its events commit together. No schema changes. */
export class MarketJournal{
 private cursors=new Map<string,Cursor>();private trades=new Map<string,MarketTrade>();private jobs=new Map<string,Promise<void>>();private availability:{at:number;ready:boolean}|null=null;
 readonly metrics={pages:0,signatures:0,events:0,errors:0,conflicts:0};
 private failures=new Map<string,number>();
 private observations=new Map<string,{through:number|null;complete:boolean;progressAt:number;lastSuccess:number;failures:number}>();
 constructor(private pool?:pg.Pool,private now=()=>Date.now()){}
 telemetry(){const values=[...this.observations.values()],now=this.now();return{...this.metrics,lagMs:Math.max(0,...values.map(v=>v.through===null?now-v.progressAt:now-v.through)),stale:values.filter(v=>v.through===null||now-v.through>=180000).length,backfillPending:values.filter(v=>!v.complete).length,stalled:values.filter(v=>!v.complete&&now-v.progressAt>=600000).length,consecutiveFailures:Math.max(0,...this.failures.values()),lastSuccess:values.length?Math.min(...values.map(v=>v.lastSuccess)):0};}
 private async ready(){
  if(!this.pool)return true;
  if(this.availability&&this.now()-this.availability.at<60000)return this.availability.ready;
  const q=await this.pool.query("SELECT to_regclass('public.token_market_trades') IS NOT NULL AND to_regclass('public.token_market_cursors') IS NOT NULL AS ready");
  const ready=q.rows[0]?.ready===true;this.availability={at:this.now(),ready};return ready;
 }
 async sync(network:string,mint:string,addresses:string[],read:Reader,scope:Phase|'both'='both'){
  if(!await this.ready())return;
  const key=network+':'+mint+':'+scope;if(this.jobs.has(key))return this.jobs.get(key);
  const job=this.run(network,mint,addresses,read,scope).finally(()=>this.jobs.delete(key));this.jobs.set(key,job);return job;
 }
 private upgrade(raw:Cursor|null):Cursor{
  if(!raw)return{v:2,initialized:false,head:null,started:this.now(),complete:false,through:null,floor:null};
  if(raw.v===2){
   const c=structuredClone(raw);
   // v2 persists the legacy fields as mirrors. If an older worker advances them
   // during rollback, adopt its checkpoint rather than resurrecting stale work.
   if(c.complete){c.liveBefore=c.before;c.liveScanHead=c.scanHead;if(!c.before)delete c.liveStarted;}
   else{c.head=c.liveHead??c.head;c.through=c.liveThrough??c.through;}
   return c;
  }
  return{v:2,initialized:true,head:raw.complete?raw.head:raw.liveHead??raw.scanHead??raw.head,started:raw.started,complete:raw.complete,floor:raw.floor,through:raw.complete?raw.through:raw.liveThrough??null,
   ...(raw.complete?{liveBefore:raw.before,liveScanHead:raw.scanHead,liveStarted:raw.started}:{before:raw.before,scanHead:raw.scanHead,liveBefore:raw.liveBefore,liveScanHead:raw.liveScanHead,liveStarted:raw.liveStarted}),progressAt:raw.progressAt};
 }
 private async load(network:string,mint:string,address:string):Promise<Cursor|null>{
  return this.pool?(await this.pool.query('SELECT doc FROM token_market_cursors WHERE network=$1 AND mint=$2 AND address=$3',[network,mint,address])).rows[0]?.doc??null:structuredClone(this.cursors.get([network,mint,address].join(':'))??null);
 }
 private async run(network:string,mint:string,addresses:string[],read:Reader,scope:Phase|'both'){
  let failed=false,conflicting=false;
  for(const address of addresses){let seeded=false;
   for(const phase of (scope==='both'?['live','history']:[scope])as Phase[]){
    if(phase==='history'&&seeded)continue;
    const key=[network,mint,address].join(':');
    try{
     const raw=await this.load(network,mint,address),c=this.upgrade(raw);
     if(this.observations.size>=1000&&!this.observations.has(key)){const first=this.observations.keys().next().value!;this.observations.delete(first);this.failures.delete(first+':live');this.failures.delete(first+':history');}
     const observed=this.observations.get(key);this.observations.set(key,{through:c.through,complete:c.complete,progressAt:c.progressAt??c.started,lastSuccess:Math.max(observed?.lastSuccess??0,c.through??0),failures:observed?.failures??0});
     if(phase==='history'&&(!c.initialized||c.complete))continue;
     const started=this.now();
     // No pool client or transaction is held during this network call.
     const page=await read(address,phase==='live'?c.liveBefore:c.before,phase==='live'?c.head??undefined:undefined,phase);
     const first=page.signatures[0],last=page.signatures.at(-1);
     if(!page.exhausted&&!last)throw Error('Market page made no progress');
     if(phase==='live'){
      if(!c.initialized){
       c.initialized=true;c.started=started;c.head=first??null;c.through=started;c.complete=!page.deferredError&&(page.exhausted||page.oldestTime!==null&&Number.isFinite(page.oldestTime)&&page.oldestTime*1000<=started-86400000);
       c.floor=c.complete?(page.exhausted?0:started-86400000):null;if(!c.complete)c.before=last;seeded=true;
      }else{
       c.liveStarted??=started;if(first&&!c.liveScanHead)c.liveScanHead=first;
       if(page.exhausted&&!page.deferredError){c.head=c.liveScanHead??c.head;c.through=c.liveStarted;delete c.liveBefore;delete c.liveScanHead;delete c.liveStarted;}
       else {if(last===c.liveBefore)throw Error('Market live cursor did not advance');c.liveBefore=last;}
      }
     }else{
      const reachedWindow=page.oldestTime!==null&&Number.isFinite(page.oldestTime)&&page.oldestTime*1000<=c.started-86400000;
      if(!page.deferredError&&(page.exhausted||reachedWindow)){c.complete=true;c.floor=reachedWindow?c.started-86400000:0;delete c.before;}
      else {if(last===c.before)throw Error('Market history cursor did not advance');c.before=last;}
     }
     if(last)c.progressAt=started;
     const committed=await this.commit(network,mint,address,raw,c,page,phase);
     if(committed){
      if(!page.deferredError)this.failures.set(key+':'+phase,0);
      this.metrics.pages++;this.metrics.signatures+=page.signatures.length;this.metrics.events+=page.trades.length;
      this.observations.set(key,{through:committed.through,complete:committed.complete,progressAt:committed.progressAt??committed.started,lastSuccess:this.now(),failures:0});
     }else this.metrics.conflicts++;
     if(page.deferredError)throw Error('Market detail read deferred after safe prefix');
    }catch(e){
     if(e instanceof Error&&e.message==='Conflicting finalized market evidence')conflicting=true;
     failed=true;this.metrics.errors++;this.failures.set(key+':'+phase,(this.failures.get(key+':'+phase)??0)+1);const old=this.observations.get(key)??{through:null,complete:false,progressAt:this.now(),lastSuccess:this.now(),failures:0};old.failures++;this.observations.set(key,old);
    }
   }
  }
  if(failed)throw Error(conflicting?'Conflicting finalized market evidence':'Market page unavailable; committed prefixes retained');
 }
 private compatible(c:Cursor):Cursor{
  if(c.complete){
   if(c.liveBefore){c.before=c.liveBefore;c.scanHead=c.liveScanHead;}else{delete c.before;delete c.scanHead;}
   c.started=c.liveStarted??c.through??c.started;delete c.liveHead;delete c.liveThrough;
  }else{c.scanHead??=c.head??undefined;c.liveHead=c.head??undefined;c.liveThrough=c.through??undefined;}
  return c;
 }
 private merge(observed:Cursor|null,expected:Cursor|null,candidate:Cursor,phase:Phase):Cursor|null{
  if(isDeepStrictEqual(observed,expected))return candidate;
  const old=this.upgrade(expected),current=this.upgrade(observed);
  if(!old.initialized||!current.initialized)return null;
  const fields:ReadonlyArray<keyof Cursor>=phase==='live'?['head','through','liveBefore','liveScanHead','liveStarted']:['before','started','complete','floor'];
  if(fields.some(k=>!isDeepStrictEqual(old[k],current[k])))return null;
  // Another lane may commit while RPC is in flight. Merge only this lane's validated
  // checkpoint; a concurrent writer in the SAME lane must instead re-read its cursor.
  const merged=current as unknown as Record<string,unknown>,next=candidate as unknown as Record<string,unknown>;
  for(const key of fields){if(Object.hasOwn(next,key))merged[key]=next[key];else delete merged[key];}
  current.progressAt=Math.max(current.progressAt??0,candidate.progressAt??0);return current;
 }
 private async commit(network:string,mint:string,address:string,expected:Cursor|null,cursor:Cursor,page:MarketPage,phase:Phase){
  const signatures=new Set(page.signatures),staged=new Map<string,MarketTrade>();
  for(const t of page.trades){
   if(t.blockTime===null||!Number.isSafeInteger(t.eventIndex)||t.eventIndex<0||t.pool!==address||!signatures.has(t.signature))throw Error('Invalid finalized market page');
   const id=[network,mint,t.signature,t.eventIndex].join(':');const old=staged.get(id);if(old&&!isDeepStrictEqual(old,t))throw Error('Conflicting finalized market evidence');staged.set(id,t);
  }
  const key=[network,mint,address].join(':');
  if(!this.pool){
   const candidate=this.merge(this.cursors.get(key)??null,expected,cursor,phase);if(!candidate)return null;const merged=this.compatible(candidate);
   for(const [id,t]of staged){const old=this.trades.get(id);if(old&&!isDeepStrictEqual(old,t))throw Error('Conflicting finalized market evidence');}
   for(const [id,t]of staged)this.trades.set(id,t);this.cursors.set(key,JSON.parse(JSON.stringify(merged)));return merged;
  }
  const db=await this.pool.connect();
  try{
   await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");await db.query("SET LOCAL lock_timeout='500ms'");
   const lock=await db.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',['token-market:'+key]);
   if(!lock.rows[0].locked){await db.query('ROLLBACK');return null;}
   const observed=(await db.query('SELECT doc FROM token_market_cursors WHERE network=$1 AND mint=$2 AND address=$3',[network,mint,address])).rows[0]?.doc??null;
   const candidate=this.merge(observed,expected,cursor,phase);if(!candidate){await db.query('ROLLBACK');return null;}const merged=this.compatible(candidate);
   for(const t of staged.values()){
    const insert=await db.query('INSERT INTO token_market_trades(network,mint,signature,event_index,slot,block_time,side,quote_raw,doc) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',[network,mint,t.signature,t.eventIndex,t.slot,new Date(t.blockTime!*1000),t.side,t.quoteAmount,JSON.stringify(t)]);
    if(!insert.rowCount){const old=await db.query('SELECT doc FROM token_market_trades WHERE network=$1 AND mint=$2 AND signature=$3 AND event_index=$4',[network,mint,t.signature,t.eventIndex]);if(!isDeepStrictEqual(old.rows[0]?.doc,t))throw Error('Conflicting finalized market evidence');}
   }
   await db.query('INSERT INTO token_market_cursors(network,mint,address,doc) VALUES($1,$2,$3,$4) ON CONFLICT(network,mint,address) DO UPDATE SET doc=excluded.doc',[network,mint,address,JSON.stringify(merged)]);await db.query('COMMIT');return merged;
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 async activity(network:string,mint:string,addresses:string[]):Promise<Activity>{
  const none:Activity={complete:false,durable:!!this.pool,through:null,reason:'Trade history is reconciling; incomplete totals are not displayed.',volumeSol:null,buys:null,sells:null,transactions:null,trades:[]};
  if(!await this.ready())return {...none,durable:false,reason:'Durable trade indexing awaits database migration approval.'};
  const cutoff=new Date(this.now()-86400000);
  // One SQL statement gives cursor coverage, rows and totals the SAME MVCC snapshot.
  // A page committing between separate reads must never turn partial totals into a complete window.
  const observed=this.pool?(await this.pool.query(`
   WITH totals AS (
    SELECT coalesce(sum(quote_raw),0)::text AS volume,count(*) FILTER(WHERE side='buy')::int AS buys,
     count(*) FILTER(WHERE side='sell')::int AS sells,count(DISTINCT signature)::int AS transactions
    FROM token_market_trades WHERE network=$1 AND mint=$2 AND block_time>=$4
   ), recent AS (
    SELECT doc FROM token_market_trades WHERE network=$1 AND mint=$2 ORDER BY block_time DESC,slot DESC,event_index DESC LIMIT 20
   ) SELECT totals.*,
    (SELECT json_agg(doc) FROM token_market_cursors WHERE network=$1 AND mint=$2 AND address=ANY($3)) AS cursors,
    (SELECT json_agg(doc) FROM recent) AS trades FROM totals`,[network,mint,addresses,cutoff])).rows[0]:null;
  const cursors:Cursor[]=observed?(observed.cursors??[]).map((c:Cursor)=>this.upgrade(c)):addresses.flatMap(a=>{const c=this.cursors.get([network,mint,a].join(':'));return c?[c]:[];});
  const through=cursors.length?Math.min(...cursors.map(c=>c.through??0)):0;
  const complete=cursors.length===addresses.length&&cursors.every(c=>c.complete&&!c.before&&!c.liveBefore&&(c.floor??Infinity)<=this.now()-86400000)&&this.now()-through<180000;
  if(observed){
   const trades:MarketTrade[]=observed.trades??[];
   if(!complete)return {...none,through:through?new Date(through).toISOString():null,trades};
   return {...none,complete:true,reason:null,through:new Date(through).toISOString(),volumeSol:Number(observed.volume)/1e9,buys:observed.buys,sells:observed.sells,transactions:observed.transactions,trades};
  }
  const all=[...this.trades].filter(([key])=>key.startsWith(network+':'+mint+':')).map(([,t])=>t),window=all.filter(t=>t.blockTime!*1000>=cutoff.getTime());
  if(!complete)return {...none,trades:all.sort((a,b)=>b.slot-a.slot).slice(0,20)};
  return {...none,complete:true,reason:null,through:new Date(through).toISOString(),volumeSol:Number(window.reduce((sum,t)=>sum+BigInt(t.quoteAmount),0n))/1e9,buys:window.filter(t=>t.side==='buy').length,sells:window.filter(t=>t.side==='sell').length,transactions:new Set(window.map(t=>t.signature)).size,trades:all.sort((a,b)=>b.slot-a.slot).slice(0,20)};
 }
}
