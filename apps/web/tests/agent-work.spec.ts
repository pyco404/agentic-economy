import { expandWorldControls } from "./world-controls";
import { writeFile } from "node:fs/promises";
import {expect,test} from '@playwright/test';
import { WorldAgentsResponse, ReceiptPage, ActivityPage } from '../src/api/shared';
const api=process.env.AGENT_WORK_API_URL??'http://127.0.0.1:8787';
test('observe a real assignment, travel, workplace animation and verified receipt',async({page,request})=>{
 test.setTimeout(360000);
 const started=Date.now();const stage=(name:string)=>console.info(`work-cycle ${name}: ${Math.round((Date.now()-started)/1000)}s`);
 await page.goto('/?source=backend');const city=page.getByTestId('city-canvas');
 await expect(city).toHaveAttribute('data-reveal-stage','complete',{timeout:120000});
 const read=async()=>WorldAgentsResponse.parse(await (await request.get(api+'/api/v1/world/agents')).json());
 stage("world ready");
 const initial=await read(),seen=new Set(initial.agents.map(a=>a.work?.task?.id));
 let chosen:typeof initial.agents[number]|undefined;
 await expect.poll(async()=>{
  const now=await read();chosen=now.agents.find(a=>a.state==='moving'&&a.work?.task?.kind==='production_shift'&&!seen.has(a.work.task.id));return chosen?.id;
 },{timeout:100000,intervals:[500]}).toBeTruthy();
 stage("new assignment");
 const id=chosen!.id,taskId=chosen!.work!.task!.id,place=chosen!.work!.destination!;
 await page.getByRole('link',{name:'Economy',exact:true}).first().click();
 const workPanel=page.getByRole('region',{name:'Current work assignments'});
 await expect(workPanel).toContainText(chosen!.displayName??chosen!.name);
 await workPanel.locator('.task-row').filter({hasText:chosen!.displayName??chosen!.name}).getByRole('button',{name:'Watch agent'}).click();
 await expect(page.getByRole('complementary',{name:'Agent details',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Follow agent',exact:true}).click();
 await expect(page.getByRole('button',{name:'Stop following agent'})).toBeVisible();
 stage('following');
 await page.screenshot({path:'artifacts/agent-work-travel.png'});
 await expect.poll(async()=>{
  const report=JSON.parse(await city.getAttribute('data-agent-work')??'[]') as {id:string;taskId:string;working:boolean}[];
  return report.some(a=>a.id===id&&a.taskId===taskId&&a.working);
 },{timeout:100000,intervals:[250]}).toBe(true);
 stage("working at entrance");
 const working=(await read()).agents.find(a=>a.id===id)!;
 expect(working.work?.task?.id).toBe(taskId);expect(working.state).toBe('working');expect(working.pos).toEqual({x:place.entrance.x+.5,y:place.entrance.y+.5});
 await expect(page.getByTestId('agent-work-description')).toContainText(`Production shift at ${place.name}`);
 await page.screenshot({path:'artifacts/agent-work-working.png'});
 let receipt:ReturnType<typeof ReceiptPage.parse>['items'][number]|undefined;
 await expect.poll(async()=>{
  const receipts=ReceiptPage.parse(await(await request.get(api+'/api/v1/tasks/receipts?limit=100')).json());receipt=receipts.items.find(r=>r.taskId===taskId&&r.agentId===id);return receipt?.id;
 },{timeout:60000,intervals:[500]}).toBeTruthy();
 stage("verified receipt");
 expect(receipt!.checks.every(c=>c.passed)).toBe(true);
 const activity=ActivityPage.parse(await(await request.get(api+'/api/v1/activities?limit=100')).json());
 const events=activity.items.filter(e=>e.data.taskId===taskId);expect(events.some(e=>e.type==='task.verified'&&e.agentId===id)).toBe(true);
 await expect(page.getByRole('region',{name:'Agent work evidence'})).toContainText(receipt!.id,{timeout:15000});
 await page.screenshot({path:'artifacts/agent-work-receipt.png'});
 const evidence=test.info().outputPath('authoritative-work-cycle.json');
 await writeFile(evidence,JSON.stringify({id,taskId,destination:place,working,receipt,events},null,2));
 await test.info().attach('authoritative-work-cycle.json',{path:evidence,contentType:'application/json'});
 // A manual camera gesture must safely leave Follow mode.
 await expandWorldControls(page); await page.getByRole('button',{name:'Rotate camera'}).click();await expect(page.getByRole('button',{name:'Follow agent',exact:true})).toBeVisible();
});
for(const width of [390,768])test(`work discovery and city links remain usable at ${width}px`,async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:width===390?844:1024});
 await page.goto('/?source=backend#economy');
 const facilities=page.getByRole('region',{name:'Participating workplaces'});await expect(facilities.getByRole('button',{name:'View in city'}).first()).toBeVisible({timeout:60000});
 await page.getByRole('button',{name:'flour',exact:true}).click();await expect(facilities).toContainText('Mill');
 await page.screenshot({path:`artifacts/agent-work-economy-${width}.png`});
 await facilities.getByRole('button',{name:'View in city'}).first().click();await expect(page.getByRole('complementary',{name:'Building details',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
