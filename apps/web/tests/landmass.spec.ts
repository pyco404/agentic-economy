import { expect, test } from "@playwright/test";
for(const viewport of [{width:1440,height:1000},{width:390,height:844}])test(`irregular landmass preserves the live city at ${viewport.width}px`,async({page})=>{
  test.setTimeout(240000);await page.setViewportSize(viewport);
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/?source=backend&railReview=1");const city=page.getByTestId("city-canvas");
  await expect(city).toHaveAttribute("data-reveal-stage","complete",{timeout:180000});
  const shape=JSON.parse((await city.getAttribute("data-landmass"))!);
  expect(shape.rectangleFill).toBeLessThan(.85);expect(shape.edgeSegments).toBeGreaterThan(100);
  expect(shape.removedGroundTriangles).toBeGreaterThan(1000);expect(shape.retainedWaterTriangles).toBeGreaterThan(0);
  expect(Number(await city.getAttribute("data-rendered-buildings"))).toBeGreaterThan(300);
  expect(JSON.parse((await city.getAttribute("data-ambient-actors"))!).boats).toBe(3);
  const camera=JSON.parse((await city.getAttribute("data-camera"))!);
  await page.screenshot({path:`artifacts/landmass-default-${viewport.width}.png`});
  const overview={x:64,z:64,zoom:viewport.width>700?1.15:.43};
  await city.evaluate((n,focus)=>n.dispatchEvent(new CustomEvent("city-rail-review",{detail:{focus}})),overview);
  await expect.poll(async()=>JSON.parse((await city.getAttribute("data-camera"))!).zoom).toBe(overview.zoom);
  await page.waitForTimeout(1500);await page.screenshot({path:`artifacts/landmass-outline-${viewport.width}.png`});
  if(viewport.width>700)for(let i=0;i<3;i++){
    await page.getByRole("button",{name:"Rotate camera",exact:true}).click();await page.waitForTimeout(1200);
    await page.screenshot({path:`artifacts/landmass-edge-${i}.png`});
  }
  await page.getByRole("button",{name:"Reset camera",exact:true}).click();
  await expect.poll(async()=>JSON.parse((await city.getAttribute("data-camera"))!).zoom).toBe(camera.zoom);
  expect(errors).toEqual([]);expect(await page.locator("canvas").count()).toBe(1);
});
