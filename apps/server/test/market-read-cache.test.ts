import{expect,it,vi}from'vitest';
import{PublicKey}from'@solana/web3.js';
import{SolanaRpcChain}from'../src/chain/solana.js';
import sdk from'../src/chain/pump-sdk.cjs';
const signature='1'.repeat(64),mint=PublicKey.unique().toBase58(),pool=sdk.canonicalPumpPoolPda(new PublicKey(mint)).toBase58();
const raw={version:0,slot:10,blockTime:100,transaction:{signatures:[signature],message:{accountKeys:[PublicKey.default.toBase58()],instructions:[]}},meta:{err:null,innerInstructions:[],loadedAddresses:{writable:[],readonly:[]}}};
it('reuses validated finalized raw evidence across replay while refreshing signature discovery',async()=>{
 const calls:string[]=[],lanes:string[]=[];const fetcher=(async(_url:unknown,init?:RequestInit)=>{const q=JSON.parse(String(init?.body));calls.push(q.method);return Response.json({jsonrpc:'2.0',id:q.id,result:q.method==='getTransaction'?raw:[{signature,slot:10,err:null,memo:null,blockTime:100}]});})as typeof fetch;
 const chain=new SolanaRpcChain('https://offline.invalid',undefined,{fetch:fetcher,managedReads:true,fetchForLane:lane=>{lanes.push(lane);return fetcher;}});
 await chain.getMarketTradePage(mint,pool,undefined,undefined,200,{lane:'history'});await chain.getMarketTradePage(mint,pool,undefined,undefined,200,{lane:'live'});expect(calls.filter(m=>m==='getTransaction')).toHaveLength(1);expect(calls.filter(m=>m==='getSignaturesForAddress')).toHaveLength(2);expect(lanes).toEqual(['history','live']);
});
it('never caches null/malformed evidence and recovers with the same signature on replay',async()=>{
 let details=0;const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{const q=JSON.parse(String(init?.body));return Response.json({jsonrpc:'2.0',id:q.id,result:q.method==='getTransaction'?(++details===1?null:raw):[{signature,slot:10,err:null,memo:null,blockTime:100}]});})as typeof fetch;
 const chain=new SolanaRpcChain('https://offline.invalid',undefined,{fetch:fetcher});await expect(chain.getMarketTradePage(mint,pool)).rejects.toThrow('cursor retained');await chain.getMarketTradePage(mint,pool);await chain.getMarketTradePage(mint,pool);expect(details).toBe(2);
});
