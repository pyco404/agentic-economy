/** Clear activity tour using the user-approved sample camera, no application edits. */
import {chromium} from '../../../../apps/web/node_modules/@playwright/test/index.mjs';
import {writeFile,mkdir} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const cache=new URL('../cache/',import.meta.url);await mkdir(cache,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1080,height:1080},recordVideo:{dir:fileURLToPath(cache),size:{width:1080,height:1080}}});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/src/world/City.tsx*',async route=>{
 const response=await route.fetch();let body=await response.text();const marker='if (interactive) controls.update();';
 if(!body.includes(marker))throw Error('Capture hook changed');
 body=body.replace(marker,`${marker}
 window.__filmCamera=(x,z,zoom)=>{
  runtime.current.focus=null;runtime.current.homeActive=false;runtime.current.following=null;
  controls.target.set(x,0,z);camera.position.copy(controls.target).add(new THREE.Vector3(340,237.851117,390));
  camera.zoom=zoom;camera.updateProjectionMatrix();controls.update();camera.updateMatrixWorld();
 };
 window.__filmActors=()=>[...agentPositions].map(([id,p])=>({id,x:p.x,z:p.y}));`);
 await route.fulfill({response,body});
});
const shots=[
 {at:0,x:49.1141,z:46.2959,zoom:1.16,label:'Approved sample composition'},
 {at:14,x:49.1141,z:46.2959,zoom:1.16,label:'Sample overview hold'},
 {at:23,x:59,z:65,zoom:1.62,label:'Working streets and river'},
 {at:36,x:59,z:65,zoom:1.62,label:'Activity hold'},
 {at:45,x:49,z:48,zoom:1.24,label:'City and communities'},
 {at:62,x:49,z:48,zoom:1.24,label:'City hold'},
 {at:72,x:79,z:83,zoom:1.65,label:'River boats and connected streets'},
 {at:83,x:79,z:83,zoom:1.65,label:'Waterfront hold'},
 {at:93,x:54,z:106,zoom:1.48,label:'Railway and outer neighborhoods'},
 {at:104,x:54,z:106,zoom:1.48,label:'Rail corridor hold'},
 {at:114,x:49.1141,z:46.2959,zoom:1.16,label:'Return to approved sample'},
 {at:121,x:49.1141,z:46.2959,zoom:1.16,label:'Closing hold'}
];
function cameraAt(t){let n=shots.findIndex(s=>s.at>t);if(n<1)n=shots.length-1;const a=shots[n-1],b=shots[n],v=Math.min(1,Math.max(0,(t-a.at)/(b.at-a.at))),u=v*v*(3-2*v);return {x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,zoom:a.zoom+(b.zoom-a.zoom)*u};}
try{
 const health=await(await page.request.get('http://127.0.0.1:8795/healthz')).json();if(health.mode!=='demo'||health.store!=='memory'||health.financialFeaturesEnabled)throw Error('Unsafe demo backend');
 await page.goto('http://127.0.0.1:5173/?source=backend',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const d=document.querySelector('[data-testid="city-canvas"]')?.dataset;return d?.worldState==='FULLY_ACTIVE'&&d.revealPending==='0'&&d.revealSceneryReady==='true'&&window.__filmCamera;},null,{timeout:180000});
 const report=()=>page.getByTestId('city-canvas').evaluate(e=>({...e.dataset}));const initial=await report();if(!initial.railway||!initial.mirroredRailway)throw Error('Railways missing');
 await page.addStyleTag({content:'.topbar,main,.world-atmosphere,.world-help,.world-controls,.world-error,.world-status,.agent-label,.agent-world-labels,.building-label{visibility:hidden!important}'});
 await page.evaluate(()=>window.__filmCamera(49.1141,46.2959,1.16));await page.waitForTimeout(1000);await page.screenshot({path:fileURLToPath(new URL('approved-framing.png',cache))});console.log('Approved sample framing ready');
 const started=Date.now(),snapshots=[];
 for(let step=0;step<1210;step++){
  const t=step/10,camera=cameraAt(t);await page.evaluate(c=>window.__filmCamera(c.x,c.z,c.zoom),camera);
  if(step%200===0){const d=await report();snapshots.push({t,camera,frame:d.frameNumber,water:d.waterFlowTime,rail:d.railSeconds,ambient:d.ambientTime,actors:await page.evaluate(()=>window.__filmActors())});console.log('Recording activity',t,'/120s');}
  if([250,500,750,950,1180].includes(step))await page.screenshot({path:fileURLToPath(new URL(`activity-${Math.round(t)}.png`,cache))});
  const delay=started+(step+1)*100-Date.now();if(delay>0)await page.waitForTimeout(delay);
 }
 const final=await report();if(final.geometryBuilds!==initial.geometryBuilds||final.revealPending!=='0'||errors.length)throw Error('Scene changed during recording');
 const video=page.video();await context.close();await video.saveAs(fileURLToPath(new URL('city-activity-continuous.webm',cache)));
 await writeFile(new URL('capture-evidence.json',cache),JSON.stringify({capturedAt:new Date().toISOString(),health,initial,final,errors,shots,snapshots,recordedSeconds:(Date.now()-started)/1000,notes:'Fresh continuous actual scene. Reference sample framing with gentle closer district views. Latest user correction supersedes earlier all-edges-at-all-times constraint. No 15-second loops, financial actions or application/default-camera edits.'},null,2));
}finally{await browser.close();}
