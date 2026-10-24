import { test,expect } from '@playwright/test';
const api='http://127.0.0.1:8831';
for(const width of[1440,390,690])test(`five local agents produce visible city consequences at ${width}px`,async({page,request})=>{
 const errors:string[]=[],events:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 page.on('websocket',socket=>socket.on('framereceived',frame=>{try{const j=JSON.parse(String(frame.payload));if(j.type==='activity.created'&&j.data?.event?.data?.source==='local_mock')events.push(j.data.event.id);}catch{/* Non-JSON transport frame. */}}));
 await page.setViewportSize({width,height:1000});await page.goto('/');
 await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state','ready',{timeout:180000});
 await expect.poll(async()=>page.locator('.agent-world-label:not([hidden])').count()).toBeGreaterThan(0);
 const response=await request.get(api+'/api/v1/world/agents'),body=await response.json();
 const cohort=body.agents.filter((a:{id:string})=>Array.from({length:5},(_,i)=>`agt_synthetic${i+1}`).includes(a.id));expect(cohort).toHaveLength(5);expect(cohort.every((a:{social?:unknown})=>a.social)).toBe(true);
 expect(body.agents.filter((a:{id:string})=>!cohort.some((c:{id:string})=>c.id===a.id)).every((a:{social?:unknown})=>!a.social)).toBe(true);
 await expect.poll(()=>events.length,{timeout:30000}).toBeGreaterThan(0);
 await expect.poll(()=>page.locator('.social-bubble').count(),{timeout:30000}).toBeGreaterThan(0);
 expect(await page.locator('.social-bubble').count()).toBeLessThanOrEqual(width<700?2:4);
 // Speech bubbles use the same selection path as clicking the moving citizen.
 const bubble=page.locator('.social-bubble').first();
 await expect.poll(()=>bubble.evaluate(node=>{const r=node.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.social-bubble')===node;})).toBe(true);
 if(width<700)await bubble.tap();else await bubble.click();
 const profile=page.getByRole('complementary',{name:'Agent details'});await expect(profile.getByRole('heading',{name:'Life in the city'})).toBeVisible();
 await expect(profile.getByText(/^Preferences:/)).toBeVisible();await expect(profile.getByRole('heading',{name:'Recent city moments'})).toBeVisible();
 expect(await profile.locator('.social-timeline li').count()).toBeGreaterThan(0);
 await profile.getByRole('button',{name:'Close agent details'}).click();
 await page.locator('.social-bubble').first().press('Enter');await expect(profile).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
 await page.screenshot({path:`/tmp/aeco-autonomy-browser-${width}.png`});expect(errors).toEqual([]);
});
