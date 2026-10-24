import {writeFile}from'node:fs/promises';
import {Connection,PublicKey}from'@solana/web3.js';
import{expect,it,vi}from'vitest';
import{BackgroundRpc}from'../src/chain/background-rpc.js';
import{MarketReader}from'../src/chain/market-reader.js';
import sdk from'../src/chain/pump-sdk.cjs';
import{cachedBackgroundChain}from'../src/chain/background-cache.js';
import{MockChain}from'../src/chain/mock.js';
it('measures bounded failed-signature discovery, burst recovery and finalized evidence reuse',async()=>{
 const discovery=async(limit:number)=>{
  const connection=new Connection('https://offline.invalid'),signatures=Array.from({length:400},(_,i)=>({signature:`s${i}`,slot:500-i,err:{InstructionError:[0,1]},memo:null,blockTime:100}));let calls=0;
  vi.spyOn(connection,'getSignaturesForAddress').mockImplementation(async(_key,options)=>{calls++;const offset=options?.before?signatures.findIndex(s=>s.signature===options.before)+1:0;return signatures.slice(offset,offset+(options?.limit??8));});
  const detail=vi.fn(),reader=new MarketReader(connection,detail),mint=PublicKey.unique().toBase58(),address=sdk.canonicalPumpPoolPda(new PublicKey(mint)).toBase58();let before:string|undefined;
  for(let i=0;i<100;i++){const page=await reader.page(mint,address,before,undefined,limit,{transactionLimit:8});before=page.signatures.at(-1);if(page.exhausted)break;}
  expect(detail).not.toHaveBeenCalled();return{signatures:400,discoveryRequests:calls,transactionDetailRequests:detail.mock.calls.length};
 };
 const beforeDiscovery=await discovery(8),afterDiscovery=await discovery(200);expect(beforeDiscovery.discoveryRequests).toBe(51);expect(afterDiscovery.discoveryRequests).toBe(3);
 const burst=async(managed:boolean)=>{
  vi.useFakeTimers({now:0});let requests=0,limited=0;const timestamps:number[]=[],latencies:number[]=[];
  const provider=(async(_url:unknown,init?:RequestInit)=>{requests++;const body=JSON.parse(String(init?.body)),now=Date.now();if(timestamps.filter(t=>now-t<10000).length>=4){limited++;return new Response('{}',{status:429});}timestamps.push(now);return Response.json({jsonrpc:'2.0',id:body.id,result:1});})as typeof fetch;
  const rpc=new BackgroundRpc({intervalMs:0,concurrency:2,methodLimit:4,queueLimit:32,deadlineMs:30000,attempts:3},provider);
  const connection=new Connection('https://offline.invalid',{fetch:managed?rpc.fetch('live'):provider,disableRetryOnRateLimit:managed});const silence=vi.spyOn(console,'error').mockImplementation(()=>{});
  try{const jobs=Promise.allSettled(Array.from({length:8},async()=>{const start=Date.now();const value=await connection.getSlot();latencies.push(Date.now()-start);return value;}));await vi.advanceTimersByTimeAsync(11000);const result=await jobs;return{requests,rateLimitedResponses:limited,successes:result.filter(r=>r.status==='fulfilled').length,failures:result.filter(r=>r.status==='rejected').length,maxSuccessfulLatencyMs:Math.max(...latencies),meanSuccessfulLatencyMs:latencies.reduce((a,b)=>a+b,0)/latencies.length};}finally{silence.mockRestore();rpc.close();vi.useRealTimers();}
 };
 const beforeBurst=await burst(false),afterBurst=await burst(true);expect(beforeBurst).toMatchObject({requests:24,failures:4,successes:4});expect(afterBurst).toMatchObject({requests:8,failures:0,successes:8,rateLimitedResponses:0});
 const chain=new MockChain(),genesis=vi.fn(async()=>'verified');Object.assign(chain,{getGenesisHash:genesis});for(let i=0;i<20;i++)await genesis();const beforeGenesis=genesis.mock.calls.length;genesis.mockClear();const cached=cachedBackgroundChain(chain);for(let i=0;i<20;i++)await cached.getGenesisHash!();expect(genesis).toHaveBeenCalledTimes(1);
 const report={kind:'Controlled offline fixture; not post-deployment production measurements',discovery:{before:beforeDiscovery,after:afterDiscovery},burst:{providerCapacity:'4 calls per10s,8 simultaneous requests',before:beforeBurst,after:afterBurst},genesis:{beforeRequests:beforeGenesis,afterRequests:genesis.mock.calls.length}};
 if(process.env.INDEXER_BENCHMARK_REPORT)await writeFile(process.env.INDEXER_BENCHMARK_REPORT,JSON.stringify(report,null,2),{mode:0o600});
});
