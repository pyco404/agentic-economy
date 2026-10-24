import {expect,it,vi}from'vitest';
import {cachedBackgroundChain}from'../src/chain/background-cache.js';
import {MockChain}from'../src/chain/mock.js';
import type{ObservedTransaction}from'../src/chain/types.js';
it('deduplicates network verification and expires it without caching failures',async()=>{
 let now=0;const chain=new MockChain(),get=vi.fn(async()=>'verified-genesis');Object.assign(chain,{getGenesisHash:get});const cached=cachedBackgroundChain(chain,()=>now);
 await Promise.all([cached.getGenesisHash!(),cached.getGenesisHash!()]);expect(get).toHaveBeenCalledTimes(1);now=30001;await cached.getGenesisHash!();expect(get).toHaveBeenCalledTimes(2);
 get.mockRejectedValueOnce(Error('unavailable'));now+=30001;await expect(cached.getGenesisHash!()).rejects.toThrow();await cached.getGenesisHash!();expect(get).toHaveBeenCalledTimes(4);
});
it('caches only successful finalized exact-signature evidence and clones return values',async()=>{
 let commitment:'confirmed'|'finalized'='confirmed',now=0;const chain=new MockChain();const get=vi.spyOn(chain,'getTransaction').mockImplementation(async signature=>({signature,commitment,err:null,slot:1,lamportDeltas:{wallet:1n}}as unknown as ObservedTransaction));const cached=cachedBackgroundChain(chain,()=>now);
 await cached.getTransaction('sig');await cached.getTransaction('sig');expect(get).toHaveBeenCalledTimes(2);commitment='finalized';await Promise.all([cached.getTransaction('sig'),cached.getTransaction('sig')]);expect(get).toHaveBeenCalledTimes(3);
 const result=(await cached.getTransaction('sig'))!;result.slot=99;expect((await cached.getTransaction('sig'))!.slot).toBe(1);now=1800001;await cached.getTransaction('sig');expect(get).toHaveBeenCalledTimes(4);
 get.mockResolvedValue(null);await cached.getTransaction('absent');await cached.getTransaction('absent');expect(get).toHaveBeenCalledTimes(6);
});
