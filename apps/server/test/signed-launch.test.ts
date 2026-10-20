import {expect,it} from 'vitest';
import {Keypair} from '@solana/web3.js';
import bs58 from 'bs58';
import {SignedLaunchStore,SIGNED_LAUNCH_RETENTION_MS} from '../src/store/signed-launch.js';
const key=()=>Keypair.generate().publicKey.toBase58();
const input=()=>({wallet:key(),launchId:'lch_test',mint:key(),genesisHash:key(),signature:bs58.encode(new Uint8Array(64).fill(1)),transaction:'signed-transaction'});
it('retains exact payload idempotently, binds ownership and rejects conflicting content',async()=>{
 const s=new SignedLaunchStore(),r=input();await Promise.all([s.put(r),s.put(r)]);
 expect(await s.get(r.wallet,r.launchId)).toMatchObject(r);expect(await s.get(key(),r.launchId)).toBeNull();
 await expect(s.put({...r,transaction:'different'})).rejects.toThrow('different signed');
 expect(await s.get(r.wallet,r.launchId)).toMatchObject(r);
});
it('erases payloads on finality or after bounded retention without losing public signature evidence',async()=>{
 let now=1000;const s=new SignedLaunchStore(undefined,()=>now),r=input();await s.put(r);await s.erase(r.wallet,r.launchId);
 expect(await s.get(r.wallet,r.launchId)).toMatchObject({signature:r.signature});expect((await s.get(r.wallet,r.launchId))!.transaction).toBeUndefined();
 const other={...input(),launchId:'lch_other'};await s.put(other);now+=SIGNED_LAUNCH_RETENTION_MS;await s.prune();
 expect((await s.get(other.wallet,other.launchId))!.transaction).toBeUndefined();expect((await s.get(other.wallet,other.launchId))!.signature).toBe(other.signature);
});
