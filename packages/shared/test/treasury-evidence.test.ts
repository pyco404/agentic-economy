import {it,expect} from 'vitest';
import {TreasuryEntry,WRAPPED_SOL_MINT} from '../src/index.js';
const entry={id:'tre_public',seq:1,stream:'creator_fee',account:'agent_rewards',accountAddress:'D8p7CytykA5Q7vSDGGoCJC6mNyLKXVwiEXLboih2ZHJs',assetMint:WRAPPED_SOL_MINT,assetSymbol:'SOL',decimals:9,amount:'15532',direction:'credit',signature:'1'.repeat(88),instructionIndex:1,slot:513831116,finality:'finalized',tokenMint:null,launchId:null,supersedes:null,recordedAt:'2026-10-22T09:02:45.000Z',evidence:{source:'solana_rpc',version:1,network:'devnet',distributed:'25886',distributedDust:null}};
it('preserves unknown rounding dust as null rather than inventing zero',()=>{expect(TreasuryEntry.parse(entry).evidence?.distributedDust).toBeNull();});
it('retains exact dust strings and rejects negative or malformed dust',()=>{
 expect(TreasuryEntry.parse({...entry,evidence:{...entry.evidence,distributedDust:'1'}}).evidence?.distributedDust).toBe('1');
 for(const dust of ['-1','unknown',1])expect(TreasuryEntry.safeParse({...entry,evidence:{...entry.evidence,distributedDust:dust}}).success).toBe(false);
});
