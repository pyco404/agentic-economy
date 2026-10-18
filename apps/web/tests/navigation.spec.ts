import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const read = async (city: import("@playwright/test").Locator) => JSON.parse(await city.getAttribute("data-navigation") ?? "{}");
for (const width of [1440, 390]) test(`connected decorative transport and waterfront at ${width}px`, async ({page}) => {
  test.setTimeout(480000); await page.setViewportSize({width,height:width===390?844:1000});
  const errors:string[]=[],writes:string[]=[],subscriptions:unknown[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.url().includes("/api/v1/")&&r.method()!=="GET")writes.push(r.url());});
  page.on("websocket",ws=>ws.on("framesent",frame=>{try{const value=JSON.parse(String(frame.payload));if(value.type==="subscribe")subscriptions.push(value.chunks);}catch{/* binary/non-JSON frames are unrelated */}}));
  await page.goto("/?source=backend&railReview=1");const city=page.getByTestId("city-canvas");
  await expect.poll(async()=> (await read(city)).boats?.actors.length,{timeout:300000}).toBe(3).catch(async error=>{console.log("CITY_DIAGNOSTICS",await city.evaluate(n=>({...((n as HTMLElement).dataset)})),errors);throw error;});
  const before=await read(city);expect(before.boats.types).toEqual(["cargo","ferry","service"]);
  expect(before.graphs.vehicles.components[0]).toBeGreaterThan(1000);
  await page.screenshot({path:`artifacts/navigation-overview-${width}.png`});
  await city.evaluate(node=>node.dispatchEvent(new CustomEvent("city-rail-review",{detail:{focus:{x:18,z:111,zoom:5}}})));
  await page.waitForTimeout(4000);await page.screenshot({path:`artifacts/boats-lake-${width}.png`});
  await expect.poll(async()=> (await read(city)).boats.actors.reduce((n:number,a:any)=>n+a.traveled,0),{timeout:45000}).toBeGreaterThan(before.boats.actors.reduce((n:number,a:any)=>n+a.traveled,0)+2);
  expect(errors).toEqual([]);expect(writes).toEqual([]);expect(subscriptions.length).toBeGreaterThan(0);expect(subscriptions.every(chunks=>chunks===null)).toBe(true);
});

test("ten-minute real-time connected movement observation",async({page})=>{
  test.skip(process.env.NAVIGATION_OBSERVE!=="1","Opt-in ten-minute real-time acceptance observation");
  test.setTimeout(1020000);await page.goto("/?source=backend&railReview=1");const city=page.getByTestId("city-canvas");
  await expect.poll(async()=> (await read(city)).boats?.actors.length,{timeout:300000}).toBe(3);
  const samples:any[]=[],start=Date.now();
  while(Date.now()-start<600000){
    samples.push({wallSeconds:(Date.now()-start)/1000,...await read(city),agentSample:await city.getAttribute("data-rendered-agent"),rail:JSON.parse(await city.getAttribute("data-rail-service")??"{}")});
    await writeFile("artifacts/navigation-ten-minute.json",JSON.stringify(samples,null,2));
    if(samples.length%6===1)console.log("movement observation",Math.round((Date.now()-start)/1000),"seconds",samples.at(-1).boats.actors.map((a:any)=>({id:a.id,completed:a.completed,traveled:Math.round(a.traveled)})));
    if(samples.length%12===0){await page.getByRole("button",{name:"Rotate camera",exact:true}).click();}
    await page.waitForTimeout(10000);
  }
  samples.push({wallSeconds:(Date.now()-start)/1000,...await read(city)});
  await writeFile("artifacts/navigation-ten-minute.json",JSON.stringify(samples,null,2));
  const end=samples.at(-1);expect(end.boats.actors.every((a:any)=>a.completed>=2)).toBe(true);
  expect(end.traffic.actors.some((a:any)=>a.completed>=2)).toBe(true);
  await page.screenshot({path:"artifacts/navigation-ten-minute.png"});
});
