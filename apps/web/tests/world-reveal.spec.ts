import{test,expect}from'@playwright/test';
const origin=process.env.WORLD_READINESS_PREVIEW_URL??'';
for(const viewport of[{width:1440,height:1000},{width:390,height:844}])test(`complete static city is presented together before activation at ${viewport.width}px`,async({page})=>{
 test.setTimeout(240000);await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'no-preference'});
 // Hold only the final worker environment message. Real chunks and buildings
 // still assemble, reproducing the original two-stage dependency ordering.
 await page.addInitScript(()=>{
  const Native=window.Worker,pending:{worker:Worker;data:unknown}[]=[];let released=false;
  (window as any).__releaseWorld=()=>{released=true;for(const p of pending.splice(0))p.worker.dispatchEvent(new MessageEvent('message',{data:p.data}));};
  (window as any).__heldWorld=()=>pending.length;
  window.Worker=class extends Native{constructor(url:URL|string,options?:WorkerOptions){super(url,options);if(String(url).includes('scenery.worker'))this.addEventListener('message',event=>{if(event.data.kind==='scenery'&&!released){event.stopImmediatePropagation();pending.push({worker:this,data:event.data});}});}};
 });
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${origin}/?source=backend`,{waitUntil:'domcontentloaded'});const city=page.getByTestId('city-canvas'),canvas=page.locator('canvas'),loader=page.getByTestId('world-loading');
 await expect.poll(async()=>page.evaluate(()=>(window as any).__heldWorld()),{timeout:180000}).toBeGreaterThan(0);
 await expect.poll(async()=>Number(await city.getAttribute('data-rendered-buildings')),{timeout:45000}).toBeGreaterThan(300);
 await expect(city).toHaveAttribute('data-world-state','BUILDING_WORLD');await expect(city).toHaveAttribute('aria-busy','true');await expect(loader).toBeVisible();expect(await canvas.evaluate(n=>getComputedStyle(n).opacity)).toBe('0');
 await expect(page.getByRole('link',{name:'Agentic Economy home',exact:true})).toBeVisible();
 await page.screenshot({path:`artifacts/world-readiness-loading-${viewport.width}.png`});
 await canvas.evaluate(n=>{(window as any).__readyCanvas=n;});
 await page.evaluate(()=>(window as any).__releaseWorld());
 await expect(city).toHaveAttribute('data-reveal-stage','revealing',{timeout:120000});
 const buildingsAtStart=await city.getAttribute('data-geometry-builds');
 await page.screenshot({path:`artifacts/world-reveal-during-${viewport.width}.png`});
 await expect(city).toHaveAttribute('data-world-state','FULLY_ACTIVE',{timeout:120000});
 const timings=JSON.parse((await city.getAttribute('data-world-timings'))!);
 for(const section of ['coreReady','outerTerrainReady','railwaysReady','waterwaysReady','STATIC_WORLD_READY'])expect(timings[section]).toBeLessThanOrEqual(timings.revealStarted);
 expect(timings.revealFinished-timings.revealStarted).toBeGreaterThanOrEqual(2600);
 expect(timings.revealFinished-timings.revealStarted).toBeLessThan(3600);
 expect(await city.getAttribute('data-geometry-builds')).toBe(buildingsAtStart);
 await test.info().attach(`world-timings-${viewport.width}`,{body:JSON.stringify(timings,null,2),contentType:'application/json'});
 await expect(loader).not.toBeVisible();await expect(city).toHaveAttribute('aria-busy','false');
 await expect.poll(()=>canvas.evaluate(n=>getComputedStyle(n).opacity)).toBe('1');
 const history=JSON.parse((await city.getAttribute('data-world-phase-history'))!);expect(history).toEqual(['INITIALIZING','BUILDING_WORLD','STATIC_WORLD_READY','INTERACTIVE','FULLY_ACTIVE']);
 expect(JSON.parse((await city.getAttribute('data-landmass'))!).rectangleFill).toBeLessThan(.85);expect(JSON.parse((await city.getAttribute('data-railway'))!).mode).toBe('riverside');expect(JSON.parse((await city.getAttribute('data-mirrored-railway'))!).mode).toBe('mirrored');
 expect(Number(await city.getAttribute('data-rendered-buildings'))).toBe(413);
 const builds=await city.getAttribute('data-geometry-builds'),camera=await city.getAttribute('data-camera');
 await page.screenshot({path:`artifacts/world-readiness-complete-${viewport.width}.png`});
 await page.getByRole('link',{name:'About Agentic Economy',exact:true}).press('Enter');await page.getByRole('button',{name:'Close page and view city',exact:true}).press('Enter');
 await expect(city).toHaveAttribute('data-world-state','FULLY_ACTIVE');expect(await city.getAttribute('data-geometry-builds')).toBe(builds);expect(await city.getAttribute('data-camera')).toBe(camera);expect(await canvas.evaluate(n=>n===(window as any).__readyCanvas)).toBe(true);
 expect(errors).toEqual([]);await expect(page.getByTestId('connection-status')).toContainText('connected');
});

test('unavailable Treasury does not block static city and retry retains the scene',async({page})=>{
 test.setTimeout(240000);await page.setViewportSize({width:1440,height:1000});
 await page.route('**/api/v1/treasury',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Treasury temporarily unavailable'}})}));
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${origin}/?source=backend`,{waitUntil:'domcontentloaded'});const city=page.getByTestId('city-canvas');
 await expect(city).toHaveAttribute('data-world-state','FULLY_ACTIVE',{timeout:180000});
 await expect(page.getByText('The city is ready. Dashboard information is temporarily unavailable.')).toBeVisible();
 expect(Number(await city.getAttribute('data-rendered-buildings'))).toBe(413);
 const canvas=page.locator('canvas');await canvas.evaluate(n=>{(window as any).__retainedCanvas=n;});
 const camera=await city.getAttribute('data-camera'),builds=await city.getAttribute('data-geometry-builds');
 await page.unroute('**/api/v1/treasury');await page.getByRole('button',{name:'Retry dashboard'}).click();
 await expect(page.getByTestId('connection-status')).toContainText('connected',{timeout:30000});
 await expect(page.getByText('The city is ready. Dashboard information is temporarily unavailable.')).not.toBeVisible();
 expect(await canvas.evaluate(n=>n===(window as any).__retainedCanvas)).toBe(true);
 expect(await city.getAttribute('data-camera')).toBe(camera);expect(await city.getAttribute('data-geometry-builds')).toBe(builds);expect(errors).toEqual([]);
});
