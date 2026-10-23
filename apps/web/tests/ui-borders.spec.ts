import {expect,test,type Locator,type Page} from '@playwright/test';
import {waitForApplicationReady} from './startup';

async function thinFrames(page:Page){
 const violations=await page.evaluate(()=>{
  const failures:string[]=[];
  for(const node of document.querySelectorAll<HTMLElement>('body *')){
   if(!node.getClientRects().length)continue;
   for(const pseudo of [null,'::before','::after']){
    const style=getComputedStyle(node,pseudo);
    if(style.visibility==='hidden'||style.display==='none'||(pseudo&&(style.content==='none'||style.content==='normal')))continue;
    // This border draws a building facade, rather than a UI frame.
    if(pseudo==='::after'&&node.classList.contains('drawn-building'))continue;
    for(const side of ['Top','Right','Bottom','Left'])if(parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`))>1)
     failures.push(`${node.tagName}.${node.className}${pseudo??''}: border${side}`);
    if(style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>2)failures.push(`${node.tagName}.${node.className}${pseudo??''}: outline`);
   }
  }
  return failures;
 });
 expect(violations).toEqual([]);
}
async function keyboardFocus(page:Page,control:Locator){
 await control.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
 await expect(control).toBeFocused();
 await expect.poll(()=>control.evaluate(n=>n.matches(':focus-visible'))).toBe(true);
}

async function contrastingRing(control:Locator){
 const ratio=await control.evaluate(n=>{
  const rgb=(value:string)=>value.match(/[\d.]+/g)!.map(Number),fg=rgb(getComputedStyle(n).outlineColor);
  let parent=n.parentElement,bg=[255,250,242];
  while(parent){const c=rgb(getComputedStyle(parent).backgroundColor);if((c[3]??1)>.9){bg=c;break;}parent=parent.parentElement;}
  const lum=(c:number[])=>c.slice(0,3).reduce((a,v,i)=>{const x=v/255;return a+[.2126,.7152,.0722][i]!*(x<=.04045?x/12.92:((x+.055)/1.055)**2.4);},0);
  const alpha=fg[3]??1,front=fg.map((v,i)=>i<3?v*alpha+bg[i]!*(1-alpha):v),a=lum(front),b=lum(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 });expect(ratio).toBeGreaterThanOrEqual(3);
}
async function unclippedRing(control:Locator){
 await control.scrollIntoViewIfNeeded();
 const clipped=await control.evaluate(n=>{
  const rect=n.getBoundingClientRect(),bad:string[]=[];
  for(let parent=n.parentElement;parent;parent=parent.parentElement){const s=getComputedStyle(parent),p=parent.getBoundingClientRect();
   if(/auto|scroll|hidden|clip/.test(s.overflowY)&&(rect.top-4<p.top+parent.clientTop-.5||rect.bottom+4>p.top+parent.clientTop+parent.clientHeight+.5))bad.push(parent.className+' vertical');
   if(/auto|scroll|hidden|clip/.test(s.overflowX)&&(rect.left-4<p.left+parent.clientLeft-.5||rect.right+4>p.left+parent.clientLeft+parent.clientWidth+.5))bad.push(parent.className+' horizontal');
  }return bad;
 });expect(clipped).toEqual([]);
}

async function go(page:Page,path:string){
 await page.evaluate(path=>{history.pushState(null,'',path+'?source=backend');dispatchEvent(new PopStateEvent('popstate'));},path);
 await expect(page).toHaveURL(new RegExp(path+'\\?'));
}
for(const width of [1440,820,344,690])test(`1px frames with pointer and accessible keyboard focus at ${width}px`,async({page})=>{
 test.setTimeout(300000);await page.setViewportSize({width,height:1000});
 const errors:string[]=[],financialWrites:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.method()==='POST'&&/\/(logo|metadata|launch|submit|resume|mint-signature)$/.test(new URL(r.url()).pathname))financialWrites.push(r.url());});
 await page.goto('/launchpad?source=backend');await waitForApplicationReady(page);
 const canvas=page.locator('canvas');await canvas.evaluate(n=>{(window as any).__borderCanvas=n;});
 const name=page.getByRole('textbox',{name:'Token name',exact:true});
 const before=await name.boundingBox();
 await name.click();await expect(name).toHaveCSS('outline-style','none');await expect(name).toHaveCSS('border-top-width','1px');await expect(name).toHaveCSS('border-top-color','rgb(51, 102, 77)');
 await name.press('m');await expect(name).toHaveCSS('outline-style','none');
 await keyboardFocus(page,name);await contrastingRing(name);await unclippedRing(name);
 await expect(name).toHaveCSS('border-top-width','1px');await expect(name).toHaveCSS('outline-width','2px');
 await expect(name).toHaveCSS('outline-offset','2px');await expect(name).toHaveCSS('outline-color','rgb(51, 102, 77)');await expect(name).toHaveCSS('box-shadow','none');
 const after=await name.boundingBox();expect(after?.width).toBe(before?.width);expect(after?.height).toBe(before?.height);
 await name.fill('é'.repeat(17));await expect(name).toHaveAttribute('aria-invalid','true');await expect(name).toHaveCSS('border-top-width','1px');await expect(name).toHaveCSS('box-shadow','none');await name.fill('Moss');
 const description=page.getByRole('textbox',{name:'Description',exact:true});await keyboardFocus(page,description);await expect(description).toHaveCSS('outline-width','2px');await expect(description).toHaveCSS('outline-offset','2px');
 const amount=page.getByRole('textbox',{name:'Amount in SOL',exact:true});await keyboardFocus(page,amount);
 const shell=page.locator('.launch-dev-buy-sol');await contrastingRing(shell);await unclippedRing(shell);await expect(shell).toHaveCSS('border-top-width','1px');await expect(shell).toHaveCSS('outline-width','2px');await expect(shell).toHaveCSS('outline-offset','2px');await expect(shell).toHaveCSS('outline-color','rgb(51, 102, 77)');await expect(shell).toHaveCSS('box-shadow','none');
 await expect(amount).toHaveCSS('border-top-width','0px');await expect(amount).toHaveCSS('outline-style','none');
 await amount.click();await expect(shell).toHaveCSS('outline-style','none');await expect(shell).toHaveCSS('border-top-width','1px');await expect(shell).toHaveCSS('border-top-color','rgb(51, 102, 77)');
 await keyboardFocus(page,amount);await expect(shell).toHaveCSS('outline-width','2px');
 await page.getByRole('group',{name:/Developer Buy/}).screenshot({path:`artifacts/borders-focused-sol-${width}.png`});await thinFrames(page);
 const file=page.getByLabel('Token logo file',{exact:true});await keyboardFocus(page,file);await expect(page.locator('.logo-dropzone')).toHaveCSS('outline-width','2px');await unclippedRing(page.locator('.logo-dropzone'));
 await page.getByRole('button',{name:'Add project links',exact:true}).first().click();
 const website=page.locator('#project-website').first();await keyboardFocus(page,website);await expect(website).toHaveCSS('outline-width','2px');await expect(website).toHaveCSS('box-shadow','none');await thinFrames(page);
 for(const path of ['/explore','/communities','/agent-studio','/economy','/treasury','/roadmap','/about']){
  await go(page,path);await thinFrames(page);
  const select=page.locator('select:visible:enabled').first();
  if(await select.count()){await keyboardFocus(page,select);await expect(select).toHaveCSS('border-top-width','1px');await expect(select).toHaveCSS('outline-width','2px');await expect(select).toHaveCSS('outline-offset','2px');}
  const search=page.locator('.search input:visible').first();
  if(await search.count()){await keyboardFocus(page,search);await expect(search).toHaveCSS('outline-style','none');await expect(search.locator('..')).toHaveCSS('outline-width','2px');}
  if(path==='/roadmap'){const summary=page.locator('.roadmap-phases summary').first();await keyboardFocus(page,summary);await expect(summary).toHaveCSS('outline-width','2px');await expect(summary).toHaveCSS('outline-color','rgb(51, 102, 77)');}
  if(path==='/about'){const link=page.locator('.about-vision-link');await keyboardFocus(page,link);await expect(link).toHaveCSS('outline-width','2px');await expect(link).toHaveCSS('outline-color','rgb(193, 214, 186)');await contrastingRing(link);}
 }
 const toggle=page.getByRole('button',{name:'Toggle navigation',exact:true});
 if(await toggle.isVisible()){
  await toggle.press('Enter');const menu=page.getByRole('dialog',{name:'Navigation',exact:true});await expect(menu).toBeVisible();await thinFrames(page);
  const close=menu.getByRole('button',{name:'Close navigation',exact:true});await expect(close).toBeFocused();await expect(close).toHaveCSS('outline-width','2px');await expect(close).toHaveCSS('outline-offset','2px');await contrastingRing(close);await unclippedRing(close);
  await page.keyboard.press('Tab');await expect(menu.getByRole('link',{name:'World',exact:true})).toBeFocused();await unclippedRing(menu.getByRole('link',{name:'World',exact:true}));
  await menu.screenshot({path:`artifacts/borders-mobile-menu-${width}.png`});await page.keyboard.press('Escape');await expect(toggle).toBeFocused();
 }else{const link=page.locator('nav.nav a').first();await keyboardFocus(page,link);await expect(link).toHaveCSS('outline-width','2px');}
 await keyboardFocus(page,page.locator('.topbar .wallet-button'));await expect(page.locator('.topbar .wallet-button')).toHaveCSS('outline-width','2px');await page.keyboard.press('Enter');const wallet=page.getByRole('dialog');await expect(wallet).toBeVisible();await thinFrames(page);const walletClose=page.getByRole('button',{name:'Close wallet selection'});await keyboardFocus(page,walletClose);await expect(walletClose).toHaveCSS('outline-width','2px');await unclippedRing(walletClose);await walletClose.press('Enter');
 expect(await canvas.evaluate(n=>n===(window as any).__borderCanvas)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await go(page,'/launchpad');await page.emulateMedia({forcedColors:'active'});const forced=page.getByRole('textbox',{name:'Token name',exact:true});await keyboardFocus(page,forced);
 await expect(forced).toHaveCSS('outline-width','2px');await expect(forced).toHaveCSS('outline-style','solid');await expect(forced).toHaveCSS('border-top-width','1px');await contrastingRing(forced);
 await page.emulateMedia({forcedColors:'none'});
 expect(errors).toEqual([]);expect(financialWrites).toEqual([]);
});

test('touch focus stays thin and keyboard navigation restores the ring',async({browser})=>{
 const context=await browser.newContext({baseURL:process.env.LAUNCH_WORKSPACE_URL,viewport:{width:390,height:844},hasTouch:true});const page=await context.newPage();
 await page.goto('/launchpad?source=backend');await waitForApplicationReady(page);
 const input=page.getByRole('textbox',{name:'Token name',exact:true});await input.tap();await expect(input).toHaveCSS('outline-style','none');await expect(input).toHaveCSS('border-top-width','1px');await expect(input).toHaveCSS('border-top-color','rgb(51, 102, 77)');
 await keyboardFocus(page,input);await expect(input).toHaveCSS('outline-width','2px');await expect(input).toHaveCSS('outline-offset','2px');
 const file=page.getByLabel('Token logo file',{exact:true});await keyboardFocus(page,file);await expect(page.locator('.logo-dropzone')).toHaveCSS('outline-width','2px');
 await page.keyboard.press('Tab');const choose=page.getByRole('button',{name:'Choose logo',exact:true});await expect(choose).toBeFocused();await expect(choose).toHaveCSS('outline-width','2px');await expect(page.locator('.logo-dropzone')).toHaveCSS('outline-style','none');
 await context.close();
});

test('menu and wallet focus rings stay unclipped in short forced-colors layouts',async({page})=>{
 await page.setViewportSize({width:390,height:450});await page.emulateMedia({forcedColors:'active'});
 await page.goto('/launchpad?source=backend');await waitForApplicationReady(page);
 await page.getByRole('button',{name:'Toggle navigation',exact:true}).press('Enter');
 const menu=page.getByRole('dialog',{name:'Navigation',exact:true});
 for(const control of [menu.getByRole('button',{name:'Close navigation',exact:true}),menu.getByRole('link',{name:'View Agentic Economy on GitHub',exact:true})]){
  await keyboardFocus(page,control);await expect(control).toHaveCSS('outline-width','2px');await expect(control).toHaveCSS('outline-offset','2px');await contrastingRing(control);await unclippedRing(control);
 }
 await menu.screenshot({path:'artifacts/focus-short-forced-colors-menu.png'});await page.keyboard.press('Escape');
 await page.locator('.topbar .wallet-button').press('Enter');const close=page.getByRole('button',{name:'Close wallet selection'});
 await keyboardFocus(page,close);await expect(close).toHaveCSS('outline-width','2px');await contrastingRing(close);await unclippedRing(close);
});
