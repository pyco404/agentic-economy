import {waitForApplicationReady} from './startup';
import {test,expect} from '@playwright/test';
import {AddressLookupTableAccount,Keypair,VersionedTransaction} from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {buildPumpLaunch,pumpLaunchInstructions,validateSignedPumpLaunch} from '../../server/src/chain/pump-builder';
import {sharingConfigPda} from '../../server/src/chain/pump';
const site=process.env.LAUNCH_WORKSPACE_URL,api=process.env.AGENT_WORK_API_URL;
test.skip(!site||!api,'Requires isolated auth/draft API with mocked Pinata; never run live uploads implicitly.');
test('safe-network signing UI handles rejection and verified confirmation (mock RPC, real transaction signatures)',async({page})=>{
 test.setTimeout(360000);await page.setViewportSize({width:390,height:844});
 const creator=Keypair.generate(),wallet=creator.publicKey.toBase58();let reject=true,signs=0,preparations=0,submissions=0,resolveSubmission=false;let submittedSignature='',submittedPayload='';let resumptions=0;const prepareKeys:string[]=[];
 let launch:Record<string,unknown>|undefined,prepared='';
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
 await page.route('**/api/v1/launchpad/capabilities',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),launchEnabled:true}});});
 await page.route(/\/launchpad\/drafts\/[^/]+\/review$/,async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),launchEnabled:true}});});
 await page.route(/\/launchpad\/drafts\/[^/]+\/launch$/,async route=>{
  prepareKeys.push(route.request().headers()['idempotency-key']??'');
  if(launch){await route.fulfill({json:{launch,transaction:prepared,demoTransaction:false,lastValidBlockHeight:100000}});return;}
  preparations++;const id=new URL(route.request().url()).pathname.split('/').at(-2)!;
  const d=await page.request.get(`${api}/api/v1/launchpad/drafts/${id}`).then(r=>r.json());
  const mint=Keypair.generate(),platform=Keypair.generate().publicKey.toBase58(),agent=Keypair.generate().publicKey.toBase58();
  const input={launcherWallet:wallet,mint:mint.publicKey.toBase58(),mintSecretKey:mint.secretKey,name:d.fields.name,symbol:d.fields.symbol,uri:d.metadata.ipfsUri,platformTreasury:platform,agentRewardsTreasury:agent};
  const instructions=await pumpLaunchInstructions(input),table=new AddressLookupTableAccount({key:Keypair.generate().publicKey,state:{deactivationSlot:2n**64n-1n,lastExtendedSlot:0,lastExtendedSlotStartIndex:0,addresses:[...new Map(instructions.flatMap(i=>[i.programId,...i.keys.filter(k=>!k.isSigner).map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()]}});
  prepared=(await buildPumpLaunch(input,Keypair.generate().publicKey.toBase58(),[table])).transaction;
  const now=new Date().toISOString();launch={id:'lch_BrowserExecutionTest',mode:'devnet',status:'awaiting_signature',launcherWallet:wallet,draft:{...d.fields,metadataUri:d.metadata.ipfsUri,imageUri:d.image.gatewayUrl},mint:input.mint,feeSharingConfig:sharingConfigPda(input.mint),fees:{platformLaunchFeeLamports:'50000000',platformTreasury:platform,estimatedNetworkFeesLamports:'10000',estimatedAccountRentLamports:'16500000',launcherCreatorFeeBps:0,creatorFeeSplit:{agentRewardsTreasury:agent,agentRewardsBps:6000,platformTreasury:platform,platformBps:4000},notes:[]},execution:{draftId:id,draftVersion:d.version,transaction:prepared,lastValidBlockHeight:100000,genesisHash:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',network:'devnet',quoteAsset:'SOL',platformOrigin:'PLATFORM',initiator:'HUMAN'},signature:null,slot:null,communityId:null,errors:[],history:[{status:'awaiting_signature',at:now}],createdAt:now,updatedAt:now};
  await route.fulfill({status:503,json:{error:{message:'Preparation response lost. Retry safely.'}}});
 });
 await page.route('**/api/v1/launchpad/launches/lch_BrowserExecutionTest/submit',async route=>{
  submissions++;const checked=await validateSignedPumpLaunch(prepared,route.request().postDataJSON().transaction);submittedSignature=checked.signature;submittedPayload=route.request().postDataJSON().transaction;await route.fulfill({status:503,json:{error:{message:'Submission response lost'}}});
 });
 await page.route('**/api/v1/launchpad/launches/lch_BrowserExecutionTest/resume',async route=>{resumptions++;expect(route.request().postDataJSON().transaction).toBe(submittedPayload);await route.fulfill({status:503,json:{error:{message:'RPC still unavailable; keep this signature'}}});});
 await page.route('**/api/v1/launchpad/launches/lch_BrowserExecutionTest',route=>{if(submissions&&resolveSubmission)launch={...launch!,status:'confirmed',signature:submittedSignature,slot:1234,communityId:'com_BrowserExecutionTest'};return route.fulfill({json:{launch}});});
 await page.route('https://gateway.pinata.cloud/ipfs/**',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWNYtbuDIGIYVcQwCIMAAJ5MFWCkU82kAAAAAElFTkSuQmCC','base64')}));
 await page.goto(site!+'/launchpad?source=backend');await waitForApplicationReady(page);await expect(page.getByLabel('Token name',{exact:true})).toBeVisible({timeout:30000});
 await page.locator('form').getByRole('button',{name:'Connect wallet',exact:true}).click();await page.getByRole('button',{name:'Phantom',exact:true}).click();
 await expect(page.getByRole('button',{name:'Create Coin',exact:true})).toBeVisible();await page.getByLabel('Token name',{exact:true}).fill('Browser Signature Test');await page.getByLabel('Symbol',{exact:true}).fill('BST');
 // Use the known validated image fixture (no genuine Pinata invocation).
 await page.getByLabel('Token logo file').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWNYtbuDIGIYVcQwCIMAAJ5MFWCkU82kAAAAAElFTkSuQmCC','base64')});
 await page.getByRole('button',{name:'Create Coin',exact:true}).click();
 const execution=page.getByRole('region',{name:'Launch execution'});await expect(execution.getByRole('alert')).toContainText('Preparation response lost');expect(signs).toBe(0);await execution.getByRole('button',{name:'Retry preparation',exact:true}).click();await expect(execution).toContainText('0.05 SOL');expect(prepareKeys).toHaveLength(2);expect(prepareKeys[0]).toBeTruthy();expect(prepareKeys[1]).toBe(prepareKeys[0]);expect(signs).toBe(0);expect(submissions).toBe(0);
 await page.reload();await waitForApplicationReady(page);await expect(execution).toContainText('0.05 SOL');await expect(page.getByLabel('Token name',{exact:true})).toBeDisabled();expect(preparations).toBe(1);
 await page.getByRole('button',{name:'Approve in wallet',exact:true}).click();await expect(execution.getByRole('alert')).toContainText('rejected');expect(submissions).toBe(0);
 reject=false;await page.getByRole('button',{name:'Approve in wallet',exact:true}).click();
 await expect(execution.getByRole('alert')).toContainText('HTTP 503: Submission response lost');
 await execution.getByRole('button',{name:'Check launch status',exact:true}).click();
 await expect(execution.getByRole('button',{name:'Approve in wallet',exact:true})).toHaveCount(0);
 await expect(execution).toContainText('Checking your signed transaction');
 await page.reload();await waitForApplicationReady(page);await expect(execution).toContainText('Checking your signed transaction');
 await expect(execution.getByRole('button',{name:'Approve in wallet',exact:true})).toHaveCount(0);
 expect(submissions).toBe(1);expect(signs).toBe(2);
 const hint=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('aeco:launch:')).map(k=>JSON.parse(localStorage.getItem(k)!)).find(v=>v.submissionUncertain));
 expect(hint.walletSignature).toBe(submittedSignature);
 await execution.getByRole('button',{name:'Resume same transaction',exact:true}).click();
 await expect(execution.getByRole('alert')).toContainText('RPC still unavailable');expect(resumptions).toBe(1);expect(signs).toBe(2);expect(submissions).toBe(1);
 launch={...launch!,status:'expired'};await execution.getByRole('button',{name:'Check launch status',exact:true}).click();
 await expect(execution).toContainText('Checking your signed transaction');
 await expect(execution.getByRole('button',{name:'Prepare a new attempt',exact:true})).toHaveCount(0);
 resolveSubmission=true;await page.getByRole('button',{name:'Check launch status',exact:true}).click();await expect(execution).toContainText('Token creation verified');
 expect(preparations).toBe(1);expect(submissions).toBe(1);expect(signs).toBe(2);expect(bs58.decode(String(launch!.signature))).toHaveLength(64);
 await page.screenshot({path:'artifacts/launch-execution-mocked-mobile.png',fullPage:true});
 const canvas=page.locator('canvas');await canvas.evaluate(node=>{(window as any).__launchRouteCanvas=node;});
 const exploreLink=page.getByRole('link',{name:'View in Explore',exact:true});
 const confirmedMint=launch?.mint;if(!confirmedMint)throw new Error('Confirmed mock launch is missing its mint');
 expect(new URL((await exploreLink.getAttribute('href'))!,page.url()).pathname).toBe('/explore/'+confirmedMint);
 await exploreLink.click();await expect.poll(()=>new URL(page.url()).pathname).toBe('/explore/'+confirmedMint);
 expect(new URL(page.url()).hash).toBe('');
 expect(await canvas.evaluate(node=>node===(window as any).__launchRouteCanvas)).toBe(true);
});
