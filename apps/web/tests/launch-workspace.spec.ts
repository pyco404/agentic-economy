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
for(const viewport of [{width:1440,height:1000},{width:390,height:844}])test(`authenticated draft → logo → metadata → persisted review at ${viewport.width}px`,async({page})=>{
 test.setTimeout(180000);await page.setViewportSize(viewport);
 const site=viewport.width<700?origin!.replace('127.0.0.1','localhost'):origin!;
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
 await page.goto(site+'/launchpad?source=backend');await expect(page.locator('form').getByRole('button',{name:'Connect wallet',exact:true})).toBeVisible();
 await expect.poll(async()=>page.request.get(site+'/healthz').then(r=>r.status())).toBe(200);
 // Wait for additive capabilities, rather than relying on a timer.
 await expect(page.getByRole('heading',{name:'Token details',exact:true})).toBeVisible({timeout:30000});
 // Prepare the visible form and local logo before authentication. No draft or upload may be sent yet.
 const writes:string[]=[];const watch=(r:import('@playwright/test').Request)=>{if(r.method()!=='GET'&&/launchpad\/drafts/.test(r.url()))writes.push(r.url());};page.on('request',watch);
 await page.getByLabel('Token name',{exact:true}).fill('Prepared before connection');
 await page.getByLabel('Token logo file').setInputFiles({name:'before-connect.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWNYtbuDIGIYVcQwCIMAAJ5MFWCkU82kAAAAAElFTkSuQmCC','base64')});
 await expect(page.getByAltText('Token logo preview')).toBeVisible();await expect(page.getByRole('button',{name:'Upload to IPFS',exact:true})).toBeDisabled();
 await page.screenshot({path:`artifacts/launch-disconnected-${viewport.width}.png`,fullPage:true});
 await page.locator('form').getByRole('button',{name:'Connect wallet',exact:true}).click();await page.getByRole('button',{name:'Phantom',exact:true}).click();
 await expect(page.getByLabel('Token name',{exact:true})).toHaveValue('Prepared before connection');await expect(page.getByAltText('Token logo preview')).toBeVisible();expect(writes).toEqual([]);page.off('request',watch);
 await expect(page.getByText(`Verified creator: ${wallet}`)).toBeVisible();expect(signing).toBe(1);
 expect(await page.evaluate(()=>(window as unknown as TestWalletWindow).__aecoSigningKind)).toBe(viewport.width>700?'standard':'injected');
 await page.getByLabel('Token name',{exact:true}).fill('Moss Community');await page.getByLabel('Symbol',{exact:true}).fill('MOSS');await page.getByRole('textbox',{name:'Description',exact:true}).fill('A genuine backend-persisted draft.');await page.getByRole('button',{name:'Create draft',exact:true}).click();await expect(page.getByText('Draft saved to the backend.')).toBeVisible();await expect(page.getByAltText('Token logo preview')).toBeVisible();await expect(page.getByRole('button',{name:'Upload to IPFS',exact:true})).toBeEnabled();
 await page.getByLabel('Token logo file').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWNYtbuDIGIYVcQwCIMAAJ5MFWCkU82kAAAAAElFTkSuQmCC','base64')});
 await expect(page.getByAltText('Token logo preview')).toBeVisible();await page.getByRole('button',{name:'Upload to IPFS',exact:true}).click();await expect(page.getByText('Logo uploaded and verified. No token launched.')).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'Generate metadata',exact:true}).click();await expect(page.getByText('Metadata pinned and saved by the backend.')).toBeVisible();await page.getByRole('button',{name:'Review saved draft',exact:true}).click();await expect(page.getByRole('heading',{name:'Backend draft review'})).toBeVisible();await expect(page.getByText('Draft assets are ready for the next milestone. Token launching remains disabled.')).toBeVisible();
 expect(await page.locator('main').evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
 await page.screenshot({path:`artifacts/launch-workspace-review-${viewport.width}.png`,fullPage:true});
 await page.reload();await expect(page.getByText(`Verified creator: ${wallet}`)).toBeVisible();expect(signing).toBe(1);const select=page.getByLabel('Saved launch drafts');await expect(select).toContainText('Moss Community');await select.selectOption({label:'Moss Community'});await expect(page.getByLabel('Token name',{exact:true})).toHaveValue('Moss Community');await expect(page.getByAltText('Token logo preview')).toBeVisible();
 await page.getByRole('button',{name:'Review saved draft',exact:true}).click();await expect(page.getByRole('heading',{name:'Backend draft review'})).toBeVisible();
 await page.getByRole('textbox',{name:'Description',exact:true}).fill('Latest details');await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('button',{name:'Review saved draft',exact:true}).click();await expect(page.getByText('Generate metadata for the latest saved details')).toBeVisible();
 // Wallet changes revoke the cookie session; drafts disappear immediately.
 await page.evaluate(()=>(window as unknown as TestWalletWindow).__aecoWalletChanged?.());

 await expect(page.getByRole('heading',{name:'Token details',exact:true})).toBeVisible();await expect(page.getByLabel('Token name',{exact:true})).toHaveValue('');await expect(page.getByAltText('Token logo preview')).toHaveCount(0);expect(financial).toEqual([]);expect(errors).toEqual([]);
});

test('missing wallet and rejected signatures leave drafts unauthenticated',async({page})=>{
 test.setTimeout(120000);await page.goto(origin!+'/launchpad?source=backend');await expect(page.getByRole('heading',{name:'Token details',exact:true})).toBeVisible({timeout:30000});await page.locator('form').getByRole('button',{name:'Connect wallet',exact:true}).click();await expect(page.getByText(/No supported wallet detected/)).toBeVisible();await page.getByRole('button',{name:'Close wallet selection'}).click();
 const key=nacl.sign.keyPair(),wallet=bs58.encode(key.publicKey);
 await page.evaluate(wallet=>{(window as unknown as TestWalletWindow).phantom={solana:{connect:async()=>({publicKey:{toBase58:()=>wallet}}),signMessage:async()=>{throw new Error('Signature rejected by user');},disconnect:async()=>{}}};},wallet);
 await page.locator('form').getByRole('button',{name:'Connect wallet',exact:true}).click();await page.getByRole('button',{name:'Phantom',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Signature rejected by user');await page.getByRole('button',{name:'Close wallet selection'}).click();await expect(page.getByRole('heading',{name:'Token details',exact:true})).toBeVisible();
});
