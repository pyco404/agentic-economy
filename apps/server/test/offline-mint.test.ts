import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withMintReservation } from '../scripts/lib/mint-reservation.js';
import { createHash } from 'node:crypto';
import { AddressLookupTableAccount, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import { buildPumpLaunch, buildUnsignedPumpLaunch, unsignedPumpLaunchInstructions, validateSignedPumpLaunch } from '../src/chain/pump-builder.js';
import { coSignReviewedMint, inspectMintSigningReview, MAINNET_GENESIS, mintMessageHash, type MintSigningReview } from '../src/chain/offline-mint.js';

// Entirely offline, disposable keys. No official mint keypair or Devnet transaction is used.
async function fixture(){
 const [mint,deployer,platform,rewards]=Array.from({length:4},()=>Keypair.generate()) as [Keypair,Keypair,Keypair,Keypair];
 const input={mint:mint.publicKey.toBase58(),launcherWallet:deployer.publicKey.toBase58(),platformTreasury:platform.publicKey.toBase58(),agentRewardsTreasury:rewards.publicKey.toBase58(),name:'Offline Fixture',symbol:'OFFLINE',uri:'https://example.invalid/metadata.json'};
 const instructions=await unsignedPumpLaunchInstructions(input),addresses=[...new Map(instructions.flatMap(i=>[i.programId,...i.keys.filter(k=>!k.isSigner).map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()];
 const table=new AddressLookupTableAccount({key:Keypair.generate().publicKey,state:{deactivationSlot:2n**64n-1n,lastExtendedSlot:0,lastExtendedSlotStartIndex:0,addresses}});
 const blockhash=Keypair.generate().publicKey.toBase58(),built=await buildUnsignedPumpLaunch(input,blockhash,[table]);
 const review:MintSigningReview={version:1,launchId:'offline-fixture-attempt',network:'mainnet-beta',genesisHash:MAINNET_GENESIS,...input,recentBlockhash:blockhash,lastValidBlockHeight:100,maxTotalDebitLamports:'80000000',messageSha256:mintMessageHash(VersionedTransaction.deserialize(Buffer.from(built.transaction,'base64'))),unsignedTransaction:built.transaction,lookupTables:[{key:table.key.toBase58(),addresses:addresses.map(k=>k.toBase58())}]};
 const policy={mint:input.mint,deployer:input.launcherWallet,platform:input.platformTreasury,rewards:input.agentRewardsTreasury};
 return {mint,deployer,input,table,blockhash,built,review,policy};
}
describe('offline reserved mint co-signing',()=>{
 it('uses public keys only for construction and preserves the existing atomic transaction bytes',async()=>{
  const f=await fixture(),old=await buildPumpLaunch({...f.input,mintSecretKey:f.mint.secretKey},f.blockhash,[f.table]);
  const mintSigned=await coSignReviewedMint(f.review,f.policy,f.review.messageSha256,f.mint.secretKey);
  expect(mintSigned.transaction).toBe(old.transaction);
  const tx=VersionedTransaction.deserialize(Buffer.from(mintSigned.transaction,'base64'));
  expect(tx.signatures[0]!.every(b=>b===0)).toBe(true);
  tx.sign([f.deployer]);
  await expect(validateSignedPumpLaunch(f.built.transaction,Buffer.from(tx.serialize()).toString('base64'))).resolves.toMatchObject({transaction:Buffer.from(tx.serialize()).toString('base64')});
 });
 it('refuses mint/recipient/deployer substitutions and invalid network claims',async()=>{
  const f=await fixture(),other=Keypair.generate().publicKey.toBase58();
  for(const patch of [{mint:other},{launcherWallet:other},{platformTreasury:other},{agentRewardsTreasury:other},{network:'devnet'},{genesisHash:other}])
   await expect(inspectMintSigningReview({...f.review,...patch},f.policy)).rejects.toThrow();
 });
 it('rejects modified instructions even when an attacker recomputes the supplied message hash',async()=>{
  const f=await fixture(),tx=VersionedTransaction.deserialize(Buffer.from(f.review.unsignedTransaction,'base64'));
  const charge=tx.message.compiledInstructions[1]!.data;charge[4]=charge[4]!^1;
  const changed={...f.review,unsignedTransaction:Buffer.from(tx.serialize()).toString('base64'),messageSha256:mintMessageHash(tx)};
  await expect(inspectMintSigningReview(changed,f.policy)).rejects.toThrow('construction');
 });
 it('requires the independent approved hash, exact mint key and unsigned deployer',async()=>{
  const f=await fixture();
  await expect(coSignReviewedMint(f.review,f.policy,createHash('sha256').update('different').digest('hex'),f.mint.secretKey)).rejects.toThrow('approved');
  await expect(coSignReviewedMint(f.review,f.policy,f.review.messageSha256,Keypair.generate().secretKey)).rejects.toThrow('reserved mint');
  const tx=VersionedTransaction.deserialize(Buffer.from(f.review.unsignedTransaction,'base64'));tx.sign([f.deployer]);
  await expect(inspectMintSigningReview({...f.review,unsignedTransaction:Buffer.from(tx.serialize()).toString('base64')},f.policy)).rejects.toThrow('unsigned');
 });
 it('does not accept a changed lookup snapshot or a malformed packet',async()=>{
  const f=await fixture();
  const tables=[{...f.review.lookupTables[0]!,addresses:[...f.review.lookupTables[0]!.addresses]}];
  const tx=VersionedTransaction.deserialize(Buffer.from(f.review.unsignedTransaction,'base64'));
  const lookup=tx.message.addressTableLookups[0]!;const used=lookup.writableIndexes[0]??lookup.readonlyIndexes[0]!;
  tables[0]!.addresses[used]=new PublicKey(new Uint8Array(32)).toBase58();
  await expect(inspectMintSigningReview({...f.review,lookupTables:tables},f.policy)).rejects.toThrow();
  await expect(inspectMintSigningReview({...f.review,unsignedTransaction:'bad base64'},f.policy)).rejects.toThrow();
 });
});

 describe('local immutable mint reservation',()=>{
 it('survives process-local state loss, permits exact retries and rejects a different attempt or message',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'aeco-mint-journal-test-'));
  const reservation={launchId:'fixture',mint:Keypair.generate().publicKey.toBase58(),messageSha256:'a'.repeat(64)};let calls=0;
  try{
   await withMintReservation(dir,reservation,async()=>{calls++;});
   await withMintReservation(dir,{...reservation},async()=>{calls++;});
   await expect(withMintReservation(dir,{...reservation,launchId:'different'},async()=>{calls++;})).rejects.toThrow('reserved');
   await expect(withMintReservation(dir,{...reservation,messageSha256:'b'.repeat(64)},async()=>{calls++;})).rejects.toThrow('reserved');
   expect(calls).toBe(2);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it('blocks concurrent signers and keeps an unsuccessful signing attempt reserved',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'aeco-mint-journal-test-'));
  const r={launchId:'fixture',mint:Keypair.generate().publicKey.toBase58(),messageSha256:'a'.repeat(64)};
  try{
   await withMintReservation(dir,r,async()=>{await expect(withMintReservation(dir,r,async()=>undefined)).rejects.toThrow();});
   await expect(withMintReservation(dir,r,async()=>{throw new Error('fixture failure');})).rejects.toThrow('fixture failure');
   await expect(withMintReservation(dir,{...r,messageSha256:'b'.repeat(64)},async()=>undefined)).rejects.toThrow('reserved');
   writeFileSync(join(dir,r.mint+'.lock'),'');
   await expect(withMintReservation(dir,r,async()=>undefined)).rejects.toThrow();
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
});
