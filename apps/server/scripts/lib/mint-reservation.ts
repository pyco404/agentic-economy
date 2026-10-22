import { closeSync, constants, fstatSync, fsyncSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PublicKey } from '@solana/web3.js';
export type MintReservation = {launchId:string;mint:string;messageSha256:string};
/** Private local journal. No expiry/release/generation/broadcast path exists.
 * A crash can leave a lock: stop for reconciliation rather than silently releasing it. */
export async function withMintReservation<T>(state:string,reservation:MintReservation,run:()=>Promise<T>):Promise<T>{
  if(new PublicKey(reservation.mint).toBase58()!==reservation.mint||!reservation.launchId||!/^[a-f0-9]{64}$/.test(reservation.messageSha256))throw new Error('Invalid reservation');
  const lock=resolve(state,reservation.mint+'.lock'),record=resolve(state,reservation.mint+'.json');
  const lockFd=openSync(lock,'wx',0o600);closeSync(lockFd);
  try{
    let fd:number;
    try{
      fd=openSync(record,'wx',0o600);
      try{writeFileSync(fd,JSON.stringify(reservation)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
      const directory=openSync(state,constants.O_RDONLY);try{fsyncSync(directory);}finally{closeSync(directory);}
    }catch(e){
      if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
      fd=openSync(record,constants.O_RDONLY|constants.O_NOFOLLOW);
      try{
        const st=fstatSync(fd);if(!st.isFile()||st.size>2048||(st.mode&0o077)!==0||st.uid!==process.getuid?.())throw new Error('Unsafe reservation');
        const old=JSON.parse(readFileSync(fd,'utf8')) as MintReservation;
        if(old.launchId!==reservation.launchId||old.mint!==reservation.mint||old.messageSha256!==reservation.messageSha256)throw new Error('Mint already reserved; reconcile before another message');
      }finally{closeSync(fd);}
    }
    return await run();
  }finally{unlinkSync(lock);}
}
