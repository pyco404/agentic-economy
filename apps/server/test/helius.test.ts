import sdk from '../src/chain/pump-sdk.cjs';
import {PublicKey as SolanaKey} from '@solana/web3.js';
import { EventEmitter } from 'node:events';
import type WebSocket from 'ws';
import { describe, expect, it, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { HeliusReadBudget, HeliusReader, HELIUS_GENESIS } from '../src/chain/helius.js';
import { SolanaRpcChain } from '../src/chain/solana.js';
import { heliusMarketChain } from '../src/chain/helius-market.js';
import { bondingCurvePda } from '../src/chain/pump.js';
import type { ChainGateway } from '../src/chain/types.js';
const key = () => Keypair.generate().publicKey.toBase58();
const setup = (reply: (method: string, params: Record<string, unknown>) => unknown, network: 'devnet' | 'mainnet-beta' = 'devnet') => {
  let time = 1_000_000;
  const budget = new HeliusReadBudget(() => time, async ms => { time += ms; });
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body));
    const result = b.method === 'getGenesisHash' ? HELIUS_GENESIS[network] : reply(b.method, b.params);
    return result instanceof Response ? result : Response.json({ jsonrpc: '2.0', id: b.id, result });
  }) as unknown as typeof fetch;
  return { reader: new HeliusReader('synthetic-test-key', network, budget, fetcher, () => time), fetcher, budget, advance: (ms: number) => { time += ms; } };
};

describe('Helius read-only transport', () => {
  it('uses fixed network endpoints, verifies genesis, preserves batch ids and blocks writes before requesting', async () => {
    const f = setup(() => ({context:{slot:100},value:0}));
    const response = await f.reader.fetch('https://not-a-provider.invalid',{body:JSON.stringify([{id:1,method:'getBalance',params:[]},{id:2,method:'getBalance',params:[]}])});
    expect(((await response.json()) as Array<{id:number}>).map(r=>r.id)).toEqual([1,2]);
    expect(vi.mocked(f.fetcher).mock.calls.every(([url])=>new URL(String(url)).hostname==='devnet.helius-rpc.com')).toBe(true);
    const count=vi.mocked(f.fetcher).mock.calls.length;
    await expect(f.reader.rpc('sendTransaction',['not-signed'])).rejects.toMatchObject({code:'unsupported'});
    expect(f.fetcher).toHaveBeenCalledTimes(count);
    expect(JSON.stringify(f.reader)).not.toContain('synthetic-test-key');
  });
  it('fails closed on wrong genesis and never propagates provider secrets/errors', async () => {
    const fetcher=vi.fn(async()=>Response.json({result:HELIUS_GENESIS['mainnet-beta']}));
    const reader=new HeliusReader('fake-key','devnet',new HeliusReadBudget(),fetcher);
    await expect(reader.rpc('getBalance',[])).rejects.toMatchObject({code:'wrong_network'});
    expect(fetcher).toHaveBeenCalledTimes(1);
    const f=setup(()=>Response.json({error:{code:-32001,message:'private URL api-key=never-show'}}));
    await expect(f.reader.rpc('getBalance',[])).rejects.toThrow('Helius read unauthorized');
    await expect(f.reader.rpc('getBalance',[])).rejects.not.toThrow('never-show');
  });
  it('retries transient errors once, opens a rate-limit cooldown, and does not retry unauthorized methods', async()=>{
    let failures=0;const f=setup(()=>++failures===1?new Response('secret',{status:503}):{context:{slot:1},value:0});
    await expect(f.reader.rpc('getBalance',[])).resolves.toMatchObject({value:0});expect(failures).toBe(2);
    const throttled=setup(()=>new Response('hidden',{status:429,headers:{'Retry-After':'2'}}));
    await expect(throttled.reader.rpc('getBalance',[])).rejects.toMatchObject({code:'rate_limited'});
    const count=vi.mocked(throttled.fetcher).mock.calls.length;
    await expect(throttled.reader.rpc('getBalance',[])).rejects.toMatchObject({code:'rate_limited'});expect(throttled.fetcher).toHaveBeenCalledTimes(count);
    throttled.advance(3000);await expect(throttled.reader.rpc('getBalance',[])).rejects.toMatchObject({code:'rate_limited'});
  });
  it('requires matching genesis before falling back to the existing Treasury endpoint',async()=>{
    const f=setup(()=>new Response('no',{status:403}));
    const good=vi.fn(async(_url:unknown,init?:RequestInit)=>Response.json({result:JSON.parse(String(init?.body)).method==='getGenesisHash'?HELIUS_GENESIS.devnet:{context:{slot:1},value:12}}));
    const r=await f.reader.withFallback('https://existing.invalid',good)('https://placeholder.invalid',{body:JSON.stringify({id:1,method:'getBalance',params:[]})});
    expect(await r.json()).toMatchObject({result:{value:12}});
    await expect(f.reader.withFallback('https://existing.invalid',vi.fn(async()=>Response.json({result:'wrong-network'})))('https://placeholder.invalid',{body:JSON.stringify({id:1,method:'getBalance',params:[]})})).rejects.toMatchObject({code:'unavailable'});
  });
  it('enforces a per-minute weighted credit budget rather than requesting unbounded DAS pages',async()=>{
    const f=setup(()=>({}));
    // 1 genesis credit + 11 DAS reads (110). The next call would exceed 120.
    for(let n=0;n<11;n++)await f.reader.rpc('getAsset',{id:key()});
    await expect(f.reader.rpc('getAsset',{id:key()})).rejects.toMatchObject({code:'budget'});
  });
});

describe('Helius holder index completeness',()=>{
  it('deduplicates token accounts and owners, sums raw amounts exactly, excludes zero balances and the curve, and caches concurrent scans',async()=>{
    const mint=key(),owner=key(),a=key(),b=key();let page=0;
    const f=setup(()=>++page===1?{last_indexed_slot:10,cursor:'next',token_accounts:[{address:a,mint,owner,amount:'5'},{address:key(),mint,owner:key(),amount:0},{address:key(),mint,owner:bondingCurvePda(mint),amount:999}]}:page===2?{last_indexed_slot:10,cursor:'last',token_accounts:[{address:a,mint,owner,amount:'5'},{address:b,mint,owner,amount:'7'}]}:{last_indexed_slot:10,cursor:null,token_accounts:[]});
    const [x,y]=await Promise.all([f.reader.holderCount(mint),f.reader.holderCount(mint)]);
    expect(x).toEqual(y);expect(x).toMatchObject({holders:1,exact:true,index:{complete:true,scannedAccounts:4,owners:[{address:owner,amount:'12'}]}});
    await f.reader.holderCount(mint);expect(page).toBe(3);
  });
  it('never claims exact counts across mixed index slots or conflicting account snapshots',async()=>{
    const mint=key(),address=key(),owner=key();let page=0;
    const f=setup(()=>++page===1?{last_indexed_slot:10,cursor:'next',token_accounts:[{address,mint,owner,amount:1}]}:{last_indexed_slot:11,cursor:null,token_accounts:[{address,mint,owner,amount:2}]});
    expect(await f.reader.holderCount(mint)).toMatchObject({holders:null,exact:false,index:{complete:false}});
  });
  it('returns a lower bound on interrupted/repeating cursor scans, without turning failure into zero',async()=>{
    const mint=key();let page=0;
    const f=setup(()=>++page===1?{last_indexed_slot:10,cursor:'next',token_accounts:[{address:key(),mint,owner:key(),amount:1}]}:new Response('no',{status:403}));
    expect(await f.reader.holderCount(mint)).toMatchObject({holders:1,exact:false});
    const failed=setup(()=>new Response('not supported',{status:403}));await expect(failed.reader.holderCount(mint)).rejects.toMatchObject({code:'unauthorized'});
    const repeat=setup(()=>({last_indexed_slot:10,cursor:'same',token_accounts:[{address:key(),mint,owner:key(),amount:1}]}));
    expect(await repeat.reader.holderCount(mint)).toMatchObject({exact:false,index:{reason:expect.stringContaining('cursor')}});
  });
  it('reports a complete empty scan as zero, rejects wrong mints and unsafe JSON amounts',async()=>{
    const mint=key(),empty=setup(()=>({last_indexed_slot:10,token_accounts:[]}));expect(await empty.reader.holderCount(mint)).toMatchObject({holders:0,exact:true});
    const wrong=setup(()=>({last_indexed_slot:10,token_accounts:[{address:key(),mint:key(),owner:key(),amount:1}]}));await expect(wrong.reader.holderCount(mint)).rejects.toThrow();
    const unsafe=setup(()=>({last_indexed_slot:10,token_accounts:[{address:key(),mint,owner:key(),amount:2**60}]}));await expect(unsafe.reader.holderCount(mint)).rejects.toThrow();
  });
  it('keeps indexed metadata informational and rejects mint substitution',async()=>{
    const mint=key(),good=setup(()=>({id:mint,content:{metadata:{name:'Indexed token',symbol:'TOK'}}}));
    expect(await good.reader.metadata(mint)).toMatchObject({mint,name:'Indexed token',symbol:'TOK',source:'helius_das'});
    const wrong=setup(()=>({id:key()}));expect(await wrong.reader.metadata(mint)).toBeNull();
  });
});

it('keeps launch-critical methods on the original gateway and verifies network before market fallback',async()=>{
  const mint=key(),f=setup(()=>new Response('unavailable',{status:403}));
  const original={source:'solana_rpc',getGenesisHash:vi.fn(async()=>HELIUS_GENESIS.devnet),getHolderCount:vi.fn(async()=>({slot:1,holders:2,exact:false})),submitLaunchTransaction:vi.fn(async()=> 'original-test-signature')} as unknown as ChainGateway;
  const chain=heliusMarketChain(original,f.reader);
  expect(await chain.getHolderCount!(mint)).toMatchObject({holders:2});expect(original.getHolderCount).toHaveBeenCalledTimes(1);
  expect(await chain.submitLaunchTransaction!('synthetic')).toBe('original-test-signature');
  vi.mocked(original.getGenesisHash!).mockResolvedValue('wrong-network');await expect(chain.getHolderCount!(key())).rejects.toThrow(/network/);
});

 it('never reports exact fallback holders when a largest-account owner cannot be decoded', async()=>{
  const mint=key(),chain=new SolanaRpcChain('https://test.invalid');
  const connection=(chain as unknown as {conn:{getProgramAccounts:()=>unknown;getTokenLargestAccounts:()=>unknown;getMultipleParsedAccounts:()=>unknown}}).conn;
  vi.spyOn(connection,'getProgramAccounts').mockRejectedValue({code:-32010});
  vi.spyOn(connection,'getTokenLargestAccounts').mockResolvedValue({context:{slot:1},value:[{address:key(),amount:'1'},{address:key(),amount:'1'}]});
  vi.spyOn(connection,'getMultipleParsedAccounts').mockResolvedValue({value:[{data:{parsed:{info:{owner:key()}}}},null]});
  expect(await chain.getHolderCount(mint)).toMatchObject({holders:1,exact:false});
 });

it('uses finalized mint-filtered subscriptions only as hints and closes them on abort', async () => {
  const socket = new EventEmitter() as EventEmitter & { send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  socket.send = vi.fn(); socket.close = vi.fn();
  const open = vi.fn(() => socket as unknown as WebSocket);
  const f = setup(() => null); const abort = new AbortController(); const hint = vi.fn(); const mint = key();
  f.reader.watchTokenAccounts(mint, hint, abort.signal, open);
  await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
  socket.emit('open');
  const requests = socket.send.mock.calls.map(([raw]) => JSON.parse(raw));
  expect(requests).toHaveLength(2);
  for (const request of requests) {
    expect(request.method).toBe('programSubscribe');
    expect(request.params[1]).toMatchObject({ commitment: 'finalized', filters: [{ memcmp: { offset: 0, bytes: mint } }] });
  }
  socket.emit('message', JSON.stringify({ method: 'programNotification', params: { result: { context: { slot: 9 } } } }));
  expect(hint).toHaveBeenCalledOnce();
  socket.emit('message', 'malformed'); expect(hint).toHaveBeenCalledOnce();
  abort.abort(); expect(socket.close).toHaveBeenCalledOnce();
});

it('does not invalidate holder balances when only the empty terminal page advances its index slot',async()=>{
 const mint=key();let page=0;const f=setup(()=>++page===1?{last_indexed_slot:10,cursor:'last',token_accounts:[{address:key(),mint,owner:key(),amount:'1'}]}:{last_indexed_slot:11,token_accounts:[]});
 expect(await f.reader.holderCount(mint)).toMatchObject({slot:10,holders:1,exact:true,index:{complete:true}});
});

it('excludes canonical AMM liquidity inventory from holder owners after graduation',async()=>{
 const mint=key(),owner=key(),pool=sdk.canonicalPumpPoolPda(new SolanaKey(mint)).toBase58();const f=setup(()=>({last_indexed_slot:10,token_accounts:[{address:key(),mint,owner:pool,amount:'100'},{address:key(),mint,owner,amount:'1'}]}));
 expect(await f.reader.holderCount(mint)).toMatchObject({holders:1,exact:true,index:{owners:[{address:owner,amount:'1'}]}});
});

it('keeps routine polling on the existing verified RPC and reserves Helius reads for fallback',async()=>{
 const f=setup(()=>101),original={source:'solana_rpc',getGenesisHash:vi.fn(async()=>HELIUS_GENESIS.devnet),getBlockTime:vi.fn(async()=>100)} as unknown as ChainGateway;
 const chain=heliusMarketChain(original,f.reader);expect(await chain.getBlockTime!(10)).toBe(100);expect(f.fetcher).not.toHaveBeenCalled();
 vi.mocked(original.getBlockTime!).mockRejectedValue(Error('RPC outage'));expect(await chain.getBlockTime!(10)).toBe(101);
 vi.mocked(original.getBlockTime!).mockResolvedValue(null);expect(await chain.getBlockTime!(10)).toBe(101);
});

it('caches holder enumeration for five minutes without inventing a new observation timestamp',async()=>{
 const mint=key(),f=setup(()=>({last_indexed_slot:10,token_accounts:[]})),first=await f.reader.holderCount(mint),calls=vi.mocked(f.fetcher).mock.calls.length;
 f.advance(61000);expect(await f.reader.holderCount(mint)).toEqual(first);expect(f.fetcher).toHaveBeenCalledTimes(calls);
 f.advance(240000);const next=await f.reader.holderCount(mint);expect(next.index.fetchedAt).not.toBe(first.index.fetchedAt);
});
