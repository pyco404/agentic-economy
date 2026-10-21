/* global document */
/** Actual current application footage, after complete-world readiness. Read-only demo. */
import {chromium} from '../../../../apps/web/node_modules/@playwright/test/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),cache=new URL('cache/',root),site='http://127.0.0.1:5173';
await mkdir(cache,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1080,height:1080},recordVideo:{dir:fileURLToPath(cache),size:{width:1080,height:1080}}});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 const source=await(await page.request.get(site+'/src/components/LaunchWorkspace.tsx')).text();if(!source.includes('LaunchProjectLinks'))throw Error('Outdated local frontend');
 const health=await(await page.request.get('http://127.0.0.1:8795/healthz')).json();if(health.mode!=='demo'||health.store!=='memory'||health.financialFeaturesEnabled)throw Error('Preview is not isolated safe demo');
 await page.goto(site+'/?source=backend',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const d=document.querySelector('[data-testid="city-canvas"]')?.dataset;return d?.worldState==='FULLY_ACTIVE'&&d.revealPending==='0'&&d.revealSceneryReady==='true';},null,{timeout:180000});
 const report=()=>page.getByTestId('city-canvas').evaluate(e=>Object.fromEntries(['worldState','worldTimings','worldPhaseHistory','railway','mirroredRailway','composition','revealPending','revealSceneryReady','renderedBuildings','renderedTrees','camera','waterFlowTime','ambientTime','geometryBuilds','frameNumber'].map(k=>[k,e.dataset[k]])));
 const initial=await report();if(!initial.railway||!initial.mirroredRailway)throw Error('Both railways must be prepared');
 // Film framing uses the existing Zoom out control; it never changes the application's defaults.
 for(let i=0;i<6;i++)await page.getByRole('button',{name:'Zoom out',exact:true}).click();
 await page.mouse.move(540,600);await page.mouse.down({button:'right'});await page.mouse.move(540,470,{steps:12});await page.mouse.up({button:'right'});
 await page.addStyleTag({content:'.topbar,main,.world-atmosphere,.world-help,.world-controls,.world-error,.world-status,.agent-label,.agent-world-labels,.building-label{visibility:hidden!important}.global-world-layer{pointer-events:auto!important}'});
 await page.mouse.move(540,600);await page.mouse.down();const start=Date.now();
 for(let i=0;i<150;i++){
  if(i===55)await page.screenshot({path:fileURLToPath(new URL('current-city-wide.png',cache))});
  if(i===60)await page.locator('[aria-label="Zoom in"]').evaluate(button=>{button.click();button.click();});
  await page.mouse.move(540+i*.15,600);
  const pause=start+(i+1)*100-Date.now();if(pause>0)await page.waitForTimeout(pause);
 }
 await page.mouse.up();
 await page.screenshot({path:fileURLToPath(new URL('current-city-close.png',cache))});
 const final=await report();if(final.geometryBuilds!==initial.geometryBuilds)throw Error('Structural rebuild during capture');
 if(final.revealPending!=='0')throw Error('Late reveal job');
 const video=page.video();await context.close();await video.saveAs(fileURLToPath(new URL('current-city-recording.webm',cache)));
 await writeFile(new URL('capture-evidence.json',cache),JSON.stringify({capturedAt:new Date().toISOString(),site,sourceCommit:'66e5c71',health,initial,final,errors,framing:'Fresh context, approved default orientation; six existing zoom-out clicks for a complete wide landmass, then two existing zoom-in actions at second six for a closer city view; small pan/orbit in the recording browser only. No world source/default changes.',recording:'Use last 15 seconds of actual current-city-recording.webm. All static scenery complete before recording; no wallet, upload or economic write requests.'},null,2));
 console.log('Fresh city footage ready; buildings',final.renderedBuildings,'both railways present; no structural rebuild.');
}finally{await browser.close();}
