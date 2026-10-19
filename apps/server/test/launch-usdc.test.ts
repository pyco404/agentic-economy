import {afterEach,describe,expect,it,vi} from 'vitest';
import {AddressLookupTableAccount,Keypair,SystemInstruction,SystemProgram,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import bs58 from 'bs58';
import sharp from 'sharp';
import {LAUNCH_FEE_LAMPORTS} from '@agentic-economy/shared';
import {makeEnv,type TestEnv} from './helpers.js';
import {buildPumpLaunch,pumpLaunchInstructions} from '../src/chain/pump-builder.js';
import {verifyLaunch} from '../src/chain/verify.js';
import {TOKEN_ACCOUNT_RENT_LAMPORTS} from '../src/services/launch.js';
import {USDC_QUOTE_MINTS} from '../src/config.js';
import type {BuildLaunchInput,ChainGateway,FeeRoutingState,ObservedTransaction} from '../src/chain/types.js';
import type {MockChain} from '../src/chain/mock.js';

const origin='http://localhost:5173',cid='bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m';
const DEVNET='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',USDC=USDC_QUOTE_MINTS.devnet;
let env:TestEnv|undefined;
afterEach(async()=>{vi.unstubAllGlobals();await env?.close();env=undefined;});

/** Real Ed25519 browser session, a pinned USDC draft, and a chain stub that compiles real Pump instructions. */
async function setup(usdcEnabled:boolean){
 env=await makeEnv({PINATA_JWT:'test-only'});vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:{cid}})));
 const creator=Keypair.generate(),nacl=(await import('tweetnacl')).default;
 const ch=(await env.app.inject({method:'POST',url:'/api/v1/auth/challenge',headers:{origin},payload:{wallet:creator.publicKey.toBase58()}})).json();
 const auth=await env.app.inject({method:'POST',url:'/api/v1/auth/browser/verify',headers:{origin},payload:{wallet:creator.publicKey.toBase58(),nonce:ch.nonce,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(ch.message),creator.secretKey))}});
 const cookie=auth.headers['set-cookie']!.toString().split(';')[0]!;
 const call=(method:'GET'|'POST'|'PATCH',url:string,payload?:unknown,key='usdc-test-key')=>env!.app.inject({method,url,headers:{origin,cookie,'idempotency-key':key},...(payload?{payload:payload as object}:{})});
 let draft=(await call('POST','/api/v1/launchpad/drafts',{name:'Usdc Test',symbol:'UTST',quoteAsset:'USDC'})).json();
 const bytes=await sharp({create:{width:4,height:4,channels:3,background:'#aabb88'}}).png().toBuffer();
 draft=(await env.app.inject({method:'POST',url:`/api/v1/launchpad/drafts/${draft.id}/logo?version=0`,headers:{origin,cookie,'content-type':'application/octet-stream','idempotency-key':'usdc-logo-key'},payload:bytes})).json();
 draft=(await call('POST',`/api/v1/launchpad/drafts/${draft.id}/metadata`,{version:1},'usdc-metadata-key')).json();
 const chain=env.ctx.chain as MockChain&ChainGateway;let input:BuildLaunchInput|undefined,lookup:AddressLookupTableAccount|undefined;
 vi.spyOn(chain,'buildLaunchTransaction').mockImplementation(async p=>{
  input=p;const ix=await pumpLaunchInstructions(p);
  // A lookup table holding every non-signer account, as the configured on-chain table would.
  const table=new AddressLookupTableAccount({key:Keypair.generate().publicKey,state:{deactivationSlot:2n**64n-1n,lastExtendedSlot:0,lastExtendedSlotStartIndex:0,
   addresses:[...new Map(ix.flatMap(i=>[i.programId,...i.keys.filter(k=>!k.isSigner).map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()]}});
  lookup=table;
  return{...await buildPumpLaunch(p,Keypair.generate().publicKey.toBase58(),[table]),demo:false,lastValidBlockHeight:100,genesisHash:DEVNET};
 });
 env.ctx.config.mode='devnet';env.ctx.config.financialFeaturesEnabled=true;env.ctx.config.pumpLaunch.enabled=true;env.ctx.config.pumpLaunch.usdcEnabled=usdcEnabled;
 const prepare=()=>call('POST',`/api/v1/launchpad/drafts/${draft.id}/launch`,{version:draft.version},'usdc-prepare-key');
 return {creator,draft,call,prepare,input:()=>input,lookup:()=>lookup!};
}

describe('TOKEN/USDC launches through the Launchpad',()=>{
 it('stays disabled unless USDC launches are explicitly enabled on a safe network',async()=>{
  const {draft,call,prepare}=await setup(false);
  expect((await env!.app.inject('/api/v1/launchpad/capabilities')).json().quotes.USDC).toBe('planned');
  expect((await call('GET',`/api/v1/launchpad/drafts/${draft.id}/review`)).json().launchEnabled).toBe(false);
  const r=await prepare();
  expect(r.statusCode).toBe(503);
  expect(r.json().error.code).toBe('feature_disabled');
  expect(env!.ctx.chain.buildLaunchTransaction).not.toHaveBeenCalled();
 });

 it('prepares one atomic USDC launch with the configured mint, the separate 0.05 SOL charge and exact vault rent',async()=>{
  const {creator,prepare,input,lookup}=await setup(true);
  expect((await env!.app.inject('/api/v1/launchpad/capabilities')).json().quotes.USDC).toBe('draft');
  const r=await prepare();
  expect(r.statusCode).toBe(200);
  const {launch,transaction}=r.json();
  // The mint comes from server configuration, never from the client or the draft.
  expect(input()).toMatchObject({quoteAsset:'USDC',quoteMint:USDC,launcherWallet:creator.publicKey.toBase58()});
  expect(launch.execution).toMatchObject({quoteAsset:'USDC',quoteMint:USDC,network:'devnet',platformOrigin:'PLATFORM',initiator:'HUMAN'});
  // Fee preview: the SOL charge is unchanged; rent adds exactly the two quote vault token accounts.
  expect(launch.fees.platformLaunchFeeLamports).toBe(LAUNCH_FEE_LAMPORTS.toString());
  expect(BigInt(launch.fees.estimatedAccountRentLamports)).toBe(16_500_000n+2n*TOKEN_ACCOUNT_RENT_LAMPORTS);
  const tx=VersionedTransaction.deserialize(Buffer.from(transaction,'base64'));
  expect(Buffer.from(transaction,'base64').length).toBeLessThanOrEqual(1232);
  expect(tx.message.compiledInstructions).toHaveLength(7); // compute budget, SOL charge, create, sharing, two vaults, shares
  const decompiled=TransactionMessage.decompile(tx.message,{addressLookupTableAccounts:[lookup()]}),charge=decompiled.instructions[1]!;
  expect(charge.programId.equals(SystemProgram.programId)).toBe(true);
  expect(SystemInstruction.decodeTransfer(charge)).toMatchObject({toPubkey:expect.anything(),lamports:LAUNCH_FEE_LAMPORTS});
  expect(SystemInstruction.decodeTransfer(charge).toPubkey.toBase58()).toBe(launch.fees.platformTreasury);
 });

 it('prepares SOL drafts exactly as before: native quote, no vault rent',async()=>{
  const {draft,call,input}=await setup(true);
  const fields={name:'Sol Test',symbol:'STST',quoteAsset:'SOL'};
  const saved=(await call('PATCH',`/api/v1/launchpad/drafts/${draft.id}`,{version:draft.version,fields})).json();
  expect(saved.fields.quoteAsset).toBe('SOL');
  // Changing fields drops the pinned metadata; re-pin before preparing.
  const pinned=(await call('POST',`/api/v1/launchpad/drafts/${draft.id}/metadata`,{version:saved.version},'sol-metadata-key')).json();
  const r=await call('POST',`/api/v1/launchpad/drafts/${draft.id}/launch`,{version:pinned.version},'sol-prepare-key');
  expect(r.statusCode).toBe(200);
  expect(input()?.quoteAsset).toBeUndefined();
  expect(r.json().launch.execution).toMatchObject({quoteAsset:'SOL'});
  expect(r.json().launch.execution.quoteMint).toBeUndefined();
  expect(r.json().launch.fees.estimatedAccountRentLamports).toBe('16500000');
 });
});

describe('quote-aware launch confirmation',()=>{
 const wallet=Keypair.generate().publicKey.toBase58(),mint=Keypair.generate().publicKey.toBase58(),platform=Keypair.generate().publicKey.toBase58(),agent=Keypair.generate().publicKey.toBase58(),sharing=Keypair.generate().publicKey.toBase58();
 const tx:ObservedTransaction={signature:'s',slot:7,err:null,feePayer:wallet,signers:[wallet,mint],commitment:'finalized',blockTime:1,
  systemTransfers:[{from:wallet,to:platform,lamports:LAUNCH_FEE_LAMPORTS,ixIndex:1}],
  instructions:[{programId:'6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',discriminatorHex:'d6904cec5f8b31b4',accounts:[mint,'','','','',wallet]}]} as unknown as ObservedTransaction;
 const routing=(quote:string|null):FeeRoutingState=>({bondingCurveCreator:sharing,bondingCurveComplete:false,bondingCurveQuoteMint:quote,
  sharingConfig:{address:sharing,mint,status:'Active',adminRevoked:true,shareholders:[{address:agent,shareBps:6000},{address:platform,shareBps:4000}]}} as FeeRoutingState);
 const exp=(quoteMint:string,quoteRequired:boolean)=>({launcherWallet:wallet,mint,platformTreasury:platform,agentRewardsTreasury:agent,sharingConfig:sharing,quoteMint,quoteRequired});

 it('confirms a USDC launch only when its curve is quoted in the prepared USDC mint',()=>{
  expect(verifyLaunch(exp(USDC,true),tx,routing(USDC)).outcome).toBe('confirmed');
  const wrong=verifyLaunch(exp(USDC,true),tx,routing('So11111111111111111111111111111111111111112'));
  expect(wrong.outcome).toBe('recovery_needed');
  expect(wrong.outcome==='recovery_needed'&&wrong.issues.map(i=>i.code)).toContain('quote_mint_mismatch');
  // An unreadable curve quote is never assumed correct for USDC.
  expect(verifyLaunch(exp(USDC,true),tx,routing(null)).outcome).toBe('recovery_needed');
 });

 it('keeps SOL confirmation unchanged, including curves read without a quote field',()=>{
  const native='So11111111111111111111111111111111111111112';
  expect(verifyLaunch(exp(native,false),tx,routing(native)).outcome).toBe('confirmed');
  expect(verifyLaunch(exp(native,false),tx,routing(null)).outcome).toBe('confirmed');
  expect(verifyLaunch(exp(native,false),tx,routing(USDC)).outcome).toBe('recovery_needed');
 });
});
