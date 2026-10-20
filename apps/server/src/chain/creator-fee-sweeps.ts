import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {PUMP_AMM_PROGRAM_ID,PUMP_PROGRAM_ID,SYSTEM_PROGRAM_ID,WRAPPED_SOL_MINT} from '@agentic-economy/shared';
import {bondingCurvePda,creatorVaultPda,sharingConfigPda} from './pump.js';
import sdk from './pump-sdk.cjs';
import type {ObservedTransaction} from './types.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const CREATOR_SWEEP='20f6bf3408c949ba';
export const pda=(program:string,seeds:Buffer[])=>PublicKey.findProgramAddressSync(seeds,new PublicKey(program))[0].toBase58();
export const quoteAta=(owner:string,mint:string)=>pda(ATA,[new PublicKey(owner).toBuffer(),new PublicKey(TOKEN).toBuffer(),new PublicKey(mint).toBuffer()]);
const equal=(actual:string[],expected:string[])=>actual.length===expected.length&&actual.every((k,i)=>k===expected[i]);
/** Verify only canonical creator sweeps and their authenticated self-CPI events; protocol/LP fees never qualify. */
export function verifyCreatorSweeps(tx:ObservedTransaction,mint:string,quote:string,distributionIndex:number,consolidationIndex?:number){
 const sweeps=tx.instructions.filter(i=>[PUMP_PROGRAM_ID,PUMP_AMM_PROGRAM_ID].includes(i.programId)&&i.discriminatorHex===CREATOR_SWEEP);
 if(sweeps.length&&quote!==WRAPPED_SOL_MINT)throw Error('Non-SOL creator sweeps are disabled pending verification');
 const sc=sharingConfigPda(mint),vault=creatorVaultPda(sc),curve=bondingCurvePda(mint);
 const ammVault=pda(PUMP_AMM_PROGRAM_ID,[Buffer.from('creator_vault'),new PublicKey(sc).toBuffer()]);
 const pool=sdk.canonicalPumpPoolPdaWithQuote(new PublicKey(mint),new PublicKey(quote)).toBase58();
 let curveSwept=0n,poolSwept=0n,rentFunding=0n;
 if(new Set(sweeps.map(i=>i.programId)).size!==sweeps.length)throw Error('Duplicate creator sweeps');
 for(const ix of sweeps){
  const a=ix.accounts,payer=a[0]!,pump=ix.programId===PUMP_PROGRAM_ID;
  if(!tx.signers.includes(payer)||ix.ixIndex>=distributionIndex||(!pump&&(consolidationIndex===undefined||ix.ixIndex>=consolidationIndex))||Buffer.from(ix.dataBase64??'','base64').toString('hex')!==CREATOR_SWEEP)throw Error('Invalid creator sweep ordering or signer');
  const eventAuthority=pda(ix.programId,[Buffer.from('__event_authority')]);
  const expected=pump?[payer,pda(PUMP_PROGRAM_ID,[Buffer.from('global')]),mint,quote,TOKEN,ATA,SYSTEM_PROGRAM_ID,curve,quoteAta(curve,quote),vault,quoteAta(vault,quote),eventAuthority,PUMP_PROGRAM_ID]
   :[payer,pda(PUMP_AMM_PROGRAM_ID,[Buffer.from('global_config')]),pool,quote,TOKEN,quoteAta(pool,quote),ammVault,quoteAta(ammVault,quote),SYSTEM_PROGRAM_ID,ATA,eventAuthority,PUMP_AMM_PROGRAM_ID];
  if(!equal(a,expected))throw Error('Noncanonical creator sweep accounts');
  const prefix=Buffer.concat([Buffer.from('e445a52e51cb9a1d','hex'),createHash('sha256').update(`event:${pump?'SweepBondingCurveFeeEvent':'SweepPoolFeeEvent'}`).digest().subarray(0,8)]);
  const events=(tx.innerInstructions??[]).filter(i=>i.parentIndex===ix.ixIndex&&i.programId===ix.programId&&i.stackHeight===2&&i.accounts[0]===eventAuthority&&Buffer.from(i.dataBase64,'base64').subarray(0,16).equals(prefix));
  if(events.length!==1)throw Error('Missing authenticated creator sweep event');
  const raw=Buffer.from(events[0]!.dataBase64,'base64');if(raw.length!==(pump?161:193))throw Error('Unknown creator sweep event layout');
  let amount:bigint;
  if(pump){
   const event=sdk.PUMP_SDK.decodeSweepBondingCurveFeeEvent(raw.subarray(16)),q=event.quoteMint.toBase58();
   if(event.bucket!==1||event.recipient.toBase58()!==vault||(q===SYSTEM_PROGRAM_ID?WRAPPED_SOL_MINT:q)!==quote||event.mint.toBase58()!==mint||event.bondingCurve.toBase58()!==curve)throw Error('Creator sweep event mismatch');
   amount=BigInt(event.amount.toString());curveSwept=amount;
  }else{
   const event=sdk.PUMP_SDK.decodeSweepPoolFeeEventAmm(raw.subarray(16)),q=event.quoteMint.toBase58();
   if(event.bucket!==1||event.recipient.toBase58()!==ammVault||(q===SYSTEM_PROGRAM_ID?WRAPPED_SOL_MINT:q)!==quote||event.baseMint.toBase58()!==mint||event.pool.toBase58()!==pool||event.payer.toBase58()!==payer)throw Error('Creator sweep event mismatch');
   amount=BigInt(event.amount.toString());poolSwept=amount;
  }
  // A native curve sweep may initialize its creator vault. This rent is not creator-fee income.
  if(pump&&quote===WRAPPED_SOL_MINT)for(const i of tx.innerInstructions??[]){
   const data=Buffer.from(i.dataBase64,'base64');
   if(i.parentIndex===ix.ixIndex&&i.programId===SYSTEM_PROGRAM_ID&&i.stackHeight===2&&i.accounts.length===2&&i.accounts[0]===payer&&i.accounts[1]===vault&&data.length===12&&data.readUInt32LE(0)===2)rentFunding+=data.readBigUInt64LE(4);
  }
 }
 return {sweeps,curveSwept,poolSwept,rentFunding,ammVault,pool};
}
