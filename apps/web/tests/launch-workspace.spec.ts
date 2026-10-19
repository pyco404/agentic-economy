import { waitForApplicationReady } from "./startup";
import { test,expect } from '@playwright/test';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
type TestWalletWindow=Window & {
 phantom:{solana:{
  connect():Promise<{publicKey:{toBase58():string}}>;
  signMessage(message:Uint8Array):Promise<{signature:Uint8Array}>;
  disconnect():Promise<void>;
  on?(name:string,callback:()=>void):void;
  removeListener?(name:string,callback:()=>void):void;
 }};
 __aecoSign(bytes:number[]):Promise<number[]>;
 __aecoWalletChanged?:()=>void;
 __aecoSigningKind?:'standard'|'injected';
};
const origin=process.env.LAUNCH_WORKSPACE_URL;
test.skip(!origin,'Requires isolated authenticated API with test-only Pinata transport; never run a live upload implicitly.');
for(const viewport of [{width:1440,height:1000,mode:'normal'},{width:390,height:844,mode:'normal'},{width:820,height:1000,mode:'unavailable'},{width:1024,height:900,mode:'retry'}])test(`authenticated draft → logo → metadata → persisted review (${viewport.mode}) at ${viewport.width}px`,async({page})=>{
 test.setTimeout(180000);await page.setViewportSize(viewport);
 const site=viewport.width<700?origin!.replace('127.0.0.1','localhost'):origin!;
 // This fixture permits the explicit commit action; review deliberately keeps financial execution disabled.
 await page.route('**/api/v1/launchpad/capabilities',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),launchEnabled:true,...(viewport.mode==='unavailable'?{uploads:false}:{})}});});
 let holdCapabilities=false,capabilitiesHeld=false,releaseCapabilities=()=>{};
 const capabilitiesGate=new Promise<void>(resolve=>{releaseCapabilities=resolve;});
 if(viewport.width===1440)await page.route('**/api/v1/launchpad/capabilities',async route=>{if(holdCapabilities){capabilitiesHeld=true;await capabilitiesGate;}const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),launchEnabled:true}});});
 const uploadKeys:string[]=[],metadataKeys:string[]=[];
 if(viewport.mode==='retry'){
  await page.route(/\/launchpad\/drafts\/[^/]+\/logo\?/,async route=>{uploadKeys.push(route.request().headers()['idempotency-key']??'');if(uploadKeys.length===1)await route.fulfill({status:503,json:{error:{message:'Logo upload interrupted. Please try again.'}}});else await route.continue();});
  await page.route(/\/launchpad\/drafts\/[^/]+\/metadata$/,async route=>{metadataKeys.push(route.request().headers()['idempotency-key']??'');if(metadataKeys.length===1)await route.fulfill({status:503,json:{error:{message:'Pinata metadata unavailable'}}});else await route.continue();});
 }
 const key=nacl.sign.keyPair(),wallet=bs58.encode(key.publicKey);let signing=0;
 await page.route('https://gateway.pinata.cloud/ipfs/**',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWNYtbuDIGIYVcQwCIMAAJ5MFWCkU82kAAAAAElFTkSuQmCC','base64')}));
 await page.exposeFunction('__aecoSign',async(bytes:number[])=>{
  const message=new TextDecoder().decode(new Uint8Array(bytes));
  const host=new URL(site).host;
  if(!message.startsWith(`${host} wants you to sign in with your Solana account:\n${wallet}\n`)||!message.split('\n').includes(`URI: ${site}`))throw new Error("The app's signature request cannot be shown as the domain in the sign-in message does not match the requesting app's origin");
  // Phantom rejects SIWS-shaped text with invalid chain identifiers before
  // showing approval. A permissive signer previously concealed this defect.
  const chain=message.split('\n').find(line=>line.startsWith('Chain ID: '));
  if(chain&&!/^Chain ID: (mainnet|testnet|devnet|localnet|solana:mainnet|solana:testnet|solana:devnet)$/.test(chain))throw new Error("The app's signature request cannot be shown due to invalid formatting.");
  signing++;return Array.from(nacl.sign.detached(new Uint8Array(bytes),key.secretKey));
 });
 await page.addInitScript(({wallet,publicKey,standard})=>{
  const callbacks:Record<string,(()=>void)[]>={};
  const testWindow=window as unknown as TestWalletWindow;
  testWindow.phantom={solana:{connect:async()=>({publicKey:{toBase58:()=>wallet}}),signMessage:async(message:Uint8Array)=>{testWindow.__aecoSigningKind='injected';return{signature:new Uint8Array(await testWindow.__aecoSign(Array.from(message)))};},disconnect:async()=>{},on:(name:string,cb:()=>void)=>{(callbacks[name]??=[]).push(cb);},removeListener:(name:string,cb:()=>void)=>{callbacks[name]=callbacks[name]?.filter(f=>f!==cb)??[];}}};
  if(standard){
   const account={address:wallet,publicKey:new Uint8Array(publicKey),chains:['solana:devnet'],features:['solana:signMessage']};
   const registered={version:'1.0.0',name:'Phantom',icon:'data:image/png;base64,',chains:['solana:devnet'],accounts:[account],features:{
    'standard:connect':{version:'1.0.0',connect:async()=>({accounts:[account]})},
    'standard:disconnect':{version:'1.0.0',disconnect:async()=>{}},
    'standard:events':{version:'1.0.0',on:(_name:string,cb:()=>void)=>{(callbacks.accountChanged??=[]).push(cb);return()=>{callbacks.accountChanged=callbacks.accountChanged?.filter(f=>f!==cb)??[];};}},
    'solana:signMessage':{version:'1.0.0',signMessage:async({message}:{message:Uint8Array})=>{testWindow.__aecoSigningKind='standard';return[{signedMessage:message,signature:new Uint8Array(await testWindow.__aecoSign(Array.from(message)))}];}},
   }};
   window.addEventListener('wallet-standard:app-ready',event=>(event as CustomEvent<{register(wallet:unknown):void}>).detail.register(registered));
  }
  (window as unknown as TestWalletWindow).__aecoWalletChanged=()=>callbacks.accountChanged?.forEach(cb=>cb());
 },{wallet,publicKey:Array.from(key.publicKey),standard:viewport.width>700});
 const errors:string[]=[],financial:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/launches\/(prepare|confirm)|demo\/launches/.test(r.url()))financial.push(r.url());});
 await page.goto(site+'/launchpad?source=backend');await waitForApplicationReady(page);await expect(page.locator('form').getByRole('button',{name:'Connect wallet',exact:true})).toBeVisible();
 await expect.poll(async()=>page.request.get(site+'/healthz').then(r=>r.status())).toBe(200);
 // Wait for additive capabilities, rather than relying on a timer.
 await expect(page.getByRole('heading',{name:'Token details',exact:true})).toBeVisible({timeout:30000});
 // Prepare the visible form and local logo before authentication. No draft or upload may be sent yet.
 const writes:string[]=[];const watch=(r:import('@playwright/test').Request)=>{if(r.method()!=='GET'&&/launchpad\/drafts/.test(r.url()))writes.push(r.url());};page.on('request',watch);
 await page.getByLabel('Token name',{exact:true}).fill('Prepared before connection');
 await page.getByLabel('Token logo file').setInputFiles({name:'before-connect.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWNYtbuDIGIYVcQwCIMAAJ5MFWCkU82kAAAAAElFTkSuQmCC','base64')});
 await expect(page.getByAltText('Token logo preview')).toBeVisible();await expect(page.getByRole('button',{name:'Upload to IPFS',exact:true})).toHaveCount(0);
 await page.screenshot({path:`artifacts/launch-disconnected-${viewport.width}.png`,fullPage:true});
 if(viewport.width===1440)holdCapabilities=true;
 await page.locator('form').getByRole('button',{name:'Connect wallet',exact:true}).click();await page.getByRole('button',{name:'Phantom',exact:true}).click();
 if(viewport.width===1440){
  await expect.poll(()=>capabilitiesHeld).toBe(true);
  const loading=page.locator('form').getByRole('button',{name:'Loading token preparation…',exact:true});
  await expect(loading).toBeVisible();await expect(loading).toBeDisabled();expect(writes).toEqual([]);
  holdCapabilities=false;releaseCapabilities();
 }

 await expect(page.getByLabel('Token name',{exact:true})).toHaveValue('Prepared before connection');await expect(page.getByAltText('Token logo preview')).toBeVisible();expect(writes).toEqual([]);page.off('request',watch);
 await expect(page.getByRole('button',{name:'Create Coin',exact:true})).toBeVisible();expect(signing).toBe(1);
 expect(await page.evaluate(()=>(window as unknown as TestWalletWindow).__aecoSigningKind)).toBe(viewport.width>700?'standard':'injected');
 const preparation:string[]=[];page.on('request',r=>{if(/launchpad\/drafts/.test(r.url()) && (r.method()!=='GET'||r.url().endsWith('/review')))preparation.push(`${r.method()} ${new URL(r.url()).pathname.split('/').slice(4).join('/')}`);});
 await page.getByLabel('Token name',{exact:true}).fill('Moss Community');await page.getByLabel('Symbol',{exact:true}).fill('MOSS');await page.getByRole('textbox',{name:'Description',exact:true}).fill('A genuine backend-persisted draft.');
 await page.getByRole('button',{name:'Create Coin',exact:true}).click();
 if(viewport.mode==='unavailable'){
  await expect(page.getByRole('status').filter({hasText:'Your draft is saved.'})).toContainText('Your draft is saved. Logo uploads are temporarily unavailable.');
  expect(preparation.map(p=>p.split(' ')[0])).toEqual(['POST']);await expect(page.getByRole('region',{name:'Token review'})).toHaveCount(0);
  await expect(page.getByAltText('Token logo preview')).toBeVisible();await expect(page.getByRole('button',{name:'Create Coin',exact:true})).toBeEnabled();
  expect(await page.locator('main').innerText()).not.toMatch(/Pinata|IPFS|Generate metadata|Upload to IPFS/);
  await page.screenshot({path:'artifacts/launch-preparation-unavailable.png',fullPage:true});expect(financial).toEqual([]);expect(errors).toEqual([]);return;
 }
 if(viewport.mode==='retry'){
  await expect(page.getByRole('alert')).toContainText('Logo upload interrupted');await page.getByRole('button',{name:'Create Coin',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Your token assets could not be prepared');await page.getByRole('button',{name:'Create Coin',exact:true}).click();
 }
 const review=page.getByRole('region',{name:'Token review'});
 await expect(review).toContainText('Your token details and logo are ready.',{timeout:30000});await expect(review).toContainText(wallet);
 await review.getByText('Verified token assets',{exact:true}).click();
 const references=review.locator('details code');
 await expect(references).toHaveCount(2);
 for(const reference of await references.all())await expect(reference).toHaveText('ipfs://bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m');
 await expect(review).toContainText('Backend checks passed');
 await expect(review).toContainText('MOSS/SOL');
 await expect(review).toContainText('0.05 SOL');
 await expect(page.getByRole('button',{name:'Generate metadata',exact:true})).toHaveCount(0);
 expect(preparation.map(p=>p.split(' ')[0])).toEqual(viewport.mode==='retry'?['POST','POST','POST','POST','POST','GET']:['POST','POST','POST','GET']);
 expect(preparation[1]).toMatch(/\/logo$/);
 if(viewport.mode==='retry'){expect(uploadKeys).toHaveLength(2);expect(uploadKeys[0]).toBeTruthy();expect(uploadKeys[1]).toBe(uploadKeys[0]);expect(metadataKeys).toHaveLength(2);expect(metadataKeys[0]).toBeTruthy();expect(metadataKeys[1]).toBe(metadataKeys[0]);}else expect(preparation[2]).toMatch(/\/metadata$/);
 expect(await page.locator('main').evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
 await page.screenshot({path:`artifacts/launch-workspace-review-${viewport.width}.png`,fullPage:true});
 await page.reload();await waitForApplicationReady(page);await expect(page.getByRole('button',{name:'Create Coin',exact:true})).toBeVisible();expect(signing).toBe(1);
 await page.getByText('Manage drafts & technical details',{exact:true}).click();await expect(page.getByText(`Verified creator: ${wallet}`)).toBeVisible();
 const select=page.getByLabel('Saved launch drafts');await expect(select).toContainText('Moss Community');await select.selectOption({label:'Moss Community'});await expect(page.getByLabel('Token name',{exact:true})).toHaveValue('Moss Community');await expect(page.getByAltText('Token logo preview')).toBeVisible();
 await page.getByText('Manage drafts & technical details',{exact:true}).click();
 const before=preparation.length;await page.getByRole('button',{name:'Create Coin',exact:true}).click();await expect(review).toBeVisible();expect(preparation.slice(before).map(p=>p.split(' ')[0])).toEqual(['GET']);
 await page.getByRole('textbox',{name:'Description',exact:true}).fill('Latest details');await page.getByRole('button',{name:'Create Coin',exact:true}).click();await expect(review).toContainText('Latest details');await expect(review).toContainText('Your token details and logo are ready.');
 // Wallet changes revoke the cookie session; drafts disappear immediately.
 await page.evaluate(()=>(window as unknown as TestWalletWindow).__aecoWalletChanged?.());

 await expect(page.getByRole('heading',{name:'Token details',exact:true})).toBeVisible();await expect(page.getByLabel('Token name',{exact:true})).toHaveValue('');await expect(page.getByAltText('Token logo preview')).toHaveCount(0);expect(financial).toEqual([]);expect(errors).toEqual([]);
});

test('missing wallet and rejected signatures leave drafts unauthenticated',async({page})=>{
 test.setTimeout(120000);await page.goto(origin!+'/launchpad?source=backend');await waitForApplicationReady(page);await expect(page.getByRole('heading',{name:'Token details',exact:true})).toBeVisible({timeout:30000});await page.locator('form').getByRole('button',{name:'Connect wallet',exact:true}).click();await expect(page.getByText(/No supported wallet detected/)).toBeVisible();await page.getByRole('button',{name:'Close wallet selection'}).click();
 const key=nacl.sign.keyPair(),wallet=bs58.encode(key.publicKey);
 await page.evaluate(wallet=>{(window as unknown as TestWalletWindow).phantom={solana:{connect:async()=>({publicKey:{toBase58:()=>wallet}}),signMessage:async()=>{throw new Error('Signature rejected by user');},disconnect:async()=>{}}};},wallet);
 await page.locator('form').getByRole('button',{name:'Connect wallet',exact:true}).click();await page.getByRole('button',{name:'Phantom',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Signature rejected by user');await page.getByRole('button',{name:'Close wallet selection'}).click();await expect(page.getByRole('heading',{name:'Token details',exact:true})).toBeVisible();
});

test('wallet changes during pending approval cannot establish a stale session',async({page})=>{
 test.setTimeout(120000);
 const key=nacl.sign.keyPair(),wallet=bs58.encode(key.publicKey);
 let release:()=>void=()=>{};
 const approval=new Promise<void>(resolve=>{release=resolve;});let signingStarted=false;
 await page.exposeFunction('__aecoSign',async(bytes:number[])=>{signingStarted=true;await approval;return Array.from(nacl.sign.detached(new Uint8Array(bytes),key.secretKey));});
 await page.addInitScript(wallet=>{
  const callbacks:Record<string,(()=>void)[]>={};
  const w=window as unknown as TestWalletWindow;
  w.phantom={solana:{connect:async()=>({publicKey:{toBase58:()=>wallet}}),signMessage:async message=>({signature:new Uint8Array(await w.__aecoSign(Array.from(message)))}),disconnect:async()=>{},
   on:(event,cb)=>{(callbacks[event]??=[]).push(cb);},removeListener:(event,cb)=>{callbacks[event]=callbacks[event]?.filter(f=>f!==cb)??[];}}};
  w.__aecoWalletChanged=()=>callbacks.accountChanged?.forEach(cb=>cb());
 },wallet);
 const verifications:string[]=[];
 page.on('request',r=>{if(r.url().endsWith('/auth/browser/verify'))verifications.push(r.url());});
 await page.goto(origin!+'/launchpad?source=backend');await waitForApplicationReady(page);
 await expect(page.getByRole('heading',{name:'Token details',exact:true})).toBeVisible({timeout:30000});
 await page.locator('form').getByRole('button',{name:'Connect wallet',exact:true}).click();
 await page.getByRole('button',{name:'Phantom',exact:true}).click();
 await expect.poll(()=>signingStarted).toBe(true);
 await page.evaluate(()=>(window as unknown as TestWalletWindow).__aecoWalletChanged?.());
 await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Wallet changed during sign-in');
 release();
 await expect(page.getByRole('button',{name:'Phantom',exact:true})).toBeEnabled();
 expect(verifications).toEqual([]);
 await page.getByRole('button',{name:'Close wallet selection'}).click();
 await expect(page.locator('form').getByRole('button',{name:'Connect wallet',exact:true})).toBeVisible();
});

test('live preview stays local and a disabled demo cannot pin artwork',async({page})=>{
 await page.setViewportSize({width:390,height:844});const writes:string[]=[];
 page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/launchpad/drafts'))writes.push(new URL(r.url()).pathname);});
 const pair=nacl.sign.keyPair(),wallet=bs58.encode(pair.publicKey);
 await page.exposeFunction('__aecoSign',(bytes:number[])=>Array.from(nacl.sign.detached(Uint8Array.from(bytes),pair.secretKey)));
 await page.addInitScript(wallet=>{const w=window as unknown as TestWalletWindow;w.phantom={solana:{connect:async()=>({publicKey:{toBase58:()=>wallet}}),signMessage:async message=>({signature:new Uint8Array(await w.__aecoSign(Array.from(message)))}),disconnect:async()=>{}}};},wallet);
 await page.goto(origin!+'/launchpad?source=backend');await waitForApplicationReady(page);
 await page.getByLabel('Token name',{exact:true}).fill('Local Preview Coin');await page.getByLabel('Symbol',{exact:true}).fill('LOCAL');await page.getByLabel('Description',{exact:true}).fill('Artwork stays on my device.');
 const preview=page.getByRole('region',{name:'Live token preview'});
 await expect(preview).toContainText('Local Preview Coin');await expect(preview).toContainText('LOCAL/SOL');await expect(preview).toContainText('Artwork stays on my device.');
 const image={name:'local.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWNYtbuDIGIYVcQwCIMAAJ5MFWCkU82kAAAAAElFTkSuQmCC','base64')};
 await page.getByLabel('Token logo file').setInputFiles(image);await expect(preview.getByRole('img')).toHaveAttribute('src',/^blob:/);
 const old=await preview.getByRole('img').getAttribute('src');await page.getByLabel('Token logo file').setInputFiles({...image,name:'replacement.png'});
 await expect(preview.getByRole('img')).not.toHaveAttribute('src',old!);expect(await page.evaluate(async url=>{try{await fetch(url!);return true;}catch{return false;}},old)).toBe(false);
 expect(writes).toEqual([]);
 await preview.scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/create-coin-preview-mobile.png'});
 await page.setViewportSize({width:1440,height:1000});await preview.scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/create-coin-preview-desktop.png'});await page.setViewportSize({width:390,height:844});
 await page.locator('form').getByRole('button',{name:'Connect wallet',exact:true}).click();await page.getByRole('button',{name:'Phantom',exact:true}).click();
 await expect(page.locator('form').getByRole('button',{name:'Create Coin',exact:true})).toBeDisabled();await expect(page.getByRole('note')).toContainText('no images are uploaded');expect(writes).toEqual([]);
 await page.getByText('Manage drafts & technical details',{exact:true}).click();await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Draft saved.'})).toBeVisible();
 expect(writes).toEqual(['/api/v1/launchpad/drafts']);await expect(preview.getByRole('img')).toHaveAttribute('src',/^blob:/);
 await page.screenshot({path:'artifacts/create-coin-live-preview-mobile.png',fullPage:true});
});
