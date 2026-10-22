/** Real UI captures, with only local anonymous form edits. Never authenticate/sign/upload. */
import {chromium} from '../../../../apps/web/node_modules/@playwright/test/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const cache=new URL('../cache/',import.meta.url);await mkdir(cache,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist']});
const evidence={recordedAt:new Date().toISOString(),requestsBlocked:[],pages:{}};
try{
 for(const [route,seconds] of [['economy',20],['launchpad',20],['explore',4],['communities',4],['treasury',4],['roadmap',2]]){
  const context=await browser.newContext({viewport:{width:1080,height:900},recordVideo:{dir:fileURLToPath(cache),size:{width:1080,height:900}}});
  const page=await context.newPage();
  await page.route('**/api/**',async route=>{if(!['GET','HEAD','OPTIONS'].includes(route.request().method())){evidence.requestsBlocked.push({method:route.request().method(),path:new URL(route.request().url()).pathname});await route.abort();}else await route.continue();});
  await page.goto('http://127.0.0.1:5173/'+route+'?source=backend',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('[data-testid="city-canvas"]')?.dataset.worldState==='FULLY_ACTIVE',null,{timeout:180000});
  if(route==='economy')await page.getByRole('heading',{name:'Resource market',exact:true}).scrollIntoViewIfNeeded();
  if(route==='launchpad')await page.getByRole('region',{name:'Live token preview'}).scrollIntoViewIfNeeded();
  const started=Date.now();
  if(route==='launchpad'){
   await page.getByLabel('Token name',{exact:true}).fill('Demo Coin');await page.waitForTimeout(1000);
   await page.getByLabel('Symbol',{exact:true}).fill('DEMO');await page.waitForTimeout(1000);
   await page.getByLabel('Description',{exact:true}).fill('Local artwork preview. Demonstration only; no token launch.');
   await page.locator('input[type=file]').setInputFiles('/home/pikoo/Desktop/agentic-economy/video/agentic-economy-explainer/assets/logo.png');
   await page.waitForTimeout(1000);await page.getByRole('region',{name:'Live token preview'}).scrollIntoViewIfNeeded();
  }
  await page.screenshot({path:fileURLToPath(new URL(`${route}-current.png`,cache))});
  evidence.pages[route]={text:(await page.locator('main').innerText()).slice(0,16000),canvas:await page.getByTestId('city-canvas').evaluate(e=>({...e.dataset}))};
  const wait=seconds*1000-(Date.now()-started);if(wait>0)await page.waitForTimeout(wait);
  const video=page.video();await context.close();await video.saveAs(fileURLToPath(new URL(`${route}-recording.webm`,cache)));console.log('Recorded current',route);
 }
 if(evidence.requestsBlocked.length)throw Error('Unexpected mutating request: '+JSON.stringify(evidence.requestsBlocked));
 await writeFile(new URL('product-evidence.json',cache),JSON.stringify(evidence,null,2));
}finally{await browser.close();}
