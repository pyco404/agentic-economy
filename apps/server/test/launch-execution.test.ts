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
import type {SignedLaunchStore} from '../src/store/signed-launch.js';
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
  input={...p,mintSecretKey:Uint8Array.from(p.mintSecretKey)};const ix=await pumpLaunchInstructions(p);const table=new AddressLookupTableAccount({key:Keypair.generate().publicKey,state:{deactivationSlot:2n**64n-1n,lastExtendedSlot:0,lastExtendedSlotStartIndex:0,addresses:[...new Map(ix.flatMap(i=>[i.programId,...i.keys.filter(k=>!k.isSigner).map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()]}});
  return{...await buildPumpLaunch(p,Keypair.generate().publicKey.toBase58(),[table]),demo:false,lastValidBlockHeight:100,genesisHash:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'};
 });
 const get=chain.getTransaction.bind(chain);vi.spyOn(chain,'getTransaction').mockImplementation(async signature=>{
  if(!landed)return null;
  const mock=chain.simulateLaunch({launcherWallet:input.launcherWallet,mint:input.mint,platformTreasury:input.platformTreasury,agentRewardsTreasury:input.agentRewardsTreasury});return{...(await get(mock))!,signature,genesisHash:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'};
 });
 chain.getGenesisHash=async()=>'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
 chain.getFinalizedBlockHeight=async()=>finalizedHeight;
 chain.getConfirmedBlockHeight=async()=>finalizedHeight;
 chain.isBlockhashValid=async()=>true;
 chain.mintAccountExists=vi.fn(async()=>false);
 chain.getSignatureStatus=vi.fn(async()=>null);
 chain.submitLaunchTransaction=vi.fn(async transaction=>{pendingSig=bs58.encode(VersionedTransaction.deserialize(Buffer.from(transaction,'base64')).signatures[0]!);if(rpcFailure)throw new Error('RPC timed out');return pendingSig;});
 env.ctx.config.mode='devnet';env.ctx.config.financialFeaturesEnabled=true;env.ctx.config.pumpLaunch.enabled=true;
 const prepare=async(key='prepare-test-key')=>call('POST',`/api/v1/launchpad/drafts/${draft.id}/launch`,{version:draft.version},key);
 const signed=(transaction:string)=>{const tx=VersionedTransaction.deserialize(Buffer.from(transaction,'base64'));tx.sign([creator,Keypair.fromSecretKey(input.mintSecretKey)]);return Buffer.from(tx.serialize()).toString('base64');};
 return{call,prepare,signed,draft,chain,creator,user,setLanded:()=>{landed=true;},expire:()=>{finalizedHeight=101;},failRpc:()=>{rpcFailure=true;}};
}
describe('owned launch execution API (mock RPC, real transaction bytes/signatures)',()=>{
 it('keeps review unsigned and refreshes the SAME random mint just before wallet issuance',async()=>{
  const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;
  const {mintMessageHash}=await import('../src/chain/offline-mint.js');
  const hash=(t:string)=>mintMessageHash(VersionedTransaction.deserialize(Buffer.from(t,'base64')));
  expect(VersionedTransaction.deserialize(Buffer.from(p.transaction,'base64')).signatures.every(s=>s.every(b=>b===0))).toBe(true);
  const fresh=await f.call('POST',url+'/refresh-transaction',{messageSha256:hash(p.transaction)});
  expect(fresh.statusCode).toBe(200);const r=fresh.json();
  expect(r.launch).toMatchObject({id:p.launch.id,mint:p.launch.mint,draft:p.launch.draft,execution:{walletApprovalIssued:false}});
  expect(hash(r.transaction)).not.toBe(hash(p.transaction));
  const ready=await f.call('POST',url+'/wallet-transaction',{messageSha256:hash(r.transaction)});
  expect(ready.statusCode).toBe(200);const tx=VersionedTransaction.deserialize(Buffer.from(ready.json().transaction,'base64'));
  expect(tx.signatures[0]!.every(b=>b===0)).toBe(true);expect(tx.signatures[1]!.some(b=>b!==0)).toBe(true);
  expect((await f.call('POST',url+'/refresh-transaction',{messageSha256:hash(r.transaction)})).statusCode).toBe(409);
  expect((await f.call('POST',url+'/wallet-transaction',{messageSha256:hash(p.transaction)})).statusCode).toBe(409);
  expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
 it('refreshes an issued random mint only after authoritative expiry and invalidates its old mint signature',async()=>{
  const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;
  const {mintMessageHash}=await import('../src/chain/offline-mint.js');const hash=(t:string)=>mintMessageHash(VersionedTransaction.deserialize(Buffer.from(t,'base64')));
  const ready=(await f.call('POST',url+'/wallet-transaction',{messageSha256:hash(p.transaction)})).json();
  const old=f.signed(ready.transaction);f.expire();
  expect((await f.call('POST',url+'/submit',{transaction:old})).json().expiredReview).toBeDefined();
  // A fresh RPC blockhash must also return a renewed validity height.
  const build=f.chain.buildLaunchTransaction.bind(f.chain);
  vi.spyOn(f.chain,'buildLaunchTransaction').mockImplementation(async input=>({...await build(input),lastValidBlockHeight:250}));
  const refreshed=await f.call('POST',url+'/refresh-transaction',{messageSha256:hash(p.transaction)});
  expect(refreshed.statusCode).toBe(200);const r=refreshed.json();expect(r.launch.mint).toBe(p.launch.mint);expect(r.launch.id).toBe(p.launch.id);
  expect(r.launch.execution.expiredApprovals).toHaveLength(1);
  expect(VersionedTransaction.deserialize(Buffer.from(r.transaction,'base64')).signatures.every(s=>s.every(b=>b===0))).toBe(true);
  expect((await f.call('POST',url+'/submit',{transaction:old})).statusCode).toBe(400);
  const issued=await f.call('POST',url+'/wallet-transaction',{messageSha256:hash(r.transaction)});expect(issued.statusCode).toBe(200);
  expect(issued.json().messageSha256).not.toBe(ready.messageSha256);expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
 it('reconciles an interrupted RPC submission before archiving evidence and allowing a same-mint refresh',async()=>{
  const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;
  const {mintMessageHash}=await import('../src/chain/offline-mint.js');const hash=mintMessageHash(VersionedTransaction.deserialize(Buffer.from(p.transaction,'base64')));
  f.failRpc();expect((await f.call('POST',url+'/submit',{transaction:f.signed(p.transaction)})).statusCode).toBe(503);
  expect((await f.call('POST',url+'/refresh-transaction',{messageSha256:hash})).statusCode).toBe(409);
  f.expire();const status=await f.call('GET',url);expect(status.json().launch.status).toBe('expired');expect(status.json().expiredReview).toBeDefined();
  const {submissions}=env!.ctx.launches as unknown as {submissions:SignedLaunchStore};
  expect(await submissions.get(f.creator.publicKey.toBase58(),p.launch.id)).not.toBeNull();
  const build=f.chain.buildLaunchTransaction.bind(f.chain);vi.spyOn(f.chain,'buildLaunchTransaction').mockImplementation(async input=>({...await build(input),lastValidBlockHeight:250}));
  const fresh=await f.call('POST',url+'/refresh-transaction',{messageSha256:hash});expect(fresh.statusCode).toBe(200);
  expect(fresh.json().launch).toMatchObject({id:p.launch.id,mint:p.launch.mint,signature:null,status:'awaiting_signature'});
  expect(fresh.json().launch.execution.expiredApprovals).toHaveLength(1);
  expect(await submissions.get(f.creator.publicKey.toBase58(),p.launch.id)).toBeNull();
  expect(f.chain.submitLaunchTransaction).toHaveBeenCalledTimes(1); // Only the original failed RPC request, no retry.
 });
 it('records a late wallet approval without broadcasting and returns exact-message expiry proof',async()=>{
  const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;
  const transaction=f.signed(p.transaction),signature=bs58.encode(VersionedTransaction.deserialize(Buffer.from(transaction,'base64')).signatures[0]!);
  f.expire();const r=await f.call('POST',url+'/submit',{transaction});expect(r.statusCode).toBe(200);
  expect(r.json().launch).toMatchObject({status:'expired',signature:null,execution:{expiredApprovals:[{signature}]}});
  expect(r.json().expiredReview).toMatchObject({lastValidBlockHeight:100,finalizedBlockHeight:101,checkedSignature:signature});
  const version=(await env!.ctx.store.getLaunch(p.launch.id))!.version;
  expect((await f.call('POST',url+'/submit',{transaction})).json().launch.execution.expiredApprovals).toHaveLength(1);
  expect((await f.call('GET',url+'?signature='+signature)).json().expiredReview.checkedSignature).toBe(signature);
  expect((await env!.ctx.store.getLaunch(p.launch.id))!.version).toBe(version);
  expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();expect(await env!.ctx.launches.recovery(f.creator.publicKey.toBase58(),p.launch.id)).toBeUndefined();
 });
 it('keeps expiry unresolved on contradictory signature or mint history, including a browser-only signature',async()=>{
  const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;
  const transaction=f.signed(p.transaction),signature=bs58.encode(VersionedTransaction.deserialize(Buffer.from(transaction,'base64')).signatures[0]!);f.expire();
  await f.call('GET',url);f.chain.getSignatureStatus=vi.fn(async()=>({slot:1,err:null,confirmationStatus:'processed' as const}));
  expect((await f.call('GET',url+'?signature='+signature)).statusCode).toBe(503);
  expect((await f.call('POST',url+'/submit',{transaction})).statusCode).toBe(503);
  f.chain.getSignatureStatus=async()=>null;vi.spyOn(f.chain,'listSignaturesForAddress').mockResolvedValue([signature]);
  expect((await f.call('GET',url)).statusCode).toBe(503);expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
 it('checks confirmed height and blockhash before opening a fresh wallet signing window',async()=>{
  const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}/signing-window`;
  expect((await f.call('GET',url)).json()).toMatchObject({remainingBlocks:99});
  f.chain.getConfirmedBlockHeight=async()=>80;expect((await f.call('GET',url)).statusCode).toBe(409);
  f.chain.getConfirmedBlockHeight=async()=>1;f.chain.isBlockhashValid=async()=>false;expect((await f.call('GET',url)).statusCode).toBe(409);
  f.chain.isBlockhashValid=async()=>{throw Error('RPC unavailable');};expect((await f.call('GET',url)).statusCode).toBe(503);
  expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
 it('never broadcasts a closed blockhash while finalized expiry is still catching up',async()=>{
  const f=await setup(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;
  const transaction=f.signed(p.transaction);f.chain.isBlockhashValid=async()=>false;
  const r=await f.call('POST',url+'/submit',{transaction});expect(r.statusCode).toBe(503);expect(r.json().error.message).toContain('approval window ended');
  expect((await f.call('GET',url)).json().expiredReview).toBeUndefined();expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
  f.expire();expect((await f.call('POST',url+'/submit',{transaction})).json().expiredReview).toBeDefined();
  expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
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
  expect((await f.call('POST',url+'/refresh-transaction',{messageSha256:'a'.repeat(64)})).statusCode).toBe(403);
  expect((await f.call('POST',url+'/wallet-transaction',{messageSha256:'a'.repeat(64)})).statusCode).toBe(403);
  expect((await f.call('POST',url+'/mint-signature/automatic',{})).statusCode).toBe(403);
  expect((await f.call('POST',url+'/mint-review/renew',{messageSha256:'a'.repeat(64)})).statusCode).toBe(403);
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
  await expect(env!.ctx.launches.prepare(OFFICIAL_TREASURIES.aecoDeployer,LaunchDraft.parse(DRAFT),{id:f.draft.id,version:0,launchId:'lch_deployerpolicy'})).rejects.toMatchObject({code:'forbidden'});
  expect(f.chain.buildLaunchTransaction).not.toHaveBeenCalled();
  cfg.financialFeaturesEnabled=false;
  await expect(env!.ctx.launches.prepare(OFFICIAL_TREASURIES.aecoDeployer,LaunchDraft.parse(DRAFT))).rejects.toMatchObject({code:'feature_disabled'});
  expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
});

describe('separately approved public Mainnet release (disposable keys and mock RPC only)',()=>{
 async function publicRelease(){
  const f=await setup(),cfg=env!.ctx.config;
  const build=vi.mocked(f.chain.buildLaunchTransaction).getMockImplementation()!;
  vi.mocked(f.chain.buildLaunchTransaction).mockImplementation(async input=>({...await build(input),genesisHash:MAINNET_GENESIS}));
  const observe=vi.mocked(f.chain.getTransaction).getMockImplementation()!;
  vi.mocked(f.chain.getTransaction).mockImplementation(async signature=>{const tx=await observe(signature);return tx?{...tx,genesisHash:MAINNET_GENESIS,commitment:'finalized' as const}:null;});
  f.chain.getGenesisHash=async()=>MAINNET_GENESIS;
  cfg.mode='production';cfg.solana.cluster='mainnet-beta';cfg.launchRegistrationCommitment='finalized';
  cfg.treasuries={platform:OFFICIAL_TREASURIES.platform,agentRewards:OFFICIAL_TREASURIES.agentRewards};
  cfg.pumpLaunch.mainnetApproved=true;cfg.pumpLaunch.publicMainnetApproved=true;
  return f;
 }
 it('keeps public approval default-off and rejects approval without the independent execution gates',()=>{
  expect(loadConfig({MODE:'demo'}).pumpLaunch.publicMainnetApproved).toBe(false);
  expect(()=>loadConfig({MODE:'demo',MAINNET_PUBLIC_LAUNCH_APPROVED:'true'})).toThrow('separate Mainnet execution approval');
 });
 it('uses a normal random mint, refreshes it, requires the independent payer signature and finalizes one charge',async()=>{
  const f=await publicRelease();
  expect(launchWalletAllowed(env!.ctx.config,undefined)).toBe(false);
  const result=await f.prepare();expect(result.statusCode).toBe(200);const p=result.json();
  expect(p.launch.mint).not.toBe(PLANNED_AECO_MINT);expect(p.launch.execution.localMintReview).toBeUndefined();
  expect(p.launch.fees).toMatchObject({platformLaunchFeeLamports:'50000000',platformTreasury:OFFICIAL_TREASURIES.platform,developerBuy:null,creatorFeeSplit:{agentRewardsTreasury:OFFICIAL_TREASURIES.agentRewards,agentRewardsBps:6000,platformTreasury:OFFICIAL_TREASURIES.platform,platformBps:4000}});
  const {mintMessageHash}=await import('../src/chain/offline-mint.js'),hash=(t:string)=>mintMessageHash(VersionedTransaction.deserialize(Buffer.from(t,'base64'))),url=`/api/v1/launchpad/launches/${p.launch.id}`;
  const refreshed=await f.call('POST',url+'/refresh-transaction',{messageSha256:hash(p.transaction)});
  expect(refreshed.statusCode).toBe(200);expect(refreshed.json().launch.mint).toBe(p.launch.mint);
  const issued=await f.call('POST',url+'/wallet-transaction',{messageSha256:hash(refreshed.json().transaction)});
  expect(issued.statusCode).toBe(200);const tx=VersionedTransaction.deserialize(Buffer.from(issued.json().transaction,'base64'));
  expect(tx.signatures[0]!.every(b=>b===0)).toBe(true);expect(tx.signatures[1]!.some(b=>b!==0)).toBe(true);
  expect((await f.call('POST',url+'/submit',{transaction:issued.json().transaction})).statusCode).toBe(400);
  const signed=f.signed(issued.json().transaction);expect((await f.call('POST',url+'/submit',{transaction:signed})).statusCode).toBe(200);
  f.setLanded();expect((await f.call('GET',url)).json().launch.status).toBe('confirmed');
  expect((await f.call('POST',url+'/submit',{transaction:signed})).statusCode).toBe(200);
  expect(f.chain.submitLaunchTransaction).toHaveBeenCalledTimes(1);
  expect((await env!.ctx.store.allTreasuryEntries()).filter(r=>r.stream==='launch_fee')).toHaveLength(1);
  expect((await env!.ctx.store.allCommunities()).some(c=>c.mint===p.launch.mint&&c.provenance?.network==='mainnet-beta')).toBe(true);
 });
 it('allows repeated metadata and multiple independent mints while never routing a normal launch through the official signer',async()=>{
  const f=await publicRelease(),owner=f.creator.publicKey.toBase58(),draft=LaunchDraft.parse(DRAFT);
  const prepare=(suffix:string)=>env!.ctx.launches.prepare(owner,draft,{id:crypto.randomUUID(),version:0,launchId:`lch_public_${suffix}`});
  const first=await prepare('first'),second=await prepare('second');
  expect(first.launch.mint).not.toBe(second.launch.mint);expect([first.launch.mint,second.launch.mint]).not.toContain(PLANNED_AECO_MINT);
  expect(first.launch.draft).toEqual(second.launch.draft);expect(f.chain.mintAccountExists).not.toHaveBeenCalled();
  expect(f.chain.buildLaunchTransaction).toHaveBeenCalledTimes(2);expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
 it('blocks pending preparations, refresh, signer issuance and submission immediately after public access is rolled back',async()=>{
  const f=await publicRelease(),p=(await f.prepare()).json(),url=`/api/v1/launchpad/launches/${p.launch.id}`;
  env!.ctx.config.pumpLaunch.publicMainnetApproved=false;
  expect((await f.prepare()).statusCode).toBe(403);
  for(const suffix of ['/refresh-transaction','/wallet-transaction','/submit','/resume'])
   expect((await f.call('POST',url+suffix,{transaction:f.signed(p.transaction),messageSha256:'a'.repeat(64)})).statusCode).toBe(403);
  expect((await f.call('GET',url)).statusCode).toBe(200);
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
 it('binds the official mint automatically to one durable intent without an operator draft ID',async()=>{
  const f=await reserved();f.cfg.pumpLaunch.preparedMintDraftId=null;f.cfg.financialFeaturesEnabled=false;f.cfg.pumpLaunch.enabled=false;
  const first=await f.prepareOfficial();
  expect(first.launch.mint).toBe(PLANNED_AECO_MINT);expect(first.launch.execution!.draftId).toBe(f.owned.id);
  expect(first.launch.execution!.localMintReview!.launchId).toBe(first.launch.id);
  expect((await f.prepareOfficial()).transaction).toBe(first.transaction);
  await expect(env!.ctx.launches.localMintReview(f.owner,first.launch.id)).resolves.toEqual(first.launch.execution!.localMintReview);
  const results=await Promise.allSettled([1,2].map(i=>env!.ctx.launches.prepare(f.owner,f.tokenDraft,{...f.owned,id:crypto.randomUUID(),launchId:`lch_otherintent${i}`})));
  expect(results.every(r=>r.status==='rejected')).toBe(true);
  expect((await env!.ctx.store.getLaunch(first.launch.id))!.launch.execution!.draftId).toBe(f.owned.id);
  await expect(env!.ctx.launches.submit(f.owner,first.launch.id,first.transaction)).rejects.toMatchObject({code:'feature_disabled'});
  await expect(env!.ctx.launches.importLocalMintSignature(f.owner,first.launch.id,{})).rejects.toMatchObject({code:'feature_disabled'});
  expect(f.chain.buildLaunchTransaction).not.toHaveBeenCalled();expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
 it('guards automatic signing before key access on permission, expiry, network, mint and recovery uncertainty',async()=>{
  const f=await reserved(),service=env!.ctx.launches,sign=vi.fn();
  Object.defineProperty(service,'serverMintSigner',{value:{configured:()=>true,sign}});
  const p=await f.prepareOfficial();
  await expect(service.automaticMintSignature(f.creator.publicKey.toBase58(),p.launch.id)).rejects.toMatchObject({code:'forbidden'});
  f.cfg.financialFeaturesEnabled=false;await expect(service.automaticMintSignature(f.owner,p.launch.id)).rejects.toMatchObject({code:'feature_disabled'});f.cfg.financialFeaturesEnabled=true;
  f.expire();await expect(service.automaticMintSignature(f.owner,p.launch.id)).rejects.toMatchObject({code:'conflict'});f.chain.getFinalizedBlockHeight=async()=>1;
  f.chain.getGenesisHash=async()=>'wrong';await expect(service.automaticMintSignature(f.owner,p.launch.id)).rejects.toMatchObject({code:'unavailable'});f.chain.getGenesisHash=async()=>MAINNET_GENESIS;
  f.chain.mintAccountExists=async()=>true;await expect(service.automaticMintSignature(f.owner,p.launch.id)).rejects.toMatchObject({code:'unavailable'});f.chain.mintAccountExists=async()=>false;
  f.chain.assertLaunchSubmissionAllowed=async()=>{throw new Error('Protocol changed');};await expect(service.automaticMintSignature(f.owner,p.launch.id)).rejects.toMatchObject({code:'unavailable'});f.chain.assertLaunchSubmissionAllowed=async()=>{};
  const submissions=(service as unknown as {submissions:SignedLaunchStore}).submissions;
  await submissions.put({wallet:f.owner,launchId:p.launch.id,mint:p.launch.mint,genesisHash:MAINNET_GENESIS,signature:bs58.encode(new Uint8Array(64).fill(1)),transaction:p.transaction});
  await expect(service.automaticMintSignature(f.owner,p.launch.id)).rejects.toMatchObject({code:'conflict'});expect(sign).not.toHaveBeenCalled();expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
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
 it('renews only a definitively expired unsigned review on the same mint and retains history/idempotency',async()=>{
  const f=await reserved();f.cfg.pumpLaunch.preparedMintDraftId=null;const first=await f.prepareOfficial(),old=first.launch.execution!.localMintReview!,service=env!.ctx.launches;
  await expect(service.renewLocalMintReview(f.owner,first.launch.id,old.messageSha256)).rejects.toMatchObject({code:'conflict'});
  f.expire();const builder=f.chain.buildUnsignedLaunchTransaction!;f.chain.buildUnsignedLaunchTransaction=vi.fn(async input=>({...await builder(input),lastValidBlockHeight:250}));
  const renewed=await service.renewLocalMintReview(f.owner,first.launch.id,old.messageSha256);
  expect(renewed.launch.id).toBe(first.launch.id);expect(renewed.launch.mint).toBe(PLANNED_AECO_MINT);
  expect(renewed.launch.execution!.localMintReviewHistory).toEqual([old]);expect(renewed.transaction).not.toBe(first.transaction);
  expect(renewed.launch.execution!.localMintReview!.renewal).toMatchObject({previousMessageSha256:old.messageSha256,previousLastValidBlockHeight:100,finalizedBlockHeight:101});
  expect((await service.renewLocalMintReview(f.owner,first.launch.id,old.messageSha256)).transaction).toBe(renewed.transaction);
  expect((await f.prepareOfficial()).transaction).toBe(renewed.transaction);
  expect(f.chain.buildUnsignedLaunchTransaction).toHaveBeenCalledTimes(1);expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
 it('collapses concurrent renewals to one saved review without regenerating a mint or submitting',async()=>{
  const f=await reserved(),first=await f.prepareOfficial(),old=first.launch.execution!.localMintReview!,service=env!.ctx.launches;
  f.expire();const builder=f.chain.buildUnsignedLaunchTransaction!;let ready=0,release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  f.chain.buildUnsignedLaunchTransaction=vi.fn(async input=>{const built=await builder(input);if(++ready===2)release();await gate;return {...built,lastValidBlockHeight:250};});
  const [a,b]=await Promise.all([service.renewLocalMintReview(f.owner,first.launch.id,old.messageSha256),service.renewLocalMintReview(f.owner,first.launch.id,old.messageSha256)]);
  expect(a.transaction).toBe(b.transaction);expect(a.launch.id).toBe(first.launch.id);
  expect((await env!.ctx.store.getLaunch(first.launch.id))!.launch.execution!.localMintReviewHistory).toEqual([old]);
  expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();expect(f.chain.buildLaunchTransaction).not.toHaveBeenCalled();
 });
 it('retains expired-approval evidence when renewing the same reserved mint and unchanged metadata',async()=>{
  const f=await reserved(),service=env!.ctx.launches,first=await f.prepareOfficial(),old=first.launch.execution!.localMintReview!;
  const signature=bs58.encode(new Uint8Array(64).fill(7)),rec=(await env!.ctx.store.getLaunch(first.launch.id))!;
  await env!.ctx.store.updateLaunch({...rec.launch,status:'expired',execution:{...rec.launch.execution!,expiredApprovals:[{signature,messageSha256:old.messageSha256,at:new Date().toISOString()}]}},rec.version);
  f.expire();const proof=await service.expiredReview(f.owner,first.launch.id,signature);expect(proof?.checkedSignature).toBe(signature);
  const builder=f.chain.buildUnsignedLaunchTransaction!;f.chain.buildUnsignedLaunchTransaction=vi.fn(async input=>({...await builder(input),lastValidBlockHeight:250}));
  const renewed=await service.renewLocalMintReview(f.owner,first.launch.id,old.messageSha256);
  expect(renewed.launch.mint).toBe(first.launch.mint);expect(renewed.launch.draft).toEqual(first.launch.draft);
  expect(renewed.launch.execution!.expiredApprovals).toMatchObject([{signature,messageSha256:old.messageSha256}]);
  expect(renewed.launch.execution!.localMintReviewHistory).toEqual([old]);expect(renewed.launch.signature).toBeNull();
  expect(renewed.launch.fees.platformTreasury).toBe(first.launch.fees.platformTreasury);expect(renewed.launch.fees.creatorFeeSplit).toEqual(first.launch.fees.creatorFeeSplit);
  expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
 it('blocks renewal on mint/history/network uncertainty, a signed receipt, permission loss or disabled execution',async()=>{
  const f=await reserved(),first=await f.prepareOfficial(),old=first.launch.execution!.localMintReview!,service=env!.ctx.launches;
  f.expire();f.chain.mintAccountExists=async()=>true;
  await expect(service.renewLocalMintReview(f.owner,first.launch.id,old.messageSha256)).rejects.toMatchObject({code:'unavailable'});
  f.chain.mintAccountExists=async()=>false;f.chain.listSignaturesForAddress=async()=>['history'];
  await expect(service.renewLocalMintReview(f.owner,first.launch.id,old.messageSha256)).rejects.toMatchObject({code:'unavailable'});
  f.chain.listSignaturesForAddress=async()=>{throw new Error('RPC unavailable');};
  await expect(service.renewLocalMintReview(f.owner,first.launch.id,old.messageSha256)).rejects.toThrow();
  f.chain.listSignaturesForAddress=async()=>[];f.chain.getGenesisHash=async()=>'wrong';
  await expect(service.renewLocalMintReview(f.owner,first.launch.id,old.messageSha256)).rejects.toMatchObject({code:'unavailable'});
  f.chain.getGenesisHash=async()=>MAINNET_GENESIS;f.cfg.financialFeaturesEnabled=false;f.cfg.treasuries.platform=Keypair.generate().publicKey.toBase58();
  await expect(service.renewLocalMintReview(f.owner,first.launch.id,old.messageSha256)).rejects.toMatchObject({code:'feature_disabled'});f.cfg.financialFeaturesEnabled=true;f.cfg.treasuries.platform=OFFICIAL_TREASURIES.platform;
  await expect(service.renewLocalMintReview(f.creator.publicKey.toBase58(),first.launch.id,old.messageSha256)).rejects.toMatchObject({code:'forbidden'});
  const submissions=(service as unknown as {submissions:SignedLaunchStore}).submissions;
  await submissions.put({wallet:f.owner,launchId:first.launch.id,mint:first.launch.mint,genesisHash:MAINNET_GENESIS,signature:bs58.encode(new Uint8Array(64).fill(1)),transaction:first.transaction});
  await expect(service.renewLocalMintReview(f.owner,first.launch.id,old.messageSha256)).rejects.toMatchObject({code:'conflict'});
  expect((await env!.ctx.store.getLaunch(first.launch.id))!.launch.execution!.localMintReview).toEqual(old);
  expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
 it('blocks mismatched drafts, disabled financial gates, expired messages and unsigned adapter outages',async()=>{
  const f=await reserved();
  await expect(env!.ctx.launches.prepare(f.owner,f.tokenDraft,{...f.owned,id:crypto.randomUUID()})).rejects.toMatchObject({code:'forbidden'});
  f.cfg.financialFeaturesEnabled=false;
  const unsigned=await f.prepareOfficial();
  await expect(env!.ctx.launches.importLocalMintSignature(f.owner,unsigned.launch.id,{})).rejects.toMatchObject({code:'feature_disabled'});
  await expect(env!.ctx.launches.submit(f.owner,unsigned.launch.id,unsigned.transaction)).rejects.toMatchObject({code:'feature_disabled'});
  f.cfg.financialFeaturesEnabled=true;
  const p=await f.prepareOfficial();f.expire();
  await expect(env!.ctx.launches.importLocalMintSignature(f.owner,p.launch.id,{})).rejects.toMatchObject({code:'conflict'});
  f.chain.buildUnsignedLaunchTransaction=undefined;
  await expect(env!.ctx.launches.prepare(f.owner,f.tokenDraft,{...f.owned,launchId:'lch_missingadapter'})).rejects.toMatchObject({code:'unavailable'});
  expect(f.chain.buildLaunchTransaction).not.toHaveBeenCalled();expect(f.chain.submitLaunchTransaction).not.toHaveBeenCalled();
 });
});
