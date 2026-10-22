import {describe,it,expect} from 'vitest';
import {Keypair,type VersionedTransactionResponse} from '@solana/web3.js';
import {PUMP_PROGRAM_ID,WRAPPED_SOL_MINT,type Community,type TokenLaunch} from '@agentic-economy/shared';
import {associatedAccount,USDC_MINT,verifiedCreatorDistribution} from '../src/chain/creator-fees.js';
import {sharingConfigPda} from '../src/chain/pump.js';
import {MemoryStore} from '../src/store/memory.js';
import {TreasuryService} from '../src/services/treasury.js';
import {loadConfig} from '../src/config.js';
import {PublicKey} from '@solana/web3.js';
import {distribution} from './fixtures/creator-distribution.js';
const key=()=>Keypair.generate().publicKey.toBase58();
describe('instruction-scoped creator distributions',()=>{
 it.each([WRAPPED_SOL_MINT,USDC_MINT])('verifies denomination and retained fractional-share dust for %s',quote=>{const f=distribution(quote);const v=verifiedCreatorDistribution(f.tx,f.platform,f.agent);expect(v.total).toBe(1000n);expect(v.dust).toBe(quote===WRAPPED_SOL_MINT?null:1n);expect(v.payouts.map(p=>p.amount)).toEqual([600n,400n]);expect(v.decimals).toBe(quote===USDC_MINT?6:9);});
 it('rejects a successful no-op distribution rather than recording earned income',()=>{const f=distribution(WRAPPED_SOL_MINT,0n);expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow('No creator fees distributed');});
 it('rejects unrelated transfers, spoofed events and duplicate distributions',()=>{
  const f=distribution();f.tx.lamportDeltas[f.platform]=401n;expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/lamports/);
  f.tx.lamportDeltas[f.platform]=400n;f.tx.innerInstructions![0]!.programId=key();expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/event/);
  f.tx.innerInstructions![0]!.programId=PUMP_PROGRAM_ID;f.tx.instructions.push({...f.tx.instructions[0]!,ixIndex:1});expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/envelope/);
 });
 it('rejects wrong quote, ATAs, unsupported policies and token credits',()=>{
  const f=distribution(USDC_MINT);f.tx.tokenAccounts![associatedAccount(f.platform,USDC_MINT)]!.post=401n;expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/balance/);
  f.tx.tokenAccounts![associatedAccount(f.platform,USDC_MINT)]!.post=400n;f.tx.instructions[0]!.accounts[15]=key();expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/balance/);
  f.tx.instructions[0]!.accounts[9]=key();expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/denomination/);
 });
 it('adjusts only the actual transaction fee when a treasury cranks distribution',()=>{const f=distribution();f.tx.feePayer=f.agent;f.tx.lamportDeltas[f.agent]=600n-5000n;expect(verifiedCreatorDistribution(f.tx,f.platform,f.agent).payouts[0]!.amount).toBe(600n);});
 it('fails closed on malformed or missing instruction/event evidence',()=>{const f=distribution();delete f.tx.innerInstructions;expect(()=>verifiedCreatorDistribution(f.tx,f.platform,f.agent)).toThrow(/event/);});
 it('requires a confirmed matching platform launch before a real receipt can enter the ledger',async()=>{const f=distribution();const store=new MemoryStore(),t=new TreasuryService(store,{...loadConfig({MODE:'demo'}),mode:'devnet'});const c={mint:f.mint,feeSharingConfig:sharingConfigPda(f.mint),launchId:'lch_fake0001'} as Community;expect((await t.ingestCreatorFeeDistribution(f.tx,[c])).accepted).toBe(false);expect(await store.allTreasuryEntries()).toEqual([]);});
});

it('accounts verified RPC distributions using original treasury destinations, separate assets and immutable evidence',async()=>{
 const f=distribution(USDC_MINT),store=new MemoryStore();
 const fixture=(await import('../../../packages/shared/fixtures/launch.json')).default.launch;
 const launch={...structuredClone(fixture),mode:'devnet' as const,mint:f.mint,communityId:'com_actual01',signature:'2'.repeat(88),fees:{...fixture.fees,platformTreasury:f.platform,creatorFeeSplit:{...fixture.fees.creatorFeeSplit,agentRewardsTreasury:f.agent}}} as TokenLaunch;
 await store.createLaunch(launch);
 const c={id:'com_actual01',mint:f.mint,launchId:launch.id,launchSignature:launch.signature,feeSharingConfig:sharingConfigPda(f.mint)} as Community;
 const t=new TreasuryService(store,{...loadConfig({MODE:'demo'}),mode:'devnet'});
 expect((await t.ingestCreatorFeeDistribution(f.tx,[c])).inserted).toHaveLength(2);
 expect((await t.ingestCreatorFeeDistribution(f.tx,[c])).inserted).toHaveLength(0);
 const s=await t.summary(1);expect(s.creatorFees.agentRewards[0]).toMatchObject({assetSymbol:'USDC',decimals:6,finalized:'600'});expect(s.creatorFees.platform[0]!.finalized).toBe('400');expect(s.launchFees.totals).toEqual([]);
 expect(s.recentEntries.every(e=>e.evidence?.distributedDust==='1'&&e.evidence.source==='solana_rpc'&&e.evidence.network==='devnet')).toBe(true);
 f.tx.genesisHash='wrong-network';expect((await t.ingestCreatorFeeDistribution(f.tx,[c])).reason).toContain('genesis');
});

it('normalizes RPC inner event instructions and exact token balances before USDC verification',async()=>{
 const {TransactionMessage,TransactionInstruction}=await import('@solana/web3.js');const {normalizeTransaction}=await import('../src/chain/solana.js');const bs58=(await import('bs58')).default;
 const f=distribution(USDC_MINT),ix=f.tx.instructions[0]!,message=new TransactionMessage({payerKey:new PublicKey(ix.accounts[0]!),recentBlockhash:key(),instructions:[new TransactionInstruction({programId:new PublicKey(PUMP_PROGRAM_ID),keys:ix.accounts.map((pubkey,i)=>({pubkey:new PublicKey(pubkey),isSigner:i===0,isWritable:true})),data:Buffer.from(ix.dataBase64!,'base64')})]}).compileToV0Message();const keys=message.staticAccountKeys.map(k=>k.toBase58());
 const preBalances=keys.map(()=>1000000),postBalances=keys.map(k=>1000000+Number(f.tx.lamportDeltas[k]??0n));
 const preTokenBalances=Object.entries(f.tx.tokenAccounts!).map(([address,b])=>({accountIndex:keys.indexOf(address),mint:b.mint,owner:b.owner,uiTokenAmount:{amount:b.pre.toString(),decimals:b.decimals,uiAmount:null}}));
 const postTokenBalances=preTokenBalances.map(b=>({...b,uiTokenAmount:{...b.uiTokenAmount,amount:f.tx.tokenAccounts![keys[b.accountIndex]!]!.post.toString()}}));
 const raw={slot:100,transaction:{message,signatures:[f.tx.signature]},meta:{err:null,fee:5000,preBalances,postBalances,preTokenBalances,postTokenBalances,innerInstructions:[{index:0,instructions:[{programIdIndex:keys.indexOf(PUMP_PROGRAM_ID),accounts:[keys.indexOf(ix.accounts[6]!)],data:bs58.encode(Buffer.from(f.tx.innerInstructions![0]!.dataBase64,'base64')),stackHeight:2}]}]}};
 const tx=normalizeTransaction(f.tx.signature,raw as unknown as VersionedTransactionResponse,'finalized');
 expect(verifiedCreatorDistribution(tx,f.platform,f.agent)).toMatchObject({symbol:'USDC',total:1000n,dust:1n});
});
