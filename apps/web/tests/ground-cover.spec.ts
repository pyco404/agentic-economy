import { test, expect } from '@playwright/test';
for (const width of [1440, 820, 344]) test(`outer ground vegetation review at ${width}px`, async ({ page }) => {
  test.setTimeout(240000); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/?source=backend&railReview=1');
  const city = page.getByTestId('city-canvas');
  await expect(city).toHaveAttribute('data-world-state', 'FULLY_ACTIVE', { timeout: 180000 });
  await page.screenshot({path:`artifacts/ground-cover-default-${width}.png`});
  const original = await city.getAttribute('data-composition');
  // Existing, independently inspected locations in the approved Genesis world.
  const views = [{theme:'rail-canal',x:48,z:139},{theme:'rail-field',x:116,z:-8},
    {theme:'aviation',x:-11,z:31},{theme:'agriculture',x:-9,z:65},
    {theme:'utility',x:137,z:79},{theme:'pond',x:-17,z:49}];
  for (const view of views) {
    const focus = {x:view.x,z:view.z,zoom:width>700?4.5:3.2};
    await city.evaluate((node,focus)=>node.dispatchEvent(new CustomEvent('city-rail-review',{detail:{focus}})), focus);
    await expect.poll(async()=>JSON.parse((await city.getAttribute('data-camera'))!).zoom).toBe(focus.zoom);
    await expect.poll(async()=>JSON.parse((await city.getAttribute('data-camera'))!).target[0]).toBeCloseTo(focus.x, 4);
    await expect(city).toHaveAttribute('data-world-state','FULLY_ACTIVE');
    await expect(city).toHaveAttribute('data-reveal-pending','0');
    await page.screenshot({path:`artifacts/ground-cover-${view.theme}-${width}.png`});
  }
  // Camera culling may reload chunk batches; it must preserve the cached environment and district plan.
  expect(await city.getAttribute('data-composition')).toBe(original);
  expect(await page.locator('canvas').count()).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
