import {expect,it} from 'vitest';
import {marketTransaction} from '../src/chain/market-transaction.js';
const signature='1'.repeat(64),key='11111111111111111111111111111111';
const fixture=(version:'legacy'|0|1=1)=>({version,slot:1,blockTime:100,transaction:{signatures:[signature],message:{accountKeys:[key],instructions:[{programIdIndex:0,accounts:[0],data:''}],...(version===1?{transactionConfig:{computeUnitLimit:200000,priorityFee:50}}:{})}},meta:{err:null,innerInstructions:[],loadedAddresses:{writable:[] as string[],readonly:[] as string[]}}});
it('reads compiled market evidence for legacy, v0 and v1 without signing or dropping account indices',()=>{
 for(const v of ['legacy',0,1] as const)expect(marketTransaction(fixture(v),signature)).toMatchObject({slot:1,blockTime:100,keys:[key],instructions:[{programIdIndex:0,accounts:[0],data:''}]});
});
it('rejects unsupported versions, missing success evidence, signature mismatches and invalid indices',()=>{
 for(const raw of [{...fixture(),version:2},{...fixture(),meta:{innerInstructions:[]}},{...fixture(),meta:{...fixture().meta,err:{InstructionError:[0,'failed']}}}])expect(()=>marketTransaction(raw,signature)).toThrow();
 expect(()=>marketTransaction(fixture(),'other-signature')).toThrow(/signature/);
 const bad=fixture();bad.transaction.message.instructions[0]!.accounts=[2];expect(()=>marketTransaction(bad,signature)).toThrow(/index/);
 const loaded=fixture();loaded.meta.loadedAddresses.writable.push(key);expect(()=>marketTransaction(loaded,signature)).toThrow(/v1/);
});
