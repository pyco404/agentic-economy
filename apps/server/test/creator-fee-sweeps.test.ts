import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {verifiedCreatorDistribution} from '../src/chain/creator-fees.js';
import type {ObservedTransaction} from '../src/chain/types.js';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/pump-distribution-swept-local.json',import.meta.url),'utf8'),(_k,v)=>v&&typeof v==='object'&&'$bigint'in v?BigInt(v.$bigint):v) as {tx:ObservedTransaction;platform:string;agent:string};
it('verifies captured v3 creator sweep + distribution and excludes rent from fee income',()=>{
 const f=fixture(),v=verifiedCreatorDistribution(f.tx,f.platform,f.agent);
 expect(v).toMatchObject({symbol:'SOL',total:2_550_160n,swept:2_550_161n,dust:0n});expect(v.payouts.map(p=>p.amount)).toEqual([1_530_096n,1_020_064n]);
});
it('rejects altered sweep destination, protocol buckets, spoofed event authority and unknown instructions',()=>{
 const f=fixture();f.tx.instructions[1]!.accounts[9]=f.agent;expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/sweep accounts/);
 const g=fixture(),event=g.tx.innerInstructions!.find(i=>i.parentIndex===1&&i.programId===g.tx.instructions[1]!.programId&&Buffer.from(i.dataBase64,'base64').length===161)!;
 const raw=Buffer.from(event.dataBase64,'base64');raw[160]=0;event.dataBase64=raw.toString('base64');expect(()=>verifiedCreatorDistribution(g.tx,g.platform,g.agent)).toThrow(/event mismatch/);
 const h=fixture();h.tx.instructions.push({...h.tx.instructions[1]!,ixIndex:99});expect(()=>verifiedCreatorDistribution(h.tx,h.platform,h.agent)).toThrow(/Duplicate/);
});
