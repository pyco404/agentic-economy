import {CREATOR_SWEEP,verifyCreatorSweeps} from './creator-fee-sweeps.js';
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {PUMP_AMM_PROGRAM_ID,PUMP_PROGRAM_ID,SYSTEM_PROGRAM_ID,WRAPPED_SOL_MINT} from '@agentic-economy/shared';
import {bondingCurvePda,creatorVaultPda,PUMP_IX,sharingConfigPda} from './pump.js';
import type {ObservedTransaction} from './types.js';
import {USDC_QUOTE_MINTS} from '../config.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const USDC_MINT='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
/** USDC quote mints per network (mainnet, and devnet/localnet's allowlisted mint). */
const USDC_MINTS:readonly string[]=Object.values(USDC_QUOTE_MINTS);
const DIST_V1=PUMP_IX.distributeCreatorFees,DIST_V2=PUMP_IX.distributeCreatorFeesV2;
/** pump-amm transfer_creator_fees_to_pump: after graduation the SDK moves the pool's SOL creator fees (wrapped SOL
 * held for the sharing config) into Pump's creator vault, in the same transaction, before distributing. */
const CONSOLIDATE='8b348655e4e56cf1';
/** Mint of a transaction's single Pump creator-fee distribution (either ABI), or null. */
export function distributionMint(tx:Pick<ObservedTransaction,'instructions'>):string|null{
 const ix=tx.instructions.find(i=>i.programId===PUMP_PROGRAM_ID&&(i.discriminatorHex===DIST_V1||i.discriminatorHex===DIST_V2));
 return ix?(ix.discriminatorHex===DIST_V1?ix.accounts[0]:ix.accounts[1])??null:null;
}
const eventPrefix=Buffer.concat([Buffer.from('e445a52e51cb9a1d','hex'),createHash('sha256').update('event:DistributeCreatorFeesEvent').digest().subarray(0,8)]);
export function associatedAccount(owner:string,mint:string){return PublicKey.findProgramAddressSync([new PublicKey(owner).toBuffer(),new PublicKey(TOKEN).toBuffer(),new PublicKey(mint).toBuffer()],new PublicKey(ATA))[0].toBase58();}
/** Official distribute_creator_fees (SOL-only; the SDK's standard path for SOL coins) and distribute_creator_fees_v2.
 * Conservative one-distribution envelope, optionally preceded by one canonical post-graduation SOL consolidation;
 * canonical creator sweeps and quote consolidation are validated independently; unknown batches/quote assets remain unaccounted.
 * The CPI event is authenticated by Pump's event-authority PDA, not text log content.
 */
export function verifiedCreatorDistribution(tx:ObservedTransaction,platform:string,agent:string){
 if(tx.source!=='solana_rpc'||tx.err!==null||platform===agent)throw new Error('Not successful RPC evidence');
 const distributions=tx.instructions.filter(i=>i.programId===PUMP_PROGRAM_ID&&(i.discriminatorHex===DIST_V1||i.discriminatorHex===DIST_V2));
 const consolidations=tx.instructions.filter(i=>i.programId===PUMP_AMM_PROGRAM_ID&&i.discriminatorHex===CONSOLIDATE);
 const isSweep=(i:ObservedTransaction['instructions'][number])=>[PUMP_PROGRAM_ID,PUMP_AMM_PROGRAM_ID].includes(i.programId)&&i.discriminatorHex===CREATOR_SWEEP;
 if(distributions.length!==1||consolidations.length>1||tx.instructions.some(i=>i!==distributions[0]&&i!==consolidations[0]&&!isSweep(i)&&i.programId!=='ComputeBudget111111111111111111111111111111'))throw new Error('Unsupported distribution transaction envelope');
 const ix=distributions[0]!,a=ix.accounts,v1=ix.discriminatorHex===DIST_V1,mint=(v1?a[0]:a[1])!,sc=sharingConfigPda(mint),vault=creatorVaultPda(sc);
 const programPda=(seed:string)=>PublicKey.findProgramAddressSync([Buffer.from(seed)],new PublicKey(PUMP_PROGRAM_ID))[0].toBase58();
 const data=Buffer.from(ix.dataBase64??'','base64');
 // v1: mint, curve, sharing config, creator vault, system, event authority, program, shareholder 0, shareholder 1 (SOL only).
 // v2: payer, mint, curve, sharing config, creator vault, system, event authority, program, vault ATA, quote, token, ATA, shareholders (+ their ATAs).
 let quote:string,eventAuthority:string,holders:[string,string];
 if(v1){
  quote=WRAPPED_SOL_MINT;eventAuthority=a[5]!;holders=[a[7]!,a[8]!];
  if(a.length!==9||a[1]!==bondingCurvePda(mint)||a[2]!==sc||a[3]!==vault||a[4]!==SYSTEM_PROGRAM_ID||a[5]!==programPda('__event_authority')||a[6]!==PUMP_PROGRAM_ID)throw new Error('Noncanonical distribution accounts or unsupported denomination');
  if(data.length!==8)throw new Error('Unknown distribution ABI');
 }else{
  quote=a[9]!;eventAuthority=a[6]!;holders=[a[12]!,a[13]!];
  if(a.length!==(quote===WRAPPED_SOL_MINT?14:16)||a[2]!==bondingCurvePda(mint)||a[3]!==sc||a[4]!==vault||a[5]!==SYSTEM_PROGRAM_ID||a[6]!==programPda('__event_authority')||a[7]!==PUMP_PROGRAM_ID||a[8]!==associatedAccount(vault,quote)||a[10]!==TOKEN||a[11]!==ATA||![WRAPPED_SOL_MINT,...USDC_MINTS].includes(quote))throw new Error('Noncanonical distribution accounts or unsupported denomination');
  if(data.length!==9||data[8]!>1)throw new Error('Unknown distribution ABI');
 }
 const events=(tx.innerInstructions??[]).filter(i=>i.parentIndex===ix.ixIndex&&i.programId===PUMP_PROGRAM_ID&&i.stackHeight===2&&i.accounts[0]===eventAuthority&&Buffer.from(i.dataBase64,'base64').subarray(0,16).equals(eventPrefix));
 if(events.length!==1)throw new Error('Missing authenticated distribution event');
 const b=Buffer.from(events[0]!.dataBase64,'base64');let offset=24;
 const key=()=>{const v=new PublicKey(b.subarray(offset,offset+32)).toBase58();offset+=32;return v;};
 if(b.length<16+8+128+4+68+8+32||key()!==mint||key()!==bondingCurvePda(mint)||key()!==sc)throw new Error('Event mint/config mismatch');
 key();const count=b.readUInt32LE(offset);offset+=4;
 if(count!==2)throw new Error('Unsupported shareholder policy');
 const shares=[];for(let i=0;i<count;i++){const address=key(),bps=b.readUInt16LE(offset);offset+=2;shares.push({address,bps});}
 const total=b.readBigUInt64LE(offset);offset+=8;const eventQuote=key();
 // v1 events record SOL as the legacy all-zero quote address.
 if(total===0n)throw new Error('No creator fees distributed');
 const normalizedQuote=eventQuote===SYSTEM_PROGRAM_ID?WRAPPED_SOL_MINT:eventQuote;
 if(offset!==b.length||normalizedQuote!==quote||shares[0]!.address!==holders[0]||shares[1]!.address!==holders[1]||!shares.some(s=>s.address===agent&&s.bps===6000)||!shares.some(s=>s.address===platform&&s.bps===4000))throw new Error('Event shares/quote mismatch');
 // The authenticated event's `distributed` is the SUM ACTUALLY PAID, not the
 // pre-rounding vault amount. Re-splitting it can undercount the 60% recipient
 // by one lamport. Read actual credits, then require an exact floor-consistent
 // gross basis (net or net+1 for this two-share 60/40 policy).
 const payouts=shares.map(s=>{
  const amount=quote===WRAPPED_SOL_MINT
   ? (tx.lamportDeltas[s.address]??0n)+(tx.feePayer===s.address?(tx.feeLamports??0n):0n)
   : (()=>{const t=tx.tokenAccounts?.[associatedAccount(s.address,quote)];return t?t.post-t.pre:-1n;})();
  if(amount<0n)throw Error('Recipient lamports/balance do not reconcile');
  return {...s,amount};
 });
 const paid=payouts.reduce((n,p)=>n+p.amount,0n);
 if(paid!==total)throw Error('Recipient lamports/balance do not match authenticated distributed amount');
 let grossCandidates=[paid,paid+1n].filter(g=>payouts.every(p=>g*BigInt(p.bps)/10000n===p.amount));
 if(!grossCandidates.length)throw Error('Recipient shares do not reconcile to exact 60/40 floors');
 // Consolidation accounts: wsol mint, token, system, ATA, coin creator (= sharing config), its pump-amm vault
 // authority, that authority's wrapped-SOL account, Pump creator vault, pump-amm event authority, pump-amm.
 const sweep=verifyCreatorSweeps(tx,mint,quote,ix.ixIndex,consolidations[0]?.ixIndex);
 let consolidated=0n;
 const c=consolidations[0];
 if(c){
  const amm=(seeds:Buffer[])=>PublicKey.findProgramAddressSync(seeds,new PublicKey(PUMP_AMM_PROGRAM_ID))[0].toBase58();
  const authority=amm([Buffer.from('creator_vault'),new PublicKey(sc).toBuffer()]),source=associatedAccount(authority,WRAPPED_SOL_MINT),ca=c.accounts;
  if(c.ixIndex>=ix.ixIndex||Buffer.from(c.dataBase64??'','base64').length!==8)throw new Error('Unsupported creator-fee consolidation');
  if(quote!==WRAPPED_SOL_MINT)throw new Error('Unsupported creator-fee consolidation');
  if(ca.length!==10||ca[0]!==WRAPPED_SOL_MINT||ca[1]!==TOKEN||ca[2]!==SYSTEM_PROGRAM_ID||ca[3]!==ATA||ca[4]!==sc||ca[5]!==authority||ca[6]!==source||ca[7]!==vault||ca[8]!==amm([Buffer.from('__event_authority')])||ca[9]!==PUMP_AMM_PROGRAM_ID)throw new Error('Noncanonical consolidation accounts');
  const t=tx.tokenAccounts?.[source];
  if(!t||t.owner!==authority||t.mint!==WRAPPED_SOL_MINT||t.pre+sweep.poolSwept<t.post)throw new Error('Consolidation source mismatch');
  consolidated=t.pre+sweep.poolSwept-t.post;
 }
 if(quote===WRAPPED_SOL_MINT){
  // The vault receives the consolidated pool fees (if any) and pays out exactly the distributed shares.
  if((tx.lamportDeltas[vault]??0n)!==sweep.curveSwept+sweep.rentFunding+consolidated-paid)throw new Error('Creator vault debit mismatch');
  for(const p of payouts){const delta=(tx.lamportDeltas[p.address]??0n)+(tx.feePayer===p.address?(tx.feeLamports??0n):0n);if(delta!==p.amount)throw new Error('Recipient lamports do not reconcile');}
 }else{
  const source=tx.tokenAccounts?.[a[8]!];if(!source||source.owner!==vault||source.mint!==quote||source.decimals!==6||source.pre+sweep.curveSwept+consolidated-source.post!==paid)throw new Error('Quote vault debit mismatch');
  grossCandidates=grossCandidates.filter(g=>g===source.pre+sweep.curveSwept+consolidated);
  if(!grossCandidates.length)throw new Error('Quote vault gross amount does not reconcile');
  for(let i=0;i<2;i++){const p=payouts[i]!,dest=associatedAccount(p.address,quote),t=tx.tokenAccounts?.[dest];if(a[14+i]!==dest||!t||t.owner!==p.address||t.mint!==quote||t.decimals!==6||t.post-t.pre!==p.amount)throw new Error('Quote recipient balance mismatch');}
 }
 return {mint,quote,decimals:quote===WRAPPED_SOL_MINT?9:6,symbol:quote===WRAPPED_SOL_MINT?'SOL':'USDC',ixIndex:ix.ixIndex,total,dust:grossCandidates.length===1?grossCandidates[0]!-paid:null,consolidated,swept:sweep.curveSwept+sweep.poolSwept,payouts};
}
// Explicit discriminator helper for test fixtures; not accepted as RPC evidence by itself.
export const distributionEventPrefix=()=>Buffer.from(eventPrefix);
