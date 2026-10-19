import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {Keypair} from '@solana/web3.js';
import {WRAPPED_SOL_MINT} from '@agentic-economy/shared';
import {distributionMint,verifiedCreatorDistribution} from '../src/chain/creator-fees.js';
import type {ObservedTransaction} from '../src/chain/types.js';

/**
 * Real distributions captured by scripts/test-graduation-local.ts on an isolated validator running the cloned devnet
 * Pump, Pump Fees and PumpSwap programs, for a SOL coin launched with the platform's locked 60/40 sharing config:
 * - complete-unmigrated: curve bought out, not yet migrated (plain distribute_creator_fees);
 * - graduated: after migration and one pool trade, the SDK's standard pump-amm transfer_creator_fees_to_pump
 *   followed by distribute_creator_fees in one transaction.
 */
type Fixture={signature:string;platform:string;agent:string;tx:ObservedTransaction};
const load=(name:string):Fixture=>JSON.parse(readFileSync(new URL(`./fixtures/pump-distribution-${name}-local.json`,import.meta.url),'utf8'),
 (_k,v)=>v&&typeof v==='object'&&'$bigint' in v?BigInt((v as {$bigint:string}).$bigint):v);
const CONSOLIDATE='8b348655e4e56cf1';

describe('creator fees across graduation',()=>{
 it('verifies a distribution after the curve completes but before migration',()=>{
  const f=load('complete-unmigrated'),v=verifiedCreatorDistribution(f.tx,f.platform,f.agent);
  expect(v).toMatchObject({quote:WRAPPED_SOL_MINT,total:2_550_160n,dust:0n,consolidated:0n});
  expect(v.payouts.map(p=>p.amount).sort()).toEqual([1_020_064n,1_530_096n]);
 });

 it('verifies the post-graduation consolidation + distribution: pool fees reach the treasuries exactly 60/40',()=>{
  const f=load('graduated'),v=verifiedCreatorDistribution(f.tx,f.platform,f.agent);
  expect(v).toMatchObject({quote:WRAPPED_SOL_MINT,symbol:'SOL',total:14_814_815n,dust:0n,consolidated:14_814_815n});
  expect(v.payouts).toEqual(expect.arrayContaining([
   expect.objectContaining({address:f.agent,bps:6000,amount:8_888_889n}),
   expect.objectContaining({address:f.platform,bps:4000,amount:5_925_926n}),
  ]));
  expect(distributionMint(f.tx)).toBe(v.mint);
 });

 it('rejects tampered or unsupported consolidation envelopes',()=>{
  const consolidation=(tx:ObservedTransaction)=>tx.instructions.find(i=>i.discriminatorHex===CONSOLIDATE)!;
  const other=Keypair.generate().publicKey.toBase58();
  // Treasuries swapped or foreign.
  let f=load('graduated');expect(()=>verifiedCreatorDistribution(f.tx,f.agent,f.platform)).toThrow(/shares/);
  // Consolidation from another coin creator's vault authority.
  f=load('graduated');consolidation(f.tx).accounts[5]=other;expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/consolidation accounts/);
  // Consolidation after the distribution does not fund it.
  f=load('graduated');consolidation(f.tx).ixIndex=99;expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/consolidation/);
  // Source balance change that does not match what the vault received and paid out.
  f=load('graduated');const src=consolidation(f.tx).accounts[6]!;f.tx.tokenAccounts![src]!.pre+=1n;expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/vault/);
  // Missing source evidence.
  f=load('graduated');delete f.tx.tokenAccounts![src];expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/source/);
  // Two consolidations, or any other instruction in the envelope.
  f=load('graduated');f.tx.instructions.push({...consolidation(f.tx),ixIndex:f.tx.instructions.length});expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/envelope/);
  f=load('graduated');f.tx.instructions.push({...consolidation(f.tx),programId:other,ixIndex:f.tx.instructions.length});expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/envelope/);
  // Altered recipient lamports.
  f=load('graduated');f.tx.lamportDeltas[f.platform]=5_925_927n;expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/lamports/);
 });
});
