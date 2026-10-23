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
    if(style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>1)failures.push(`${node.tagName}.${node.className}${pseudo??''}: outline`);
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
async function go(page:Page,path:string){
 await page.evaluate(path=>{history.pushState(null,'',path+'?source=backend');dispatchEvent(new PopStateEvent('popstate'));},path);
 await expect(page).toHaveURL(new RegExp(path+'\\?'));
}
for(const width of [1440,820,344,690])test(`shared 1px frames and keyboard focus at ${width}px`,async({page})=>{
 test.setTimeout(300000);await page.setViewportSize({width,height:1000});
 const errors:string[]=[],financialWrites:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.method()==='POST'&&/\/(logo|metadata|launch|submit|resume|mint-signature)$/.test(new URL(r.url()).pathname))financialWrites.push(r.url());});
 await page.goto('/launchpad?source=backend');await waitForApplicationReady(page);
 const canvas=page.locator('canvas');await canvas.evaluate(n=>{(window as any).__borderCanvas=n;});
 const name=page.getByRole('textbox',{name:'Token name',exact:true});
 const before=await name.boundingBox();await keyboardFocus(page,name);
 await expect(name).toHaveCSS('border-top-width','1px');await expect(name).toHaveCSS('outline-width','1px');
 await expect(name).toHaveCSS('outline-offset','-1px');await expect(name).toHaveCSS('outline-color','rgb(51, 102, 77)');await expect(name).toHaveCSS('box-shadow','none');
 const after=await name.boundingBox();expect(after?.width).toBe(before?.width);expect(after?.height).toBe(before?.height);
 await name.fill('é'.repeat(17));await expect(name).toHaveAttribute('aria-invalid','true');await expect(name).toHaveCSS('border-top-width','1px');await expect(name).toHaveCSS('box-shadow','none');await name.fill('Moss');
 const description=page.getByRole('textbox',{name:'Description',exact:true});await keyboardFocus(page,description);await expect(description).toHaveCSS('outline-width','1px');await expect(description).toHaveCSS('outline-offset','-1px');
 const amount=page.getByRole('textbox',{name:'Amount in SOL',exact:true});await keyboardFocus(page,amount);
 const shell=page.locator('.launch-dev-buy-sol');await expect(shell).toHaveCSS('border-top-width','1px');await expect(shell).toHaveCSS('outline-width','1px');await expect(shell).toHaveCSS('outline-offset','-1px');await expect(shell).toHaveCSS('outline-color','rgb(51, 102, 77)');await expect(shell).toHaveCSS('box-shadow','none');
 await expect(amount).toHaveCSS('border-top-width','0px');await expect(amount).toHaveCSS('outline-style','none');
 await page.getByRole('group',{name:/Developer Buy/}).screenshot({path:`artifacts/borders-focused-sol-${width}.png`});await thinFrames(page);
 await page.getByRole('button',{name:'Add project links',exact:true}).first().click();
 const website=page.locator('#project-website').first();await keyboardFocus(page,website);await expect(website).toHaveCSS('outline-width','1px');await expect(website).toHaveCSS('box-shadow','none');await thinFrames(page);
 for(const path of ['/explore','/communities','/agent-studio','/economy','/treasury','/roadmap','/about']){
  await go(page,path);await thinFrames(page);
  const select=page.locator('select:visible:enabled').first();
  if(await select.count()){await keyboardFocus(page,select);await expect(select).toHaveCSS('border-top-width','1px');await expect(select).toHaveCSS('outline-width','1px');await expect(select).toHaveCSS('outline-offset','-1px');}
  const search=page.locator('.search input:visible').first();
  if(await search.count()){await keyboardFocus(page,search);await expect(search).toHaveCSS('outline-style','none');await expect(search.locator('..')).toHaveCSS('outline-width','1px');}
  if(path==='/roadmap'){const summary=page.locator('.roadmap-phases summary').first();await keyboardFocus(page,summary);await expect(summary).toHaveCSS('outline-width','1px');await expect(summary).toHaveCSS('outline-color','rgb(51, 102, 77)');}
  if(path==='/about'){const link=page.locator('.about-vision-link');await keyboardFocus(page,link);await expect(link).toHaveCSS('outline-width','1px');await expect(link).toHaveCSS('background-color','rgb(255, 250, 242)');}
 }
 const toggle=page.getByRole('button',{name:'Toggle navigation',exact:true});
 if(await toggle.isVisible()){
  await toggle.press('Enter');const menu=page.getByRole('dialog',{name:'Navigation',exact:true});await expect(menu).toBeVisible();await thinFrames(page);
  const close=menu.getByRole('button',{name:'Close navigation',exact:true});await expect(close).toBeFocused();await expect(close).toHaveCSS('outline-width','1px');await expect(close).toHaveCSS('outline-offset','-1px');
  await menu.screenshot({path:`artifacts/borders-mobile-menu-${width}.png`});await page.keyboard.press('Escape');await expect(toggle).toBeFocused();
 }else{const link=page.locator('nav.nav a').first();await keyboardFocus(page,link);await expect(link).toHaveCSS('outline-width','1px');}
 await page.locator('.topbar .wallet-button').click();const wallet=page.getByRole('dialog');await expect(wallet).toBeVisible();await thinFrames(page);await page.getByRole('button',{name:'Close wallet selection'}).press('Enter');
 expect(await canvas.evaluate(n=>n===(window as any).__borderCanvas)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);expect(financialWrites).toEqual([]);
});
