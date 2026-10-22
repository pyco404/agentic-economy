import {afterEach,describe,expect,it,vi} from 'vitest';
import {AddressLookupTableAccount,Keypair,VersionedTransaction} from '@solana/web3.js';
import bs58 from 'bs58';
import sharp from 'sharp';
import {makeEnv,newWallet,type TestEnv} from './helpers.js';
import {buildPumpLaunch,pumpLaunchInstructions,buildUnsignedPumpLaunch,unsignedPumpLaunchInstructions} from '../src/chain/pump-builder.js';
import type {ChainGateway} from '../src/chain/types.js';
import type {MockChain} from '../src/chain/mock.js';
import {OFFICIAL_TREASURIES,LaunchDraft} from '@agentic-economy/shared';
import {assertLaunchWalletAllowed,launchWalletAllowed} from '../src/services/launch-permission.js';
import {LaunchpadStore} from '../src/store/launchpad.js';
import {login,DRAFT,idem} from './helpers.js';
import {PLANNED_AECO_MINT,MAINNET_GENESIS} from '../src/chain/offline-mint.js';
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
  const mock=chain.simulateLaunch({launcherWallet:input.launcherWallet,mint:input.mint,platformTreasury:input.platformTreasury,agentRewardsTreasury:input.agentRewardsTreasury});return{...(await get(mock))!,signature,genesisHash:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'};
 });
 chain.getGenesisHash=async()=>'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
 chain.getFinalizedBlockHeight=async()=>finalizedHeight;
 chain.mintAccountExists=vi.fn(async()=>false);
 chain.getSignatureStatus=vi.fn(async()=>null);
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
  expect((await env!.ctx.store.listEvents(null,100)).items.filter(e=>e.type==='launch.confirmed')).toHaveLength(0);
  f.setLanded();const confirmed=await f.call('GET',url);expect(confirmed.statusCode).toBe(200);expect(confirmed.json().launch.status).toBe('confirmed');expect((await env!.app.inject(`/api/v1/launches/${p.launch.id}`)).statusCode).toBe(200);
  expect((await f.call('GET',url)).json().launch.status).toBe('confirmed');
  const communities=(await env!.ctx.store.allCommunities()).filter(c=>c.launchId===p.launch.id);expect(communities).toHaveLength(1);expect(communities[0]!.provenance).toMatchObject({initiator:'HUMAN',platformOrigin:'PLATFORM',network:'devnet'});
  expect((await env!.ctx.store.allTreasuryEntries()).filter(e=>e.launchId===p.launch.id)).toHaveLength(1);
  const events=(await env!.ctx.store.listEvents(null,100)).items.filter(e=>e.type==='launch.confirmed');
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({summary:`${p.launch.draft.name} ($${p.launch.draft.symbol}) launched on Agentic Economy.`,communityId:communities[0]!.id,data:{mint:p.launch.mint,signature:confirmed.json().launch.signature}});
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
  const config=loadConfig({MODE:'production',DATABASE_URL:'postgres://not-connected',SOLANA_RPC_URL:'https://api.mainnet-beta.solana.com',PLATFORM_TREASURY:"HmmnNqZbfUZ2YK4mWVLXEGTsAU2NUUAvFzLFxgdgKUT2",AGENT_REWARDS_TREASURY:"GEDMCV4WXHCAnySqH4CWNh3NYBrDfAUb3t4BBVBWVnJi",FEE_ROUTING_VERIFIED:'true',PUMP_LAUNCH_ENABLED:'true'});
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

it('preserves attempts and prevents broadcast or expiry when the RPC network changes',async()=>{
 const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;
 f.chain.getGenesisHash=async()=>'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';f.expire();
 expect((await f.call('POST',url+'/submit',{transaction:f.signed(p.transaction)})).statusCode).toBe(503);
 expect((await f.call('GET',url)).statusCode).toBe(503);
 expect((await env!.ctx.store.getLaunch(p.launch.id))!.launch.status).toBe('awaiting_signature');
 expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();expect(await env!.ctx.store.allTreasuryEntries()).toEqual([]);
});
it('rejects mismatched transaction-network evidence even when the RPC reports the expected genesis',async()=>{
 const f=await setup(),p=(await f.prepare()).json(),get=vi.mocked(f.chain.getTransaction).getMockImplementation()!;f.setLanded();
 vi.mocked(f.chain.getTransaction).mockImplementation(async signature=>({...await get(signature),genesisHash:'wrong-network'}) as Awaited<ReturnType<ChainGateway['getTransaction']>>);
 expect((await f.call('POST',`/api/v1/launchpad/launches/${p.launch.id}/submit`,{transaction:f.signed(p.transaction)})).statusCode).toBe(503);
 expect((await env!.ctx.store.getLaunch(p.launch.id))!.launch.status).toBe('awaiting_signature');
 expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();expect(await env!.ctx.store.allTreasuryEntries()).toEqual([]);
});
it('sanitizes unavailable genesis checks and permits recovery with the same attempt',async()=>{
 const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;
 f.chain.getGenesisHash=async()=>{throw new Error('secret-rpc-credential');};
 const unavailable=await f.call('GET',url);expect(unavailable.statusCode).toBe(503);expect(unavailable.body).not.toContain('secret-rpc-credential');
 f.chain.getGenesisHash=async()=>'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
 expect((await f.call('POST',url+'/submit',{transaction:f.signed(p.transaction)})).json().launch.status).toBe('submitted');
 f.setLanded();expect((await f.call('GET',url)).json().launch.status).toBe('confirmed');
});

 it('retains an expired-height preparation when its mint exists instead of declaring nonpayment',async()=>{
  const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;f.expire();f.chain.mintAccountExists=vi.fn(async()=>true);
  for(const response of [await f.call('GET',url),await f.call('POST',url+'/submit',{transaction:f.signed(p.transaction)})]){expect(response.statusCode).toBe(503);expect(response.json().error.message).toContain('requires recovery');}
  expect((await env!.ctx.store.getLaunch(p.launch.id))!.launch.status).toBe('awaiting_signature');
  expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();expect(await env!.ctx.store.allTreasuryEntries()).toEqual([]);
 });
 it('fails closed on absent or unavailable finalized mint readers without losing the original attempt',async()=>{
  const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;f.expire();
  for(const reader of [undefined,async():Promise<boolean>=>{throw Error('RPC unavailable');}]){
   f.chain.mintAccountExists=reader;
   expect((await f.call('GET',url)).statusCode).toBe(503);
   expect((await f.call('POST',url+'/submit',{transaction:f.signed(p.transaction)})).statusCode).toBe(503);
   expect((await env!.ctx.store.getLaunch(p.launch.id))!.launch.status).toBe('awaiting_signature');
  }
  expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });

it('resumes the exact stored signed transaction without signing again and retains one launch/receipt',async()=>{
 const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`,signed=f.signed(p.transaction);f.failRpc();
 expect((await f.call('POST',url+'/submit',{transaction:signed})).statusCode).toBe(503);
 const status=await f.call('GET',url);expect(status.json().recovery).toMatchObject({canResume:true});expect(status.body).not.toContain(signed);
 // Restart the service using the same private recovery repository: no wallet signature is requested.
 const service=env!.ctx.launches;const submissions=(service as unknown as {submissions:unknown}).submissions;
 const {LaunchService}=await import('../src/services/launch.js');
 env!.ctx.launches=new LaunchService(env!.ctx.store,f.chain,env!.ctx.config,env!.ctx.treasury,env!.ctx.coord,env!.ctx.runtime.bus,env!.ctx.runtime.reader,undefined,submissions as ConstructorParameters<typeof LaunchService>[8]);
 await f.call('POST',url+'/resume',{});
 expect(f.chain.submitLaunchTransaction).toHaveBeenCalledTimes(2);
 expect(vi.mocked(f.chain.submitLaunchTransaction!).mock.calls.map(c=>c[0])).toEqual([signed,signed]);
 f.setLanded();const recovered=await f.call('POST',url+'/resume',{});expect(recovered.json().launch.status).toBe('confirmed');
 expect((await env!.ctx.store.allTreasuryEntries()).filter(e=>e.launchId===p.launch.id)).toHaveLength(1);
});
it('recovers a payload that never reached submit using the same attempt, while rejecting unauthorized or changed payloads',async()=>{
 const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;
 expect((await env!.app.inject({method:'POST',url:url+'/resume',payload:{}})).statusCode).toBe(403);
 expect((await f.call('POST',url+'/resume',{transaction:p.transaction})).statusCode).toBe(400);
 const signed=f.signed(p.transaction),results=await Promise.all([f.call('POST',url+'/resume',{transaction:signed}),f.call('POST',url+'/resume',{transaction:signed})]);
 expect(results.every(r=>r.statusCode===200)).toBe(true);
 expect((await f.call('GET',url)).json().launch.signature).toBeTruthy();
 expect(vi.mocked(f.chain.submitLaunchTransaction!).mock.calls.every(c=>c[0]===signed)).toBe(true);
});

it('closes a signed but unobserved expired attempt only after history and mint checks, preserving its signature',async()=>{
 const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;
 const submitted=await f.call('POST',url+'/submit',{transaction:f.signed(p.transaction)});const signature=submitted.json().launch.signature;
 f.expire();const status=await f.call('GET',url);expect(status.statusCode).toBe(200);expect(status.json().launch).toMatchObject({status:'expired',signature});
 expect(status.json().launch.errors).toEqual(expect.arrayContaining([expect.objectContaining({code:'submission_expired_unobserved'})]));
 expect(await env!.ctx.store.allTreasuryEntries()).toEqual([]);expect(f.chain.submitLaunchTransaction).toHaveBeenCalledTimes(1);
});
it('keeps an expired-height signed attempt unresolved when history contradicts a missing transaction or mint exists',async()=>{
 const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;await f.call('POST',url+'/submit',{transaction:f.signed(p.transaction)});f.expire();
 f.chain.getSignatureStatus=async()=>({slot:99,confirmationStatus:'finalized',err:null});expect((await f.call('GET',url)).statusCode).toBe(503);
 f.chain.getSignatureStatus=async()=>null;f.chain.mintAccountExists=async()=>true;expect((await f.call('GET',url)).statusCode).toBe(503);
 f.chain.mintAccountExists=async()=>{throw Error('RPC unavailable');};expect((await f.call('GET',url)).statusCode).toBe(503);
 expect((await env!.ctx.store.getLaunch(p.launch.id))!.launch.status).toBe('submitted');expect(f.chain.submitLaunchTransaction).toHaveBeenCalledTimes(1);
});
it('reports the operator broadcast gate before recording a misleading submitted state',async()=>{
 const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;
 f.chain.assertLaunchSubmissionAllowed=async()=>{throw Error('disabled');};expect((await env!.app.inject('/api/v1/launchpad/capabilities')).json().launchEnabled).toBe(false);expect((await f.call('GET',`/api/v1/launchpad/drafts/${f.draft.id}/review`)).json().launchEnabled).toBe(false);const response=await f.call('POST',url+'/submit',{transaction:f.signed(p.transaction)});
 expect(response.statusCode).toBe(503);expect((await env!.ctx.store.getLaunch(p.launch.id))!.launch).toMatchObject({status:'awaiting_signature',signature:null});expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
});

it('keeps Mainnet provenance private until finalized and recovers one receipt without a second submission (mock RPC)',async()=>{
 const f=await setup(),genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
 const build=vi.mocked(f.chain.buildLaunchTransaction).getMockImplementation()!,observe=vi.mocked(f.chain.getTransaction).getMockImplementation()!;
 let commitment:'confirmed'|'finalized'='confirmed';
 vi.mocked(f.chain.buildLaunchTransaction).mockImplementation(async input=>({...await build(input),genesisHash:genesis}));
 vi.mocked(f.chain.getTransaction).mockImplementation(async signature=>{const tx=await observe(signature);return tx?{...tx,genesisHash:genesis,commitment}:null;});
 f.chain.getGenesisHash=async()=>genesis;
 env!.ctx.config.launchRegistrationCommitment='finalized';
 env!.ctx.config.treasuries={platform:'HmmnNqZbfUZ2YK4mWVLXEGTsAU2NUUAvFzLFxgdgKUT2',agentRewards:'GEDMCV4WXHCAnySqH4CWNh3NYBrDfAUb3t4BBVBWVnJi'};
 const first=await f.prepare();expect(first.statusCode).toBe(200);const p=first.json();
 const signed=f.signed(p.transaction),url=`/api/v1/launchpad/launches/${p.launch.id}`;
 await f.call('POST',url+'/submit',{transaction:signed});f.setLanded();
 // A synthetic historical Mainnet record predates the restriction. Only read-only recovery is allowed.
 const rec=(await env!.ctx.store.getLaunch(p.launch.id))!;rec.launch.mode='production';rec.launch.execution!.network='mainnet-beta';await env!.ctx.store.updateLaunch(rec.launch,rec.version);
 env!.ctx.config.mode='production';env!.ctx.config.solana.cluster='mainnet-beta';
 expect((await f.call('GET',url)).json().launch.status).toBe('submitted');expect((await env!.app.inject(`/api/v1/launches/${p.launch.id}`)).statusCode).toBe(404);
 commitment='finalized';expect((await f.call('GET',url)).json().launch.status).toBe('confirmed');
 expect((await env!.app.inject(`/api/v1/launches/${p.launch.id}`)).statusCode).toBe(200);
 const community=(await env!.ctx.store.allCommunities()).find(c=>c.launchId===p.launch.id);expect(community?.provenance?.network).toBe('mainnet-beta');
 expect((await f.call('POST',url+'/submit',{transaction:signed})).statusCode).toBe(403);expect(f.chain.submitLaunchTransaction).toHaveBeenCalledTimes(1);
 const receipts=(await env!.ctx.store.allTreasuryEntries()).filter(e=>e.launchId===p.launch.id);expect(receipts).toHaveLength(1);expect(receipts[0]!.amount).toBe('50000000');
});


describe('initial Mainnet deployer-only policy (mock RPC; no real transactions)',()=>{
 const restrict=()=>{env!.ctx.config.mode='production';env!.ctx.config.solana.cluster='mainnet-beta';};
 it('denies ordinary authenticated wallets before allocation, including legacy preparation and body spoofing',async()=>{
  const f=await setup();restrict();
  expect((await f.prepare()).statusCode).toBe(403);
  const user=await login(env!.app);
  const legacy=await env!.app.inject({method:'POST',url:'/api/v1/launches/prepare',headers:{...user.auth,...idem()},payload:{draft:DRAFT}});
  expect(legacy.statusCode).toBe(403);
  const spoof=await f.call('POST',`/api/v1/launchpad/drafts/${f.draft.id}/launch`,{version:f.draft.version,wallet:OFFICIAL_TREASURIES.aecoDeployer});
  expect(spoof.statusCode).toBe(403);
  expect(f.chain.buildLaunchTransaction).not.toHaveBeenCalled();expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
  expect((await env!.app.inject({method:'POST',url:`/api/v1/launchpad/drafts/${f.draft.id}/launch`,headers:{origin},payload:{version:f.draft.version}})).statusCode).toBe(401);
 });
 it('rejects a legacy cached response before returning its transaction bytes',async()=>{
  const f=await setup(),user=await login(env!.app);
  env!.ctx.config.mode='demo';
  const request={method:'POST' as const,url:'/api/v1/launches/prepare',headers:{...user.auth,...idem()},payload:{draft:DRAFT}};
  expect((await env!.app.inject(request)).statusCode).toBe(201);
  restrict();expect((await env!.app.inject(request)).statusCode).toBe(403);
  expect(f.chain.buildLaunchTransaction).toHaveBeenCalledTimes(1);expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
 it('rejects a deployer sign-in forged with another wallet signature',async()=>{
  const f=await setup();restrict();
  const ch=(await env!.app.inject({method:'POST',url:'/api/v1/auth/challenge',headers:{origin},payload:{wallet:OFFICIAL_TREASURIES.aecoDeployer}})).json();
  const forged=await env!.app.inject({method:'POST',url:'/api/v1/auth/browser/verify',headers:{origin},payload:{wallet:OFFICIAL_TREASURIES.aecoDeployer,nonce:ch.nonce,signature:f.user.sign(ch.message)}});
  expect(forged.statusCode).toBe(401);expect(forged.headers['set-cookie']).toBeUndefined();
  expect(f.chain.buildLaunchTransaction).not.toHaveBeenCalled();
 });
 it('does not replay cached preparations or broadcast saved signed attempts after access is restricted',async()=>{
  const f=await setup(),p=(await f.prepare()).json(),signed=f.signed(p.transaction),url=`/api/v1/launchpad/launches/${p.launch.id}`;
  restrict();
  expect((await f.prepare()).statusCode).toBe(403);
  expect((await f.call('POST',url+'/submit',{transaction:signed})).statusCode).toBe(403);
  expect((await f.call('POST',url+'/resume',{transaction:signed})).statusCode).toBe(403);
  expect((await f.call('GET',url)).statusCode).toBe(200);
  expect(f.chain.buildLaunchTransaction).toHaveBeenCalledTimes(1);expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
  expect(await env!.ctx.store.allTreasuryEntries()).toEqual([]);
 });
 it('keeps signed recovery read-only for blocked wallets and hides resume availability',async()=>{
  const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;
  f.failRpc();expect((await f.call('POST',url+'/submit',{transaction:f.signed(p.transaction)})).statusCode).toBe(503);
  restrict();const status=await f.call('GET',url);
  expect(status.statusCode).toBe(200);expect(status.json().recovery.canResume).toBe(false);
  expect((await f.call('POST',url+'/resume',{})).statusCode).toBe(403);
  expect(f.chain.submitLaunchTransaction).toHaveBeenCalledTimes(1);
 });
 it('checks the persisted Mainnet network even when runtime configuration says Devnet',async()=>{
  const f=await setup(),p=(await f.prepare()).json(),rec=(await env!.ctx.store.getLaunch(p.launch.id))!;
  rec.launch.execution!.network='mainnet-beta';await env!.ctx.store.updateLaunch(rec.launch,rec.version);
  await expect(env!.ctx.launches.submit(f.creator.publicKey.toBase58(),p.launch.id,f.signed(p.transaction))).rejects.toMatchObject({code:'forbidden'});
  await expect(env!.ctx.launches.resume(f.creator.publicKey.toBase58(),p.launch.id)).rejects.toMatchObject({code:'forbidden'});
  await expect(env!.ctx.launches.prepare(f.creator.publicKey.toBase58(),p.launch.draft,{id:f.draft.id,version:f.draft.version,launchId:p.launch.id})).rejects.toMatchObject({code:'forbidden'});
  const claim=vi.spyOn(LaunchpadStore.prototype,'claim').mockResolvedValue({replayed:true,result:{...p,launch:rec.launch}});
  try{expect((await f.prepare()).statusCode).toBe(403);}finally{claim.mockRestore();}
  expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
 it('rechecks permission after asynchronous submission prerequisites',async()=>{
  const f=await setup(),p=(await f.prepare()).json();
  f.chain.assertLaunchSubmissionAllowed=async()=>{restrict();};
  await expect(env!.ctx.launches.submit(f.creator.publicKey.toBase58(),p.launch.id,f.signed(p.transaction))).rejects.toMatchObject({code:'forbidden'});
  expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
  expect((await env!.ctx.store.getLaunch(p.launch.id))!.launch.status).toBe('awaiting_signature');
 });
 it('keeps capabilities and media preparation locked while public pages, drafts and reviews stay readable',async()=>{
  const f=await setup();restrict();
  for(const result of [await env!.app.inject('/api/v1/launchpad/capabilities'),await f.call('GET','/api/v1/launchpad/capabilities')])expect(result.json()).toMatchObject({uploads:false,launchEnabled:false,devBuy:{status:'unavailable'}});
  expect((await f.call('GET',`/api/v1/launchpad/drafts/${f.draft.id}/review`)).json().launchEnabled).toBe(false);
  expect((await f.call('GET',`/api/v1/launchpad/drafts/${f.draft.id}`)).statusCode).toBe(200);
  expect((await f.call('POST',`/api/v1/launchpad/drafts/${f.draft.id}/metadata`,{version:f.draft.version})).statusCode).toBe(403);
  expect((await f.call('POST',`/api/v1/launchpad/drafts/${f.draft.id}/logo?version=${f.draft.version}`,Buffer.from('blocked before buffering'))).statusCode).toBe(403);
  expect((await env!.app.inject('/api/v1/world/stats')).statusCode).toBe(200);
 });
 it('permits only the fixed official deployer on Mainnet, keeps other execution gates independent and leaves Devnet unrestricted',async()=>{
  const f=await setup(),cfg=env!.ctx.config;
  expect(launchWalletAllowed(cfg,f.creator.publicKey.toBase58())).toBe(true);
  restrict();
  for(const wallet of [undefined,f.creator.publicKey.toBase58(),OFFICIAL_TREASURIES.platform,OFFICIAL_TREASURIES.agentRewards])expect(launchWalletAllowed(cfg,wallet)).toBe(false);
  expect(launchWalletAllowed(cfg,OFFICIAL_TREASURIES.aecoDeployer)).toBe(true);
  expect(()=>assertLaunchWalletAllowed(cfg,OFFICIAL_TREASURIES.aecoDeployer)).not.toThrow();
  // Wallet permission alone must not allocate a random first Mainnet mint.
  await expect(env!.ctx.launches.prepare(OFFICIAL_TREASURIES.aecoDeployer,LaunchDraft.parse(DRAFT),{id:f.draft.id,version:0,launchId:'lch_deployerpolicy'})).rejects.toMatchObject({code:'feature_disabled'});
  expect(f.chain.buildLaunchTransaction).not.toHaveBeenCalled();
  cfg.financialFeaturesEnabled=false;
  await expect(env!.ctx.launches.prepare(OFFICIAL_TREASURIES.aecoDeployer,LaunchDraft.parse(DRAFT))).rejects.toMatchObject({code:'feature_disabled'});
  expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
});

describe('operator-bound prepared official mint (public keys and mock RPC only)',()=>{
 async function reserved(){
  const f=await setup(),cfg=env!.ctx.config;
  cfg.mode='production';cfg.solana.cluster='mainnet-beta';cfg.treasuries={platform:OFFICIAL_TREASURIES.platform,agentRewards:OFFICIAL_TREASURIES.agentRewards};
  cfg.pumpLaunch.preparedMintDraftId=f.draft.id;
  f.chain.getGenesisHash=async()=>MAINNET_GENESIS;
  f.chain.buildUnsignedLaunchTransaction=vi.fn(async input=>{
   expect('mintSecretKey' in input).toBe(false);expect(input.mint).toBe(PLANNED_AECO_MINT);
   const ix=await unsignedPumpLaunchInstructions(input),addresses=[...new Map(ix.flatMap(i=>[i.programId,...i.keys.filter(k=>!k.isSigner).map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()];
   const table=new AddressLookupTableAccount({key:Keypair.generate().publicKey,state:{deactivationSlot:2n**64n-1n,lastExtendedSlot:0,lastExtendedSlotStartIndex:0,addresses}});
   const built=await buildUnsignedPumpLaunch(input,Keypair.generate().publicKey.toBase58(),[table]);
   return {...built,demo:false,genesisHash:MAINNET_GENESIS,lastValidBlockHeight:100,estimatedNetworkFeesLamports:'10000',estimatedAccountRentLamports:'11597640',mintSigningContext:{lookupTables:[{key:table.key.toBase58(),addresses:addresses.map(a=>a.toBase58())}]}};
  });
  const owner=OFFICIAL_TREASURIES.aecoDeployer,draft=LaunchDraft.parse(DRAFT),owned={id:f.draft.id,version:0,launchId:'lch_reservedofficial'};
  return {...f,cfg,owner,owned,tokenDraft:draft,prepareOfficial:()=>env!.ctx.launches.prepare(owner,draft,owned)};
 }
 it('persists the exact public mint without a mint secret and restores the immutable unsigned review',async()=>{
  const f=await reserved(),p=await f.prepareOfficial();
  expect(p.launch.mint).toBe(PLANNED_AECO_MINT);expect(p.launch.execution?.localMintReview).toMatchObject({mint:PLANNED_AECO_MINT,launcherWallet:f.owner,network:'mainnet-beta',maxTotalDebitLamports:'61607640'});
  const tx=VersionedTransaction.deserialize(Buffer.from(p.transaction,'base64'));
  expect(tx.signatures.every(sig=>sig.every(b=>b===0))).toBe(true);
  expect((await f.prepareOfficial()).transaction).toBe(p.transaction);
  expect(await env!.ctx.launches.localMintReview(f.owner,p.launch.id)).toEqual(p.launch.execution!.localMintReview);
  expect(f.chain.buildLaunchTransaction).not.toHaveBeenCalled();expect(f.chain.buildUnsignedLaunchTransaction).toHaveBeenCalledTimes(1);
  await expect(env!.ctx.launches.localMintReview(f.creator.publicKey.toBase58(),p.launch.id)).rejects.toMatchObject({code:'forbidden'});
  await expect(env!.ctx.launches.importLocalMintSignature(f.owner,p.launch.id,{launchId:p.launch.id,mint:p.launch.mint,messageSha256:p.launch.execution!.localMintReview!.messageSha256,transaction:p.transaction})).rejects.toMatchObject({code:'bad_request'});
  expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
 it('never falls back or reallocates the reserved mint across duplicate intents, stale configuration or existing chain accounts',async()=>{
  const f=await reserved(),p=await f.prepareOfficial();
  await expect(env!.ctx.launches.prepare(f.owner,f.tokenDraft,{...f.owned,launchId:'lch_second'})).rejects.toThrow();
  expect((await env!.ctx.store.getLaunch(p.launch.id))?.launch.mint).toBe(PLANNED_AECO_MINT);
  expect(await env!.ctx.store.getLaunch('lch_second')).toBeNull();
  f.cfg.pumpLaunch.preparedMintDraftId=crypto.randomUUID();
  await expect(f.prepareOfficial()).rejects.toMatchObject({code:'forbidden'});
  await expect(env!.ctx.launches.localMintReview(f.owner,p.launch.id)).rejects.toMatchObject({code:'forbidden'});
  await expect(env!.ctx.launches.assertPreparedMintAllowed(f.owner,p.launch.id)).rejects.toMatchObject({code:'forbidden'});
  await expect(env!.ctx.launches.submit(f.owner,p.launch.id,p.transaction)).rejects.toMatchObject({code:'forbidden'});
  await expect(env!.ctx.launches.resume(f.owner,p.launch.id)).rejects.toMatchObject({code:'forbidden'});
  f.cfg.pumpLaunch.preparedMintDraftId=f.owned.id;
  f.chain.mintAccountExists=vi.fn(async()=>true);
  await expect(env!.ctx.launches.prepare(f.owner,f.tokenDraft,{...f.owned,launchId:'lch_alreadyexists'})).rejects.toMatchObject({code:'unavailable'});
  expect(f.chain.buildLaunchTransaction).not.toHaveBeenCalled();expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
 it('blocks mismatched drafts, disabled financial gates, expired messages and unsigned adapter outages',async()=>{
  const f=await reserved();
  await expect(env!.ctx.launches.prepare(f.owner,f.tokenDraft,{...f.owned,id:crypto.randomUUID()})).rejects.toMatchObject({code:'forbidden'});
  f.cfg.financialFeaturesEnabled=false;
  await expect(f.prepareOfficial()).rejects.toMatchObject({code:'feature_disabled'});f.cfg.financialFeaturesEnabled=true;
  const p=await f.prepareOfficial();f.expire();
  await expect(env!.ctx.launches.importLocalMintSignature(f.owner,p.launch.id,{})).rejects.toMatchObject({code:'conflict'});
  f.chain.buildUnsignedLaunchTransaction=undefined;
  await expect(env!.ctx.launches.prepare(f.owner,f.tokenDraft,{...f.owned,launchId:'lch_missingadapter'})).rejects.toMatchObject({code:'unavailable'});
  expect(f.chain.buildLaunchTransaction).not.toHaveBeenCalled();expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
});
