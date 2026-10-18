import {describe,expect,it} from 'vitest';
import {AddressLookupTableAccount,Keypair,PublicKey,SystemInstruction,type TransactionInstruction,VersionedTransaction} from '@solana/web3.js';
import {PUMP_PROGRAM_ID,PUMP_FEES_PROGRAM_ID} from '@agentic-economy/shared';
import {buildPumpLaunch,pumpLaunchInstructions,validateSignedPumpLaunch} from '../src/chain/pump-builder.js';
function fixture(){const creator=Keypair.generate(),mint=Keypair.generate();return{creator,mint,input:{launcherWallet:creator.publicKey.toBase58(),mint:mint.publicKey.toBase58(),mintSecretKey:mint.secretKey,name:'Local Test',symbol:'TEST',uri:'https://example.com/test.json',platformTreasury:Keypair.generate().publicKey.toBase58(),agentRewardsTreasury:Keypair.generate().publicKey.toBase58()}};}
function table(instructions:TransactionInstruction[]){return new AddressLookupTableAccount({key:Keypair.generate().publicKey,state:{deactivationSlot:2n**64n-1n,lastExtendedSlot:0,lastExtendedSlotStartIndex:0,addresses:[...new Map(instructions.flatMap(ix=>[ix.programId,...ix.keys.filter(k=>!k.isSigner).map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()]}});}
async function prepared(){const f=fixture(),instructions=await pumpLaunchInstructions(f.input),lookup=table(instructions),blockhash=Keypair.generate().publicKey.toBase58();return{...f,lookup,blockhash,...await buildPumpLaunch(f.input,blockhash,[lookup])};}
describe('official Pump SDK atomic construction (offline, no on-chain claim)',()=>{
 it('constructs the exact platform charge, token creation and locked 60/40 instructions together',async()=>{
  const f=fixture(),ix=await pumpLaunchInstructions(f.input);expect(ix).toHaveLength(5);
  const charge=SystemInstruction.decodeTransfer(ix[1]!);expect(charge.fromPubkey.toBase58()).toBe(f.input.launcherWallet);expect(charge.toPubkey.toBase58()).toBe(f.input.platformTreasury);expect(charge.lamports).toBe(50_000_000n);
  const create=ix[2]!;expect(create.programId.toBase58()).toBe(PUMP_PROGRAM_ID);expect([...create.data.subarray(0,8)]).toEqual([214,144,76,236,95,139,49,180]);
  expect(create.keys[0]).toMatchObject({isSigner:true,isWritable:true});expect(create.keys[0]!.pubkey.toBase58()).toBe(f.input.mint);expect(create.keys[5]!.pubkey.toBase58()).toBe(f.input.launcherWallet);
  let offset=8;for(const field of [f.input.name,f.input.symbol,f.input.uri]){const length=create.data.readUInt32LE(offset);offset+=4;expect(create.data.subarray(offset,offset+length).toString('utf8')).toBe(field);offset+=length;}
  expect(create.data.subarray(offset,offset+32)).toEqual(f.creator.publicKey.toBuffer());offset+=32;
  expect([...create.data.subarray(offset)]).toEqual([0,0,0,0,0,0,0,0,0,0,0]); // no mayhem/cashback/custom fee/holder reward
  expect(ix[3]!.programId.toBase58()).toBe(PUMP_FEES_PROGRAM_ID);expect([...ix[3]!.data]).toEqual([195,78,86,76,111,52,251,213]);
  const shares=ix[4]!;expect(shares.programId.toBase58()).toBe(PUMP_FEES_PROGRAM_ID);expect([...shares.data.subarray(0,8)]).toEqual([111,251,49,6,78,78,106,18]);expect(shares.data.readUInt32LE(8)).toBe(2);
  expect(shares.data.subarray(12,44).toString('hex')).toBe(new PublicKey(f.input.agentRewardsTreasury).toBuffer().toString('hex'));
  expect(shares.data.readUInt16LE(44)).toBe(6000);expect(shares.data.readUInt16LE(78)).toBe(4000);
 });
 it('requires lookup compression and never silently splits charge and creation into different transactions',async()=>{
  const f=fixture();await expect(buildPumpLaunch(f.input,Keypair.generate().publicKey.toBase58())).rejects.toThrow(/packet/);
  const p=await prepared();expect(p.bytes).toBeLessThanOrEqual(1232);const tx=VersionedTransaction.deserialize(Buffer.from(p.transaction,'base64'));
  expect(tx.message.header.numRequiredSignatures).toBe(2);expect(tx.message.staticAccountKeys[0]!.toBase58()).toBe(p.input.launcherWallet);
  expect(tx.signatures[0]!.every(n=>n===0)).toBe(true);expect(tx.signatures[1]!.some(n=>n!==0)).toBe(true);
 });
 it('accepts exact creator/mint signatures and rejects missing, invalid or altered messages',async()=>{
  const p=await prepared();await expect(validateSignedPumpLaunch(p.transaction,p.transaction)).rejects.toThrow('signature');
  const tx=VersionedTransaction.deserialize(Buffer.from(p.transaction,'base64'));tx.sign([p.creator]);
  const signed=Buffer.from(tx.serialize()).toString('base64');expect((await validateSignedPumpLaunch(p.transaction,signed)).signature).toBeTruthy();
  tx.signatures[0]![0]=tx.signatures[0]![0]!^1;await expect(validateSignedPumpLaunch(p.transaction,Buffer.from(tx.serialize()).toString('base64'))).rejects.toThrow('signature');
  tx.message.recentBlockhash=Keypair.generate().publicKey.toBase58();await expect(validateSignedPumpLaunch(p.transaction,Buffer.from(tx.serialize()).toString('base64'))).rejects.toThrow('differs');
  await expect(validateSignedPumpLaunch(p.transaction,'bad base64')).rejects.toThrow('encoding');
 });
 it('rejects role collisions, mismatched mint keys, unsupported quotes and UTF-8 overflow',async()=>{
  const f=fixture();for(const input of [{...f.input,platformTreasury:f.input.launcherWallet},{...f.input,agentRewardsTreasury:f.input.platformTreasury},{...f.input,mint:Keypair.generate().publicKey.toBase58()},{...f.input,name:'é'.repeat(17)},{...f.input,quoteAsset:'USDC'}])
   await expect(pumpLaunchInstructions(input as Parameters<typeof pumpLaunchInstructions>[0])).rejects.toThrow();
 });
 it('fits maximum supported metadata using only shared protocol and treasury lookup addresses',async()=>{
  const a=fixture(),b=fixture();b.input.platformTreasury=a.input.platformTreasury;b.input.agentRewardsTreasury=a.input.agentRewardsTreasury;
  a.input.name='N'.repeat(32);a.input.symbol='S'.repeat(13);a.input.uri='https://example.com/'+ 'a'.repeat(180);
  const first=await pumpLaunchInstructions(a.input),second=await pumpLaunchInstructions(b.input);
  const keys=(ix:TransactionInstruction[])=>new Map(ix.flatMap(i=>[i.programId,...i.keys.filter(k=>!k.isSigner).map(k=>k.pubkey)]).map(k=>[k.toBase58(),k]));
  const shared=[...keys(first)].filter(([key])=>keys(second).has(key)).map(([,value])=>value);
  const lookup=new AddressLookupTableAccount({key:Keypair.generate().publicKey,state:{deactivationSlot:2n**64n-1n,lastExtendedSlot:0,lastExtendedSlotStartIndex:0,addresses:shared}});
  expect((await buildPumpLaunch(a.input,Keypair.generate().publicKey.toBase58(),[lookup])).bytes).toBeLessThanOrEqual(1232);
 });

});

it('rejects recipient, fee amount, mint and lookup-table substitutions in wallet-returned messages',async()=>{
 const p=await prepared();
 const attacks=[
  (tx:VersionedTransaction)=>{tx.message.compiledInstructions[1]!.accountKeyIndexes[1]=0;},
  (tx:VersionedTransaction)=>{const data=tx.message.compiledInstructions[1]!.data;data[4]=data[4]!^1;},
  (tx:VersionedTransaction)=>{tx.message.staticAccountKeys[1]=Keypair.generate().publicKey;},
  (tx:VersionedTransaction)=>{tx.message.addressTableLookups[0]!.accountKey=Keypair.generate().publicKey;},
 ];
 for(const alter of attacks){const tx=VersionedTransaction.deserialize(Buffer.from(p.transaction,'base64'));alter(tx);await expect(validateSignedPumpLaunch(p.transaction,Buffer.from(tx.serialize()).toString('base64'))).rejects.toThrow('differs');}
});

it('constructs explicit USDC quote accounts while retaining the separate SOL platform charge',async()=>{
 const f=fixture();
 for(const quoteMint of ['4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU','EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']){
  const input={...f.input,quoteAsset:'USDC' as const,quoteMint},ix=await pumpLaunchInstructions(input),create=ix[2]!;
  expect(create.keys).toHaveLength(20);expect(create.keys[16]!.pubkey.toBase58()).toBe(quoteMint);expect(create.keys[18]!.pubkey.toBase58()).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  expect(ix.at(-1)!.keys.some(k=>k.pubkey.toBase58()===quoteMint)).toBe(true);expect(ix).toHaveLength(7);
  const charge=SystemInstruction.decodeTransfer(ix[1]!);expect(charge.lamports).toBe(50000000n);expect(charge.toPubkey.toBase58()).toBe(f.input.platformTreasury);
  expect((await buildPumpLaunch(input,Keypair.generate().publicKey.toBase58(),[table(ix)])).bytes).toBeLessThanOrEqual(1232);
 }
 await expect(pumpLaunchInstructions({...f.input,quoteAsset:'USDC',quoteMint:Keypair.generate().publicKey.toBase58()})).rejects.toThrow('Unrecognized');
});
