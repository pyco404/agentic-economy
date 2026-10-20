/** Explicit, resumable public-Devnet acceptance through the actual Launchpad API and PostgreSQL.
 * No migrations, arbitrary wallet paths, user wallets, new ALTs or production configuration.
 * The signer and recipients below are dedicated faucet-funded test roles. Financial enablement is
 * confined to this process; no HTTP listener is opened. PINATA_JWT remains server-side.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,stat,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Connection,Keypair,PublicKey,VersionedTransaction,TransactionMessage} from '@solana/web3.js';
import pg from 'pg';import nacl from 'tweetnacl';import bs58 from 'bs58';import sharp from 'sharp';
import {loadConfig} from '../src/config.js';import {createContext,type AppContext} from '../src/context.js';import {buildApp} from '../src/http/app.js';
import {devBuyTokenAccount} from '../src/chain/pump-builder.js';import {pumpTradesFromEvidence} from '../src/chain/pump-events.js';
import type {FastifyInstance} from 'fastify';
const GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',RPC='https://api.devnet.solana.com';
const WALLET='49Y2BZrtXmkKPTphcsx5riMDX4s4uqwC6yDmrprYaX3F',ALT='3fzk4ecq4NZ6XtVyayTBo2cYJTcMJMgNYr4cAFcgYLrn';
const PLATFORM='GcQFWipjZvpuk2sdJAZ4BwyTMdWTDmfjxWSdw4bTVzvp',AGENT='D8p7CytykA5Q7vSDGGoCJC6mNyLKXVwiEXLboih2ZHJs';
const DB='postgres:///aeco_launch_execution_20261018_test?host=/var/run/postgresql',ORIGIN='http://localhost:5187';
const privateDir='/home/pikoo/Desktop/agentic-economy/.backups/private-devnet-verification';
const statePath=new URL('../../web/artifacts/controlled-dev-buy-devnet-state.json',import.meta.url);
const evidencePath=new URL('../docs/evidence/developer-buy-controlled-devnet-2026-10-20.json',import.meta.url);
const action=process.argv[2]??'verify';
assert(process.env.AECO_CONTROLLED_DEVNET_TEST==='true','Explicit controlled Devnet opt-in required');
assert(['run','verify','reconcile-home'].includes(action),'Unknown action');
const connection=new Connection(RPC,'finalized');assert.equal(await connection.getGenesisHash(),GENESIS);
const pool=new pg.Pool({connectionString:DB});try{
 assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'aeco_launch_execution_20261018_test');
 const applied=new Map((await pool.query('SELECT name,checksum FROM schema_migrations')).rows.map(r=>[r.name,r.checksum]));
 const dir=new URL('../src/store/migrations/',import.meta.url);
 for(const name of(await readdir(dir)).filter(n=>n.endsWith('.sql')))assert.equal(applied.get(name),createHash('sha256').update(await readFile(new URL(name,dir))).digest('hex'),'Unapproved migration/checksum mismatch');
}finally{await pool.end();}
const log=(stage:string,detail:object={})=>console.log(JSON.stringify({stage,...detail}));
const config=loadConfig({MODE:'devnet',ROLE:'all',LOG_LEVEL:'silent',DATABASE_URL:DB,SOLANA_RPC_URL:RPC,SOLANA_CLUSTER:'devnet',PUMP_LAUNCH_ENABLED:'true',FEE_ROUTING_VERIFIED:'true',LAUNCH_REGISTRATION_COMMITMENT:'finalized',PUMP_LAUNCH_LOOKUP_TABLE:ALT,PLATFORM_TREASURY:PLATFORM,AGENT_REWARDS_TREASURY:AGENT,PINATA_JWT:process.env.PINATA_JWT,AUTH_URI:ORIGIN,AUTH_DOMAIN:'localhost:5187',CORS_ORIGINS:ORIGIN,SIM_AUTOSTART:'false',WORLD_SEED:'local-launch-protocol-verification'});
let ctx:AppContext,app:FastifyInstance,cookie='';
async function open(){ctx=await createContext(config,{logger:{info:(event)=>{if(event&&typeof event==='object'&&'stage'in event)log('backend',event);},warn:()=>{},error:()=>{}}});app=await buildApp(ctx);}
async function close(){await app.close();await ctx.close();}
async function call(method:'GET'|'POST',url:string,payload?:unknown,key:string|undefined=undefined,mime='application/json'){
 const response=await app.inject({method,url,headers:{origin:ORIGIN,cookie,...(key?{'idempotency-key':key}:{}),'content-type':mime},...(payload===undefined?{}:{payload:payload as string})});
 if(response.statusCode>=400){const e=response.json().error;throw Error(`${method} ${url}: HTTP ${response.statusCode} ${e?.code??''} ${e?.message??'Request failed'}`);}return response.json();
}
await open();
try{
 if(action==='reconcile-home'){
  // Read-only chain verification plus a targeted state transition; never a submission or wallet signature.
  const id='lch_81180034cef889665c3273a4',wallet='3pF1MM1PCg2tekM5KeWEDyT8LVKbVd7ia668NRAnYpAR';
  const before=await ctx!.store.getLaunch(id);assert(before);const after=await ctx!.launches.refresh(wallet,id);
  assert.equal(after.signature,before.launch.signature);assert.equal(after.status,'expired');log('home_reconciled',{id,mint:after.mint,signature:after.signature,status:after.status,errors:after.errors});
 }else{
  assert(process.env.PINATA_JWT,'Server-only Pinata credential required');
  for(const b of [300,350]){const file=privateDir+`/.env.controlled-signed-${b}.txt`;try{if((await stat(file)).mtimeMs+24*60*60*1000<Date.now())await unlink(file);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
  const creator=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(privateDir+'/.env.developer-buy-test-20261020.keypair.json','utf8'))));assert.equal(creator.publicKey.toBase58(),WALLET);
  const table=(await connection.getAddressLookupTable(new PublicKey(ALT))).value;assert(table);assert(table.isActive());assert((await connection.getSlot('finalized'))>table.state.lastExtendedSlot);
  let state:Record<string,{draftId:string;launchId?:string;mint?:string;signature?:string}>={};try{state=JSON.parse(await readFile(statePath,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const save=()=>writeFile(statePath,JSON.stringify(state,null,2)+'\n');
  async function login(){const ch=await call('POST','/api/v1/auth/challenge',{wallet:WALLET});const r=await app.inject({method:'POST',url:'/api/v1/auth/browser/verify',headers:{origin:ORIGIN},payload:{wallet:WALLET,nonce:ch.nonce,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(ch.message),creator.secretKey))}});assert.equal(r.statusCode,200);cookie=r.headers['set-cookie']!.toString().split(';')[0]!;}
  await login();const results:object[]=[];
  for(const bps of [300,350]){
   const key=String(bps);if(action==='verify')assert(state[key]?.launchId,'Run must create the controlled attempt before verification');
   if(!state[key]){const d=await call('POST','/api/v1/launchpad/drafts',{name:`AECO Dev Buy ${bps} Test`,symbol:bps===300?'ADBT3':'ADBT35',description:'Controlled public Devnet test. Faucet funds only. No real monetary value.',quoteAsset:'SOL',devBuyBps:bps},`controlled-20261020-create-${bps}`);state[key]={draftId:d.id};await save();}
   const record=state[key]!;let draft=await call('GET',`/api/v1/launchpad/drafts/${record.draftId}`);
   if(!record.launchId){
    assert.equal(action,'run');
    if(!draft.image){const bytes=await sharp({create:{width:64,height:64,channels:4,background:{r:79,g:109,b:82,alpha:1}}}).png().toBuffer();draft=await call('POST',`/api/v1/launchpad/drafts/${draft.id}/logo?version=${draft.version}`,bytes,`controlled-image-${bps}`,'application/octet-stream');}
    if(!draft.metadata)draft=await call('POST',`/api/v1/launchpad/drafts/${draft.id}/metadata`,{version:draft.version},`controlled-metadata-${bps}`);
    const review=await call('GET',`/api/v1/launchpad/drafts/${draft.id}/review`);assert(review.launchEnabled&&review.readyForNextMilestone);
    const p=await call('POST',`/api/v1/launchpad/drafts/${draft.id}/launch`,{version:draft.version},`controlled-launch-20261020-${bps}`);record.launchId=p.launch.id;record.mint=p.launch.mint;await save();
   }
   let launch=(await call('GET',`/api/v1/launchpad/launches/${record.launchId}`)).launch;
   if(!['confirmed','submitted','recovery_needed'].includes(launch.status)){
    assert.equal(action,'run');assert.equal(launch.status,'awaiting_signature','Never silently replace an expired or failed controlled attempt');assert(!launch.signature);
    const tx=VersionedTransaction.deserialize(Buffer.from(launch.execution.transaction,'base64'));
    assert.deepEqual(tx.message.staticAccountKeys.slice(0,tx.message.header.numRequiredSignatures).map(k=>k.toBase58()),[WALLET,launch.mint]);
    const fees=launch.fees,total=BigInt(fees.platformLaunchFeeLamports)+BigInt(fees.estimatedNetworkFeesLamports)+BigInt(fees.estimatedAccountRentLamports)+BigInt(fees.developerBuy.maxQuoteCost);
    assert.equal(fees.platformLaunchFeeLamports,'50000000');assert.equal(fees.developerBuy.bps,bps);assert(total<100000000n);assert(BigInt(await connection.getBalance(creator.publicKey))>=total);
    assert.equal(BigInt(fees.developerBuy.tokenAmount)*10000n,BigInt(fees.developerBuy.totalSupply)*BigInt(bps));
    const decompiled=TransactionMessage.decompile(tx.message,{addressLookupTableAccounts:[table]});
    log('before_signing',{bps,launchId:launch.id,mint:launch.mint,maxLamports:total.toString(),fees,bytes:tx.serialize().length,instructions:decompiled.instructions.map(i=>({program:i.programId.toBase58(),dataHex:Buffer.from(i.data).subarray(0,8).toString('hex')})),lookupTables:tx.message.addressTableLookups.map(t=>t.accountKey.toBase58())});
    tx.sign([creator]);const signed=Buffer.from(tx.serialize()).toString('base64');record.signature=bs58.encode(tx.signatures[0]!);await save();
    await writeFile(privateDir+`/.env.controlled-signed-${bps}.txt`,signed,{mode:0o600});
    const result=await call('POST',`/api/v1/launchpad/launches/${launch.id}/submit`,{transaction:signed});launch=result.launch;
    // Discard the submission response and restart the entire backend/context before confirmation.
    await close();await open();await login();log('backend_restarted_after_submission',{bps,signature:record.signature});
   }
   for(let i=0;i<90;i++){
    launch=(await call('GET',`/api/v1/launchpad/launches/${record.launchId}`)).launch;
    if(launch.status==='confirmed')break;
    assert(!['failed','expired','recovery_needed'].includes(launch.status),`Controlled attempt ${launch.status}; keep its existing mint/signature`);
    await new Promise(r=>setTimeout(r,1500));
   }
   assert.equal(launch.status,'confirmed','Uncertain outcome; no new transaction is authorized by a retry');record.signature=launch.signature;await save();
   const tx=await connection.getTransaction(launch.signature,{commitment:'finalized',maxSupportedTransactionVersion:0});assert(tx?.meta);assert.equal(tx.meta.err,null);
   const observed=await ctx!.chain.getTransaction(launch.signature);assert(observed);assert.equal(observed.commitment,'finalized');
   const supply=await connection.getTokenSupply(new PublicKey(launch.mint),'finalized'),balance=await connection.getTokenAccountBalance(new PublicKey(devBuyTokenAccount(WALLET,launch.mint)),'finalized');
   const amount=BigInt(balance.value.amount),total=BigInt(supply.value.amount);assert.equal(amount*10000n,total*BigInt(bps));assert(amount*10000n<=total*350n);
   const charges=observed.systemTransfers.filter(t=>t.from===WALLET&&t.to===PLATFORM&&t.lamports===50000000n);assert.equal(charges.length,1);assert.equal(observed.lamportDeltas[PLATFORM],50000000n);
   const trade=pumpTradesFromEvidence([],observed.innerInstructions??[],launch.mint).trades.find(t=>t.side==='buy'&&t.user===WALLET);assert(trade);assert.equal(BigInt(trade.tokenAmount),amount);
   const purchase=BigInt(trade.quoteAmount)+BigInt(trade.protocolFee)+BigInt(trade.creatorFee),walletDebit=-observed.lamportDeltas[WALLET]!,network=BigInt(tx.meta.fee),rent=walletDebit-50000000n-purchase-network;
   const receipts=(await ctx!.store.allTreasuryEntries()).filter(e=>e.launchId===launch.id&&e.stream==='launch_fee');assert.equal(receipts.length,1);
   const market=await call('GET',`/api/v1/token-markets/${launch.mint}`);assert.equal(market.mint??market.launch?.mint,launch.mint);
   const again=await call('POST',`/api/v1/launchpad/launches/${launch.id}/resume`,{});assert.equal(again.launch.signature,launch.signature);assert.equal(again.launch.status,'confirmed');
   const metadata=await fetch(draft.metadata.gatewayUrl,{signal:AbortSignal.timeout(30000)});assert(metadata.ok);const json=await metadata.json() as {image:string};assert.equal(json.image,draft.image.gatewayUrl);
   const image=await fetch(draft.image.gatewayUrl,{signal:AbortSignal.timeout(30000)});assert(image.ok);
   const result={bps,wallet:WALLET,launchId:launch.id,mint:launch.mint,signature:launch.signature,commitment:'finalized',slot:tx.slot,tokenSupplyRaw:total.toString(),decimals:supply.value.decimals,developerTokensRaw:amount.toString(),allocationPercent:String(bps/100),purchaseLamports:purchase.toString(),curveQuoteLamports:trade.quoteAmount,protocolFeesLamports:trade.protocolFee,creatorFeesLamports:trade.creatorFee,networkFeeLamports:network.toString(),rentLamports:rent.toString(),walletDebitLamports:walletDebit.toString(),platformChargeLamports:'50000000',platformChargeCount:charges.length,platformReceiptCount:receipts.length,feesPreview:launch.fees,backendLaunchStatus:launch.status,exploreVerified:true,image:draft.image,metadata:draft.metadata,metadataRetrievable:true,imageRetrievable:true,transactionBytes:tx.transaction.message.serialize().length+1+tx.transaction.signatures.length*64,computeUnitsConsumed:tx.meta.computeUnitsConsumed,lookupTables:tx.transaction.message.addressTableLookups.map(t=>t.accountKey.toBase58())};
   await unlink(privateDir+`/.env.controlled-signed-${bps}.txt`).catch(e=>{if(e.code!=='ENOENT')throw e;});
   results.push(result);log('finalized',result);
   await writeFile(evidencePath,JSON.stringify({network:'public-devnet',genesis:GENESIS,database:'aeco_launch_execution_20261018_test',signer:'dedicated locally controlled disposable wallet, not Phantom',pinata:'actual authenticated image and metadata pipeline',lookupTable:ALT,checkedAt:new Date().toISOString(),results},null,2)+'\n');
  }
 }
}finally{await close();}
