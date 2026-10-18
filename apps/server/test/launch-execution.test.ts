import {afterEach,describe,expect,it,vi} from 'vitest';
import {AddressLookupTableAccount,Keypair,VersionedTransaction} from '@solana/web3.js';
import bs58 from 'bs58';
import sharp from 'sharp';
import {makeEnv,newWallet,type TestEnv} from './helpers.js';
import {buildPumpLaunch,pumpLaunchInstructions} from '../src/chain/pump-builder.js';
import type {ChainGateway} from '../src/chain/types.js';
import type {MockChain} from '../src/chain/mock.js';
import {loadConfig} from '../src/config.js';
const origin='http://localhost:5173',cid='bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m';
let env:TestEnv|undefined;
afterEach(async()=>{vi.unstubAllGlobals();await env?.close();env=undefined;});
async function setup(){
 env=await makeEnv({PINATA_JWT:'test-only'});vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:{cid}})));
 const creator=Keypair.generate(),user=newWallet();
 // Authenticate the actual creator key with a real Ed25519 challenge signature.
 const ch=(await env.app.inject({method:'POST',url:'/api/v1/auth/challenge',headers:{origin},payload:{wallet:creator.publicKey.toBase58()}})).json();
 const nacl=(await import('tweetnacl')).default;
 const auth=await env.app.inject({method:'POST',url:'/api/v1/auth/browser/verify',headers:{origin},payload:{wallet:creator.publicKey.toBase58(),nonce:ch.nonce,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(ch.message),creator.secretKey))}});
 const cookie=auth.headers['set-cookie']!.toString().split(';')[0]!;
 const call=(method:'GET'|'POST',url:string,payload?:unknown,key='execution-test-key')=>env!.app.inject({method,url,headers:{origin,cookie,'idempotency-key':key},...(payload?{payload:payload as object}:{})});
 let draft=(await call('POST','/api/v1/launchpad/drafts',{name:'Test',symbol:'TST'})).json();
 const bytes=await sharp({create:{width:4,height:4,channels:3,background:'#aabb88'}}).png().toBuffer();
 draft=(await env.app.inject({method:'POST',url:`/api/v1/launchpad/drafts/${draft.id}/logo?version=0`,headers:{origin,cookie,'content-type':'application/octet-stream','idempotency-key':'logo-test-key'},payload:bytes})).json();
 draft=(await call('POST',`/api/v1/launchpad/drafts/${draft.id}/metadata`,{version:1},'metadata-test-key')).json();
 const chain=env.ctx.chain as MockChain & ChainGateway;let landed=false;let pendingSig='';let finalizedHeight=1;let input:Parameters<typeof buildPumpLaunch>[0];let rpcFailure=false;
 vi.spyOn(chain,'buildLaunchTransaction').mockImplementation(async p=>{
  input=p;const ix=await pumpLaunchInstructions(p);const table=new AddressLookupTableAccount({key:Keypair.generate().publicKey,state:{deactivationSlot:2n**64n-1n,lastExtendedSlot:0,lastExtendedSlotStartIndex:0,addresses:[...new Map(ix.flatMap(i=>[i.programId,...i.keys.filter(k=>!k.isSigner).map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()]}});
  return{...await buildPumpLaunch(p,Keypair.generate().publicKey.toBase58(),[table]),demo:false,lastValidBlockHeight:100,genesisHash:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'};
 });
 const get=chain.getTransaction.bind(chain);vi.spyOn(chain,'getTransaction').mockImplementation(async signature=>{
  if(!landed)return null;
  const mock=chain.simulateLaunch({launcherWallet:input.launcherWallet,mint:input.mint,platformTreasury:input.platformTreasury,agentRewardsTreasury:input.agentRewardsTreasury});return{...(await get(mock))!,signature};
 });
 chain.getFinalizedBlockHeight=async()=>finalizedHeight;
 chain.submitLaunchTransaction=vi.fn(async transaction=>{pendingSig=bs58.encode(VersionedTransaction.deserialize(Buffer.from(transaction,'base64')).signatures[0]!);if(rpcFailure)throw new Error('RPC timed out');return pendingSig;});
 env.ctx.config.mode='devnet';env.ctx.config.financialFeaturesEnabled=true;env.ctx.config.pumpLaunch.enabled=true;
 const prepare=async(key='prepare-test-key')=>call('POST',`/api/v1/launchpad/drafts/${draft.id}/launch`,{version:draft.version},key);
 const signed=(transaction:string)=>{const tx=VersionedTransaction.deserialize(Buffer.from(transaction,'base64'));tx.sign([creator]);return Buffer.from(tx.serialize()).toString('base64');};
 return{call,prepare,signed,draft,chain,creator,user,setLanded:()=>{landed=true;},expire:()=>{finalizedHeight=101;},failRpc:()=>{rpcFailure=true;}};
}
describe('owned launch execution API (mock RPC, real transaction bytes/signatures)',()=>{
 it('prepares idempotently and confirms only chain evidence, registering one platform token and fee receipt',async()=>{
  const f=await setup(),first=await f.prepare();expect(first.statusCode).toBe(200);const p=first.json();expect(p.demoTransaction).toBe(false);expect((await env!.app.inject(`/api/v1/launches/${p.launch.id}`)).statusCode).toBe(404);expect(p.launch.execution).toMatchObject({draftId:f.draft.id,platformOrigin:'PLATFORM',initiator:'HUMAN',quoteAsset:'SOL',network:'devnet'});
  expect((await f.prepare()).json()).toEqual(p);expect(f.chain.buildLaunchTransaction).toHaveBeenCalledTimes(1);
  const signed=f.signed(p.transaction),url=`/api/v1/launchpad/launches/${p.launch.id}`;
  expect((await f.call('POST',url+'/submit',{transaction:signed})).json().launch.status).toBe('submitted');
  expect((await f.call('GET',url)).json().launch.status).toBe('submitted');expect((await env!.ctx.store.allCommunities()).filter(c=>c.launchId===p.launch.id)).toHaveLength(0);
  f.setLanded();const confirmed=await f.call('GET',url);expect(confirmed.statusCode).toBe(200);expect(confirmed.json().launch.status).toBe('confirmed');expect((await env!.app.inject(`/api/v1/launches/${p.launch.id}`)).statusCode).toBe(200);
  expect((await f.call('GET',url)).json().launch.status).toBe('confirmed');
  const communities=(await env!.ctx.store.allCommunities()).filter(c=>c.launchId===p.launch.id);expect(communities).toHaveLength(1);expect(communities[0]!.provenance).toMatchObject({initiator:'HUMAN',platformOrigin:'PLATFORM',network:'devnet'});
  expect((await env!.ctx.store.allTreasuryEntries()).filter(e=>e.launchId===p.launch.id)).toHaveLength(1);
 });
 it('rejects invalid signatures, missing authentication and stale drafts before broadcasting',async()=>{
  const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;
  expect((await f.call('POST',url+'/submit',{transaction:p.transaction})).statusCode).toBe(400);expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
  expect((await env!.app.inject(url)).statusCode).toBe(401);
  expect((await f.call('POST',`/api/v1/launchpad/drafts/${f.draft.id}/launch`,{version:0},'stale-prepare-key')).statusCode).toBe(409);
 });
 it('keeps a timed-out submission recoverable and heals from later confirmation without another charge',async()=>{
  const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;f.failRpc();
  expect((await f.call('POST',url+'/submit',{transaction:f.signed(p.transaction)})).statusCode).toBe(503);
  expect((await f.call('GET',url)).json().launch.status).toBe('submitted');f.expire();
  // Missing RPC history after broadcast is uncertain, not evidence of nonpayment.
  expect((await f.call('POST',url+'/submit',{transaction:f.signed(p.transaction)})).json().launch.status).toBe('submitted');
  f.setLanded();expect((await f.call('GET',url)).json().launch.status).toBe('confirmed');expect(f.chain.submitLaunchTransaction).toHaveBeenCalledTimes(1);
 });
 it('expires an unsubmitted preparation without broadcasting and permits another intentional attempt',async()=>{
  const f=await setup(),p=(await f.prepare()).json();f.expire();const result=await f.call('POST',`/api/v1/launchpad/launches/${p.launch.id}/submit`,{transaction:f.signed(p.transaction)});expect(result.json().launch.status).toBe('expired');expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
  expect((await f.prepare('new-intent-key')).json().launch.id).not.toBe(p.launch.id);
 });
 it('keeps mainnet execution disabled even if verification switches are set',()=>{
  const config=loadConfig({MODE:'production',DATABASE_URL:'postgres://not-connected',SOLANA_RPC_URL:'https://api.mainnet-beta.solana.com',PLATFORM_TREASURY:Keypair.generate().publicKey.toBase58(),AGENT_REWARDS_TREASURY:Keypair.generate().publicKey.toBase58(),FEE_ROUTING_VERIFIED:'true',PUMP_LAUNCH_ENABLED:'true'});
  expect(config.financialFeaturesEnabled).toBe(false);expect(config.pumpLaunch.enabled).toBe(false);
 });
});
it('keeps execution attempts private to the authenticated creator',async()=>{
 const f=await setup(),p=(await f.prepare()).json(),other=newWallet();
 const ch=(await env!.app.inject({method:'POST',url:'/api/v1/auth/challenge',headers:{origin},payload:{wallet:other.wallet}})).json();
 const auth=await env!.app.inject({method:'POST',url:'/api/v1/auth/browser/verify',headers:{origin},payload:{wallet:other.wallet,nonce:ch.nonce,signature:other.sign(ch.message)}});
 const cookie=auth.headers['set-cookie']!.toString().split(';')[0]!;
 expect((await env!.app.inject({url:`/api/v1/launchpad/launches/${p.launch.id}`,headers:{cookie}})).statusCode).toBe(403);
 expect((await env!.app.inject({method:'POST',url:`/api/v1/launchpad/launches/${p.launch.id}/submit`,headers:{cookie,origin},payload:{transaction:f.signed(p.transaction)}})).statusCode).toBe(403);
});
it('does not let an in-flight expiry check overwrite a concurrent submission',async()=>{
 const f=await setup(),p=(await f.prepare()).json();let release:(height:number)=>void=()=>{},started:()=>void=()=>{};
 const waiting=new Promise<void>(resolve=>{started=resolve;});const height=new Promise<number>(resolve=>{release=resolve;});
 f.chain.getFinalizedBlockHeight=async()=>{started();return height;};
 const refreshing=f.call('GET',`/api/v1/launchpad/launches/${p.launch.id}`);await waiting;
 const record=(await env!.ctx.store.getLaunch(p.launch.id))!;
 const signature=bs58.encode(VersionedTransaction.deserialize(Buffer.from(f.signed(p.transaction),'base64')).signatures[0]!);
 await env!.ctx.store.updateLaunch({...record.launch,status:'submitted',signature},record.version);release(101);
 expect((await refreshing).json().launch.status).toBe('submitted');
});
it('recovers a previously expired preparation when authoritative transaction evidence later appears',async()=>{
 const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}/submit`,transaction=f.signed(p.transaction);f.expire();
 expect((await f.call('POST',url,{transaction})).json().launch.status).toBe('expired');f.setLanded();
 expect((await f.call('POST',url,{transaction})).json().launch.status).toBe('confirmed');
 expect((await env!.ctx.store.allTreasuryEntries()).filter(e=>e.launchId===p.launch.id)).toHaveLength(1);
});
it('verifies and records the original treasury destination if configuration changes after preparation',async()=>{
 const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;
 await f.call('POST',url+'/submit',{transaction:f.signed(p.transaction)});
 env!.ctx.config.treasuries.platform=Keypair.generate().publicKey.toBase58();env!.ctx.config.treasuries.agentRewards=Keypair.generate().publicKey.toBase58();f.setLanded();
 expect((await f.call('GET',url)).json().launch.status).toBe('confirmed');
 expect((await env!.ctx.store.allTreasuryEntries()).find(e=>e.launchId===p.launch.id)!.accountAddress).toBe(p.launch.fees.platformTreasury);
});
it('retries preparation outages with the same intent key without imposing a media-operation retry limit',async()=>{
 const f=await setup(),build=vi.mocked(f.chain.buildLaunchTransaction).getMockImplementation()!,intercept=vi.mocked(f.chain.buildLaunchTransaction);let failures=4;
 intercept.mockImplementation(async input=>{if(failures-->0)throw new Error('temporary RPC outage');return build(input);});
 for(let n=0;n<4;n++)expect((await f.prepare()).statusCode).toBe(503);
 expect((await f.prepare()).statusCode).toBe(200);
 expect((await f.prepare()).statusCode).toBe(200);
});
it('allows more than twenty intentional launches from the same wallet and draft without a launch quota or metadata gate',async()=>{
 const f=await setup(),ids=new Set<string>();
 for(let n=0;n<26;n++){const result=await f.prepare(`policy-intent-${n}`);expect(result.statusCode).toBe(200);ids.add(result.json().launch.id);}
 expect(ids.size).toBe(26);
});
