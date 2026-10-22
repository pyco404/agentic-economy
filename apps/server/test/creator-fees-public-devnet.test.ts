import{readFileSync}from'node:fs';
import{describe,it,expect}from'vitest';
import{verifiedCreatorDistribution}from'../src/chain/creator-fees.js';
import type{ObservedTransaction}from'../src/chain/types.js';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/pump-distribution-public-devnet.json',import.meta.url),'utf8'),(_k,v)=>v&&typeof v==='object'&&'$bigint'in v?BigInt(v.$bigint):v) as {tx:ObservedTransaction;platform:string;agent:string};
describe('captured finalized public Devnet distribution',()=>{
 it('uses net distributed event correctly, preserving the actual 60% credit and unique rounding dust',()=>{
  const f=fixture(),v=verifiedCreatorDistribution(f.tx,f.platform,f.agent);
  expect(v).toMatchObject({total:25886n,dust:1n});
  expect(v.payouts.map(p=>p.amount)).toEqual([15532n,10354n]);
  expect(f.tx.commitment).toBe('finalized');expect(f.tx.err).toBeNull();
 });
 it('rejects changed credits, vault debit, forged event and an added funding sibling',()=>{
  let f=fixture();f.tx.lamportDeltas[f.agent]=f.tx.lamportDeltas[f.agent]!-1n;expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/lamports/);
  f=fixture();const vault=f.tx.instructions[1]!.accounts[3]!;f.tx.lamportDeltas[vault]=f.tx.lamportDeltas[vault]!-1n;expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/vault/);
  f=fixture();f.tx.innerInstructions![2]!.accounts[0]=f.agent;expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/event/);
  f=fixture();f.tx.instructions.push({ixIndex:2,programId:'11111111111111111111111111111111',discriminatorHex:null,accounts:[f.tx.feePayer,f.agent]});expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/envelope/);
 });
});
