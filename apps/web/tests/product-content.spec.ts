import {test,expect,type Page} from '@playwright/test';
const viewports=[{width:1440,height:1000},{width:1024,height:768},{width:768,height:1024},{width:390,height:844},{width:844,height:390}];
async function open(page:Page,name:string){
 if(name==='About'){await page.getByRole('link',{name:'About Agentic Economy',exact:true}).press('Enter');return;}
 const desktop=page.locator('.topbar .nav').getByRole('link',{name,exact:true});
 if(await desktop.isVisible())await desktop.press('Enter');
 else{await page.getByRole('button',{name:'Toggle navigation'}).click();await page.getByRole('dialog',{name:'Navigation',exact:true}).getByRole('link',{name,exact:true}).click();}
}
for(const viewport of viewports)test(`current product content and persistent world at ${viewport.width}x${viewport.height}`,async({page})=>{
 test.setTimeout(240000);await page.setViewportSize(viewport);
 const errors:string[]=[],writes:string[]=[],fontRequests:string[]=[];page.on('request',r=>{if(/fonts\.googleapis|fonts\.gstatic|\.woff2(?:$|\?)/.test(r.url()))fontRequests.push(r.url());});
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/v1/'))writes.push(r.url());});
 await page.goto('/?source=fixtures',{waitUntil:'domcontentloaded'});const city=page.getByTestId('city-canvas');
 await expect(city).toHaveAttribute('data-world-state','FULLY_ACTIVE',{timeout:150000});
 const loadedFonts=await page.evaluate(async()=>{const faces=await Promise.all([document.fonts.load('400 16px \"DM Sans\"'),document.fonts.load('400 16px \"Libre Caslon Display\"')]);return faces.map(f=>f.length);});expect(loadedFonts.every(n=>n>0)).toBe(true);expect(fontRequests.length).toBeGreaterThan(0);expect(fontRequests.every(u=>new URL(u).origin===new URL(page.url()).origin)).toBe(true);
 const canvas=page.locator('canvas');await canvas.evaluate(n=>{(window as any).__productCanvas=n;});
 const builds=await city.getAttribute('data-geometry-builds'),camera=await city.getAttribute('data-camera');
 await expect(page.locator('.world-header')).toContainText('A World That Works');
 await expect(page.locator('.world-header').getByRole('button')).toHaveCount(0);
 await expect(page.locator('.world-header').getByRole('link')).toHaveCount(0);
 await expect(page.locator('.world-header')).not.toContainText('Watch rule-based');
 await expect(page).toHaveTitle('Agentic Economy — A World That Works');
 await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://useaeco.xyz/');
 await page.screenshot({path:`artifacts/product-home-${viewport.width}.png`});
 await open(page,'Launch');await expect(page.getByRole('region',{name:'Live token preview'})).toBeVisible();
 await page.getByLabel('Token name',{exact:true}).fill('My own community');await page.getByLabel('Symbol',{exact:true}).fill('MINE');
 await page.getByText('Project links (optional)',{exact:true}).click();await page.getByLabel('X profile',{exact:true}).fill('https://x.com/myowncoin');
 const preview=page.getByRole('region',{name:'Live token preview'});
 await expect(preview).toContainText('MINE/SOL');await expect(preview.getByRole('link',{name:'X',exact:false})).toHaveAttribute('href','https://x.com/myowncoin');
 await page.getByLabel('Token logo file').setInputFiles(new URL('../public/aeco-website-logo.png',import.meta.url).pathname);
 await expect(preview.getByRole('img')).toHaveAttribute('src',/^blob:/);expect(writes).toEqual([]);
 await preview.scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/product-launch-${viewport.width}.png`});
 await open(page,'Explore');await expect(page.locator('.explore-spotlights section')).toHaveCount(6);
 await expect(page.locator('.source-pill')).toContainText('Recorded demo fixtures');await page.screenshot({path:`artifacts/product-explore-${viewport.width}.png`});
 await open(page,'Agent Studio');await expect(page.getByRole('heading',{name:'City agents',exact:true})).toBeVisible();
 await expect(page.locator('.agent-row').first()).toContainText(/Simulation citizen|Legacy simulation agent|Token-linked agent/);
 await open(page,'Economy');await expect(page.locator('.page-heading')).toContainText('Wheat → Flour → Bread → Residents');
 await open(page,'Treasury');await expect(page.locator('main')).toContainText('Pending allocations are not collected balances or payouts');
 await open(page,'About');await expect(page.locator('#about-status')).toContainText('Verified on staging');await expect(page.locator('#about-status')).toContainText('Awaiting external verification');
 await expect(page.locator('.about-hero').getByRole('link',{name:'View Agentic Economy on GitHub'})).toHaveAttribute('href','https://github.com/pyco404/agentic-economy');
 await page.locator('#about-title').scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/product-about-${viewport.width}.png`});
 await expect(page.locator('.about-page .roadmap-phases')).toHaveCount(0);
 await page.getByRole('link',{name:'Explore Our Roadmap'}).press('Enter');
 await expect(page.locator('#roadmap-title')).toBeVisible();await expect(page.locator('.roadmap-phases summary')).toHaveCount(8);
 await expect(page.locator('.roadmap-phases details').nth(1)).toHaveAttribute('open','');await expect(page.locator('.roadmap-phases')).toContainText('current development phase');
 await page.screenshot({path:`artifacts/product-roadmap-${viewport.width}.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await canvas.evaluate(n=>n===(window as any).__productCanvas)).toBe(true);expect(await city.getAttribute('data-geometry-builds')).toBe(builds);expect(await city.getAttribute('data-camera')).toBe(camera);
 expect(errors).toEqual([]);expect(writes).toEqual([]);
});
