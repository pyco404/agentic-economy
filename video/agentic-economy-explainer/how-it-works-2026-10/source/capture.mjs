/** Read-only footage from the deployed product; no wallet, draft, or financial actions. */
import {chromium} from '../../../../apps/web/node_modules/@playwright/test/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),cache=new URL('cache/',root);
await mkdir(cache,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist']});
const origin=process.env.VIDEO_SITE??'https://staging.useaeco.xyz';
const context=await browser.newContext({viewport:{width:1080,height:1080},recordVideo:{dir:fileURLToPath(cache),size:{width:1080,height:1080}}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.getByTestId('city-canvas').waitFor({state:'attached',timeout:180000});
 await page.waitForFunction(()=>document.querySelector('[data-testid="city-canvas"]')?.dataset.worldState==='FULLY_ACTIVE',null,{timeout:180000});
 // A film plate only: hide surrounding DOM overlays inside this capture session.
 // Geometry, materials, camera preset and the deployed source are unchanged.
 await page.addStyleTag({content:'.topbar,main,.world-atmosphere,.world-help,.world-controls,.world-error,.world-status,.chunk-label,.district-label,.agent-label,.building-label{visibility:hidden!important} .global-world-layer{pointer-events:auto!important}'});
 await page.mouse.move(540,620);await page.mouse.down();
 const start=Date.now();
 for(let i=0;i<120;i++){
  await page.mouse.move(540+i*.34,620+i*.025);
  const delay=start+(i+1)*100-Date.now();if(delay>0)await page.waitForTimeout(delay);
 }
 await page.mouse.up();console.log('City orbit captured');
 await page.screenshot({path:fileURLToPath(new URL('city-current.png',cache))});
 const recording=page.video();await context.close();await recording.saveAs(fileURLToPath(new URL('city-recording.webm',cache)));
 const ui=await browser.newPage({viewport:{width:1080,height:1080}});
 await ui.goto(origin+'/economy',{waitUntil:'domcontentloaded'});
 await ui.getByRole('heading',{name:'Resource market',exact:true}).waitFor({timeout:180000});
 await ui.getByRole('heading',{name:'Resource market',exact:true}).scrollIntoViewIfNeeded();
 await ui.screenshot({path:fileURLToPath(new URL('economy-current.png',cache))});console.log('Economy captured');
 const pages={};
 const routeLabels={launchpad:'BUILD A PRESENCE',explore:'EXPLORE AGENTIC ECONOMY',communities:'COMMUNITIES IN ONE WORLD',treasury:'TRANSPARENCY BY DESIGN',roadmap:'Our roadmap'};
 for(const route of ['launchpad','explore','communities','treasury','roadmap']){
  await ui.evaluate(path=>{history.pushState(null,'',path);window.dispatchEvent(new PopStateEvent('popstate'));},'/'+route);await ui.waitForFunction(label=>document.querySelector('main')?.innerText.includes(label),routeLabels[route],{timeout:30000});await ui.locator('main').waitFor({timeout:180000});
  await ui.screenshot({path:fileURLToPath(new URL(route+'-current.png',cache))});
  pages[route]=(await ui.locator('main').innerText()).slice(0,18000);
 }
 const health=await (await ui.request.get('https://api-staging.useaeco.xyz/healthz')).json();
 const capabilities=await (await ui.request.get('https://api-staging.useaeco.xyz/api/v1/launchpad/capabilities')).json();
 await writeFile(new URL('capture-evidence.json',cache),JSON.stringify({capturedAt:new Date().toISOString(),origin,health,capabilities,pages,errors,recording:'Last twelve seconds of city-recording.webm; actual deployed website, overlays hidden only in capture browser. No wallet or write API calls.'},null,2));
 console.log('Footage complete; demo mode:',health.mode,'financial features:',health.financialFeaturesEnabled,'launch enabled:',capabilities.launchEnabled);
}finally{await browser.close();}
