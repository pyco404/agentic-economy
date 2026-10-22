/** Read-only plan: no keypair access, signing, submission, buy, database or configuration writes. */
import {writeFileSync} from 'node:fs';
import {Connection,PublicKey,TransactionMessage,VersionedTransaction,ComputeBudgetProgram,SystemProgram} from '@solana/web3.js';
import sdk from '../src/chain/pump-sdk.cjs';
import {SolanaRpcChain} from '../src/chain/solana.js';
import {creatorVaultPda,sharingConfigPda} from '../src/chain/pump.js';
const mint=new PublicKey('4PMot5KMVbwR1XE4waWGVoWhax3wXcAUv6E9xapPdy8p');
const payer=new PublicKey('49Y2BZrtXmkKPTphcsx5riMDX4s4uqwC6yDmrprYaX3F');
const expectedPlatform='GcQFWipjZvpuk2sdJAZ4BwyTMdWTDmfjxWSdw4bTVzvp',expectedAgent='D8p7CytykA5Q7vSDGGoCJC6mNyLKXVwiEXLboih2ZHJs';
const rpc='https://api.devnet.solana.com',connection=new Connection(rpc,'finalized');
if(await connection.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('Not Devnet');
const chain=new SolanaRpcChain(rpc),routing=await chain.getFeeRoutingState(mint.toBase58());
const sc=routing.sharingConfig;
if(!sc||!sc.adminRevoked||sc.status!=='Active'||sc.shareholders.length!==2||!sc.shareholders.some(h=>h.address===expectedAgent&&h.shareBps===6000)||!sc.shareholders.some(h=>h.address===expectedPlatform&&h.shareBps===4000))throw Error('Unexpected fee-sharing recipients');
const online=new sdk.OnlinePumpSdk(connection);
const minimum=await online.getMinimumDistributableFee(mint,payer,{payer});
const distribution=await online.buildDistributeCreatorFeesInstructions(mint,{payer});
const instructions=[ComputeBudgetProgram.setComputeUnitLimit({units:500_000}),...distribution.instructions];
const latest=await connection.getLatestBlockhash('finalized');
const message=new TransactionMessage({payerKey:payer,recentBlockhash:latest.blockhash,instructions}).compileToV0Message();
const transaction=new VersionedTransaction(message);
const addresses=[payer.toBase58(),expectedAgent,expectedPlatform,creatorVaultPda(sharingConfigPda(mint.toBase58()))];
const before=await connection.getMultipleAccountsInfo(addresses.map(a=>new PublicKey(a)),'finalized');
const simulation=await connection.simulateTransaction(transaction,{sigVerify:false,commitment:'finalized',accounts:{encoding:'base64',addresses}});
const fee=(await connection.getFeeForMessage(message,'finalized')).value;
const recipientRent=await connection.getMinimumBalanceForRentExemption(0);
// Read-only combined simulation predicts the effect of separately prefunding a test recipient.
// If approved, funding and distribution MUST be separate transactions: the accounting
// verifier deliberately rejects arbitrary transfer siblings in a distribution envelope.
let prefundingScenario:unknown=null;
if(!minimum.canDistribute && !before[1]){
 const funding=SystemProgram.transfer({fromPubkey:payer,toPubkey:new PublicKey(expectedAgent),lamports:recipientRent});
 const combined=new VersionedTransaction(new TransactionMessage({payerKey:payer,recentBlockhash:latest.blockhash,instructions:[funding,...instructions]}).compileToV0Message());
 const observed=await connection.simulateTransaction(combined,{sigVerify:false,commitment:'finalized',accounts:{encoding:'base64',addresses}});
 prefundingScenario={purpose:'Prefund the empty dedicated rewards test account to rent exemption; not creator-fee income. Then distribute already accrued creator fees in a separate transaction.',
  rentFundingLamports:recipientRent,estimatedSeparateTransactionFeesLamports:fee===null?null:fee*2,
  combinedSimulationOnly:true,error:observed.value.err,
  accountChanges:addresses.map((address,i)=>({address,deltaLamports:observed.value.accounts?.[i]?observed.value.accounts[i]!.lamports-(before[i]?.lamports??0):null})),logs:observed.value.logs};
}
const normalizedMinimum={minimumRequired:minimum.minimumRequired.toString(10),distributableFees:minimum.distributableFees.toString(10),canDistribute:minimum.canDistribute,isGraduated:minimum.isGraduated,feesQuoteMint:minimum.feesQuoteMint.toBase58()};
const report={checkedAt:new Date().toISOString(),network:'public-devnet',readOnly:true,mint:mint.toBase58(),payer:payer.toBase58(),routing,minimum:normalizedMinimum,prefundingScenario,
 isGraduated:distribution.isGraduated,sweepCount:distribution.sweepCount,packetBytes:transaction.serialize().length,networkFeeLamports:fee,
 instructions:instructions.map(i=>({program:i.programId.toBase58(),discriminatorHex:Buffer.from(i.data).subarray(0,8).toString('hex')})),
 simulation:{error:simulation.value.err,unitsConsumed:simulation.value.unitsConsumed,accountChanges:addresses.map((address,i)=>({address,beforeLamports:before[i]?.lamports??0,afterLamports:simulation.value.accounts?.[i]?.lamports??null,deltaLamports:simulation.value.accounts?.[i]?simulation.value.accounts[i]!.lamports-(before[i]?.lamports??0):null})),logs:simulation.value.logs},
 approval:'No transaction submitted. Any distribution requires separate explicit owner approval after reviewing this plan. No new buy is authorized.'};
const out=JSON.stringify(report,(_k,v)=>typeof v==='bigint'?v.toString():v,2);
writeFileSync(new URL('../docs/evidence/creator-fee-devnet-plan-2026-10-22.json',import.meta.url),out+'\n');console.log(out);
