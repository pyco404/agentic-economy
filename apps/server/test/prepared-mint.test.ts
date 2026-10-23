import {describe,it,expect,vi} from 'vitest';
import type pg from 'pg';
import {PreparedMintStore} from '../src/store/prepared-mint.js';

describe('private generated-mint persistence (disposable keys only)',()=>{
 it('keeps an intent mint across store restarts and never substitutes a missing or conflicting signer',async()=>{
  const records=new Map<string,unknown>();
  const query=vi.fn(async(sql:string,args:unknown[])=>{
   const id=JSON.stringify(args.slice(0,2));
   if(sql.startsWith('INSERT')){if(!records.has(id))records.set(id,args[2]);return{rows:[]};}
   if(sql.startsWith('DELETE')){records.delete(id);return{rows:[]};}
   return{rows:records.has(id)?[{seed:(records.get(id) as {seed:string}).seed}]:[]};
  });
  const pool={query} as unknown as pg.Pool;
  const first=await new PreparedMintStore(pool).getOrCreate('wallet','intent');
  const mint=first.publicKey.toBase58();first.secretKey.fill(0);
  const restarted=new PreparedMintStore(pool),recovered=await restarted.getOrCreate('wallet','intent',mint);
  expect(recovered.publicKey.toBase58()).toBe(mint);recovered.secretKey.fill(0);
  await expect(restarted.getOrCreate('other-wallet','intent',mint)).rejects.toMatchObject({code:'unavailable'});
  await expect(restarted.getOrCreate('wallet','other-intent',mint)).rejects.toMatchObject({code:'unavailable'});
  await expect(restarted.getOrCreate('wallet','intent','wrong-mint')).rejects.toMatchObject({code:'unavailable'});
  expect(records.size).toBe(1);await restarted.erase('wallet','intent');expect(records.size).toBe(0);
  await expect(restarted.getOrCreate('wallet','intent',mint)).rejects.toMatchObject({code:'unavailable'});
 });
});
