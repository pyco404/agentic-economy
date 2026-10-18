import { expect, test } from "@playwright/test";
for(const viewport of [{width:1440,height:1000},{width:820,height:1180},{width:390,height:844}]){
 test(`outer support compounds remain connected and visible at ${viewport.width}px`,async({page})=>{
  test.setTimeout(240000);await page.setViewportSize(viewport);
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/?source=backend&railReview=1");
  const city=page.getByTestId("city-canvas");
  await expect(city).toHaveAttribute("data-reveal-stage","complete",{timeout:180000});
  await expect(city).toHaveAttribute("data-reveal-scenery-ready","true",{timeout:180000});
  await expect(page.getByTestId("connection-status")).toContainText("connected");
  const composition=JSON.parse((await city.getAttribute("data-composition"))!);
  const report=composition.support;
  expect(report.parts).toBeGreaterThan(200);expect(report.parts).toBeLessThanOrEqual(1800);
  expect(report.parkedAircraft).toBe(2);expect(report.parkedCars).toBe(5);
  expect(new Set(report.sites.map((s:{theme:string})=>s.theme))).toEqual(new Set(["aviation","transport","service","agriculture","woodland","wetland"]));
  for(const site of report.sites)if(site.theme!=="woodland")expect(site.access.length).toBeGreaterThan(0);
  expect(JSON.parse((await city.getAttribute("data-ambient-actors"))!).train).toBe(2);
  const initial=JSON.parse((await city.getAttribute("data-camera"))!);
  await page.screenshot({path:`artifacts/support-default-${viewport.width}.png`});
  await page.getByRole("button",{name:"Enter immersive mode",exact:true}).click();
  for(const theme of ["aviation","transport","wetland"]){
   const site=report.sites.find((s:{theme:string})=>s.theme===theme),focus={x:site.x,z:site.z,zoom:viewport.width>700?3:2.3};
   await city.evaluate((node,focus)=>node.dispatchEvent(new CustomEvent("city-rail-review",{detail:{focus}})),focus);
   await expect.poll(async()=>JSON.parse((await city.getAttribute("data-camera"))!).zoom).toBe(focus.zoom);
   await page.screenshot({path:`artifacts/support-${theme}-${viewport.width}.png`});
  }
  await page.getByRole("button",{name:"Reset camera",exact:true}).click();
  await expect.poll(async()=>JSON.parse((await city.getAttribute("data-camera"))!).zoom).toBe(initial.zoom);
  expect(JSON.parse((await city.getAttribute("data-composition"))!).support).toEqual(report);
  expect(await page.locator("canvas").count()).toBe(1);expect(errors).toEqual([]);
 });
}
