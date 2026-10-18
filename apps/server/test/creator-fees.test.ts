import {describe,it,expect} from 'vitest';
import {Keypair,type VersionedTransactionResponse} from '@solana/web3.js';
import {PUMP_PROGRAM_ID,SYSTEM_PROGRAM_ID,WRAPPED_SOL_MINT,type Community,type TokenLaunch} from '@agentic-economy/shared';
import {associatedAccount,distributionEventPrefix,USDC_MINT,verifiedCreatorDistribution} from '../src/chain/creator-fees.js';
import {bondingCurvePda,creatorVaultPda,sharingConfigPda,anchorIxDiscriminator} from '../src/chain/pump.js';
import type {ObservedTransaction} from '../src/chain/types.js';
import {MemoryStore} from '../src/store/memory.js';
import {TreasuryService} from '../src/services/treasury.js';
import {loadConfig} from '../src/config.js';
import {PublicKey} from '@solana/web3.js';
const key=()=>Keypair.generate().publicKey.toBase58();
export function distribution(quote=WRAPPED_SOL_MINT,total=1001n){
 const mint=key(),agent=key(),platform=key(),payer=key(),sc=sharingConfigPda(mint),vault=creatorVaultPda(sc),curve=bondingCurvePda(mint);
 const authority=PublicKey.findProgramAddressSync([Buffer.from('__event_authority')],new PublicKey(PUMP_PROGRAM_ID))[0].toBase58();
 const a=[payer,mint,curve,sc,vault,SYSTEM_PROGRAM_ID,authority,PUMP_PROGRAM_ID,associatedAccount(vault,quote),quote,'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA','ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',agent,platform];
 if(quote!==WRAPPED_SOL_MINT)a.push(associatedAccount(agent,quote),associatedAccount(platform,quote));
 const pk=(v:string)=>new PublicKey(v).toBuffer(),u64=(v:bigint)=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(v);return b;},u16=(v:number)=>{const b=Buffer.alloc(2);b.writeUInt16LE(v);return b;};
 const event=Buffer.concat([distributionEventPrefix(),Buffer.alloc(8),pk(mint),pk(curve),pk(sc),pk(payer),Buffer.from([2,0,0,0]),pk(agent),u16(6000),pk(platform),u16(4000),u64(total),pk(quote)]);
 const agentAmount=total*6000n/10000n,platformAmount=total*4000n/10000n,paid=agentAmount+platformAmount;
 const tx:ObservedTransaction={signature:'1'.repeat(88),source:'solana_rpc',genesisHash:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',slot:100,commitment:'finalized',err:null,feePayer:payer,feeLamports:5000n,signers:[payer],systemTransfers:[],instructions:[{ixIndex:0,programId:PUMP_PROGRAM_ID,discriminatorHex:anchorIxDiscriminator('distribute_creator_fees_v2').toString('hex'),accounts:a,dataBase64:Buffer.concat([anchorIxDiscriminator('distribute_creator_fees_v2'),Buffer.from([0])]).toString('base64')}],innerInstructions:[{parentIndex:0,programId:PUMP_PROGRAM_ID,accounts:[authority],stackHeight:2,dataBase64:event.toString('base64')}],lamportDeltas:quote===WRAPPED_SOL_MINT?{[agent]:agentAmount,[platform]:platformAmount,[vault]:-paid,[payer]:-5000n}:{},tokenAccounts:quote===WRAPPED_SOL_MINT?{}:{[a[8]!]:{mint:quote,owner:vault,decimals:6,pre:total,post:total-paid},[a[14]!]:{mint:quote,owner:agent,decimals:6,pre:0n,post:agentAmount},[a[15]!]:{mint:quote,owner:platform,decimals:6,pre:0n,post:platformAmount}}};
 return {tx,mint,agent,platform,vault};
}
describe('instruction-scoped creator distributions',()=>{
 it.each([WRAPPED_SOL_MINT,USDC_MINT])('verifies denomination and retained fractional-share dust for %s',quote=>{const f=distribution(quote);const v=verifiedCreatorDistribution(f.tx,f.platform,f.agent);expect(v.total).toBe(1001n);expect(v.dust).toBe(1n);expect(v.payouts.map(p=>p.amount)).toEqual([600n,400n]);expect(v.decimals).toBe(quote===USDC_MINT?6:9);});
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
 expect(verifiedCreatorDistribution(tx,f.platform,f.agent)).toMatchObject({symbol:'USDC',total:1001n,dust:1n});
});
