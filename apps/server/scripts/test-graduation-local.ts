/**
 * Creator fees across graduation, on an isolated loopback validator (scripts/local-pump-validator.sh) only.
 * Launches a SOL coin with the platform's locked 60/40 fee-sharing config, buys out the bonding curve, distributes
 * (curve complete, not yet migrated), migrates to PumpSwap, trades once on the pool, and distributes again with the
 * SDK's standard instructions. Each distribution is read back through SolanaRpcChain and run through the ledger's
 * verifier; the observed transactions are saved as fixtures. Local lamports only; no public transaction or key.
 *
 *   AECO_RUN_LOCAL_PROTOCOL=true AECO_LOCAL_TEST_RPC=http://127.0.0.1:18999 AECO_LOCAL_TEST_EVIDENCE=<out.json> \
 *   AECO_LOCAL_TEST_FIXTURES=<dir> pnpm exec tsx scripts/test-graduation-local.ts
 */
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {ComputeBudgetProgram,Connection,Keypair,LAMPORTS_PER_SOL,PublicKey,Transaction,sendAndConfirmTransaction,type TransactionInstruction} from '@solana/web3.js';
import sdk from '../src/chain/pump-sdk.cjs';
import {pumpLaunchInstructions} from '../src/chain/pump-builder.js';
import {SolanaRpcChain} from '../src/chain/solana.js';
import {verifiedCreatorDistribution} from '../src/chain/creator-fees.js';

const rpc=process.env.AECO_LOCAL_TEST_RPC??'';
if(process.env.AECO_RUN_LOCAL_PROTOCOL!=='true'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(rpc))throw Error('Explicit local opt-in and a loopback RPC are required');
const conn=new Connection(rpc,'confirmed'),devnet=new Connection('https://api.devnet.solana.com','confirmed'),chain=new SolanaRpcChain(rpc);
const genesis=await conn.getGenesisHash();
if(['EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'].includes(genesis))throw Error('Refusing to run on a public network');
const swap=createRequire(createRequire(import.meta.url).resolve('@pump-fun/pump-sdk'))('@pump-fun/pump-swap-sdk');
const T22=new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),SYSTEM=new PublicKey('11111111111111111111111111111111');
const report:Record<string,unknown>={network:'isolated-localnet (devnet programs/config cloned)',genesis,financialScope:'local validator lamports only',steps:[]};
const step=(name:string,data:Record<string,unknown>)=>{(report.steps as unknown[]).push({name,...data});console.log(name,JSON.stringify(data,(_k,v)=>typeof v==='bigint'?v.toString():v));};
const air=async(k:PublicKey,sol:number)=>{for(let left=sol;left>0;left-=Math.min(left,100))await conn.confirmTransaction(await conn.requestAirdrop(k,Math.min(left,100)*LAMPORTS_PER_SOL),'confirmed');};
// The SDK picks protocol fee recipients at random; fund writable system accounts that exist on devnet but not on
// this clone (what cloning them would have done). Accounts the transaction itself creates do not exist on devnet.
const mirror=async(ixs:TransactionInstruction[])=>{
 const keys=[...new Set(ixs.flatMap(i=>i.keys.filter(k=>k.isWritable&&!k.isSigner).map(k=>k.pubkey.toBase58())))].map(k=>new PublicKey(k));
 const [here,there]=[await conn.getMultipleAccountsInfo(keys),await devnet.getMultipleAccountsInfo(keys)];
 for(let i=0;i<keys.length;i++)if(!here[i]&&there[i]?.owner.equals(SYSTEM)&&there[i]!.data.length===0)await conn.confirmTransaction(await conn.requestAirdrop(keys[i]!,Math.max(there[i]!.lamports,1_000_000)),'confirmed');
};
const send=async(ixs:TransactionInstruction[],signers:Keypair[])=>{await mirror(ixs);return sendAndConfirmTransaction(conn,new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({units:1_400_000}),...ixs),signers,{commitment:'confirmed'});};
const fixtures=process.env.AECO_LOCAL_TEST_FIXTURES;if(fixtures)mkdirSync(fixtures,{recursive:true});

try{
 const creator=Keypair.generate(),platform=Keypair.generate(),agent=Keypair.generate(),buyer=Keypair.generate(),mint=Keypair.generate();
 const P=platform.publicKey.toBase58(),A=agent.publicKey.toBase58();
 await air(creator.publicKey,2);await air(platform.publicKey,1);await air(agent.publicKey,1);await air(buyer.publicKey,400);
 // The platform's launch instructions (charge, create, fee-sharing config, locked 60/40 shares), sent in two
 // transactions because this experiment has no lookup table; atomicity is covered by the Launchpad harness.
 const ixs=await pumpLaunchInstructions({launcherWallet:creator.publicKey.toBase58(),mint:mint.publicKey.toBase58(),mintSecretKey:mint.secretKey,name:'Graduation Test',symbol:'GRAD',
  uri:'ipfs://bafkreid3pnqkevdah6inoproy2kxuyefqfurztyup5mxbkqu4rfyx5gzxu',platformTreasury:P,agentRewardsTreasury:A});
 await send(ixs.slice(1,3),[creator,mint]);await send(ixs.slice(3),[creator]);
 const routing=await chain.getFeeRoutingState(mint.publicKey.toBase58());
 step('launched',{mint:mint.publicKey.toBase58(),sharingConfig:routing.sharingConfig});

 const online=new sdk.OnlinePumpSdk(conn),global=await online.fetchGlobal(),feeConfig=await online.fetchFeeConfig().catch(()=>null);
 const balances=async()=>({agent:await conn.getBalance(agent.publicKey),platform:await conn.getBalance(platform.publicKey)});
 const distribute=async(label:string)=>{
  const before=await balances(),minimum=await online.getMinimumDistributableFee(mint.publicKey,buyer.publicKey,{payer:buyer.publicKey}).catch((e:Error)=>({error:e.message}));
  const dist=await online.buildDistributeCreatorFeesInstructions(mint.publicKey,{payer:buyer.publicKey});
  const programs=dist.instructions.map((i:TransactionInstruction)=>`${i.programId.toBase58()}:${Buffer.from(i.data).subarray(0,8).toString('hex')}`);
  let signature:string|null=null,error:string|null=null;
  try{signature=await send(dist.instructions,[buyer]);}catch(e){error=(e as Error).message.slice(0,400);}
  const after=await balances(),delta={agent:after.agent-before.agent,platform:after.platform-before.platform};
  let verifier:unknown=null;
  if(signature){
   const tx=(await chain.getTransaction(signature))!;
   if(fixtures)writeFileSync(`${fixtures}/pump-distribution-${label}-local.json`,JSON.stringify({signature,platform:P,agent:A,tx},(_k,v)=>typeof v==='bigint'?{$bigint:v.toString()}:v,1)+'\n');
   try{const v=verifiedCreatorDistribution(tx,P,A);verifier={accepted:true,total:v.total,dust:v.dust,payouts:v.payouts};}catch(e){verifier={accepted:false,reason:(e as Error).message};}
  }
  step(`distribution_${label}`,{isGraduated:dist.isGraduated,sweepCount:dist.sweepCount,instructions:programs,minimum:JSON.parse(JSON.stringify(minimum,(_k,v)=>v&&typeof v==='object'&&v.constructor?.name==='BN'?v.toString():v)),signature,error,recipientDeltas:delta,verifier});
  return {signature,delta,verifier};
 };

 // 1. Buy out the bonding curve (a single isolated local buyer; nothing public, no market exists).
 for(let i=0;i<4;i++){
  const state=await online.fetchBuyState(mint.publicKey,buyer.publicKey,T22);
  if(state.bondingCurve.complete)break;
  const amount=state.bondingCurve.realTokenReserves,solAmount=sdk.getBuySolAmountFromTokenAmount({global,feeConfig,mintSupply:null,bondingCurve:state.bondingCurve,amount,quoteMint:state.quoteMint});
  const buy=await sdk.PUMP_SDK.buyInstructions({global,bondingCurveAccountInfo:state.bondingCurveAccountInfo,bondingCurve:state.bondingCurve,associatedUserAccountInfo:state.associatedUserAccountInfo,mint:mint.publicKey,user:buyer.publicKey,amount,solAmount,slippage:5,tokenProgram:T22});
  const sig=await send(buy,[buyer]);
  step('buy',{signature:sig,tokens:amount.toString(),solAmount:solAmount.toString()});
 }
 const curve=await chain.getCurveProgress(mint.publicKey.toBase58());
 step('curve_complete',{curve});

 // 2. Distribution while complete but not yet migrated.
 const pre=await distribute('complete-unmigrated');

 // 3. Permissionless migration to the canonical PumpSwap pool.
 const migrate=await sdk.PUMP_SDK.migrateInstruction({withdrawAuthority:global.withdrawAuthority,mint:mint.publicKey,user:buyer.publicKey,tokenProgram:T22});
 const migrated=await send([migrate],[buyer]).then(s=>({signature:s,error:null}),(e:Error)=>({signature:null,error:e.message.slice(0,600)}));
 step('migrate',migrated);
 let post=null;
 if(migrated.signature){
  // 4. One pool trade, then the SDK's standard post-graduation distribution (sweeps + consolidation + distribute).
  const pool=sdk.canonicalPumpPoolPda(mint.publicKey),amm=new swap.OnlinePumpAmmSdk(conn),state=await amm.swapSolanaState(pool,buyer.publicKey);
  const BN=global.initialRealTokenReserves.constructor as new(n:number|string)=>unknown;
  const ammBuy=await new swap.PumpAmmSdk().buyQuoteInput(state,new BN(5*LAMPORTS_PER_SOL),5);
  const sig=await send(ammBuy,[buyer]).then(s=>({signature:s,error:null}),(e:Error)=>({signature:null,error:(e.message.match(/caused by account: \w+/)?.[0]??"")+" "+e.message.slice(0,300)}));
  const keys=[...new Set(ammBuy.flatMap((i:TransactionInstruction)=>i.keys.map(k=>k.pubkey.toBase58())))].map(k=>new PublicKey(k as string));
  const [here,there]=[await conn.getMultipleAccountsInfo(keys),await devnet.getMultipleAccountsInfo(keys)];
  const notCloned=keys.filter((_k,i)=>!here[i]&&there[i]&&!there[i]!.owner.equals(SYSTEM)).map((k,_i)=>k.toBase58());
  const poolInfo=await conn.getAccountInfo(pool);
  step('pool_buy',{...sig,notCloned,pool:pool.toBase58(),poolCreatorFees:poolInfo?swap.PUMP_AMM_SDK.decodePool(poolInfo).creatorFees?.toString?.()??null:null});
  if(sig.signature)post=await distribute('graduated');
 }
 report.summary={preGraduationDistributed:!!pre.signature,preGraduationAccepted:(pre.verifier as {accepted?:boolean}|null)?.accepted??null,
  migrated:!!migrated.signature,postGraduationDistributed:!!post?.signature,postGraduationAccepted:(post?.verifier as {accepted?:boolean}|null)?.accepted??null};
 report.result='completed';
}catch(e){report.result='failed';report.error=(e as Error).message;console.error(e);process.exitCode=1;}
finally{if(process.env.AECO_LOCAL_TEST_EVIDENCE)writeFileSync(process.env.AECO_LOCAL_TEST_EVIDENCE,JSON.stringify(report,(_k,v)=>typeof v==='bigint'?v.toString():v,1)+'\n');}
