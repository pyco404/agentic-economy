import {test,expect} from '@playwright/test';
import nacl from 'tweetnacl';import bs58 from 'bs58';
import {waitForApplicationReady} from './startup';
const site=process.env.LAUNCH_WORKSPACE_URL;
test.skip(!site,'Isolated memory API and mock Pinata only');
for(const width of [1440,820,390])test(`quiet autosave, restoration and My Drafts at ${width}px`,async({page})=>{
 test.setTimeout(180000);page.setDefaultTimeout(25000);await page.setViewportSize({width,height:width===390?844:1000});
 let pair=nacl.sign.keyPair();const wallet=bs58.encode(pair.publicKey),writes:string[]=[],errors:string[]=[];
 await page.exposeFunction('__draftSign',(bytes:number[])=>Array.from(nacl.sign.detached(Uint8Array.from(bytes),pair.secretKey)));
 await page.addInitScript(wallet=>{const w=window as any;w.__draftWallet=wallet;const callbacks:Record<string,(()=>void)[]>={};w.phantom={solana:{publicKey:{toBase58:()=>w.__draftWallet},connect:async()=>({publicKey:{toBase58:()=>w.__draftWallet}}),signMessage:async(m:Uint8Array)=>({signature:new Uint8Array(await w.__draftSign(Array.from(m)))}),disconnect:async()=>{},on:(name:string,f:()=>void)=>{(callbacks[name]??=[]).push(f);},removeListener:(name:string,f:()=>void)=>{callbacks[name]=callbacks[name]?.filter(x=>x!==f)??[];}}};w.__changeDraftWallet=(next:string)=>{w.__draftWallet=next;callbacks.accountChanged?.forEach(f=>f());};},wallet);
 page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/launchpad/drafts'))writes.push(`${r.method()} ${new URL(r.url()).pathname}`);});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(site+'/launchpad?source=backend');await waitForApplicationReady(page);
 await page.locator('form').getByRole('button',{name:'Connect wallet',exact:true}).click();await page.getByRole('button',{name:'Phantom',exact:true}).click();
 const name=page.getByLabel('Token name',{exact:true}),symbol=page.getByLabel('Symbol',{exact:true}),status=page.locator('.launch-save-status');
 await expect(page.getByRole('button',{name:'My Drafts',exact:true})).toBeVisible();await expect(status).not.toContainText('Loading');
 expect(writes).toEqual([]);await name.fill('Original token');await symbol.fill('ORIG');await expect(status).toHaveText('Saved');
 expect(writes.filter(x=>x==='POST /api/v1/launchpad/drafts')).toHaveLength(1);
 // Hold an older response while typing newer fields. Typing remains enabled and the old response cannot undo it.
 let release!:()=>void;const held=new Promise<void>(r=>{release=r;});let holding=false,fail=false;
 await page.route(/\/api\/v1\/launchpad\/drafts\/[^/]+$/,async route=>{
  if(route.request().method()!=='PATCH')return route.continue();
  if(fail){fail=false;return route.fulfill({status:503,json:{error:{message:'Temporary save failure'}}});}
  if(!holding){holding=true;const response=await route.fetch();await held;return route.fulfill({response});}return route.continue();
 });
 await name.fill('Older edit');await expect.poll(()=>holding).toBe(true);await expect(name).toBeEnabled();await name.fill('Newest edit');release();await expect(status).toHaveText('Saved');await expect(name).toHaveValue('Newest edit');
 fail=true;await name.fill('Retry token');await expect(status).toContainText("Couldn't save");await status.getByRole('button',{name:'Retry',exact:true}).click();await expect(status).toHaveText('Saved');
 if(width===1440){
  const api=process.env.AGENT_WORK_API_URL!;const list=await page.request.get(api+'/api/v1/launchpad/drafts').then(r=>r.json());const d=list.items.find((x:any)=>x.fields.name==='Retry token');
  const changed=await page.request.patch(api+'/api/v1/launchpad/drafts/'+d.id,{headers:{Origin:site!},data:{version:d.version,fields:{...d.fields,name:'Other tab'}}});expect(changed.ok()).toBe(true);
  await name.fill('Unsaved conflict');await expect(status).toContainText('changed elsewhere');
  expect((await page.request.get(api+'/api/v1/launchpad/drafts/'+d.id).then(r=>r.json())).fields.name).toBe('Other tab');
  await page.getByRole('button',{name:'My Drafts',exact:true}).click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Resume Other tab',exact:true}).click();await expect(name).toHaveValue('Other tab');await name.fill('Retry token');await expect(status).toHaveText('Saved');
 }
 await page.getByLabel('Token logo file').setInputFiles({name:'local.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWNYtbuDIGIYVcQwCIMAAJ5MFWCkU82kAAAAAElFTkSuQmCC','base64')});
 await expect(page.getByRole('region',{name:'Live token preview'}).getByRole('img')).toHaveAttribute('src',/^blob:/);
 await page.reload();await waitForApplicationReady(page);await expect(name).toHaveValue('Retry token');await expect(symbol).toHaveValue('ORIG');await expect(page.getByText('Your previous image was local to the browser.',{exact:false})).toBeVisible();await expect(page.getByRole('region',{name:'Live token preview'}).getByRole('img')).toHaveCount(0);
 await page.getByRole('button',{name:'My Drafts',exact:true}).click();await page.getByRole('button',{name:'Start a new token',exact:true}).click();await expect(name).toHaveValue('');await name.fill('Other token');await symbol.fill('OTHER');await expect(status).toHaveText('Saved');
 await page.getByRole('button',{name:'My Drafts',exact:true}).click();await page.getByRole('button',{name:'Resume Retry token',exact:true}).click();await expect(name).toHaveValue('Retry token');
 await page.getByRole('button',{name:'My Drafts',exact:true}).click();
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Delete Other token',exact:true}).click();await expect(page.getByRole('button',{name:'Resume Other token',exact:true})).toBeVisible();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Delete Other token',exact:true}).click();await expect(page.getByRole('button',{name:'Resume Other token',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Close My Drafts'}).click();
 await expect(name).toHaveValue('Retry token');expect(writes.some(x=>/\/(logo|metadata|launch)$/.test(x))).toBe(false);
 if(width===390){await page.setViewportSize({width:320,height:844});await expect(page.locator('.wallet-button')).toBeVisible();expect(await page.locator('body').evaluate(n=>n.scrollWidth<=window.innerWidth+1)).toBe(true);await page.setViewportSize({width,height:844});}
 const mobileMenu=!await page.locator('.wallet-button').isVisible();if(mobileMenu)await page.getByRole('button',{name:'Toggle navigation',exact:true}).click();await page.locator('.wallet-button').click();const account=page.getByRole('region',{name:'Wallet account'});await expect(account).toContainText(wallet);await expect(account).toContainText('Authenticated');await account.getByRole('button',{name:'Sign out / Disconnect'}).click();await expect(name).toHaveValue('');await expect(page.getByRole('button',{name:'My Drafts',exact:true})).toHaveCount(0);if(mobileMenu)await page.getByRole('button',{name:'Toggle navigation',exact:true}).click();
 pair=nacl.sign.keyPair();await page.evaluate(next=>{(window as any).__draftWallet=next;},bs58.encode(pair.publicKey));await page.locator('form').getByRole('button',{name:'Connect wallet',exact:true}).click();await page.getByRole('button',{name:'Phantom',exact:true}).click();await expect(status).not.toContainText('Loading');await page.getByRole('button',{name:'My Drafts',exact:true}).click();await expect(page.getByRole('dialog',{name:'My Drafts'})).toContainText('No saved drafts yet');await page.getByRole('button',{name:'Close My Drafts'}).click();
 await expect(page.getByText('Manage drafts & technical details',{exact:true})).toHaveCount(0);expect(await page.locator('main').evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);await page.screenshot({path:`artifacts/launch-autosave-${width}.png`,fullPage:true});expect(errors).toEqual([]);
});
