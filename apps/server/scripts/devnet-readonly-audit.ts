/**
 * Read-only public-devnet audit of the Launchpad's protocol assumptions. Sends no transaction, holds no key
 * beyond fresh throwaway mint keypairs used only for unsigned-payer simulation, and spends nothing.
 *
 *   AECO_DEVNET_AUDIT_PAYER=<funded devnet address, simulation payer only> \
 *   AECO_DEVNET_AUDIT_LOOKUP_TABLE=<launch ALT> AECO_DEVNET_AUDIT_PLATFORM=<addr> AECO_DEVNET_AUDIT_AGENT=<addr> \
 *   AECO_DEVNET_AUDIT_MINTS=<comma-separated launched mints> AECO_DEVNET_AUDIT_EVIDENCE=<out.json> \
 *   pnpm exec tsx scripts/devnet-readonly-audit.ts
 */
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {Connection,Keypair,PublicKey,VersionedTransaction} from '@solana/web3.js';
import {LAUNCH_FEE_LAMPORTS} from '@agentic-economy/shared';
import sdk from '../src/chain/pump-sdk.cjs';
import {buildPumpLaunch} from '../src/chain/pump-builder.js';
import {SolanaRpcChain} from '../src/chain/solana.js';
import {USDC_QUOTE_MINTS} from '../src/config.js';

const RPC='https://api.devnet.solana.com',GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const env=(k:string)=>{const v=process.env[k];if(!v)throw Error(`${k} required`);return v;};
const payer=env('AECO_DEVNET_AUDIT_PAYER'),lookup=env('AECO_DEVNET_AUDIT_LOOKUP_TABLE'),platform=env('AECO_DEVNET_AUDIT_PLATFORM'),agent=env('AECO_DEVNET_AUDIT_AGENT');
const mints=(process.env.AECO_DEVNET_AUDIT_MINTS??'').split(',').filter(Boolean);
const conn=new Connection(RPC,'confirmed');
if(await conn.getGenesisHash()!==GENESIS)throw Error('Not public devnet; refusing to run');
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const settle=async<T>(f:()=>Promise<T>)=>{for(let i=0;;i++){try{return {ok:true as const,value:await f()};}catch(e){if(i>=3||!/429|Too Many/i.test(String(e)))return {ok:false as const,error:String((e as Error).message??e).slice(0,300)};await pause(1500*(i+1));}}};

// 1. Programs: deployment slot and binary hash against the 2026-10-18 audit.
const PROGRAMS={'6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P':'bcee35d3eeb158090dd08764a8c5c03a2852c3cee553a0ce61dd5482469a5ec7',
 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ':'446db24678fa22700d8eda86c48ba361b325a084e319c0c66f780c953520b317',
 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA':'494d2257ed4a9a2bc3eb210b22cdb5058d77e17f1ba5095b636e96c86b1fd4ef',
 'MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e':'25ac2612be74e8437f79dbb4c62d7e3701c21b8f4c9ed0acaf832df4fe1a821d'};
const programs=[];
for(const [program,expected] of Object.entries(PROGRAMS)){
 const info=await conn.getAccountInfo(new PublicKey(program));
 if(!info?.executable)throw Error(`${program} is not executable`);
 const programData=new PublicKey(info.data.subarray(4,36)),pd=(await conn.getAccountInfo(programData))!;
 // ProgramData: u32 tag, u64 slot, Option<Pubkey> authority (1+32), then the ELF (zero-padded).
 const elf=pd.data.subarray(45);let end=elf.length;while(end>0&&elf[end-1]===0)end--;
 const full=createHash('sha256').update(elf).digest('hex'),trimmed=createHash('sha256').update(elf.subarray(0,end)).digest('hex');
 programs.push({program,programData:programData.toBase58(),deploymentSlot:Number(pd.data.readBigUInt64LE(4)),upgradeAuthority:pd.data[12]?new PublicKey(pd.data.subarray(13,45)).toBase58():null,
  sha256:full,matchesAudit20261018:full===expected||trimmed===expected});
}

// 2. USDC: Global allowlist, mint layout, and the actual rent of an SPL token account.
const chain=new SolanaRpcChain(RPC);
await chain.verifyQuoteMint(USDC_QUOTE_MINTS.devnet);
const global=sdk.PUMP_SDK.decodeGlobal((await conn.getAccountInfo(sdk.GLOBAL_PDA))!);
const tokenAccountRent=await conn.getMinimumBalanceForRentExemption(165);

// 3. Lookup table contents.
const table=(await conn.getAddressLookupTable(new PublicKey(lookup))).value;
if(!table?.isActive())throw Error('Lookup table inactive');

// 4. Build both quote variants with the application's builder and simulate against devnet. The payer never
// signs; sigVerify is off; the post-simulation payer balance gives the exact launcher debit.
const payerBefore=await conn.getBalance(new PublicKey(payer),'confirmed');
const simulate=async(quoteAsset:'SOL'|'USDC',longest=false)=>{
 const mint=Keypair.generate(),latest=await conn.getLatestBlockhash('confirmed');
 let built;
 try{built=await buildPumpLaunch({launcherWallet:payer,mint:mint.publicKey.toBase58(),mintSecretKey:mint.secretKey,name:longest?'A'.repeat(32):'AECO Readonly Audit',symbol:longest?'S'.repeat(13):'AECOAUD',
  uri:'ipfs://bafkreid3pnqkevdah6inoproy2kxuyefqfurztyup5mxbkqu4rfyx5gzxu',platformTreasury:platform,agentRewardsTreasury:agent,quoteAsset,
  ...(quoteAsset==='USDC'?{quoteMint:USDC_QUOTE_MINTS.devnet}:{})},latest.blockhash,[table]);}
 catch(e){return {quoteAsset,built:false,error:(e as Error).message};}
 const tx=VersionedTransaction.deserialize(Buffer.from(built.transaction,'base64')),m=tx.message;
 const signers=m.staticAccountKeys.slice(0,m.header.numRequiredSignatures).map(k=>k.toBase58());
 const sim=await conn.simulateTransaction(tx,{sigVerify:false,commitment:'confirmed',accounts:{encoding:'base64',addresses:[payer]}});
 const fee=(await conn.getFeeForMessage(m,'confirmed')).value;
 const after=sim.value.accounts?.[0]?.lamports;
 const debit=after==null?null:payerBefore-after;
 return {quoteAsset,longestNameAndSymbol:longest,built:true,packetBytes:built.bytes,instructions:built.instructions.length,staticKeys:m.staticAccountKeys.length,
  lookupKeys:m.addressTableLookups.reduce((n,l)=>n+l.readonlyIndexes.length+l.writableIndexes.length,0),
  signers,signersAreCreatorAndMint:signers.length===2&&signers[0]===payer&&signers[1]===mint.publicKey.toBase58(),
  simulationError:sim.value.err?JSON.stringify(sim.value.err):null,unitsConsumed:sim.value.unitsConsumed??null,
  networkFeeLamports:fee,payerDebitLamports:debit,
  accountRentLamports:debit==null||fee==null?null:debit-Number(LAUNCH_FEE_LAMPORTS)-fee,
  logsTail:sim.value.err?sim.value.logs?.slice(-6):undefined};
};
const simulations=[await simulate('SOL'),await simulate('USDC'),await simulate('SOL',true),await simulate('USDC',true)];
const missingForUsdc=simulations[1]!.built?[]:[USDC_QUOTE_MINTS.devnet].filter(k=>!table.state.addresses.some(a=>a.toBase58()===k));

// 5. Explore readers on real launched coins (the same code paths the API serves).
const markets=[];
for(const mint of mints){
 const progress=await settle(()=>chain.getCurveProgress(mint));await pause(500);
 const holders=await settle(()=>chain.getHolderCount(mint));await pause(500);
 const trades=await settle(()=>chain.getRecentTrades(mint,20));await pause(500);
 markets.push({mint,progress,holders,trades:trades.ok?{ok:true,slot:trades.value.slot,complete:trades.value.complete,count:trades.value.trades.length,
  sides:trades.value.trades.map(t=>t.side),creatorFeeTotal:trades.value.trades.reduce((s,t)=>s+BigInt(t.creatorFee),0n).toString()}:trades});
}

const evidence={network:'public-devnet',genesis:GENESIS,readOnly:true,observedAt:new Date().toISOString(),slot:await conn.getSlot('confirmed'),
 sdk:'@pump-fun/pump-sdk 4.1.0',programs,
 usdc:{mint:USDC_QUOTE_MINTS.devnet,inGlobalAllowlist:true,whitelistedQuoteMints:global.whitelistedQuoteMints.map((k:PublicKey)=>k.toBase58()),
  tokenAccountRentLamports:tokenAccountRent,twoVaultRentLamports:2*tokenAccountRent},
 lookupTable:{address:lookup,active:true,entries:table.state.addresses.length,authority:table.state.authority?.toBase58()??null,containsDevnetUsdc:table.state.addresses.some(a=>a.toBase58()===USDC_QUOTE_MINTS.devnet),missingForUsdc},
 simulations,markets};
const out=JSON.stringify(evidence,(_k,v)=>typeof v==='bigint'?v.toString():v,1);
if(process.env.AECO_DEVNET_AUDIT_EVIDENCE)writeFileSync(process.env.AECO_DEVNET_AUDIT_EVIDENCE,out+'\n');
console.log(out);
