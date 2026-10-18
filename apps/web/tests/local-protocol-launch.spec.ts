/** Explicit external integration: real Pinata + an isolated validator or verified public devnet.
 * Never enables staging; public devnet requires a separately funded, explicitly named test wallet.
 */
import {test,expect} from '@playwright/test';
import {AddressLookupTableProgram,Connection,Keypair,Transaction,VersionedTransaction,sendAndConfirmTransaction} from '@solana/web3.js';
import nacl from 'tweetnacl';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {loadConfig} from '../../server/src/config';
import {createContext,type AppContext} from '../../server/src/context';
import {buildApp} from '../../server/src/http/app';
import {pumpLaunchInstructions} from '../../server/src/chain/pump-builder';
import {SolanaRpcChain} from '../../server/src/chain/solana';
import type {TokenLaunch} from '../src/api/shared';
const devnet=process.env.AECO_RUN_DEVNET_PROTOCOL==='true',network=devnet?'devnet':'localnet';
const enabled=devnet||process.env.AECO_RUN_LOCAL_PROTOCOL==='true';
test.skip(!enabled,'Explicit safe-network opt-in, real Pinata and approved disposable database required.');
const site='http://127.0.0.1:5186',api='http://127.0.0.1:8796';

test('existing Launchpad → real Pinata → safe-network Pump execution → database restart → verified Explore',async({page})=>{
 test.setTimeout(480000);
 const rpc=devnet?'https://api.devnet.solana.com':process.env.AECO_LOCAL_TEST_RPC!,genesis=devnet?'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG':process.env.PUMP_LOCAL_GENESIS_HASH!,db=process.env.TEST_DATABASE_URL!;
 if(devnet&&process.env.AECO_RUN_LOCAL_PROTOCOL==='true')throw new Error('Choose exactly one testing environment');
 if(!rpc||!genesis||!db||!process.env.PINATA_JWT||process.env.LAUNCHPAD_TEST_MIGRATIONS_APPROVED!=='true')throw new Error('Missing explicit local protocol verification prerequisites');
 const address=new URL(rpc),dbName=decodeURIComponent(new URL(db).pathname.slice(1));
 if((!devnet&&!['127.0.0.1','localhost','[::1]'].includes(address.hostname))||address.username||address.password||dbName!=='aeco_launch_execution_20261018_test')throw new Error('Unsafe RPC or unapproved database target');
 const {Pool}=createRequire(new URL('../../server/package.json',import.meta.url))('pg');
 const check=new Pool({connectionString:db});
 try{
  expect((await check.query('SELECT current_database() AS name')).rows[0].name).toBe(dbName);
  expect((await check.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map((r:{name:string})=>r.name)).toEqual(['001_init.sql','002_coordination.sql','003_agent_identity.sql','004_launchpad_workspace.sql']);
 }finally{await check.end();}
 const conn=new Connection(rpc,'confirmed');expect(await conn.getGenesisHash()).toBe(genesis);
 if(!devnet)expect(['EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d']).not.toContain(genesis);
 const creator=devnet?Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(process.env.AECO_DEVNET_TEST_WALLET_FILE!,'utf8')))):Keypair.generate(),templateMint=Keypair.generate(),platform=Keypair.generate().publicKey,agent=Keypair.generate().publicKey;
 if(devnet){expect(creator.publicKey.toBase58()).toBe(process.env.AECO_DEVNET_TEST_WALLET_PUBLIC);expect(await conn.getBalance(creator.publicKey)).toBeGreaterThanOrEqual(150_000_000);}else{const funding=await conn.requestAirdrop(creator.publicKey,3_000_000_000);expect((await conn.confirmTransaction(funding,'confirmed')).value.err).toBeNull();expect(await conn.getBalance(creator.publicKey)).toBeGreaterThanOrEqual(3_000_000_000);}
 const instructions=await pumpLaunchInstructions({launcherWallet:creator.publicKey.toBase58(),mint:templateMint.publicKey.toBase58(),mintSecretKey:templateMint.secretKey,name:devnet?'AECO Devnet Verification':'AECO Local UI Verification',symbol:'AECOTEST',uri:'ipfs://bafkreigck6kpvc45g7cso5kirqjd6ogpfrv5vjpdlsboc5dgs3gr4rgro4',platformTreasury:platform.toBase58(),agentRewardsTreasury:agent.toBase58()});
 const keys=[...new Map(instructions.flatMap(i=>[i.programId,...i.keys.filter(k=>!k.isSigner).map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()];
 const [create,lookupAddress]=AddressLookupTableProgram.createLookupTable({authority:creator.publicKey,payer:creator.publicKey,recentSlot:await conn.getSlot('finalized')});
 for(let n=0;n<keys.length;n+=20){const tx=new Transaction();if(!n)tx.add(create);tx.add(AddressLookupTableProgram.extendLookupTable({authority:creator.publicKey,payer:creator.publicKey,lookupTable:lookupAddress,addresses:keys.slice(n,n+20)}));await sendAndConfirmTransaction(conn,tx,[creator],{commitment:'confirmed'});}
 const lookup=(await conn.getAddressLookupTable(lookupAddress)).value!;
 await expect.poll(()=>conn.getSlot('confirmed'),{timeout:60000}).toBeGreaterThan(lookup.state.lastExtendedSlot);
 const config=loadConfig({MODE:'devnet',ROLE:'all',DATABASE_URL:db,SOLANA_RPC_URL:rpc,SOLANA_CLUSTER:network,PUMP_LOCAL_GENESIS_HASH:genesis,PUMP_LAUNCH_LOOKUP_TABLE:lookupAddress.toBase58(),PUMP_LAUNCH_ENABLED:'true',FEE_ROUTING_VERIFIED:'true',PLATFORM_TREASURY:platform.toBase58(),AGENT_REWARDS_TREASURY:agent.toBase58(),PINATA_JWT:process.env.PINATA_JWT,AUTH_URI:site,AUTH_DOMAIN:new URL(site).host,CORS_ORIGINS:site,PORT:'8796',HOST:'127.0.0.1',LOG_LEVEL:'silent',WORLD_SEED:'local-launch-protocol-verification',SIM_AUTOSTART:'true'});
 const assetWrites:string[]=[];page.on('request',r=>{if(r.method()==='POST'&&/\/(logo\?|metadata$)/.test(r.url()))assetWrites.push(r.url());});
 let broadcasts=0,ctx:AppContext|undefined,app:Awaited<ReturnType<typeof buildApp>>|undefined;
 const start=async()=>{
  const chain=new SolanaRpcChain(rpc,{...config.pumpLaunch,cluster:network}),broadcast=chain.submitLaunchTransaction.bind(chain);
  chain.submitLaunchTransaction=async signed=>{broadcasts++;return broadcast(signed);};
  ctx=await createContext(config,{chain});app=await buildApp(ctx);await app.listen({host:'127.0.0.1',port:8796});ctx.runtime.start();
 };
 let signedBytes='',signatures=0,rejectSignature=true,releaseStatus=()=>{},allowStatus=false;
 const statusGate=new Promise<void>(resolve=>{releaseStatus=resolve;});
 const report:Record<string,unknown>={network:devnet?'public-devnet':'isolated-localnet',genesis,database:dbName,walletSigner:'automated Wallet Standard, not actual Phantom',pinata:'actual service',publicTestSetup:{lookupTable:lookupAddress.toBase58(),platformTreasury:platform.toBase58(),agentTreasury:agent.toBase58()},checks:[]};
 const passed=(name:string)=>{(report.checks as string[]).push(name);console.log('PASS',name);};
 try{
  await start();
  await page.exposeFunction('__localMessageSign',(bytes:number[])=>Array.from(nacl.sign.detached(Uint8Array.from(bytes),creator.secretKey)));
  await page.exposeFunction('__localTransactionSign',(bytes:number[])=>{
   signatures++;if(rejectSignature)throw new Error('Local test wallet rejected launch signature');
   const tx=VersionedTransaction.deserialize(Uint8Array.from(bytes));tx.sign([creator]);signedBytes=Buffer.from(tx.serialize()).toString('base64');return Array.from(tx.serialize());
  });
  await page.addInitScript(({wallet,publicKey,network})=>{
   const w=window as unknown as {__localMessageSign(bytes:number[]):Promise<number[]>;__localTransactionSign(bytes:number[]):Promise<number[]>};
   const account={address:wallet,publicKey:new Uint8Array(publicKey),chains:[`solana:${network}`],features:['solana:signMessage','solana:signTransaction']};
   const provider={version:'1.0.0',name:'Isolated local test signer',icon:'data:image/png;base64,',accounts:[account],chains:[`solana:${network}`],features:{
    'standard:connect':{version:'1.0.0',connect:async()=>({accounts:[account]})},'standard:disconnect':{version:'1.0.0',disconnect:async()=>{}},'standard:events':{version:'1.0.0',on:()=>()=>{}},
    'solana:signMessage':{version:'1.0.0',signMessage:async({message}:{message:Uint8Array})=>[{signedMessage:message,signature:new Uint8Array(await w.__localMessageSign(Array.from(message)))}]},
    'solana:signTransaction':{version:'1.0.0',supportedTransactionVersions:[0],signTransaction:async({transaction}:{transaction:Uint8Array})=>[{signedTransaction:new Uint8Array(await w.__localTransactionSign(Array.from(transaction)))}]},
   }};window.addEventListener('wallet-standard:app-ready',event=>(event as CustomEvent).detail.register(provider));
  },{wallet:creator.publicKey.toBase58(),publicKey:Array.from(creator.publicKey.toBytes()),network});
  await page.setViewportSize({width:1440,height:1000});
  await page.route(/\/api\/v1\/launchpad\/launches\/lch_[A-Za-z0-9]+$/,async route=>{if(!allowStatus)await statusGate;await route.continue();});
  await page.goto(site+'/#launchpad',{waitUntil:'domcontentloaded'});
  await expect(page.getByLabel('Token name',{exact:true})).toBeVisible({timeout:60000});
  await page.getByLabel('Token name',{exact:true}).fill(devnet?'AECO Devnet Verification':'AECO Local UI Verification');await page.getByLabel('Symbol',{exact:true}).fill('AECOTEST');await page.getByLabel('Description',{exact:true}).fill('Controlled safe-network launch. No mainnet funds or production operations.');
  await page.getByLabel('Token logo file').setInputFiles(new URL('../public/aeco-website-logo.png',import.meta.url).pathname);
  await page.locator('form').getByRole('button',{name:'Connect wallet',exact:true}).click();await page.getByRole('button',{name:'Isolated local test signer',exact:true}).click();
  await expect(page.getByRole('region',{name:'Live token preview'}).getByRole('img')).toHaveAttribute('src',/^blob:/);expect(assetWrites).toEqual([]);
  const preparedResponse=page.waitForResponse(r=>/\/launchpad\/drafts\/[^/]+\/launch$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST');
  await page.locator('form').getByRole('button',{name:'Create Coin',exact:true}).click();
  await expect(page.getByRole('region',{name:'Token review'})).toContainText('Token details and logo are prepared.',{timeout:150000});expect(assetWrites).toHaveLength(2);passed('No asset writes before Create Coin; real Pinata image and metadata prepared after one commit action');

  const execution=page.getByRole('region',{name:'Launch execution'});await expect(execution).toContainText('awaiting signature',{timeout:60000});await expect(execution).toContainText(platform.toBase58());await expect(execution).toContainText('0.05 SOL');
  const preparation=((await(await preparedResponse).json()) as {launch:TokenLaunch}).launch;
  expect(preparation.execution?.network).toBe(network);expect(preparation.signature).toBeNull();expect((await page.request.get(api+'/api/v1/launches/'+preparation.id)).status()).toBe(404);passed('Real program simulation precedes signing; preparation remains private and unconfirmed');
  await execution.getByRole('button',{name:'Approve in wallet',exact:true}).click();await expect(execution.getByRole('alert')).toContainText('rejected');expect(broadcasts).toBe(0);expect(await conn.getBalance(platform)).toBe(0);passed('Wallet rejection creates no broadcast or platform charge');
  rejectSignature=false;const submitted=page.waitForResponse(r=>r.url().endsWith('/submit')&&r.request().method()==='POST');await execution.getByRole('button',{name:'Approve in wallet',exact:true}).click();expect((await submitted).status()).toBe(200);
  const pending=(await ctx!.store.getLaunch(preparation.id))!.launch;expect(pending.status).toBe('submitted');expect(pending.signature).toBeTruthy();expect(broadcasts).toBe(1);
  // Close all real API/database connections before any confirmation request is released.
  await app!.close();await ctx!.close();app=undefined;ctx=undefined;await start();
  await expect.poll(async()=>(await conn.getSignatureStatuses([pending.signature!],{searchTransactionHistory:true})).value[0]?.confirmationStatus).toMatch(/confirmed|finalized/);
  const concurrent=await Promise.all([ctx!.launches.refresh(creator.publicKey.toBase58(),preparation.id),ctx!.launches.refresh(creator.publicKey.toBase58(),preparation.id)]);for(const result of concurrent)expect(result.status).toBe('confirmed');
  allowStatus=true;releaseStatus();passed('Submitted transaction and owned draft survived an actual backend/context restart and concurrent chain confirmation');
  await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('form').getByRole('button',{name:'Create Coin',exact:true})).toBeVisible({timeout:60000});
  await page.getByText('Manage drafts & technical details',{exact:true}).click();await page.getByLabel('Saved launch drafts').selectOption(preparation.execution!.draftId);await expect(page.getByLabel('Token name',{exact:true})).toHaveValue(devnet?'AECO Devnet Verification':'AECO Local UI Verification');await page.getByText('Manage drafts & technical details',{exact:true}).click();await page.locator('form').getByRole('button',{name:'Create Coin',exact:true}).click();
  await expect(execution).toContainText('Token creation verified.',{timeout:120000});
  const headers={Origin:site},url=api+'/api/v1/launchpad/launches/'+preparation.id;
  const repeats=await Promise.all([page.request.get(url),page.request.get(url),page.request.post(url+'/submit',{headers,data:{transaction:signedBytes}})]);for(const r of repeats){expect(r.ok()).toBe(true);expect((await r.json()).launch.status).toBe('confirmed');}
  const confirmed=(await ctx!.store.getLaunch(preparation.id))!.launch;expect(confirmed.signature).toBe(pending.signature);expect(broadcasts).toBe(1);expect(signatures).toBe(2);expect(assetWrites).toHaveLength(2);
  const entries=(await ctx!.store.allTreasuryEntries()).filter(e=>e.launchId===confirmed.id);expect(entries).toHaveLength(1);expect(entries[0]!.amount).toBe('50000000');expect(entries[0]!.stream).toBe('launch_fee');expect(await conn.getBalance(platform)).toBe(50_000_000);passed('Actual token confirmation, one atomic 0.05 test-network SOL charge, duplicate submission and concurrent confirmation are idempotent');
  const token=(await ctx!.store.allCommunities()).find(c=>c.launchId===confirmed.id)!;expect(token.provenance).toMatchObject({platformOrigin:'PLATFORM',initiator:'HUMAN',network,quoteAsset:'SOL'});expect(token.creatorWallet).toBe(creator.publicKey.toBase58());expect(token.launchSignature).toBe(confirmed.signature);
  const market=await ctx!.tokenMarket.snapshot(confirmed.mint);expect(market.status).toBe('unavailable');expect(market.priceUsd).toBeNull();
  const draftResponse=await page.request.get(api+'/api/v1/launchpad/drafts/'+preparation.execution!.draftId);const draft=await draftResponse.json();
  for(const asset of [draft.image,draft.metadata]){const got=await page.request.get(asset.gatewayUrl,{timeout:60000});expect(got.ok()).toBe(true);}
  const metadata=await(await page.request.get(draft.metadata.gatewayUrl)).json();expect(metadata.image).toBe(draft.image.gatewayUrl);expect(metadata.name).toBe(confirmed.draft.name);expect(confirmed.draft.metadataUri).toBe(draft.metadata.ipfsUri);passed('Real IPFS metadata remains associated with the correct owned launch');
  await execution.scrollIntoViewIfNeeded();await execution.screenshot({path:`artifacts/actual-${network}-protocol-confirmed.png`});
  await page.screenshot({path:`artifacts/actual-${network}-protocol-review.png`,fullPage:true});await page.getByRole('link',{name:'Explore',exact:true}).click();await expect(page.getByText(devnet?'AECO Devnet Verification':'AECO Local UI Verification',{exact:true}).first()).toBeVisible({timeout:60000});await page.getByText(devnet?'AECO Devnet Verification':'AECO Local UI Verification',{exact:true}).first().scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/actual-${network}-protocol-explore.png`,fullPage:true});passed('Verified platform/human safe-network provenance is discoverable in existing Explore without invented market metrics');
  report.launch={id:confirmed.id,mint:confirmed.mint,signature:confirmed.signature,network:confirmed.execution!.network,metadataUri:confirmed.draft.metadataUri};report.assets={image:draft.image,metadata:draft.metadata};report.platformBalance=await conn.getBalance(platform);report.broadcasts=broadcasts;report.result='passed';
 }finally{
  allowStatus=true;releaseStatus();await app?.close();await ctx?.close();
  if(process.env.AECO_LOCAL_UI_EVIDENCE)await writeFile(process.env.AECO_LOCAL_UI_EVIDENCE,JSON.stringify(report,null,2));
 }
});
