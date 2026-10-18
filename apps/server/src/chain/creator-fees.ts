import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {PUMP_PROGRAM_ID,SYSTEM_PROGRAM_ID,WRAPPED_SOL_MINT} from '@agentic-economy/shared';
import {bondingCurvePda,creatorVaultPda,PUMP_IX,sharingConfigPda} from './pump.js';
import type {ObservedTransaction} from './types.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const USDC_MINT='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const eventPrefix=Buffer.concat([Buffer.from('e445a52e51cb9a1d','hex'),createHash('sha256').update('event:DistributeCreatorFeesEvent').digest().subarray(0,8)]);
export function associatedAccount(owner:string,mint:string){return PublicKey.findProgramAddressSync([new PublicKey(owner).toBuffer(),new PublicKey(TOKEN).toBuffer(),new PublicKey(mint).toBuffer()],new PublicKey(ATA))[0].toBase58();}
/** Official pinned V2 only. Conservative one-distribution envelope; complex batches
 * and unknown ABI/quote assets remain unaccounted, never inferred from balances.
 * The CPI event is authenticated by Pump's event-authority PDA, not text log content.
 */
export function verifiedCreatorDistribution(tx:ObservedTransaction,platform:string,agent:string){
 if(tx.source!=='solana_rpc'||tx.err!==null||platform===agent)throw new Error('Not successful RPC evidence');
 const distributions=tx.instructions.filter(i=>i.programId===PUMP_PROGRAM_ID&&i.discriminatorHex===PUMP_IX.distributeCreatorFeesV2);
 if(distributions.length!==1||tx.instructions.some(i=>i!==distributions[0]&&i.programId!=='ComputeBudget111111111111111111111111111111'))throw new Error('Unsupported distribution transaction envelope');
 const ix=distributions[0]!,a=ix.accounts,mint=a[1]!,sc=sharingConfigPda(mint),vault=creatorVaultPda(sc),quote=a[9]!;
 const programPda=(seed:string)=>PublicKey.findProgramAddressSync([Buffer.from(seed)],new PublicKey(PUMP_PROGRAM_ID))[0].toBase58();
 if(a.length!==(quote===WRAPPED_SOL_MINT?14:16)||a[2]!==bondingCurvePda(mint)||a[3]!==sc||a[4]!==vault||a[5]!==SYSTEM_PROGRAM_ID||a[6]!==programPda('__event_authority')||a[7]!==PUMP_PROGRAM_ID||a[8]!==associatedAccount(vault,quote)||a[10]!==TOKEN||a[11]!==ATA||![WRAPPED_SOL_MINT,USDC_MINT].includes(quote))throw new Error('Noncanonical distribution accounts or unsupported denomination');
 const data=Buffer.from(ix.dataBase64??'','base64');
 if(data.length!==9||data[8]!>1)throw new Error('Unknown distribution ABI');
 const events=(tx.innerInstructions??[]).filter(i=>i.parentIndex===ix.ixIndex&&i.programId===PUMP_PROGRAM_ID&&i.stackHeight===2&&i.accounts[0]===a[6]&&Buffer.from(i.dataBase64,'base64').subarray(0,16).equals(eventPrefix));
 if(events.length!==1)throw new Error('Missing authenticated distribution event');
 const b=Buffer.from(events[0]!.dataBase64,'base64');let offset=24;
 const key=()=>{const v=new PublicKey(b.subarray(offset,offset+32)).toBase58();offset+=32;return v;};
 if(b.length<16+8+128+4+68+8+32||key()!==mint||key()!==a[2]||key()!==sc)throw new Error('Event mint/config mismatch');
 key();const count=b.readUInt32LE(offset);offset+=4;
 if(count!==2)throw new Error('Unsupported shareholder policy');
 const shares=[];for(let i=0;i<count;i++){const address=key(),bps=b.readUInt16LE(offset);offset+=2;shares.push({address,bps});}
 const total=b.readBigUInt64LE(offset);offset+=8;const eventQuote=key();
 if(offset!==b.length||eventQuote!==quote||shares[0]!.address!==a[12]||shares[1]!.address!==a[13]||!shares.some(s=>s.address===agent&&s.bps===6000)||!shares.some(s=>s.address===platform&&s.bps===4000))throw new Error('Event shares/quote mismatch');
 const payouts=shares.map(s=>({...s,amount:total*BigInt(s.bps)/10000n})),paid=payouts.reduce((n,p)=>n+p.amount,0n);
 if(quote===WRAPPED_SOL_MINT){
  if((tx.lamportDeltas[vault]??0n)!==-paid)throw new Error('Creator vault debit mismatch');
  for(const p of payouts){const delta=(tx.lamportDeltas[p.address]??0n)+(tx.feePayer===p.address?(tx.feeLamports??0n):0n);if(delta!==p.amount)throw new Error('Recipient lamports do not reconcile');}
 }else{
  const source=tx.tokenAccounts?.[a[8]!];if(!source||source.owner!==vault||source.mint!==quote||source.decimals!==6||source.pre-source.post!==paid)throw new Error('Quote vault debit mismatch');
  for(let i=0;i<2;i++){const p=payouts[i]!,dest=associatedAccount(p.address,quote),t=tx.tokenAccounts?.[dest];if(a[14+i]!==dest||!t||t.owner!==p.address||t.mint!==quote||t.decimals!==6||t.post-t.pre!==p.amount)throw new Error('Quote recipient balance mismatch');}
 }
 return {mint,quote,decimals:quote===WRAPPED_SOL_MINT?9:6,symbol:quote===WRAPPED_SOL_MINT?'SOL':'USDC',ixIndex:ix.ixIndex,total,dust:total-paid,payouts};
}
// Explicit discriminator helper for test fixtures; not accepted as RPC evidence by itself.
export const distributionEventPrefix=()=>Buffer.from(eventPrefix);
