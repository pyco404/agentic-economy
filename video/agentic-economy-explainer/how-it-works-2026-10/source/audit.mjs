/** Current deployment evidence and page captures, read-only, persistent browser world. */
import {chromium} from '../../../../apps/web/node_modules/@playwright/test/index.mjs';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const cache=new URL('../cache/',import.meta.url),origin='https://staging.useaeco.xyz';
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1080,height:1080}});await page.goto(origin+'/economy',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Resource market',exact:true}).waitFor({timeout:180000});
 const pages={economy:await page.locator('main').innerText()};
 const routeLabels={launchpad:'BUILD A PRESENCE',explore:'EXPLORE AGENTIC ECONOMY',communities:'COMMUNITIES IN ONE WORLD',treasury:'TRANSPARENCY BY DESIGN',roadmap:'Our roadmap'};
 for(const route of ['launchpad','explore','communities','treasury','roadmap']){
  await page.evaluate(path=>{history.pushState(null,'',path);window.dispatchEvent(new PopStateEvent('popstate'));},'/'+route);
  await page.waitForFunction(label=>document.querySelector('main')?.innerText.includes(label),routeLabels[route],{timeout:30000});await page.locator('main').waitFor({timeout:180000});
  pages[route]=(await page.locator('main').innerText()).slice(0,20000);
  await page.screenshot({path:fileURLToPath(new URL(route+'-current.png',cache))});console.log('Read and captured',route);
 }
 const health=await (await page.request.get('https://api-staging.useaeco.xyz/healthz')).json();
 const capabilities=await (await page.request.get('https://api-staging.useaeco.xyz/api/v1/launchpad/capabilities')).json();
 await writeFile(new URL('capture-evidence.json',cache),JSON.stringify({capturedAt:new Date().toISOString(),origin,health,capabilities,pages,notes:'Actual deployed UI. No wallet actions, no uploads, no financial writes.'},null,2));
 console.log('Verified mode',health.mode,'financial execution',health.financialFeaturesEnabled,'launch execution',capabilities.launchEnabled);
}finally{await browser.close();}
