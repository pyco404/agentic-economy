import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 page.setDefaultNavigationTimeout(120000);
 await page.goto('http://127.0.0.1:5173/?source=backend&railReview=1');
 const city=page.getByTestId('city-canvas');
 await expect.poll(async()=>JSON.parse(await city.getAttribute('data-railway')??'{}').tunnel?.continuous,{timeout:90000}).toBe(true);
 const report=JSON.parse(await city.getAttribute('data-railway'));
 const state=async()=>JSON.parse(await city.getAttribute('data-rail-service')??'{}');
 const review=async(detail)=>{
  const before=await city.getAttribute('data-frame-number');
  await city.evaluate((node,value)=>node.dispatchEvent(new CustomEvent('city-rail-review',{detail:value})),detail);
  await expect.poll(()=>city.getAttribute('data-frame-number'),{timeout:30000}).not.toBe(before);
 };
 const shots=[];
 const capture=async(label)=>{await page.screenshot({path:`artifacts/underground-${label}.png`,timeout:120000});shots.push({label,report,state:await state(),camera:JSON.parse(await city.getAttribute('data-camera'))});};
 await review({rate:0}); await capture('default-city');
 await page.getByRole('button',{name:'Enter immersive mode'}).press('Enter');
 await review({focus:{x:87,z:38,zoom:1}}); await capture('full-city-both-portals');
 const service=await state(), {west,east}=report.tunnel;
 // Production timing constants and exact render frames, not replacement scenes.
 const entryAt=service.hiddenAt-7.8/1.6;
 for(const [label,time] of [['west-approach',entryAt-5],['west-entering',entryAt+1.8],['west-carriages',service.hiddenAt-1],['west-hidden',service.hiddenAt+1]]){
  await review({time,rate:0,focus:{x:west.x+1,z:west.z,zoom:14}});await capture(label);
 }
 for(const [label,time] of [['east-emerging',service.emergesAt+1.4],['east-carriages',service.emergesAt+4.2],['east-surface',service.emergesAt+8]]){
  await review({time,rate:0,focus:{x:east.x-1,z:east.z,zoom:14,reverse:true}});await capture(label);
 }
 await review({time:service.period-30,rate:0,focus:{x:86,z:1,zoom:5}});await capture('surface-bridge');
 await writeFile('artifacts/underground-visual-review.json',JSON.stringify(shots,null,2));
 console.log('Saved railway overview, approach, entry, progressive carriage visibility, emergence and bridge captures.');
} finally {await browser.close();}
