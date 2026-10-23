import {ServerMintSigner} from '../../server/src/chain/server-mint';
import {createHash} from 'node:crypto';
import {coSignReviewedMint,verifyMintSigningArtifact,type MintSigningReview,type MintSigningPolicy} from '../../server/src/chain/offline-mint';
import {waitForApplicationReady} from './startup';
import {test,expect} from '@playwright/test';
import {AddressLookupTableAccount,Keypair,VersionedTransaction} from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {buildPumpLaunch,pumpLaunchInstructions,validateSignedPumpLaunch,buildUnsignedPumpLaunch} from '../../server/src/chain/pump-builder';
import {sharingConfigPda} from '../../server/src/chain/pump';
const site=process.env.LAUNCH_WORKSPACE_URL,api=process.env.AGENT_WORK_API_URL;
test.skip(!site||!api,'Requires isolated auth/draft API with mocked Pinata; never run live uploads implicitly.');
for(const [useLocalMint,automaticMintSigning,expiryRecovery] of [[false,false,false],[true,false,false],[true,true,false],[true,true,true]]) test(`safe-network signing UI handles rejection and verified confirmation (${expiryRecovery?'expiry recovery':automaticMintSigning?'automatic server mint':useLocalMint?'local mint handoff':'normal mint'}; mock RPC, real signatures)`,async({page})=>{
 // The reserved-mint case additionally reloads the complete world twice for locked renewal.
 test.setTimeout(useLocalMint?720000:360000);await page.setViewportSize({width:390,height:844});
 const creator=Keypair.generate(),wallet=creator.publicKey.toBase58();let executionEnabled=true;let renewals=0;let renewFixture:(()=>Promise<void>)|undefined;let reject=true,signs=0,preparations=0,submissions=0,resolveSubmission=false;let submittedSignature='',submittedPayload='';let resumptions=0;const prepareKeys:string[]=[];
 let launch:Record<string,unknown>|undefined,prepared='';
 let expiryProofAvailable=false,signingWindowAvailable=true,lateApproval=true;
 let automaticSigner:ServerMintSigner|undefined,automaticSigns=0,automaticReplyMode:'ok'|'unavailable'|'changed'='ok';
 let localReview:MintSigningReview|undefined,localArtifact:Awaited<ReturnType<typeof coSignReviewedMint>>|undefined,localPolicy:MintSigningPolicy|undefined,imports=0;
 await page.exposeFunction('__signMessage',(bytes:number[])=>Array.from(nacl.sign.detached(Uint8Array.from(bytes),creator.secretKey)));
 await page.exposeFunction('__signTransaction',(bytes:number[])=>{signs++;if(reject)throw new Error('Launch signature rejected by user');const tx=VersionedTransaction.deserialize(Uint8Array.from(bytes));tx.sign([creator]);return Array.from(tx.serialize());});
 await page.addInitScript(({wallet,publicKey})=>{
  const w=window as unknown as {__signMessage(bytes:number[]):Promise<number[]>;__signTransaction(bytes:number[]):Promise<number[]>;phantom:unknown};
  w.phantom={solana:{publicKey:{toBase58:()=>wallet},connect:async()=>({publicKey:{toBase58:()=>wallet}}),signMessage:async(bytes:Uint8Array)=>({signature:new Uint8Array(await w.__signMessage(Array.from(bytes)))}),signTransaction:async(tx:{serialize():Uint8Array})=>{const signed=new Uint8Array(await w.__signTransaction(Array.from(tx.serialize())));return{serialize:()=>signed};},disconnect:async()=>{}}};
  // Hybrid Phantom registration: message auth is standard, sign-only is injected.
  const account={address:wallet,publicKey:new Uint8Array(publicKey),chains:['solana:devnet'],features:['solana:signMessage']};
  const provider={version:'1.0.0',name:'Phantom',icon:'data:image/png;base64,',accounts:[account],chains:['solana:devnet'],features:{'standard:connect':{version:'1.0.0',connect:async()=>({accounts:[account]})},'solana:signMessage':{version:'1.0.0',signMessage:async({message}:{message:Uint8Array})=>[{signedMessage:message,signature:new Uint8Array(await w.__signMessage(Array.from(message)))}]}}};
  window.addEventListener('wallet-standard:app-ready',event=>(event as CustomEvent).detail.register(provider));
 },{wallet,publicKey:Array.from(creator.publicKey.toBytes())});
 await page.route('**/api/v1/launchpad/capabilities',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),launchEnabled:executionEnabled,automaticMintSigning,preparationEnabled:executionEnabled||useLocalMint}});});
 await page.route(/\/launchpad\/drafts\/[^/]+\/review$/,async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),launchEnabled:executionEnabled,automaticMintSigning,preparationEnabled:executionEnabled||useLocalMint}});});
 await page.route(/\/launchpad\/drafts\/[^/]+\/launch$/,async route=>{
  prepareKeys.push(route.request().headers()['idempotency-key']??'');
  if(launch){await route.fulfill({json:{launch,transaction:prepared,demoTransaction:false,lastValidBlockHeight:100000}});return;}
  preparations++;const id=new URL(route.request().url()).pathname.split('/').at(-2)!;
  const d=await page.request.get(`${api}/api/v1/launchpad/drafts/${id}`).then(r=>r.json());
  const mint=Keypair.generate(),platform=Keypair.generate().publicKey.toBase58(),agent=Keypair.generate().publicKey.toBase58();
  const input={launcherWallet:wallet,mint:mint.publicKey.toBase58(),mintSecretKey:mint.secretKey,name:d.fields.name,symbol:d.fields.symbol,uri:d.metadata.ipfsUri,platformTreasury:platform,agentRewardsTreasury:agent};
  const instructions=await pumpLaunchInstructions(input),table=new AddressLookupTableAccount({key:Keypair.generate().publicKey,state:{deactivationSlot:2n**64n-1n,lastExtendedSlot:0,lastExtendedSlotStartIndex:0,addresses:[...new Map(instructions.flatMap(i=>[i.programId,...i.keys.filter(k=>!k.isSigner).map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()]}});
  const blockhash=Keypair.generate().publicKey.toBase58();
  prepared=useLocalMint?(await buildUnsignedPumpLaunch(input,blockhash,[table])).transaction:(await buildPumpLaunch(input,blockhash,[table])).transaction;
  if(useLocalMint){localReview={version:1,launchId:'lch_BrowserExecutionTest',network:'devnet',genesisHash:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',mint:input.mint,launcherWallet:wallet,platformTreasury:platform,agentRewardsTreasury:agent,name:input.name,symbol:input.symbol,uri:input.uri,recentBlockhash:blockhash,lastValidBlockHeight:100000,maxTotalDebitLamports:'66510000',messageSha256:createHash('sha256').update(VersionedTransaction.deserialize(Buffer.from(prepared,'base64')).message.serialize()).digest('hex'),unsignedTransaction:prepared,lookupTables:[{key:table.key.toBase58(),addresses:table.state.addresses.map(a=>a.toBase58())}]};
  localPolicy={network:'devnet',mint:input.mint,deployer:wallet,platform,rewards:agent};localArtifact=await coSignReviewedMint(localReview,localPolicy,localReview.messageSha256,mint.secretKey);automaticSigner=new ServerMintSigner(localPolicy,()=>JSON.stringify(Array.from(mint.secretKey)));}
  const now=new Date().toISOString();launch={id:'lch_BrowserExecutionTest',mode:'devnet',status:'awaiting_signature',launcherWallet:wallet,draft:{...d.fields,metadataUri:d.metadata.ipfsUri,imageUri:d.image.gatewayUrl},mint:input.mint,feeSharingConfig:sharingConfigPda(input.mint),fees:{platformLaunchFeeLamports:'50000000',platformTreasury:platform,estimatedNetworkFeesLamports:'10000',estimatedAccountRentLamports:'16500000',launcherCreatorFeeBps:0,creatorFeeSplit:{agentRewardsTreasury:agent,agentRewardsBps:6000,platformTreasury:platform,platformBps:4000},notes:[]},execution:{draftId:id,draftVersion:d.version,transaction:prepared,lastValidBlockHeight:100000,genesisHash:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',network:'devnet',quoteAsset:'SOL',...(useLocalMint?{localMintReview:localReview}:{}),platformOrigin:'PLATFORM',initiator:'HUMAN'},signature:null,slot:null,communityId:null,errors:[],history:[{status:'awaiting_signature',at:now}],createdAt:now,updatedAt:now};
  if(useLocalMint)renewFixture=async()=>{
   const previous=localReview!,hash=Keypair.generate().publicKey.toBase58();
   prepared=(await buildUnsignedPumpLaunch(input,hash,[table])).transaction;
   localReview={...previous,recentBlockhash:hash,lastValidBlockHeight:previous.lastValidBlockHeight+100000,unsignedTransaction:prepared,
    messageSha256:createHash('sha256').update(VersionedTransaction.deserialize(Buffer.from(prepared,'base64')).message.serialize()).digest('hex'),
    renewal:{previousMessageSha256:previous.messageSha256,previousLastValidBlockHeight:previous.lastValidBlockHeight,finalizedBlockHeight:previous.lastValidBlockHeight+1,checkedAt:new Date().toISOString()}};
   localArtifact=await coSignReviewedMint(localReview,localPolicy!,localReview.messageSha256,mint.secretKey);
   launch={...launch!,status:'awaiting_signature',execution:{...(launch!.execution as object),transaction:prepared,lastValidBlockHeight:localReview.lastValidBlockHeight,localMintReview:localReview,localMintReviewHistory:[...((launch!.execution as {localMintReviewHistory?:MintSigningReview[]}).localMintReviewHistory??[]),previous]}};
  };
  await route.fulfill({status:503,json:{error:{message:'Preparation response lost. Retry safely.'}}});
 });
 await page.route('**/api/v1/launchpad/launches/lch_BrowserExecutionTest/mint-review',route=>route.fulfill({json:localReview}));
 await page.route('**/api/v1/launchpad/launches/lch_BrowserExecutionTest/mint-review/renew',async route=>{expect(route.request().postDataJSON().messageSha256).toBe(localReview!.messageSha256);renewals++;await renewFixture!();await route.fulfill({json:{launch,transaction:prepared,lastValidBlockHeight:localReview!.lastValidBlockHeight,demoTransaction:false}});});
 await page.route('**/api/v1/launchpad/launches/lch_BrowserExecutionTest/mint-signature/automatic',async route=>{expect(route.request().postDataJSON()).toEqual({});if(automaticReplyMode==='unavailable'){await route.fulfill({status:503,json:{error:{message:'Signing is temporarily unavailable'}}});return;}const signed=await automaticSigner!.sign(localReview,wallet);if(automaticReplyMode==='changed'){const tx=VersionedTransaction.deserialize(Buffer.from(signed.transaction,'base64'));tx.message.recentBlockhash=Keypair.generate().publicKey.toBase58();await route.fulfill({json:{transaction:Buffer.from(tx.serialize()).toString('base64'),messageSha256:signed.messageSha256}});return;}automaticSigns++;await route.fulfill({json:{transaction:signed.transaction,messageSha256:signed.messageSha256}});});
 await page.route('**/api/v1/launchpad/launches/lch_BrowserExecutionTest/mint-signature',async route=>{imports++;const checked=await verifyMintSigningArtifact(localReview,localPolicy!,route.request().postDataJSON());await route.fulfill({json:{transaction:checked.transaction,messageSha256:checked.messageSha256}});});
 const expiry=()=>expiryProofAvailable?{messageSha256:localReview!.messageSha256,lastValidBlockHeight:localReview!.lastValidBlockHeight,finalizedBlockHeight:localReview!.lastValidBlockHeight+1,...(submittedSignature?{checkedSignature:submittedSignature}:{})}:undefined;
 await page.route('**/api/v1/launchpad/launches/lch_BrowserExecutionTest/signing-window',async route=>{
  if(!signingWindowAvailable){await route.fulfill({status:409,json:{error:{message:'This signing window is close to expiry'}}});return;}
  const tx=VersionedTransaction.deserialize(Buffer.from(prepared,'base64'));await route.fulfill({json:{messageSha256:createHash('sha256').update(tx.message.serialize()).digest('hex'),remainingBlocks:99,checkedAt:new Date().toISOString()}});
 });
 await page.route('**/api/v1/launchpad/launches/lch_BrowserExecutionTest/submit',async route=>{
  submissions++;const checked=await validateSignedPumpLaunch(prepared,route.request().postDataJSON().transaction);submittedSignature=checked.signature;submittedPayload=route.request().postDataJSON().transaction;if(expiryRecovery){if(lateApproval){launch={...launch!,status:'expired'};expiryProofAvailable=true;await route.fulfill({json:{launch,expiredReview:expiry()}});}else{launch={...launch!,status:'confirmed',signature:submittedSignature,slot:1234,communityId:'com_BrowserExecutionTest'};await route.fulfill({json:{launch}});}return;}await route.fulfill({status:503,json:{error:{message:'Submission response lost'}}});
 });
 await page.route('**/api/v1/launchpad/launches/lch_BrowserExecutionTest/resume',async route=>{resumptions++;expect(route.request().postDataJSON().transaction).toBe(submittedPayload);await route.fulfill({status:503,json:{error:{message:'RPC still unavailable; keep this signature'}}});});
 await page.route(/\/api\/v1\/launchpad\/launches\/lch_BrowserExecutionTest(?:\?.*)?$/,route=>{if(submissions&&resolveSubmission)launch={...launch!,status:'confirmed',signature:submittedSignature,slot:1234,communityId:'com_BrowserExecutionTest'};return route.fulfill({json:{launch,expiredReview:expiry()}});});
 await page.route('https://gateway.pinata.cloud/ipfs/**',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWNYtbuDIGIYVcQwCIMAAJ5MFWCkU82kAAAAAElFTkSuQmCC','base64')}));
 await page.goto(site!+'/launchpad?source=backend');await waitForApplicationReady(page);await expect(page.getByLabel('Token name',{exact:true})).toBeVisible({timeout:30000});
 await page.locator('form').getByRole('button',{name:'Connect wallet',exact:true}).click();await page.getByRole('button',{name:'Phantom',exact:true}).click();
 await expect(page.getByRole('button',{name:'Create Coin',exact:true})).toBeVisible();await page.getByLabel('Token name',{exact:true}).fill('Browser Signature Test');await page.getByLabel('Symbol',{exact:true}).fill('BST');
 // Use the known validated image fixture (no genuine Pinata invocation).
 await page.getByLabel('Token logo file').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWNYtbuDIGIYVcQwCIMAAJ5MFWCkU82kAAAAAElFTkSuQmCC','base64')});
 await page.getByRole('button',{name:'Create Coin',exact:true}).click();
 const execution=page.getByRole('region',{name:'Launch execution'}),technical=execution.locator('details').filter({has:page.getByText('Technical details',{exact:true})});await expect(execution.getByRole('alert')).toContainText('We couldn’t prepare your launch');expect(signs).toBe(0);await execution.getByRole('button',{name:'Retry preparation',exact:true}).click();await expect(execution).toContainText('0.05 SOL');expect(prepareKeys).toHaveLength(2);expect(prepareKeys[0]).toBeTruthy();expect(prepareKeys[1]).toBe(prepareKeys[0]);expect(signs).toBe(0);expect(submissions).toBe(0);
 await expect(execution.getByRole('heading',{name:'Review before wallet approval'})).toBeVisible();
 await expect(technical).not.toHaveAttribute('open','');
 await execution.screenshot({path:'artifacts/launch-review-card-mobile.png'});await page.screenshot({path:'artifacts/launch-review-mobile.png',fullPage:true});
 await page.reload();await waitForApplicationReady(page);await expect(execution).toContainText('0.05 SOL');await expect(page.getByLabel('Token name',{exact:true})).toBeHidden();expect(preparations).toBe(1);
 if(expiryRecovery){
  const original={mint:launch!.mint,draft:launch!.draft},firstHash=localReview!.messageSha256;
  launch={...launch!,status:'expired'};expiryProofAvailable=true;
  await page.getByRole('button',{name:'Approve in wallet',exact:true}).click();
  await expect(execution.getByRole('heading',{name:'This launch attempt did not complete'})).toBeVisible();expect(signs).toBe(0);expect(automaticSigns).toBe(0);
  await execution.getByRole('button',{name:'Refresh transaction review',exact:true}).click();expiryProofAvailable=false;
  expect(localReview!.messageSha256).not.toBe(firstHash);expect(signs).toBe(0);expect(renewals).toBe(1);
  signingWindowAvailable=false;await page.getByRole('button',{name:'Approve in wallet',exact:true}).click();await expect(execution.getByRole('alert')).toBeVisible();expect(signs).toBe(0);expect(submissions).toBe(0);
  signingWindowAvailable=true;reject=false;await page.getByRole('button',{name:'Approve in wallet',exact:true}).click();
  await expect(execution.getByRole('heading',{name:'This launch attempt did not complete'})).toBeVisible();
  await expect(execution).toContainText('No token was created or launch charge collected');await expect(execution).not.toContainText('We lost connection');
  expect(signs).toBe(1);expect(submissions).toBe(1);const expiredPayload=submittedPayload,expiredSignature=submittedSignature,expiredHash=localReview!.messageSha256;
  expect(await page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.includes(':expired:')))).toBe(true);
  await page.reload();await waitForApplicationReady(page);await expect(execution.getByRole('button',{name:'Refresh transaction review',exact:true})).toBeVisible();expect(signs).toBe(1);expect(submissions).toBe(1);
  await execution.getByRole('button',{name:'Refresh transaction review',exact:true}).click();expiryProofAvailable=false;submittedSignature='';
  await expect(execution.getByRole('heading',{name:'Review before wallet approval'})).toBeVisible();expect(localReview!.messageSha256).not.toBe(expiredHash);expect(launch!.mint).toBe(original.mint);expect(launch!.draft).toEqual(original.draft);expect(signs).toBe(1);expect(renewals).toBe(2);
  lateApproval=false;await page.getByRole('button',{name:'Approve in wallet',exact:true}).click();
  await expect(execution.getByRole('heading',{name:'Coin created successfully'})).toBeVisible();expect(signs).toBe(2);expect(submissions).toBe(2);expect(submittedPayload).not.toBe(expiredPayload);expect(submittedSignature).not.toBe(expiredSignature);expect(preparations).toBe(1);expect(resumptions).toBe(0);
  await page.getByRole('button',{name:'Check launch status',exact:true}).count();await execution.screenshot({path:'artifacts/vanity-expiry-recovered.png'});return;
 }
 if(useLocalMint&&!automaticMintSigning){
  executionEnabled=false;await page.reload();await waitForApplicationReady(page);
  await expect(execution).toContainText('Review preparation only');
  await expect(execution.getByRole('button',{name:'Approve in wallet',exact:true})).toHaveCount(0);
  launch={...launch!,status:'expired'};await execution.getByText('Technical details',{exact:true}).click();await execution.getByRole('button',{name:'Check launch status',exact:true}).click();
  await execution.getByRole('button',{name:'Refresh signing review',exact:true}).click();
  await expect(execution).toContainText('Launch summary');expect(renewals).toBe(1);expect(signs).toBe(0);expect(submissions).toBe(0);
  await expect(execution.getByRole('button',{name:'Approve in wallet',exact:true})).toHaveCount(0);
  executionEnabled=true;await page.reload();await waitForApplicationReady(page);
  await expect(page.getByRole('button',{name:'Approve in wallet',exact:true})).toBeDisabled();
  const mintDisclosure=execution.getByText('Prepared mint signing',{exact:true});
  await expect(mintDisclosure).toBeVisible();
  await mintDisclosure.click({timeout:15000});
  const download=page.waitForEvent('download');await execution.getByRole('button',{name:'Download public review'}).click();
  expect((await download).suggestedFilename()).toBe('lch_BrowserExecutionTest-public-mint-review.json');
  const file=execution.getByLabel('Public mint-signature file');
  await file.setInputFiles({name:'not-a-public-artifact.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(Array(64).fill(0)))});
  await expect(execution.getByRole('alert')).toBeVisible();expect(imports).toBe(0);expect(signs).toBe(0);
  await file.setInputFiles({name:'public-mint-signature.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(localArtifact))});
  await expect(execution.getByRole('status')).toContainText('Mint signature verified');expect(imports).toBe(1);
  await expect(page.getByRole('button',{name:'Approve in wallet',exact:true})).toBeEnabled();
 }
 if(automaticMintSigning){
  await expect(execution.getByText('Prepared mint signing',{exact:true})).toHaveCount(0);await expect(execution.getByRole('button',{name:'Download public review'})).toHaveCount(0);expect(imports).toBe(0);
  automaticReplyMode='unavailable';await page.getByRole('button',{name:'Approve in wallet',exact:true}).click();await expect(execution.getByRole('alert')).toBeVisible();expect(signs).toBe(0);expect(submissions).toBe(0);
  automaticReplyMode='changed';await page.getByRole('button',{name:'Approve in wallet',exact:true}).click();await expect(execution.getByRole('alert')).toBeVisible();await expect(technical).toContainText('changed the reviewed transaction');expect(signs).toBe(0);expect(submissions).toBe(0);automaticReplyMode='ok';
 }
 await page.getByRole('button',{name:'Approve in wallet',exact:true}).click();await expect(execution.getByRole('alert')).toContainText('Wallet approval was cancelled');
 await execution.getByText('Technical details',{exact:true}).click();
 await expect(technical).toContainText('rejected');expect(submissions).toBe(0);
 reject=false;await page.getByRole('button',{name:'Approve in wallet',exact:true}).click();
 await expect(execution.getByRole('heading',{name:'We lost connection while checking your launch'})).toBeVisible();
 await expect(technical).toContainText('HTTP 503: Submission response lost');
 await execution.getByRole('button',{name:'Check launch status',exact:true}).click();
 await expect(execution.getByRole('button',{name:'Approve in wallet',exact:true})).toHaveCount(0);
 await expect(execution).toContainText('Your wallet approval may still have succeeded');
 await page.reload();await waitForApplicationReady(page);await expect(execution).toContainText('Your wallet approval may still have succeeded');
 await expect(execution.getByRole('button',{name:'Approve in wallet',exact:true})).toHaveCount(0);
 expect(submissions).toBe(1);expect(signs).toBe(2);
 const hint=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('aeco:launch:')).map(k=>JSON.parse(localStorage.getItem(k)!)).find(v=>v.submissionUncertain));
 expect(hint.walletSignature).toBe(submittedSignature);
 await execution.getByText('Technical details',{exact:true}).click();
 await execution.getByRole('button',{name:'Resume same transaction',exact:true}).click();
 await expect(technical).toContainText('RPC still unavailable');expect(resumptions).toBe(1);expect(signs).toBe(2);expect(submissions).toBe(1);
 launch={...launch!,status:'expired'};await execution.getByRole('button',{name:'Check launch status',exact:true}).click();
 await expect(execution).toContainText('Your wallet approval may still have succeeded');
 await expect(execution.getByRole('button',{name:'Prepare new attempt',exact:true})).toHaveCount(0);
 launch={...launch!,signature:submittedSignature,errors:[{code:'submission_expired_unobserved',message:'Finalized history and mint checks passed',at:new Date().toISOString()}]};await execution.getByRole('button',{name:'Check launch status',exact:true}).click();
 await expect(execution.getByRole('heading',{name:'This launch attempt did not complete'})).toBeVisible();
 await expect(execution.getByRole('button',{name:'Prepare new attempt',exact:true})).toHaveCount(useLocalMint?0:1);
 await page.screenshot({path:'artifacts/launch-expired-mobile.png',fullPage:true});await expect(execution.getByRole('button',{name:'Resume same transaction',exact:true})).toHaveCount(0);expect(submissions).toBe(1);expect(signs).toBe(2);
 launch={...launch!,status:'submitted'};await execution.getByRole('button',{name:'Check launch status',exact:true}).click();
 await expect(execution.getByRole('heading',{name:'Launch in progress',exact:true})).toBeVisible();
 await expect(execution.getByRole('button',{name:'Prepare new attempt',exact:true})).toHaveCount(0);
 await execution.screenshot({path:'artifacts/launch-pending-card-mobile.png'});
 launch={...launch!,status:'failed'};await execution.getByRole('button',{name:'Check launch status',exact:true}).click();
 await expect(execution.getByRole('heading',{name:'This launch attempt did not complete'})).toBeVisible();
 await expect(execution.getByRole('button',{name:'Prepare new attempt',exact:true})).toHaveCount(useLocalMint?0:1);
 expect(submissions).toBe(1);expect(signs).toBe(2);
 launch={...launch!,status:'expired'};
 executionEnabled=false;await page.reload();await waitForApplicationReady(page);await expect(execution.getByRole('heading',{name:'This launch attempt did not complete'})).toBeVisible();await expect(execution.getByRole('button',{name:'Prepare new attempt',exact:true})).toHaveCount(0);await expect(execution.getByRole('button',{name:'Approve in wallet',exact:true})).toHaveCount(0);expect(signs).toBe(2);expect(preparations).toBe(1);
 resolveSubmission=true;await page.getByRole('button',{name:'Check launch status',exact:true}).click();await expect(execution.getByRole('heading',{name:'Coin created successfully'})).toBeVisible();
 await expect(execution.getByRole('button',{name:'Copy mint'})).toBeVisible();
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 await execution.getByRole('button',{name:'Copy mint'}).click();
 await expect(execution.getByRole('status')).toContainText('Mint copied');
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(launch!.mint);
 await expect(technical).not.toHaveAttribute('open','');
 if(automaticMintSigning){expect(automaticSigns).toBe(2);expect(imports).toBe(0);}
 expect(preparations).toBe(1);expect(submissions).toBe(1);expect(signs).toBe(2);expect(bs58.decode(String(launch!.signature))).toHaveLength(64);
 await execution.screenshot({path:'artifacts/launch-success-card-mobile.png'});await page.screenshot({path:'artifacts/launch-execution-mocked-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'artifacts/launch-execution-mocked-desktop.png',fullPage:true});
 const canvas=page.locator('canvas');await canvas.evaluate(node=>{(window as any).__launchRouteCanvas=node;});
 const exploreLink=page.getByRole('link',{name:'View in Explore',exact:true});
 const confirmedMint=launch?.mint;if(!confirmedMint)throw new Error('Confirmed mock launch is missing its mint');
 expect(new URL((await exploreLink.getAttribute('href'))!,page.url()).pathname).toBe('/explore/'+confirmedMint);
 await exploreLink.click();await expect.poll(()=>new URL(page.url()).pathname).toBe('/explore/'+confirmedMint);
 expect(new URL(page.url()).hash).toBe('');
 expect(await canvas.evaluate(node=>node===(window as any).__launchRouteCanvas)).toBe(true);
});
