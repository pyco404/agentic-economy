/** Read-only close inset of an actual moving simulation agent, not a fictional journey. */
import {chromium} from '../../../../apps/web/node_modules/@playwright/test/index.mjs';
import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const cache=new URL('../cache/',import.meta.url),browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist']});
try{
 const context=await browser.newContext({viewport:{width:640,height:380},recordVideo:{dir:fileURLToPath(cache),size:{width:640,height:380}}});const page=await context.newPage();
 await page.route('**/src/world/City.tsx*',async route=>{const response=await route.fetch();let body=await response.text();const marker='if (interactive) controls.update();';if(!body.includes(marker))throw Error('Capture hook moved');body=body.replace(marker,`${marker}
 window.__filmPositions=()=>[...agentPositions].map(([id,p])=>({id,x:p.x,z:p.y}));
 if(window.__filmAgent){const pos=agentPositions.get(window.__filmAgent);if(pos){runtime.current.focus=null;runtime.current.homeActive=false;const offset=camera.position.clone().sub(controls.target);controls.target.set(pos.x,0,pos.y);camera.position.copy(controls.target).add(offset);camera.zoom=8;camera.updateProjectionMatrix();controls.update();}}`);await route.fulfill({response,body});});
 await page.goto('http://127.0.0.1:5173/?source=backend',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('[data-testid="city-canvas"]')?.dataset.worldState==='FULLY_ACTIVE'&&window.__filmPositions?.().length>0,null,{timeout:180000});
 const first=await page.evaluate(()=>window.__filmPositions());await page.waitForTimeout(5000);const last=await page.evaluate(()=>window.__filmPositions());
 const movement=last.map(p=>{const from=first.find(q=>q.id===p.id);return {...p,distance:from?Math.hypot(from.x-p.x,from.z-p.z):0};}).sort((a,b)=>b.distance-a.distance);
 const agent=movement[0];if(agent.distance<.05)throw Error('No observed moving agent for this inset');
 await page.evaluate(id=>{window.__filmAgent=id;},agent.id);
 await page.addStyleTag({content:'.topbar,main,.world-atmosphere,.world-help,.world-controls,.world-error,.world-status,.agent-label,.agent-world-labels,.building-label{visibility:hidden!important}'});
 await page.waitForTimeout(1000);await page.screenshot({path:fileURLToPath(new URL('actual-agent.png',cache))});
 await page.waitForTimeout(20000);const end=await page.evaluate(()=>window.__filmPositions());const video=page.video();await context.close();await video.saveAs(fileURLToPath(new URL('actual-agent-recording.webm',cache)));
 await writeFile(new URL('actual-agent-evidence.json',cache),JSON.stringify({agent,first,last,end,note:'Observed actual moving simulation agent; no assigned fictional job, delivery or receipt. Browser-only close camera inset; main full-field recording unaffected.'},null,2));console.log('Recorded actual moving simulation agent',agent.id);
}finally{await browser.close();}
