import { expect, test } from "@playwright/test";
import { waitForApplicationReady } from "./startup";

for (const width of [320, 768, 1024, 1440]) {
  test(`Roadmap deep link, refresh and navigation at ${width}px`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 900 });
    // Editorial pages remain usable even when the optional dashboard API fails.
    await page.route('**/api/v1/**', route => route.abort());
    await page.goto('/roadmap?source=backend', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#roadmap-title')).toBeVisible();
    const phases = page.locator('.roadmap-phases details');
    await expect(phases).toHaveCount(8);
    await expect(phases.nth(0)).toHaveAttribute('data-status', 'core');
    await expect(phases.nth(1)).toHaveAttribute('data-status', 'active');
    await expect(page.locator('.roadmap-phases details[open]')).toHaveCount(0);
    await expect(phases.nth(0).locator('summary')).toContainText('Completed milestone');
    await expect(phases.nth(1).locator('summary')).toContainText('In progress');
    await expect(phases.nth(1).locator('summary')).toContainText('Current phase');
    await expect(page.locator('[data-status="planned"]')).toHaveCount(6);
    await expect(page.locator('.roadmap-context')).toContainText('Public token launching awaits release approval');
    await expect(page.locator('.roadmap-page')).not.toContainText(/USDC|staging|Devnet|validator|PostgreSQL|RPC|harness/);
    await phases.nth(1).locator('summary').press('Enter');
    await expect(phases.nth(1).locator('li')).toHaveCount(6);
    await expect(phases.nth(1)).toContainText('Official $AECO Mainnet launch');
    await expect(phases.nth(2).locator('summary')).toContainText('Awaiting Phase 2 acceptance');
    await expect(phases.nth(2)).toContainText('Phase 2 is complete');
    await expect(phases.nth(1)).toContainText('SOL-paired token launches');
    await phases.nth(1).locator('summary').press('Enter');
    await expect(phases.nth(1)).not.toHaveAttribute('open', '');
    await phases.nth(6).locator('summary').press('Enter');
    await expect(phases.nth(6).locator('li')).toHaveCount(4);
    await expect(phases.nth(6)).toContainText('Time-limited renter creator-fee participation');
    await phases.nth(6).locator('summary').press('Enter');
    for (let i=0;i<8;i++) await expect(phases.nth(i).locator('summary')).toContainText(/Phase/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#roadmap-title')).toBeVisible();
    const nav = page.locator('.topbar .nav');
    if (await nav.isVisible()) {
      await expect(nav.getByRole('link').nth(0)).toHaveText('Launch');
      await expect(nav.getByRole('link').nth(1)).toHaveText('Explore');
      await expect(nav.getByRole('link', { name: 'Roadmap', exact: true })).toHaveAttribute('aria-current', 'page');
    } else {
      await page.getByRole('button', { name: 'Toggle navigation' }).click();
      const menu = page.getByRole('dialog', { name: 'Navigation', exact: true });
      await expect(menu.locator('.mobile-navigation-pages a').nth(0)).toContainText('Launch');
      await expect(menu.locator('.mobile-navigation-pages a').nth(1)).toContainText('Explore');
      await expect(menu.getByRole('link', { name: 'Roadmap', exact: true })).toHaveAttribute('aria-current', 'page');
      await menu.getByRole('link', { name: 'Roadmap', exact: true }).click();
    }
    await page.getByRole('link', { name: 'About Agentic Economy', exact: true }).press('Enter');
    await expect(page.locator('#about-direction-title')).toHaveText("Where We're Going");
    await expect(page.locator('.about-page .roadmap-phases')).toHaveCount(0);
    await page.getByRole('link', { name: 'Explore Our Roadmap' }).press('Enter');
    await expect(page.locator('#roadmap-title')).toBeVisible();
    await page.locator('.roadmap-page').screenshot({ path: `artifacts/roadmap-public-${width}.png` });
    await page.screenshot({ path: `artifacts/roadmap-${width}.png`, fullPage: true });
  });
}

for (const width of [390, 1440]) test(`Roadmap and About retain the completed city reveal at ${width}px`, async ({page}) => {
  test.setTimeout(240000);
  await page.setViewportSize({width,height:1000});
  await page.goto('/roadmap?source=fixtures');
  await waitForApplicationReady(page);
  const city=page.getByTestId('city-canvas'),canvas=page.locator('canvas');
  await expect(city).toHaveAttribute('data-reveal-stage','complete');
  await canvas.evaluate(node=>{(window as any).__roadmapCanvas=node;});
  const timings=await city.getAttribute('data-world-timings'),builds=await city.getAttribute('data-geometry-builds');
  await page.screenshot({path:`artifacts/roadmap-public-world-${width}.png`,fullPage:true});
  const phase2=page.locator('.roadmap-phases details').nth(1);
  await phase2.locator('summary').press('Enter');
  await phase2.scrollIntoViewIfNeeded();
  await page.screenshot({path:`artifacts/roadmap-public-expanded-${width}.png`,fullPage:true});
  await page.getByRole('link',{name:'About Agentic Economy',exact:true}).press('Enter');
  await expect(page.locator('#about-direction-title')).toBeVisible();
  await page.getByRole('link',{name:'Explore Our Roadmap'}).press('Enter');
  await expect(page.locator('#roadmap-title')).toBeVisible();
  expect(await canvas.evaluate(node=>node===(window as any).__roadmapCanvas)).toBe(true);
  expect(await city.getAttribute('data-world-timings')).toBe(timings);
  expect(await city.getAttribute('data-geometry-builds')).toBe(builds);
  await expect(city).toHaveAttribute('data-reveal-stage','complete');
});
