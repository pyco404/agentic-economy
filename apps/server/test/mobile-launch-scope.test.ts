import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Keypair,TransactionMessage,VersionedTransaction,SystemProgram} from '@solana/web3.js';
import {MOBILE_LAUNCH as p,validateMobileBuild,validateMobileCosts,installMobileLaunchScope} from '../scripts/mobile-launch-scope.js';
import type {AppContext} from '../src/context.js';import type {BuildLaunchInput,BuiltLaunchTransaction} from '../src/chain/types.js';
const mint=Keypair.generate(),input:BuildLaunchInput={launcherWallet:p.wallet,name:p.name,symbol:p.symbol,mint:mint.publicKey.toBase58(),mintSecretKey:mint.secretKey,uri:'ipfs://test',platformTreasury:p.platform,agentRewardsTreasury:p.agent,devBuy:{tokenAmount:BigInt(p.tokens),maxQuoteCost:BigInt(p.maxBuy)}};
const tx=()=>Buffer.from(new VersionedTransaction(new TransactionMessage({payerKey:mint.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58(),instructions:[SystemProgram.transfer({fromPubkey:mint.publicKey,toPubkey:Keypair.generate().publicKey,lamports:1})]}).compileToV0Message()).serialize()).toString('base64');
const built:BuiltLaunchTransaction={transaction:tx(),lastValidBlockHeight:1,demo:false,genesisHash:p.genesis,estimatedNetworkFeesLamports:p.network,estimatedAccountRentLamports:p.rent,devBuy:{tokenAmount:p.tokens,quoteSpent:p.buy}};
describe('single approved physical mobile launch',()=>{
 it('requires exact wallet, allocation, recipients, SOL, and unchanged cost inputs',()=>{
  expect(()=>validateMobileBuild(input)).not.toThrow();expect(validateMobileCosts(built)).toBe(70919446n);
  for(const change of [{launcherWallet:mint.publicKey.toBase58()},{name:'Other'},{symbol:'OTHER'},{quoteAsset:'USDC' as const},{platformTreasury:p.agent},{agentRewardsTreasury:p.platform},{devBuy:{tokenAmount:35000000000000n,maxQuoteCost:BigInt(p.maxBuy)}},{devBuy:{tokenAmount:BigInt(p.tokens),maxQuoteCost:BigInt(p.maxBuy)+1n}}])expect(()=>validateMobileBuild({...input,...change})).toThrow();
  for(const change of [{genesisHash:'mainnet'},{demo:true},{estimatedNetworkFeesLamports:'10001'},{estimatedAccountRentLamports:undefined},{estimatedAccountRentLamports:'16000000'},{devBuy:{tokenAmount:p.tokens,quoteSpent:'1'}}])expect(()=>validateMobileCosts({...built,...change})).toThrow();
 });
 it('persists one launch/mint/message and allows only same-payload recovery across restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'aeco-mobile-scope-test-')),path=join(dir,'approval.json'),draftId='11111111-1111-4111-a111-111111111111';
  await writeFile(path,JSON.stringify({approval:'fold6-mobile-2026-10-22',draftId}));
  const submit=vi.fn(async()=> 'mock-signature');
  const make=()=>({config:{solana:{cluster:'devnet'},treasuries:{platform:p.platform,agentRewards:p.agent}},chain:{buildLaunchTransaction:vi.fn(async()=>built),submitLaunchTransaction:submit},launches:{prepare:async()=>({})}} as unknown as AppContext);
  const owned={id:draftId,version:0,launchId:'lch_one',devBuyBps:200},draft={name:p.name,symbol:p.symbol,metadataUri:'ipfs://test',description:'Test',imageUri:null,website:null,twitter:null,telegram:null};
  try{
   const ctx=make();await installMobileLaunchScope(ctx,path);
   await expect(ctx.launches.prepare(p.wallet,draft,{...owned,id:'another'})).rejects.toThrow();
   await ctx.launches.prepare(p.wallet,draft,owned);await ctx.chain.buildLaunchTransaction(input);
   await expect(ctx.launches.prepare(p.wallet,draft,{...owned,launchId:'lch_two'})).rejects.toThrow();
   await expect(ctx.chain.buildLaunchTransaction({...input,mint:Keypair.generate().publicKey.toBase58()})).rejects.toThrow();
   await expect(ctx.chain.submitLaunchTransaction!(tx())).rejects.toThrow();expect(submit).not.toHaveBeenCalled();
   await ctx.chain.submitLaunchTransaction!(built.transaction);
   const restarted=make();await installMobileLaunchScope(restarted,path);await restarted.chain.submitLaunchTransaction!(built.transaction);
   await expect(restarted.chain.submitLaunchTransaction!(tx())).rejects.toThrow();
   expect(submit).toHaveBeenCalledTimes(2);expect(JSON.parse(await readFile(path,'utf8')).mint).toBe(input.mint);
  }finally{await rm(dir,{recursive:true,force:true});}
 });
});
