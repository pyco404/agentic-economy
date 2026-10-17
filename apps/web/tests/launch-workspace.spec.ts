import { test,expect } from '@playwright/test';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
const origin=process.env.LAUNCH_WORKSPACE_URL;
test.skip(!origin,'Requires isolated authenticated API with test-only Pinata transport; never run a live upload implicitly.');
for(const viewport of [{width:1440,height:1000},{width:390,height:844}])test(`authenticated draft → logo → metadata → persisted review at ${viewport.width}px`,async({page})=>{
 test.setTimeout(180000);await page.setViewportSize(viewport);
 const key=nacl.sign.keyPair(),wallet=bs58.encode(key.publicKey);let signing=0;
 await page.route('https://gateway.pinata.cloud/ipfs/**',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWNYtbuDIGIYVcQwCIMAAJ5MFWCkU82kAAAAAElFTkSuQmCC','base64')}));
 await page.exposeFunction('__aecoSign',async(bytes:number[])=>{signing++;return Array.from(nacl.sign.detached(new Uint8Array(bytes),key.secretKey));});
 await page.addInitScript(({wallet})=>{
  const callbacks:Record<string,(()=>void)[]>={};
  (window as any).phantom={solana:{connect:async()=>({publicKey:{toBase58:()=>wallet}}),signMessage:async(message:Uint8Array)=>({signature:new Uint8Array(await (window as any).__aecoSign(Array.from(message)))}),disconnect:async()=>{},on:(name:string,cb:()=>void)=>{(callbacks[name]??=[]).push(cb);},removeListener:(name:string,cb:()=>void)=>{callbacks[name]=callbacks[name]?.filter(f=>f!==cb)??[];}}};
  (window as any).__aecoWalletChanged=()=>callbacks.accountChanged?.forEach(cb=>cb());
 },{wallet});
 const errors:string[]=[],financial:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/launches\/(prepare|confirm)|demo\/launches/.test(r.url()))financial.push(r.url());});
 await page.goto(origin!+'/launchpad?source=backend');await expect(page.getByRole('button',{name:'Connect wallet',exact:true}).first()).toBeVisible();
 await expect.poll(async()=>page.request.get(origin!+'/healthz').then(r=>r.status())).toBe(200);
 // Wait for additive capabilities, rather than relying on a timer.
 await expect(page.getByText('Your launch workspace')).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();await page.getByRole('button',{name:'Phantom',exact:true}).click();
 await expect(page.getByText(`Verified creator: ${wallet}`)).toBeVisible();expect(signing).toBe(1);
 await page.getByLabel('Token name',{exact:true}).fill('Moss Community');await page.getByLabel('Symbol',{exact:true}).fill('MOSS');await page.getByRole('textbox',{name:'Description',exact:true}).fill('A genuine backend-persisted draft.');await page.getByRole('button',{name:'Create draft',exact:true}).click();await expect(page.getByText('Draft saved to the backend.')).toBeVisible();
 await page.getByLabel('Token logo file').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWNYtbuDIGIYVcQwCIMAAJ5MFWCkU82kAAAAAElFTkSuQmCC','base64')});
 await expect(page.getByAltText('Token logo preview')).toBeVisible();await page.getByRole('button',{name:'Upload to IPFS',exact:true}).click();await expect(page.getByText('Logo uploaded and verified. No token launched.')).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'Generate metadata',exact:true}).click();await expect(page.getByText('Metadata pinned and saved by the backend.')).toBeVisible();await page.getByRole('button',{name:'Review saved draft',exact:true}).click();await expect(page.getByRole('heading',{name:'Backend draft review'})).toBeVisible();await expect(page.getByText('Draft assets are ready for the next milestone. Token launching remains disabled.')).toBeVisible();
 expect(await page.locator('main').evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
 await page.screenshot({path:`artifacts/launch-workspace-review-${viewport.width}.png`,fullPage:true});
 await page.reload();await expect(page.getByText(`Verified creator: ${wallet}`)).toBeVisible();expect(signing).toBe(1);const select=page.getByLabel('Saved launch drafts');await expect(select).toContainText('Moss Community');await select.selectOption({label:'Moss Community'});await expect(page.getByLabel('Token name',{exact:true})).toHaveValue('Moss Community');await expect(page.getByAltText('Token logo preview')).toBeVisible();
 await page.getByRole('button',{name:'Review saved draft',exact:true}).click();await expect(page.getByRole('heading',{name:'Backend draft review'})).toBeVisible();
 await page.getByRole('textbox',{name:'Description',exact:true}).fill('Latest details');await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('button',{name:'Review saved draft',exact:true}).click();await expect(page.getByText('Generate metadata for the latest saved details')).toBeVisible();
 // Wallet changes revoke the cookie session; drafts disappear immediately.
 await page.evaluate(()=>(window as any).__aecoWalletChanged?.());

 await expect(page.getByText('Your launch workspace')).toBeVisible();expect(financial).toEqual([]);expect(errors).toEqual([]);
});

test('missing wallet and rejected signatures leave drafts unauthenticated',async({page})=>{
 test.setTimeout(120000);await page.goto(origin!+'/launchpad?source=backend');await expect(page.getByText('Your launch workspace')).toBeVisible({timeout:30000});await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();await expect(page.getByText(/No supported wallet detected/)).toBeVisible();await page.getByRole('button',{name:'Close wallet selection'}).click();
 const key=nacl.sign.keyPair(),wallet=bs58.encode(key.publicKey);
 await page.evaluate(wallet=>{(window as any).phantom={solana:{connect:async()=>({publicKey:{toBase58:()=>wallet}}),signMessage:async()=>{throw new Error('Signature rejected by user');},disconnect:async()=>{}}};},wallet);
 await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();await page.getByRole('button',{name:'Phantom',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Signature rejected by user');await page.getByRole('button',{name:'Close wallet selection'}).click();await expect(page.getByText('Your launch workspace')).toBeVisible();
});
