/** Backend-only provider check; no transactions, wallet access, database or configuration writes. */
import {writeFile} from 'node:fs/promises';
import {HeliusReader,HeliusReadBudget} from '../../apps/server/src/chain/helius.js';
import {SolanaRpcChain} from '../../apps/server/src/chain/solana.js';
import {OFFICIAL_TREASURIES} from '../../packages/shared/src/index.js';
const key=process.env.HELIUS_API_KEY;if(!key)throw Error('Server-only Helius credential is required');
const budget=new HeliusReadBudget(),report:Record<string,unknown>={checkedAt:new Date().toISOString(),readOnly:true,configurationChanged:false,mainnetFinancialExecution:false};
for(const network of ['mainnet-beta','devnet'] as const){
 const reader=new HeliusReader(key,network,budget);
 try{
  const genesis=await reader.rpc('getGenesisHash',[]),slot=await reader.rpc('getSlot',[{commitment:'finalized'}]);
  report[network]={genesis,slot};
  if(network==='mainnet-beta'){
   const balances=[];for(const address of [OFFICIAL_TREASURIES.platform,OFFICIAL_TREASURIES.agentRewards])balances.push({address,balance:await reader.rpc('getBalance',[address,{commitment:'finalized'}])});
   report.officialTreasuryBalances=balances;
  }else{
   const mint='4PMot5KMVbwR1XE4waWGVoWhax3wXcAUv6E9xapPdy8p';
   // Exact transport used by the Explore adapter, without falling back to another provider.
   const chain=new SolanaRpcChain('https://read-only.helius.invalid',undefined,{fetch:reader.fetch});
   report.exploreCurve=await chain.getCurveProgress(mint);
   try{const h=await reader.holderCount(mint);report.holders={count:h.holders,complete:h.index.complete,scannedAccounts:h.index.scannedAccounts,source:h.index.source,indexedSlot:h.index.indexedSlot};}catch{report.holders={status:'unavailable'};}
   try{report.metadata=await reader.metadata(mint);}catch{report.metadata={status:'unavailable'};}
  }
 }catch{report[network]={status:'unavailable',reason:'Read-only provider validation failed; provider details suppressed'};}
}
await writeFile(new URL('../../docs/security/evidence/helius-readonly-2026-10-22.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
