import { closeSync, constants, fstatSync, fsyncSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PublicKey } from '@solana/web3.js';
export type MintReservation = {launchId:string;mint:string;messageSha256:string;previousMessageSha256?:string};
const hash=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const validate=(r:MintReservation)=>{if(new PublicKey(r.mint).toBase58()!==r.mint||!r.launchId||!hash(r.messageSha256)||(r.previousMessageSha256!==undefined&&!hash(r.previousMessageSha256)))throw new Error('Invalid reservation');};
/** One immutable initial reservation plus an append-only renewal chain. Explicit predecessor approval only.
 * Never releases a mint, infers expiry or broadcasts. A crash/partial record fails closed for reconciliation. */
export async function withMintReservation<T>(state:string,reservation:MintReservation,run:()=>Promise<T>):Promise<T>{
 validate(reservation);
 const lock=resolve(state,reservation.mint+'.lock'),record=resolve(state,reservation.mint+'.json'),journal=resolve(state,reservation.mint+'.renewals.jsonl');
 const lockFd=openSync(lock,'wx',0o600);closeSync(lockFd);
 const safe=(fd:number,max:number)=>{const st=fstatSync(fd);if(!st.isFile()||st.nlink!==1||st.size>max||(st.mode&0o077)!==0||st.uid!==process.getuid?.())throw new Error('Unsafe reservation');};
 try{
  try{const fd=openSync(record,'wx',0o600);try{writeFileSync(fd,JSON.stringify(reservation)+'\n');fsyncSync(fd);}finally{closeSync(fd);}}
  catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
  const fd=openSync(record,constants.O_RDONLY|constants.O_NOFOLLOW);let head:MintReservation;
  try{safe(fd,2048);head=JSON.parse(readFileSync(fd,'utf8')) as MintReservation;validate(head);}finally{closeSync(fd);}
  const history=openSync(journal,constants.O_RDWR|constants.O_CREAT|constants.O_APPEND|constants.O_NOFOLLOW,0o600);
  try{
   safe(history,1_000_000);const text=readFileSync(history,'utf8');
   if(text&&!text.endsWith('\n'))throw new Error('Incomplete renewal journal; reconcile before signing');
   for(const line of text.split('\n').filter(Boolean)){
    const next=JSON.parse(line) as MintReservation;validate(next);
    if(next.mint!==head.mint||next.launchId!==head.launchId||next.previousMessageSha256!==head.messageSha256||next.messageSha256===head.messageSha256)throw new Error('Invalid renewal chain');
    head=next;
   }
   if(head.mint!==reservation.mint||head.launchId!==reservation.launchId)throw new Error('Mint already reserved; reconcile before another attempt');
   if(head.messageSha256!==reservation.messageSha256){
    if(!reservation.previousMessageSha256||reservation.previousMessageSha256!==head.messageSha256)throw new Error('Mint already reserved; explicit approval of the current predecessor is required');
    writeFileSync(history,JSON.stringify(reservation)+'\n');fsyncSync(history);
   }else if(head.previousMessageSha256!==reservation.previousMessageSha256)throw new Error('Renewal approval differs from the saved message');
  }finally{closeSync(history);}
  const directory=openSync(state,constants.O_RDONLY);try{fsyncSync(directory);}finally{closeSync(directory);}
  return await run();
 }finally{unlinkSync(lock);}
}
