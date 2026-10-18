import {describe,it,expect,vi} from 'vitest';
import {Keypair} from '@solana/web3.js';
import {WRAPPED_SOL_MINT,PUMP_PROGRAM_ID,type Community,type TokenLaunch} from '@agentic-economy/shared';
import {TokenMarketService} from '../src/services/token-market.js';
import {MemoryStore} from '../src/store/memory.js';
import {MockChain} from '../src/chain/mock.js';
import {PUMP_IX,sharingConfigPda} from '../src/chain/pump.js';
import launchFixture from '../../../packages/shared/fixtures/launch.json' with {type:'json'};
const key=()=>Keypair.generate().publicKey.toBase58();
async function fixture(){
 const store=new MemoryStore(),chain=new MockChain(),mint=key(),creator=key(),platform=key(),agent=key();const signature=chain.simulateLaunch({mint,launcherWallet:creator,platformTreasury:platform,agentRewardsTreasury:agent});
 const launch={...structuredClone(launchFixture.launch),mode:'production',mint,launcherWallet:creator,signature,communityId:'com_market01',fees:{...launchFixture.launch.fees,platformTreasury:platform,creatorFeeSplit:{...launchFixture.launch.fees.creatorFeeSplit,agentRewardsTreasury:agent}}} as TokenLaunch;
 await store.createLaunch(launch);
 const community={id:'com_market01',mint,launchId:launch.id,launchSignature:signature} as Community;vi.spyOn(store,'allCommunities').mockResolvedValue([community]);
 const tx=(await chain.getTransaction(signature))!;const str=(s:string)=>{const b=Buffer.from(s),n=Buffer.alloc(4);n.writeUInt32LE(b.length);return Buffer.concat([n,b]);};

 const create=tx.instructions.find(i=>i.programId===PUMP_PROGRAM_ID)!;const {PublicKey}=await import('@solana/web3.js');create.accounts=[mint,'','','','',creator];create.dataBase64=Buffer.concat([Buffer.from(PUMP_IX.createV2,'hex'),str(launch.draft.name),str(launch.draft.symbol),str(launch.draft.metadataUri),new PublicKey(creator).toBuffer(),Buffer.from([0])]).toString('base64');
 const gateway={source:'solana_rpc' as const,getGenesisHash:async()=> '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',getTransaction:async()=>tx,getFeeRoutingState:(mint:string)=>chain.getFeeRoutingState(mint),getTokenBalance:chain.getTokenBalance.bind(chain),buildLaunchTransaction:chain.buildLaunchTransaction.bind(chain),listSignaturesForAddress:chain.listSignaturesForAddress.bind(chain),verifyMarketPool:vi.fn(async()=>true)};
 const pool=key(),pair={chainId:'solana',dexId:'pumpswap',pairAddress:pool,baseToken:{address:mint},quoteToken:{address:WRAPPED_SOL_MINT},priceUsd:'0.000123',volume:{h24:12345},marketCap:123000,fdv:999999,liquidity:{usd:700},priceChange:{h24:-3.5},txns:{h24:{buys:10,sells:5}}};
 return {store,gateway,mint,pair,community,launch,pool,sc:sharingConfigPda(mint)};
}
describe('verified market sources',()=>{
 it('returns attributed pair metrics, real nulls and retrieval time; coalesces and caches requests',async()=>{const f=await fixture(),fetcher=vi.fn(async()=>new Response(JSON.stringify([f.pair]))),s=new TokenMarketService(f.store,f.gateway,'mainnet-beta',fetcher);const [a,b]=await Promise.all([s.snapshot(f.mint),s.snapshot(f.mint)]);expect(a).toEqual(b);expect(a).toMatchObject({status:'available',source:'dexscreener',quoteAsset:'SOL',priceUsd:0.000123,marketCapUsd:123000,holders:null,sourceAsOf:null,graduation:'graduated'});expect(fetcher).toHaveBeenCalledTimes(1);expect(f.gateway.verifyMarketPool).toHaveBeenCalledWith(f.pool,f.mint,WRAPPED_SOL_MINT);});
 it('accepts only canonical SOL/USDC pairs and never treats fdv as market cap',async()=>{const f=await fixture();const s=new TokenMarketService(f.store,f.gateway,'mainnet-beta',async()=>new Response(JSON.stringify([{...f.pair,marketCap:undefined,quoteToken:{address:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'}}])));expect(await s.snapshot(f.mint)).toMatchObject({quoteAsset:'USDC',marketCapUsd:null});});
 it('rejects wrong token, chain, quote, pool and fabricated launch origins',async()=>{const f=await fixture();for(const bad of [{...f.pair,baseToken:{address:key()}},{...f.pair,chainId:'ethereum'},{...f.pair,quoteToken:{address:key()}}]){const s=new TokenMarketService(f.store,f.gateway,'mainnet-beta',async()=>new Response(JSON.stringify([bad])));expect((await s.snapshot(f.mint)).status).toBe('unavailable');}f.gateway.verifyMarketPool.mockResolvedValue(false);expect((await new TokenMarketService(f.store,f.gateway,'mainnet-beta',async()=>new Response(JSON.stringify([f.pair]))).snapshot(f.mint)).status).toBe('unavailable');f.community.launchSignature='wrong';await expect(new TokenMarketService(f.store,f.gateway,'mainnet-beta').snapshot(f.mint)).rejects.toThrow(/platform/);});
 it('does not send demo/devnet/localnet token identities to public market providers',async()=>{const f=await fixture(),fetcher=vi.fn();for(const network of ['demo','devnet','localnet'] as const)expect((await new TokenMarketService(f.store,f.gateway,network,fetcher).snapshot(f.mint)).status).toBe('unavailable');expect(fetcher).not.toHaveBeenCalled();});
 it('rejects wrong RPC genesis without querying providers',async()=>{const f=await fixture(),fetcher=vi.fn();f.gateway.getGenesisHash=async()=> 'wrong';expect((await new TokenMarketService(f.store,f.gateway,'mainnet-beta',fetcher).snapshot(f.mint)).reason).toContain('identity');expect(fetcher).not.toHaveBeenCalled();});
 it('marks failed refreshes stale briefly then unavailable; excludes fabricated missing zeros',async()=>{const f=await fixture();let now=Date.now(),fail=false;const s=new TokenMarketService(f.store,f.gateway,'mainnet-beta',async()=>{if(fail)throw new Error('outage');return new Response(JSON.stringify([{...f.pair,volume:{},txns:null,priceUsd:'invalid'}]));},()=>now);expect(await s.snapshot(f.mint)).toMatchObject({volume24hUsd:null,buys24h:null,priceUsd:null});fail=true;now+=31000;expect((await s.snapshot(f.mint)).status).toBe('stale');now+=90000;expect((await s.snapshot(f.mint)).status).toBe('unavailable');});
 it('loads only the checked pool history, sorts candles and handles provider failure',async()=>{const f=await fixture(),fetcher=vi.fn(async(url:string|URL|Request)=>new Response(JSON.stringify(String(url).includes('ohlcv')?{data:{attributes:{ohlcv_list:[[200,1,3,1,2,12],[100,1,2,1,1.5,10]]}}}:[f.pair]))),s=new TokenMarketService(f.store,f.gateway,'mainnet-beta',fetcher);expect((await s.history(f.mint)).candles.map(c=>c.time)).toEqual([100,200]);expect(fetcher.mock.calls[1]![0]).toContain(f.pool);});
});

it('keeps an indexed verified bonding-curve market distinct from graduation',async()=>{
 const f=await fixture(),s=new TokenMarketService(f.store,f.gateway,'mainnet-beta',async()=>new Response(JSON.stringify([{...f.pair,dexId:'pumpfun'}])));
 expect(await s.snapshot(f.mint)).toMatchObject({status:'available',graduation:'bonding_curve',graduationProgress:null});
});

it('serves schema-valid unavailable data for demo launches and rejects unknown/invalid public mints',async()=>{
 const {makeEnv,login,launch}=await import('./helpers.js');const {TokenMarket,TokenHistory}=await import('@agentic-economy/shared');const env=await makeEnv();
 try{const user=await login(env.app),created=await launch(env.app,user),mint=created.confirm.json().launch.mint as string;
  const response=await env.app.inject({method:'GET',url:`/api/v1/token-markets/${mint}`});expect(response.statusCode).toBe(200);expect(TokenMarket.parse(response.json())).toMatchObject({status:'unavailable',network:'demo',priceUsd:null});
  const history=await env.app.inject({method:'GET',url:`/api/v1/token-markets/${mint}/history`});expect(TokenHistory.parse(history.json()).candles).toEqual([]);
  expect((await env.app.inject({method:'GET',url:`/api/v1/token-markets/${key()}`})).statusCode).toBe(404);
  expect((await env.app.inject({method:'GET',url:'/api/v1/token-markets/invalid-mint'})).statusCode).toBe(400);
 }finally{await env.close();}
});
