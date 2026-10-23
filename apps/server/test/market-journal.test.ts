import {describe,it,expect,vi} from 'vitest';
import {MarketJournal} from '../src/services/market-journal.js';
import {SolUsdReference} from '../src/services/sol-usd.js';
import type {MarketTrade} from '../src/chain/market-types.js';
const now=Date.parse('2026-10-23T20:00:00Z');
const trade=(signature='sig',eventIndex=0):MarketTrade=>({signature,eventIndex,pool:'pool',venue:'bonding_curve',slot:1,blockTime:now/1000-10,side:'buy',user:'user',tokenAmount:'100',quoteAmount:'100000000',quoteMint:'SOL',creatorFee:'1',protocolFee:'1',buybackFee:'0',timestamp:now/1000-10});
describe('finalized market journal',()=>{
 it('counts distinct transactions separately from events and deduplicates replay across scans',async()=>{
  const j=new MarketJournal(undefined,()=>now),read=vi.fn(async()=>({trades:[trade(),trade('sig',1)],signatures:['sig'],oldestTime:now/1000-10,exhausted:true}));
  await j.sync('mainnet','mint',['pool'],read);await j.sync('mainnet','mint',['pool'],read);
  expect(await j.activity('mainnet','mint',['pool'])).toMatchObject({complete:true,volumeSol:0.2,buys:2,sells:0,transactions:1});
 });
 it('keeps partial coverage unavailable and resumes a failed page at the same cursor',async()=>{
  const j=new MarketJournal(undefined,()=>now),read=vi.fn(async()=>({trades:[trade()],signatures:['sig'],oldestTime:now/1000-10,exhausted:false}));
  await j.sync('mainnet','mint',['pool'],read);expect(await j.activity('mainnet','mint',['pool'])).toMatchObject({complete:false,volumeSol:null,buys:null});
  await expect(j.sync('mainnet','mint',['pool'],async()=>{throw Error('rate limited')})).rejects.toThrow();
  const finish=vi.fn(async()=>({trades:[],signatures:[],oldestTime:null,exhausted:true}));await j.sync('mainnet','mint',['pool'],finish);
  expect(finish).toHaveBeenCalledWith('pool','sig',undefined);expect(await j.activity('mainnet','mint',['pool'])).toMatchObject({complete:true,volumeSol:0.1});
 });
 it('reports verified zero only for complete empty history and expires stale coverage',async()=>{
  let clock=now;const j=new MarketJournal(undefined,()=>clock);await j.sync('mainnet','mint',['pool'],async()=>({trades:[],signatures:[],oldestTime:null,exhausted:true}));
  expect(await j.activity('mainnet','mint',['pool'])).toMatchObject({complete:true,volumeSol:0,transactions:0});clock+=180001;
  expect(await j.activity('mainnet','mint',['pool'])).toMatchObject({complete:false,volumeSol:null});
 });
 it('requires coverage of both venues after graduation and applies rolling-window boundaries',async()=>{
  const j=new MarketJournal(undefined,()=>now);await j.sync('mainnet','mint',['pool'],async()=>({trades:[{...trade(),blockTime:now/1000-86401}],signatures:['sig'],oldestTime:now/1000-86401,exhausted:false}));
  expect(await j.activity('mainnet','mint',['pool'])).toMatchObject({complete:true,volumeSol:0});expect((await j.activity('mainnet','mint',['pool','amm'])).complete).toBe(false);
 });
 it('does not create production tables or pretend memory indexing is durable when schema is absent',async()=>{
  const query=vi.fn(async(_sql:string)=>({rows:[{ready:false}]})),j=new MarketJournal({query} as never,()=>now),read=vi.fn();await j.sync('mainnet','mint',['pool'],read);
  expect(read).not.toHaveBeenCalled();expect(query.mock.calls[0]?.[0]).toContain('to_regclass');expect(await j.activity('mainnet','mint',['pool'])).toMatchObject({complete:false,durable:false,volumeSol:null});
 });
});
it('caches a fresh real USD reference and rejects stale, future, malformed and zero prices',async()=>{
 const fetcher=vi.fn(async()=>Response.json({price:'103.5',time:new Date(now).toISOString()})),r=new SolUsdReference(fetcher,()=>now);
 expect(await r.read()).toMatchObject({price:103.5,source:'coinbase'});await r.read();expect(fetcher).toHaveBeenCalledOnce();
 for(const data of [{price:'0',time:new Date(now).toISOString()},{price:'1',time:new Date(now-120001).toISOString()},{price:'1',time:new Date(now+31000).toISOString()},{price:'NaN',time:new Date(now).toISOString()}])expect(await new SolUsdReference(async()=>Response.json(data),()=>now).read()).toBeNull();
});
