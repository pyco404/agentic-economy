import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, type AddressLookupTableAccount } from '@solana/web3.js';
import { LAUNCH_FEE_LAMPORTS, LaunchDraft } from '@agentic-economy/shared';
import type { BuildLaunchInput } from './types.js';

import sdk from './pump-sdk.cjs';
const {PUMP_SDK}=sdk;
export const PUMP_SDK_VERSION='4.1.0';
export const PUMP_DOCS_COMMIT='639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22';
const nativeMint=new PublicKey('So11111111111111111111111111111111111111112');
const tokenProgram=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
/** Construction only: never reads an RPC, submits a transaction or enables an API. */
export async function pumpLaunchInstructions(input:BuildLaunchInput & {quoteAsset?:'SOL'}){
 if(input.quoteAsset!==undefined&&input.quoteAsset!=='SOL')throw new Error('Only SOL construction is enabled; other quotes require independent validation');
 LaunchDraft.parse({name:input.name,symbol:input.symbol,metadataUri:input.uri});
 // The protocol limits UTF-8 bytes, not JavaScript UTF-16 code units.
 if(Buffer.byteLength(input.name)>32||Buffer.byteLength(input.symbol)>13||Buffer.byteLength(input.uri)>200)throw new Error('Pump metadata exceeds UTF-8 byte limits');
 const mint=Keypair.fromSecretKey(input.mintSecretKey),user=new PublicKey(input.launcherWallet),platform=new PublicKey(input.platformTreasury),agent=new PublicKey(input.agentRewardsTreasury);
 if(mint.publicKey.toBase58()!==input.mint)throw new Error('Mint signing key does not match the prepared mint');
 if(platform.equals(agent)||platform.equals(user)||agent.equals(user)||platform.equals(mint.publicKey)||agent.equals(mint.publicKey)||user.equals(mint.publicKey))throw new Error('Creator, mint and treasury roles must be distinct');
 const create=await PUMP_SDK.createV2Instruction({mint:mint.publicKey,user,creator:user,name:input.name,symbol:input.symbol,uri:input.uri,mayhemMode:false,cashback:false,holderReward:false});
 const sharing=await PUMP_SDK.createFeeSharingConfig({creator:user,mint:mint.publicKey,pool:null});
 const shares=await PUMP_SDK.updateFeeSharesV2({authority:user,mint:mint.publicKey,currentShareholders:[user],newShareholders:[{address:agent,shareBps:6000},{address:platform,shareBps:4000}],quoteMint:nativeMint,quoteTokenProgram:tokenProgram,bondingCurveComplete:false});
 const instructions=[ComputeBudgetProgram.setComputeUnitLimit({units:600_000}),SystemProgram.transfer({fromPubkey:user,toPubkey:platform,lamports:LAUNCH_FEE_LAMPORTS}),create,sharing,shares];
 return instructions;
}
export async function buildPumpLaunch(input:BuildLaunchInput & {quoteAsset?:'SOL'},blockhash:string,lookupTables:AddressLookupTableAccount[]=[]){
 const instructions=await pumpLaunchInstructions(input),mint=Keypair.fromSecretKey(input.mintSecretKey),user=new PublicKey(input.launcherWallet);
 const transaction=new VersionedTransaction(new TransactionMessage({payerKey:user,recentBlockhash:blockhash,instructions}).compileToV0Message(lookupTables));
 let bytes:Uint8Array;
 try{transaction.sign([mint]);bytes=transaction.serialize();}catch{throw new Error('Atomic launch exceeds Solana packet capacity; a verified address lookup table is required');}
 if(bytes.length>1232)throw new Error(`Atomic launch exceeds Solana packet size (${bytes.length}/1232); a verified address lookup table is required`);
 return {transaction:Buffer.from(bytes).toString('base64'),bytes:bytes.length,instructions};
}

/** Compare against the SERVER-PERSISTED preparation, never a client-supplied template.
 * Both creator and fresh mint must sign the exact message; no treasury key is used.
 */
export async function validateSignedPumpLaunch(prepared:string,signed:string){
 const {default:nacl}=await import('tweetnacl'),{default:bs58}=await import('bs58');
 const decode=(value:string)=>{
  if(value.length>1644||!value.length||Buffer.from(value,'base64').toString('base64')!==value)throw new Error('Invalid launch transaction encoding or packet size');
  try{return VersionedTransaction.deserialize(Buffer.from(value,'base64'));}catch{throw new Error('Malformed launch transaction');}
 };
 const expected=decode(prepared),actual=decode(signed),message=actual.message.serialize();
 if(!Buffer.from(expected.message.serialize()).equals(Buffer.from(message)))throw new Error('Signed transaction differs from the prepared launch');
 const keys=actual.message.staticAccountKeys.slice(0,actual.message.header.numRequiredSignatures);
 if(actual.signatures.length!==keys.length||!keys.every((key,i)=>nacl.sign.detached.verify(message,actual.signatures[i]!,key.toBytes())))throw new Error('Missing or invalid launch signature');
 return {signature:bs58.encode(actual.signatures[0]!),transaction:signed};
}
