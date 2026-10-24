import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {describe,it,expect} from 'vitest';
import {MarketJournal} from '../src/services/market-journal.js';
import type {MarketTrade} from '../src/chain/market-types.js';
const url=process.env.MARKET_TEST_DATABASE_URL;
describe.skipIf(!url)('isolated market database persistence',()=>{
 it('restores cursor state across process objects, deduplicates events and rolls back failed page writes',async()=>{
  const pool=new pg.Pool({connectionString:url});
  try{
   const db=await pool.query('SELECT current_database() AS name');expect(db.rows[0].name).toMatch(/^aeco_market_.*_test$/);
   await pool.query(await readFile(new URL('../docs/sql/005_token_market.sql',import.meta.url),'utf8'));
   const now=Date.now(),trade:MarketTrade={signature:'sig',eventIndex:0,pool:'pool',venue:'bonding_curve',slot:1,blockTime:Math.floor(now/1000)-10,side:'buy',user:'user',tokenAmount:'100',quoteAmount:'100000000',quoteMint:'SOL',creatorFee:'1',protocolFee:'1',buybackFee:'0',timestamp:Math.floor(now/1000)-10};
   const page={trades:[trade],signatures:['sig'],oldestTime:trade.blockTime,exhausted:true};
   await new MarketJournal(pool,()=>now).sync('mainnet','mint',['pool'],async()=>page);
   const restarted=new MarketJournal(pool,()=>now);await restarted.sync('mainnet','mint',['pool'],async()=>page);
   expect(await restarted.activity('mainnet','mint',['pool'])).toMatchObject({complete:true,durable:true,transactions:1,buys:1,volumeSol:0.1});
   await expect(restarted.sync('mainnet','mint',['pool'],async()=>({...page,trades:[{...trade,signature:'new'},{...trade,quoteAmount:'1'}],signatures:['new','sig']}))).rejects.toThrow(/Conflicting/);
   expect((await pool.query('SELECT count(*)::int AS n FROM token_market_trades')).rows[0].n).toBe(1);
   const restored=new MarketJournal(pool,()=>now);expect(await restored.activity('mainnet','mint',['pool'])).toMatchObject({transactions:1,volumeSol:0.1});
  }finally{await pool.end();}
 });
});

describe.skipIf(!url)('short transactions and independent durable checkpoints',()=>{
 it('holds no transaction across RPC, rejects stale CAS writes, and preserves state across a real child-process restart',async()=>{
  const {execFile}=await import('node:child_process'),{promisify}=await import('node:util');
  const pool=new pg.Pool({connectionString:url,application_name:'aeco-market-network-gap-test'}),mint='cas-mint',now=Date.now();
  const event=(signature:string):MarketTrade=>({signature,eventIndex:0,pool:'cas-pool',venue:'pumpswap',slot:1,blockTime:Math.floor(now/1000),side:'buy',user:'u',tokenAmount:'1',quoteAmount:'100000000',quoteMint:'SOL',creatorFee:'0',protocolFee:'0',buybackFee:'0',timestamp:Math.floor(now/1000)});
  const page=(signature:string)=>({trades:[event(signature)],signatures:[signature],oldestTime:Math.floor(now/1000),exhausted:true});
  let release!:(p:ReturnType<typeof page>)=>void;let entered!:()=>void;const gate=new Promise<void>(r=>{entered=r;});const first=new MarketJournal(pool,()=>now),second=new MarketJournal(pool,()=>now);
  try{
   const pending=first.sync('net',mint,['cas-pool'],async()=>{entered();return new Promise<ReturnType<typeof page>>(r=>{release=r;});},'live');await gate;
   const state=await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='aeco-market-network-gap-test' AND state='idle in transaction'");expect(state.rows[0].n).toBe(0);
   await second.sync('net',mint,['cas-pool'],async()=>page('winner'),'live');release(page('stale'));await pending;expect(first.metrics.conflicts).toBe(1);expect((await first.activity('net',mint,['cas-pool'])).trades.map(t=>t.signature)).toEqual(['winner']);
   const code=`import pg from 'pg';import {MarketJournal}from${JSON.stringify(new URL('../src/services/market-journal.ts',import.meta.url).href)};const p=new pg.Pool({connectionString:process.env.MARKET_TEST_DATABASE_URL});const j=new MarketJournal(p);console.log(JSON.stringify(await j.activity('net','cas-mint',['cas-pool'])));await p.end();`;
   const child=await promisify(execFile)(process.execPath,['--conditions=@agentic-economy/source','--import',new URL('../node_modules/tsx/dist/loader.mjs',import.meta.url).href,'--input-type=module','-e',code],{env:{...process.env,MARKET_TEST_DATABASE_URL:url},timeout:30000});expect(JSON.parse(child.stdout)).toMatchObject({complete:true,durable:true,transactions:1,volumeSol:0.1});
  }finally{await pool.end();}
 });
 it('upgrades existing v1 cursor JSON without rewriting events or losing pending live/history work',async()=>{
  const pool=new pg.Pool({connectionString:url}),now=Date.now();const old={head:null,before:'history-before',scanHead:'history-anchor',started:now-1000,complete:false,through:null,floor:null,liveHead:'live-anchor',liveThrough:now-500,liveBefore:'live-before',liveScanHead:'pending-live-head',liveStarted:now-100};
  try{await pool.query('INSERT INTO token_market_cursors(network,mint,address,doc)VALUES($1,$2,$3,$4)',['net','legacy-mint','legacy-pool',JSON.stringify(old)]);const journal=new MarketJournal(pool,()=>now),seen:Array<unknown[]>=[];
   await journal.sync('net','legacy-mint',['legacy-pool'],async(...args)=>{seen.push(args);return{trades:[],signatures:[],oldestTime:null,exhausted:true};},'live');expect(seen[0]).toEqual(['legacy-pool','live-before','live-anchor','live']);
   const persisted=(await pool.query("SELECT doc FROM token_market_cursors WHERE mint='legacy-mint'")).rows[0].doc;expect(persisted).toMatchObject({v:2,head:'pending-live-head',before:'history-before',complete:false});
   await journal.sync('net','legacy-mint',['legacy-pool'],async()=>({trades:[],signatures:[],oldestTime:null,exhausted:true}),'history');expect(await journal.activity('net','legacy-mint',['legacy-pool'])).toMatchObject({complete:true,volumeSol:0,transactions:0});
  }finally{await pool.end();}
 });
});

describe.skipIf(!url)('independent lane commits in PostgreSQL',()=>{
 it('merges a concurrent completed history window with live progress atomically',async()=>{
  const pool=new pg.Pool({connectionString:url}),now=Date.now(),j1=new MarketJournal(pool,()=>now),j2=new MarketJournal(pool,()=>now);
  const p=(sig:string,exhausted:boolean)=>({trades:[{signature:sig,eventIndex:0,pool:'merge-pool',venue:'pumpswap' as const,slot:1,blockTime:Math.floor(now/1000),side:'buy' as const,user:'u',tokenAmount:'1',quoteAmount:'100000000',quoteMint:'SOL',creatorFee:'0',protocolFee:'0',buybackFee:'0',timestamp:Math.floor(now/1000)}],signatures:[sig],oldestTime:Math.floor(now/1000),exhausted});
  let release!:(value:ReturnType<typeof p>)=>void;let entered!:()=>void;const gate=new Promise<void>(r=>{entered=r;});
  try{await j1.sync('net','merge-mint',['merge-pool'],async()=>p('seed',false),'live');const live=j1.sync('net','merge-mint',['merge-pool'],async()=>{entered();return new Promise<ReturnType<typeof p>>(r=>{release=r;});},'live');await gate;
   await j2.sync('net','merge-mint',['merge-pool'],async()=>p('history',true),'history');release(p('new',true));await live;
   expect(j1.metrics.conflicts).toBe(0);expect(await j1.activity('net','merge-mint',['merge-pool'])).toMatchObject({complete:true,transactions:3,volumeSol:0.3});const doc=(await pool.query("SELECT doc FROM token_market_cursors WHERE mint='merge-mint'")).rows[0].doc;expect(doc.head).toBe('new');expect(doc.complete).toBe(true);expect(doc.before).toBeUndefined();
  }finally{await pool.end();}
 });
});

describe.skipIf(!url)('legacy rollback cursor interoperability',()=>{
 it('keeps pending live work visible to the old coverage reader and adopts an old worker checkpoint',async()=>{
  const pool=new pg.Pool({connectionString:url}),now=Date.now(),j=new MarketJournal(pool,()=>now);
  const event=(sig:string):MarketTrade=>({signature:sig,eventIndex:0,pool:'rollback-pool',venue:'pumpswap',slot:1,blockTime:Math.floor(now/1000),side:'buy',user:'u',tokenAmount:'1',quoteAmount:'100000000',quoteMint:'SOL',creatorFee:'0',protocolFee:'0',buybackFee:'0',timestamp:Math.floor(now/1000)});
  const page=(sig:string,exhausted:boolean)=>({trades:[event(sig)],signatures:[sig],oldestTime:Math.floor(now/1000),exhausted});
  try{await j.sync('net','rollback-mint',['rollback-pool'],async()=>page('base',true),'live');await j.sync('net','rollback-mint',['rollback-pool'],async()=>page('pending-head',false),'live');
   const doc=(await pool.query("SELECT doc FROM token_market_cursors WHERE mint='rollback-mint'")).rows[0].doc;
   expect(doc).toMatchObject({complete:true,before:'pending-head',scanHead:'pending-head',liveBefore:'pending-head'});expect(doc.complete&&!doc.before).toBe(false);
   // Exact legacy completion field updates, leaving the unknown v2 fields in place.
   doc.head=doc.scanHead;doc.through=now;delete doc.before;delete doc.scanHead;
   await pool.query('UPDATE token_market_cursors SET doc=$1 WHERE mint=$2',[JSON.stringify(doc),'rollback-mint']);
   const seen:Array<unknown[]>=[];await new MarketJournal(pool,()=>now).sync('net','rollback-mint',['rollback-pool'],async(...args)=>{seen.push(args);return page('latest',true);},'live');
   expect(seen[0]).toEqual(['rollback-pool',undefined,'pending-head','live']);expect(await j.activity('net','rollback-mint',['rollback-pool'])).toMatchObject({complete:true,transactions:3,volumeSol:0.3});
  }finally{await pool.end();}
 });
});
