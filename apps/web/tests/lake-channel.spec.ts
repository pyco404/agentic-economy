import {writeFile} from 'node:fs/promises';
import {expect,test} from '@playwright/test';

test('excavated lake connector, retained road crossings and animated water',async({page,context})=>{
 test.setTimeout(180000);
 await page.setViewportSize({width:1280,height:900});
 await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 let baselineIntercepted=false;
 await context.route('**/src/world/sceneryPlan.ts*',async route=>{
  const response=await route.fetch(),source=await response.text();
  expect(source).toContain('planLakeChannel(request.chunks)');
  baselineIntercepted=true;
  await route.fulfill({response,body:source.replace('planLakeChannel(request.chunks)','({ channel: null })')});
 });
 const focus=async(x:number,z:number,zoom:number)=>{
  const city=page.getByTestId('city-canvas');
  await city.evaluate((element,focus)=>element.dispatchEvent(new CustomEvent('city-rail-review',{detail:{focus}})),{x,z,zoom});
  await expect.poll(async()=>JSON.parse((await city.getAttribute('data-camera'))!).zoom).toBe(zoom);
 };
 const open=async()=>{await page.goto('/?source=backend&railReview=1');await expect(page.getByTestId('city-canvas')).toHaveAttribute('data-reveal-stage','complete',{timeout:90000});await focus(52,110,3.3);};
 await open();expect(baselineIntercepted).toBe(true);
 await expect(page.getByTestId('city-canvas')).toHaveAttribute('data-lake-channel','null');
 const beforeCalls=Number(await page.getByTestId('city-canvas').getAttribute('data-draw-calls'));
 const beforeCamera=await page.getByTestId('city-canvas').getAttribute('data-camera');
 await page.screenshot({scale:'css',path:'artifacts/lake-channel-before.png'});
 await context.unroute('**/src/world/sceneryPlan.ts*');
 await open();
 const city=page.getByTestId('city-canvas');
 await expect.poll(async()=>JSON.parse((await city.getAttribute('data-lake-channel'))??'null')?.crossings.length).toBe(3);
 expect(await city.getAttribute('data-camera')).toBe(beforeCamera);
 const afterCalls=Number(await city.getAttribute('data-draw-calls'));expect(afterCalls).toBeLessThanOrEqual(beforeCalls+20);
 await writeFile('artifacts/lake-channel-report.json',JSON.stringify({channel:JSON.parse((await city.getAttribute('data-lake-channel'))!),beforeCalls,afterCalls,camera:JSON.parse(beforeCamera!)}));
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.getByRole('button',{name:'Resume city animation',exact:true}).click();
 const water=Number(await city.getAttribute('data-water-flow-time'));
 await expect.poll(async()=>Number(await city.getAttribute('data-water-flow-time'))).toBeGreaterThan(water);
 await page.screenshot({scale:'css',path:'artifacts/lake-channel-after.png'});
 await focus(56.5,109.5,10);await page.screenshot({scale:'css',path:'artifacts/lake-channel-bridge.png'});
 await page.setViewportSize({width:390,height:844});await focus(52,110,1.5);
 await page.screenshot({scale:'css',path:'artifacts/lake-channel-mobile.png'});
 expect(errors).toEqual([]);
});
