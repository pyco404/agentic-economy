/** Read-only recording hook, injected into the isolated browser response only.
 * No application files, defaults, simulation data, wallet or deployment changes. */
import {chromium} from '../../../../apps/web/node_modules/@playwright/test/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const cache=new URL('../cache/',import.meta.url);await mkdir(cache,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1080,height:760},recordVideo:{dir:fileURLToPath(cache),size:{width:1080,height:760}}});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/src/world/City.tsx*',async route=>{
 const response=await route.fetch();let body=await response.text();
 const marker='if (interactive) controls.update();';
 if(!body.includes(marker))throw Error('Recording hook point changed');
 body=body.replace(marker,`${marker}
 window.__aecoFullFieldFit = () => {
  runtime.current.focus=null;runtime.current.homeActive=false;runtime.current.following=null;
  const bounds=new THREE.Box3();
  for(const chunk of chunks.values())bounds.union(new THREE.Box3().setFromObject(chunk.group));
  if(scenic)bounds.union(new THREE.Box3().setFromObject(scenic.group));
  if(ambient)bounds.union(new THREE.Box3().setFromObject(ambient.group));
  if(bounds.isEmpty())throw Error('Empty static geometry bounds');
  const center=bounds.getCenter(new THREE.Vector3());
  const offset=camera.position.clone().sub(controls.target);
  controls.target.copy(center);camera.position.copy(center).add(offset);camera.zoom=1;
  controls.minZoom=.01;camera.updateProjectionMatrix();controls.update();camera.updateMatrixWorld();
  const corners=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corners.push(new THREE.Vector3(x,y,z));
  const unscaled=corners.map(v=>v.clone().project(camera));
  const maximum=Math.max(...unscaled.flatMap(v=>[Math.abs(v.x),Math.abs(v.y)]));
  camera.zoom=.88/maximum;camera.updateProjectionMatrix();controls.update();camera.updateMatrixWorld();
  const projected=corners.map(v=>v.clone().project(camera).toArray());
  window.__aecoFullFieldReport={bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},projected,zoom:camera.zoom,position:camera.position.toArray(),target:controls.target.toArray(),frustum:[camera.left,camera.right,camera.top,camera.bottom]};
  return window.__aecoFullFieldReport;
 };`);
 await route.fulfill({response,body});
});
try{
 const health=await(await page.request.get('http://127.0.0.1:8795/healthz')).json();if(health.mode!=='demo'||health.store!=='memory'||health.financialFeaturesEnabled)throw Error('Unsafe recording backend');
 await page.goto('http://127.0.0.1:5173/?source=backend',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const d=document.querySelector('[data-testid="city-canvas"]')?.dataset;return d?.worldState==='FULLY_ACTIVE'&&d.revealPending==='0'&&d.revealSceneryReady==='true'&&window.__aecoFullFieldFit;},null,{timeout:180000});
 const report=()=>page.getByTestId('city-canvas').evaluate(e=>({...e.dataset}));
 const initial=await report();if(!initial.railway||!initial.mirroredRailway)throw Error('Missing railway');
 await page.addStyleTag({content:'.topbar,main,.world-atmosphere,.world-help,.world-controls,.world-error,.world-status,.agent-label,.agent-world-labels,.building-label{visibility:hidden!important}.global-world-layer{pointer-events:auto!important}'});
 const fit=await page.evaluate(()=>window.__aecoFullFieldFit());
 if(fit.projected.some(v=>Math.abs(v[0])>.9||Math.abs(v[1])>.9))throw Error('Full-field bounds outside safe frame');
 await page.waitForTimeout(1200);await page.screenshot({path:fileURLToPath(new URL('full-field-start.png',cache))});
 console.log('Full actual geometry fitted with safe margins:',JSON.stringify(fit),flushLog());
 const snapshots=[],started=Date.now();
 for(let second=0;second<121;second++){
  if(second%20===0){const d=await report();snapshots.push({second,frame:d.frameNumber,water:d.waterFlowTime,rail:d.railSeconds,ambient:d.ambientTime,geometry:d.geometryBuilds});console.log('Recording',second,'/120 seconds');}
  if([20,45,65,90,108,120].includes(second))await page.screenshot({path:fileURLToPath(new URL(`field-${second}.png`,cache))});
  const wait=started+(second+1)*1000-Date.now();if(wait>0)await page.waitForTimeout(wait);
 }
 const final=await report();if(final.geometryBuilds!==initial.geometryBuilds||final.revealPending!=='0'||errors.length)throw Error('Scene changed or error: '+errors.join(';'));
 const video=page.video();await context.close();await video.saveAs(fileURLToPath(new URL('full-field-continuous.webm',cache)));
 await writeFile(new URL('capture-evidence.json',cache),JSON.stringify({capturedAt:new Date().toISOString(),health,fit,initial,final,snapshots,errors,recordedSeconds:(Date.now()-started)/1000,framing:'Actual scene Box3 bounds from all core chunks, frontier and ambient infrastructure; approved default viewing direction; projected AABB fits within +/-0.88 NDC. Fixed camera for entire continuous recording. No repeated loops.'},null,2));
}finally{await browser.close();}
function flushLog(){return '';}
