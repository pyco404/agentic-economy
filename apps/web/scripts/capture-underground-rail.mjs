import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
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
 if(process.argv.includes('--real-cycle')) {
  // Seek once to the surface approach, then leave the production-rate clock
  // untouched through entry, the full underground interval and emergence.
  const initial=await state(), {west,east}=report.tunnel;
  await page.getByRole('button',{name:'Enter immersive mode'}).press('Enter');
  await review({time:initial.hiddenAt-10,rate:1,focus:{x:west.x+1,z:west.z,zoom:11}});
  const started=Date.now(), samples=[], states=new Set();
  let previous='', hiddenAt=null, emergedAt=null, completed=false;
  while(Date.now()-started<180000) {
   const current=await state(), visible=current.cars.filter(c=>c.visible).length;
   assert.equal(current.trackVisible,true);
   assert.equal(await city.getAttribute('data-rail-clock-rate'),'1');
   samples.push({wallSeconds:(Date.now()-started)/1000,rail:current});
   states.add(current.state);
   if(current.state==='underground') {
    assert.equal(visible,0);
    if(hiddenAt===null) hiddenAt=Date.now();
   }
   if(current.state==='emerging-tunnel'&&emergedAt===null) emergedAt=Date.now();
   const key=`${current.state}-${visible}`;
   if(key!==previous) {
    console.log(`Live cycle: ${key}`);
    await capture(`live-cycle-${String(shots.length).padStart(2,'0')}-${key}`);
    previous=key;
    if(current.state==='underground') await review({focus:{x:east.x-1,z:east.z,zoom:11,reverse:true}});
   }
   if(emergedAt!==null&&current.state==='surface'&&visible===3) {completed=true;break;}
   await page.waitForTimeout(1000);
  }
  assert.equal(completed,true,'Train did not complete its continuous journey.');
  for(const name of ['surface','entering-tunnel','underground','emerging-tunnel']) assert(states.has(name),name);
  assert(hiddenAt!==null&&emergedAt!==null);
  const observedHiddenSeconds=(emergedAt-hiddenAt)/1000;
  assert(observedHiddenSeconds>116&&observedHiddenSeconds<130,`Observed hidden interval: ${observedHiddenSeconds}`);
  assert.equal(initial.hiddenSeconds,120);
  await writeFile('artifacts/underground-live-cycle.json',JSON.stringify({clockRate:1,configuredHiddenSeconds:120,observedHiddenSeconds,samples,shots},null,2));
  console.log(`Complete live cycle captured; observed underground interval ${observedHiddenSeconds}s.`);
 } else {
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
 }
} finally {await browser.close();}
