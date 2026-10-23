import type pg from 'pg';
import {isDeepStrictEqual} from 'node:util';
import type {MarketPage,MarketTrade} from '../chain/market-types.js';
interface Cursor{head:string|null;before?:string;scanHead?:string;started:number;complete:boolean;through:number|null;floor:number|null}
export interface Activity{complete:boolean;durable:boolean;through:string|null;reason:string|null;volumeSol:number|null;buys:number|null;sells:number|null;transactions:number|null;trades:MarketTrade[]}
/** Separate read-only-chain journal. Atomic page + cursor commit, finalized events only, no financial writes.
 * Tables are NEVER created here: absence disables durable indexing until migration approval. */
export class MarketJournal{
 private cursors=new Map<string,Cursor>();private trades=new Map<string,MarketTrade>();private jobs=new Map<string,Promise<void>>();private availability:{at:number;ready:boolean}|null=null;
 constructor(private pool?:pg.Pool,private now=()=>Date.now()){}
 private async ready(){
  if(!this.pool)return true;
  if(this.availability&&this.now()-this.availability.at<60000)return this.availability.ready;
  const q=await this.pool.query("SELECT to_regclass('public.token_market_trades') IS NOT NULL AND to_regclass('public.token_market_cursors') IS NOT NULL AS ready");
  const ready=q.rows[0]?.ready===true;this.availability={at:this.now(),ready};return ready;
 }
 async sync(network:string,mint:string,addresses:string[],read:(address:string,before?:string,until?:string)=>Promise<MarketPage>){
  if(!await this.ready())return;
  const key=network+':'+mint;if(this.jobs.has(key))return this.jobs.get(key);
  const job=this.run(network,mint,addresses,read).finally(()=>this.jobs.delete(key));this.jobs.set(key,job);return job;
 }
 private async run(network:string,mint:string,addresses:string[],read:(address:string,before?:string,until?:string)=>Promise<MarketPage>){
  for(const address of addresses){
   const db=this.pool?await this.pool.connect():null,key=[network,mint,address].join(':');
   try{
    if(db){await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");await db.query("SET LOCAL lock_timeout='500ms'");const lock=await db.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',['token-market:'+key]);if(!lock.rows[0].locked){await db.query('ROLLBACK');continue;}}
    const persisted=db?(await db.query('SELECT doc FROM token_market_cursors WHERE network=$1 AND mint=$2 AND address=$3',[network,mint,address])).rows[0]?.doc:this.cursors.get(key);
    const c:Cursor=persisted?structuredClone(persisted):{head:null,started:this.now(),complete:false,through:null,floor:null};
    if(c.complete&&!c.before)c.started=this.now();
    const page=await read(address,c.before,c.complete?c.head??undefined:undefined);
    if(page.signatures.length&&!c.scanHead)c.scanHead=page.signatures[0];
    // An old signature with no timestamp cannot establish complete time-window coverage.
    const reachedWindow=!c.complete&&page.oldestTime!==null&&Number.isFinite(page.oldestTime)&&page.oldestTime*1000<=c.started-86400000;
    const staged=new Map<string,MarketTrade>();
    for(const t of page.trades){
     if(t.blockTime===null||!Number.isSafeInteger(t.eventIndex)||t.eventIndex<0||t.pool!==address||!page.signatures.includes(t.signature))throw Error('Invalid finalized market page');
     if(db){const insert=await db.query('INSERT INTO token_market_trades(network,mint,signature,event_index,slot,block_time,side,quote_raw,doc) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',[network,mint,t.signature,t.eventIndex,t.slot,new Date(t.blockTime*1000),t.side,t.quoteAmount,JSON.stringify(t)]);if(!insert.rowCount){const existing=await db.query('SELECT doc FROM token_market_trades WHERE network=$1 AND mint=$2 AND signature=$3 AND event_index=$4',[network,mint,t.signature,t.eventIndex]);if(!isDeepStrictEqual(existing.rows[0]?.doc,t))throw Error('Conflicting finalized market evidence');}}
     else {const id=[network,mint,t.signature,t.eventIndex].join(':');const old=staged.get(id)??this.trades.get(id);if(old&&!isDeepStrictEqual(old,t))throw Error('Conflicting finalized market evidence');staged.set(id,t);}
    }
    if(page.exhausted||reachedWindow){
     if(!c.complete)c.floor=reachedWindow?c.started-86400000:0;
     c.complete=true;c.head=c.scanHead??c.head;c.through=c.started;delete c.before;delete c.scanHead;
    }else{const next=page.signatures.at(-1);if(!next||next===c.before)throw Error('Market cursor did not advance');c.before=next;}
    if(db){await db.query('INSERT INTO token_market_cursors(network,mint,address,doc) VALUES($1,$2,$3,$4) ON CONFLICT(network,mint,address) DO UPDATE SET doc=excluded.doc',[network,mint,address,JSON.stringify(c)]);await db.query('COMMIT');}
    else {for(const [id,t] of staged)this.trades.set(id,t);this.cursors.set(key,c);}
   }catch(e){await db?.query('ROLLBACK');throw e;}finally{db?.release();}
  }
 }
 async activity(network:string,mint:string,addresses:string[]):Promise<Activity>{
  const none:Activity={complete:false,durable:!!this.pool,through:null,reason:'Trade history is reconciling; incomplete totals are not displayed.',volumeSol:null,buys:null,sells:null,transactions:null,trades:[]};
  if(!await this.ready())return {...none,durable:false,reason:'Durable trade indexing awaits database migration approval.'};
  const cursors:Cursor[]=this.pool?(await this.pool.query('SELECT doc FROM token_market_cursors WHERE network=$1 AND mint=$2 AND address=ANY($3)',[network,mint,addresses])).rows.map(r=>r.doc):addresses.flatMap(a=>{const c=this.cursors.get([network,mint,a].join(':'));return c?[c]:[];});
  const through=cursors.length?Math.min(...cursors.map(c=>c.through??0)):0;
  const complete=cursors.length===addresses.length&&cursors.every(c=>c.complete&&!c.before&&(c.floor??Infinity)<=this.now()-86400000)&&this.now()-through<180000;
  const cutoff=new Date(this.now()-86400000);
  if(this.pool){
   const rows=await this.pool.query('SELECT doc FROM token_market_trades WHERE network=$1 AND mint=$2 ORDER BY slot DESC,event_index DESC LIMIT 20',[network,mint]);
   const trades=rows.rows.map(r=>r.doc as MarketTrade);
   if(!complete)return {...none,through:through?new Date(through).toISOString():null,trades};
   const q=await this.pool.query("SELECT coalesce(sum(quote_raw),0)::text AS volume,count(*) FILTER(WHERE side='buy')::int AS buys,count(*) FILTER(WHERE side='sell')::int AS sells,count(DISTINCT signature)::int AS transactions FROM token_market_trades WHERE network=$1 AND mint=$2 AND block_time>=$3",[network,mint,cutoff]);
   return {...none,complete:true,reason:null,through:new Date(through).toISOString(),volumeSol:Number(q.rows[0].volume)/1e9,buys:q.rows[0].buys,sells:q.rows[0].sells,transactions:q.rows[0].transactions,trades};
  }
  const all=[...this.trades].filter(([key])=>key.startsWith(network+':'+mint+':')).map(([,t])=>t),window=all.filter(t=>t.blockTime!*1000>=cutoff.getTime());
  if(!complete)return {...none,trades:all.sort((a,b)=>b.slot-a.slot).slice(0,20)};
  return {...none,complete:true,reason:null,through:new Date(through).toISOString(),volumeSol:Number(window.reduce((sum,t)=>sum+BigInt(t.quoteAmount),0n))/1e9,buys:window.filter(t=>t.side==='buy').length,sells:window.filter(t=>t.side==='sell').length,transactions:new Set(window.map(t=>t.signature)).size,trades:all.sort((a,b)=>b.slot-a.slot).slice(0,20)};
 }
}
