import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {Keypair} from '@solana/web3.js';
import {WRAPPED_SOL_MINT} from '@agentic-economy/shared';
import {distributionMint,verifiedCreatorDistribution} from '../src/chain/creator-fees.js';
import {distribution} from './fixtures/creator-distribution.js';
import type {ObservedTransaction} from '../src/chain/types.js';

/**
 * A real distribute_creator_fees transaction (the SDK's standard path for SOL coins), captured from an isolated
 * local validator running the cloned devnet Pump programs, for a SOL coin launched through the application after
 * one test buy. Normalized by SolanaRpcChain exactly as the indexer sees it.
 */
const load=():ObservedTransaction=>JSON.parse(readFileSync(new URL('./fixtures/pump-distribution-v1-local.json',import.meta.url),'utf8'),
 (_k,v)=>v&&typeof v==='object'&&'$bigint' in v?BigInt((v as {$bigint:string}).$bigint):v).tx;
const AGENT='C2DTiS8qWqsehvQc8oqsa82rHwnjSCbmKuZ7smajQWd',PLATFORM='4zgPy6LyASjdGCSXhqKKbsS176jQHEshDKrZKN6dhrDb';

describe('original distribute_creator_fees (SOL)',()=>{
 it('verifies the real distribution: exact 60/40 payouts that reconcile to the creator vault, no dust',()=>{
  const tx=load(),v=verifiedCreatorDistribution(tx,PLATFORM,AGENT);
  expect(v).toMatchObject({quote:WRAPPED_SOL_MINT,symbol:'SOL',decimals:9,total:2_550_160n,dust:0n});
  expect(v.payouts).toEqual(expect.arrayContaining([
   expect.objectContaining({address:AGENT,bps:6000,amount:1_530_096n}),
   expect.objectContaining({address:PLATFORM,bps:4000,amount:1_020_064n}),
  ]));
  expect(distributionMint(tx)).toBe(tx.instructions.find(i=>i.discriminatorHex==='a572670079cef751')!.accounts[0]);
 });

 it('rejects the same evidence for other treasuries, altered balances, forged events or extra instructions',()=>{
  expect(()=>verifiedCreatorDistribution(load(),AGENT,PLATFORM)).toThrow(/shares/);
  const other=Keypair.generate().publicKey.toBase58();
  expect(()=>verifiedCreatorDistribution(load(),other,AGENT)).toThrow(/shares/);
  const altered=load();altered.lamportDeltas[PLATFORM]=1_020_065n;
  expect(()=>verifiedCreatorDistribution(altered,PLATFORM,AGENT)).toThrow(/lamports/);
  const vault=load();const v=Object.keys(vault.lamportDeltas).find(k=>vault.lamportDeltas[k]===-2_550_160n)!;vault.lamportDeltas[v]=-2_550_161n;
  expect(()=>verifiedCreatorDistribution(vault,PLATFORM,AGENT)).toThrow(/vault/);
  const forged=load();const event=forged.innerInstructions!.find(i=>i.programId==='6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')!;event.accounts=[other];
  expect(()=>verifiedCreatorDistribution(forged,PLATFORM,AGENT)).toThrow(/event/);
  const extra=load();extra.instructions.push({...extra.instructions[0]!,programId:other,ixIndex:extra.instructions.length});
  expect(()=>verifiedCreatorDistribution(extra,PLATFORM,AGENT)).toThrow(/envelope/);
  const reordered=load();const ix=reordered.instructions.find(i=>i.discriminatorHex==='a572670079cef751')!;[ix.accounts[7],ix.accounts[8]]=[ix.accounts[8]!,ix.accounts[7]!];
  expect(()=>verifiedCreatorDistribution(reordered,PLATFORM,AGENT)).toThrow(/shares/);
 });

 it('still verifies v2 distributions and locates their mint',()=>{
  const f=distribution();
  expect(verifiedCreatorDistribution(f.tx,f.platform,f.agent).symbol).toBe('SOL');
  expect(distributionMint(f.tx)).toBe(f.tx.instructions[0]!.accounts[1]);
  expect(distributionMint({instructions:[]})).toBeNull();
 });
});
