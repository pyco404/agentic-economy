import {describe,it,expect,vi} from 'vitest';
import {Keypair} from '@solana/web3.js';
import {TokenMarket,TokenTrades,WRAPPED_SOL_MINT,type Community,type TokenLaunch} from '@agentic-economy/shared';
import {TokenMarketService} from '../src/services/token-market.js';
import {MemoryStore} from '../src/store/memory.js';
import {USDC_QUOTE_MINTS} from '../src/config.js';
import type {ChainGateway,ChainTrade} from '../src/chain/types.js';
import launchFixture from '../../../packages/shared/fixtures/launch.json' with {type:'json'};

const DEVNET='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',key=()=>Keypair.generate().publicKey.toBase58();
const sig=()=>Keypair.generate().secretKey.subarray(0,64).reduce((s,n)=>s+'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[n%58],'');

/** A confirmed, verified devnet platform launch and an RPC stub exposing the chain readers. */
async function fixture(quoteAsset:'SOL'|'USDC'='SOL'){
 const store=new MemoryStore(),mint=key(),signature=sig();
 const launch={...structuredClone(launchFixture.launch),mode:'devnet',status:'confirmed',mint,signature,communityId:'com_chain001',
  execution:{draftId:'00000000-0000-4000-8000-000000000001',draftVersion:2,transaction:'AA==',lastValidBlockHeight:1,genesisHash:DEVNET,network:'devnet',quoteAsset,
   ...(quoteAsset==='USDC'?{quoteMint:USDC_QUOTE_MINTS.devnet}:{}),platformOrigin:'PLATFORM',initiator:'HUMAN'}} as unknown as TokenLaunch;
 await store.createLaunch(launch);
 vi.spyOn(store,'allCommunities').mockResolvedValue([{id:'com_chain001',mint,launchId:launch.id,launchSignature:signature} as Community]);
 const trade=(over:Partial<ChainTrade>={}):ChainTrade=>({signature:sig(),slot:500,blockTime:1_760_000_000,side:'buy',user:key(),tokenAmount:'3497882795867',quoteAmount:'100000000',quoteMint:WRAPPED_SOL_MINT,creatorFee:'300000',timestamp:1_760_000_000,...over});
 const gateway={source:'solana_rpc' as const,getGenesisHash:vi.fn(async()=>DEVNET),
  getCurveProgress:vi.fn(async()=>({slot:510,complete:false,progressPct:12.34,quoteMint:WRAPPED_SOL_MINT})),
  getHolderCount:vi.fn(async()=>({slot:512,holders:19,exact:false})),
  getBlockTime:vi.fn(async()=>1_760_000_100),
  getRecentTrades:vi.fn(async()=>({slot:520,complete:true,trades:[trade(),trade({side:'sell',quoteMint:USDC_QUOTE_MINTS.devnet,quoteAmount:'2500000'}),trade({quoteMint:key()})]})),
 } as unknown as ChainGateway;
 return {store,gateway,mint,trade};
}

describe('on-chain Explore metrics for verified testing-network launches',()=>{
 it('reports holders, graduation progress and their Solana source and slot time, with no invented prices',async()=>{
  const f=await fixture(),fetcher=vi.fn(),m=TokenMarket.parse(await new TokenMarketService(f.store,f.gateway,'devnet',fetcher).snapshot(f.mint));
  expect(m).toMatchObject({status:'unavailable',priceUsd:null,volume24hUsd:null,marketCapUsd:null,liquidityUsd:null,
   holders:19,holdersLowerBound:true,graduation:'bonding_curve',graduationProgress:12.34,
   chain:{source:'solana_rpc',network:'devnet',slot:512,asOf:new Date(1_760_000_100_000).toISOString()}});
  expect(fetcher).not.toHaveBeenCalled(); // testing-network identities never go to public market providers
 });

 it('keeps graduation progress when holder enumeration is rate-limited',async()=>{
  const f=await fixture();(f.gateway.getHolderCount as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('429 Too Many Requests'));
  const m=await new TokenMarketService(f.store,f.gateway,'devnet',vi.fn()).snapshot(f.mint);
  expect(m).toMatchObject({holders:null,holdersLowerBound:false,graduationProgress:12.34,chain:{slot:510}});
 });

 it('refuses chain reads from a different network than the launch',async()=>{
  const f=await fixture();(f.gateway.getGenesisHash as ReturnType<typeof vi.fn>).mockResolvedValue('wrong-network');
  const s=new TokenMarketService(f.store,f.gateway,'devnet',vi.fn());
  expect((await s.snapshot(f.mint))).toMatchObject({holders:null,graduationProgress:null,chain:null});
  expect((await s.trades(f.mint))).toMatchObject({status:'unavailable',trades:[]});
  expect(f.gateway.getCurveProgress).not.toHaveBeenCalled();
 });

 it('lists recent verified trades in raw base units with their quote, skipping unknown quotes',async()=>{
  const f=await fixture(),t=TokenTrades.parse(await new TokenMarketService(f.store,f.gateway,'devnet').trades(f.mint));
  expect(t).toMatchObject({status:'available',source:'solana_rpc',slot:520,complete:true});
  expect(t.trades).toHaveLength(2);
  expect(t.trades[0]).toMatchObject({side:'buy',quoteAsset:'SOL',quoteDecimals:9,quoteAmount:'100000000',tokenAmount:'3497882795867',tokenDecimals:6,creatorFee:'300000'});
  expect(t.trades[1]).toMatchObject({side:'sell',quoteAsset:'USDC',quoteDecimals:6,quoteAmount:'2500000'});
 });

 it('caches trades, then serves the last verified trades as stale during an RPC outage, then unavailable',async()=>{
  const f=await fixture();let now=Date.now();const s=new TokenMarketService(f.store,f.gateway,'devnet',fetch,()=>now);
  await s.trades(f.mint);await s.trades(f.mint);
  expect(f.gateway.getRecentTrades).toHaveBeenCalledTimes(1);
  (f.gateway.getRecentTrades as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('429 Too Many Requests'));
  now+=31_000;expect(await s.trades(f.mint)).toMatchObject({status:'stale',trades:expect.arrayContaining([expect.objectContaining({side:'buy'})])});
  now+=400_000;expect(await s.trades(f.mint)).toMatchObject({status:'unavailable',trades:[],complete:false});
 });

 it('rejects tokens that are not verified platform launches',async()=>{
  const f=await fixture(),s=new TokenMarketService(f.store,f.gateway,'devnet');
  await expect(s.trades(key())).rejects.toMatchObject({code:'not_found'});
 });
});
