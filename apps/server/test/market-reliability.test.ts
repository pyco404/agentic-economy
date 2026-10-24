import{expect,it,vi}from'vitest';
import{MarketJournal}from'../src/services/market-journal.js';
import type{MarketPage,MarketTrade}from'../src/chain/market-types.js';
const now=Date.parse('2026-10-24T00:00:00Z');
const trade=(signature:string,pool='pool'):MarketTrade=>({signature,eventIndex:0,pool,venue:'pumpswap',slot:1,blockTime:now/1000-10,side:'buy',user:'u',tokenAmount:'1',quoteAmount:'100000000',quoteMint:'SOL',creatorFee:'0',protocolFee:'0',buybackFee:'0',timestamp:now/1000-10});
const page=(signature:string,exhausted=false,pool='pool'):MarketPage=>({trades:[trade(signature,pool)],signatures:[signature],oldestTime:now/1000-10,exhausted});
it('keeps live progress committed when history fails, then resumes history without double counting',async()=>{
 const journal=new MarketJournal(undefined,()=>now);await journal.sync('net','mint',['pool'],async()=>page('initial'),'live');
 await expect(journal.sync('net','mint',['pool'],async(_a,_b,_u,lane)=>{if(lane==='history')throw Error('429');return page('new',true);})).rejects.toThrow();
 expect((await journal.activity('net','mint',['pool'])).trades.map(t=>t.signature)).toEqual(expect.arrayContaining(['initial','new']));
 const finish=vi.fn(async()=>page('old',true));await journal.sync('net','mint',['pool'],finish,'history');expect(finish).toHaveBeenCalledWith('pool','initial',undefined,'history');
 expect(await journal.activity('net','mint',['pool'])).toMatchObject({complete:true,transactions:3,volumeSol:0.3});
 await journal.sync('net','mint',['pool'],async()=>page('new',true),'live');expect((await journal.activity('net','mint',['pool'])).transactions).toBe(3);
});
it('continues another address after a failed address without advancing the failed cursor',async()=>{
 const j=new MarketJournal(undefined,()=>now);await expect(j.sync('net','mint',['bad','good'],async a=>{if(a==='bad')throw Error('unavailable');return page('good',true,a);},'live')).rejects.toThrow();
 expect((await j.activity('net','mint',['bad','good'])).complete).toBe(false);expect((await j.activity('net','mint',['good'])).transactions).toBe(1);expect(j.telemetry()).toMatchObject({errors:1,pages:1,consecutiveFailures:1});
});
it('commits a safe contiguous prefix but never steps past the failing detail',async()=>{
 const j=new MarketJournal(undefined,()=>now);await expect(j.sync('net','mint',['pool'],async()=>({...page('prefix'),deferredError:'transaction_unavailable'}),'live')).rejects.toThrow();
 const resume=vi.fn(async()=>page('next',true));await j.sync('net','mint',['pool'],resume,'history');expect(resume).toHaveBeenCalledWith('pool','prefix',undefined,'history');
 expect(await j.activity('net','mint',['pool'])).toMatchObject({complete:true,transactions:2,volumeSol:0.2});
});
it('withholds combined24h totals while head catchup or another venue is incomplete',async()=>{
 const j=new MarketJournal(undefined,()=>now);await j.sync('net','mint',['pool'],async()=>page('first',true),'live');
 await j.sync('net','mint',['pool'],async()=>page('new'),'live');expect(await j.activity('net','mint',['pool'])).toMatchObject({complete:false,volumeSol:null,transactions:null});
 await j.sync('net','mint',['pool'],async()=>({trades:[],signatures:[],oldestTime:null,exhausted:true}),'live');expect((await j.activity('net','mint',['pool'])).transactions).toBe(2);expect((await j.activity('net','mint',['pool','other'])).volumeSol).toBeNull();
});
it('detects conflicting evidence without replacing an existing trade',async()=>{
 const j=new MarketJournal(undefined,()=>now);await j.sync('net','mint',['pool'],async()=>page('first',true));await expect(j.sync('net','mint',['pool'],async()=>({...page('first',true),trades:[{...trade('first'),quoteAmount:'999'}]}),'live')).rejects.toThrow('Conflicting');expect((await j.activity('net','mint',['pool'])).volumeSol).toBe(0.1);
});
it('merges independent lane progress without clobbering concurrent checkpoints',async()=>{
 const j=new MarketJournal(undefined,()=>now);await j.sync('net','mint',['pool'],async()=>page('first'),'live');let release!:(p:MarketPage)=>void;let entered!:()=>void;const ready=new Promise<void>(r=>{entered=r;});
 const live=j.sync('net','mint',['pool'],async()=>{entered();return new Promise<MarketPage>(r=>{release=r;});},'live');await ready;
 await j.sync('net','mint',['pool'],async()=>page('old',true),'history');release(page('new',true));await live;
 expect(j.metrics.conflicts).toBe(0);expect((await j.activity('net','mint',['pool'])).trades.map(t=>t.signature)).toContain('new');
 const retry=vi.fn(async()=>page('new',true));await j.sync('net','mint',['pool'],retry,'live');expect(retry).toHaveBeenCalledWith('pool',undefined,'new','live');expect((await j.activity('net','mint',['pool'])).transactions).toBe(3);
});
it('keeps persistent history failures visible even when live pages succeed',async()=>{
 const j=new MarketJournal(undefined,()=>now);await j.sync('net','mint',['pool'],async()=>page('seed'),'live');
 for(let n=0;n<3;n++){await expect(j.sync('net','mint',['pool'],async()=>{throw Error('unavailable');},'history')).rejects.toThrow();await j.sync('net','mint',['pool'],async()=>({trades:[],signatures:[],oldestTime:null,exhausted:true}),'live');}
 expect(j.telemetry().consecutiveFailures).toBe(3);
});
it('counts consecutive partial page failures even when their safe prefixes commit',async()=>{
 const j=new MarketJournal(undefined,()=>now);
 for(let n=0;n<3;n++)await expect(j.sync('net','mint',['pool'],async()=>({...page(`prefix${n}`),deferredError:'transaction_unavailable'}),'live')).rejects.toThrow();
 expect(j.telemetry().consecutiveFailures).toBe(3);expect((await j.activity('net','mint',['pool'])).trades).toHaveLength(3);expect((await j.activity('net','mint',['pool'])).complete).toBe(false);
});
