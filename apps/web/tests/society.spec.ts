import { CITY_REVEAL } from "../src/world/reveal";
import { test, expect } from '@playwright/test';

// Run against a memory-only backend with SOCIAL_SIMULATION_ENABLED=true and a seeded population.
for (const width of [1440, 820, 344, 690]) test(`shared social activity, inspection and camera focus at ${width}px`, async ({ page, request }) => {
  test.setTimeout(240000);
  const errors: string[] = [], writes: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) && r.url().includes('/api/v1/')) writes.push(r.url()); });
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/');
  await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'ready', { timeout: 180000 });
  const city = page.getByTestId('city-canvas');
  await expect(city).toHaveAttribute('data-world-state', 'FULLY_ACTIVE');
  const canvas = page.locator('canvas');
  await canvas.evaluate(node => { (window as unknown as { societyCanvas: Element }).societyCanvas = node; });
  expect(CITY_REVEAL.duration).toBe(2.6);
  await expect(city).toHaveAttribute('data-reveal-progress', '1');
  // The same read-only API that feeds all visitors, not client-generated social actors.
  const api = process.env.SOCIETY_TEST_API ?? 'http://127.0.0.1:8791';
  const agents = (await (await request.get(`${api}/api/v1/world/agents`)).json()).agents;
  expect(agents.filter((a: { social?: unknown }) => a.social).length).toBeGreaterThan(0);
  const panel = page.locator('.activity-panel');
  if (await page.getByRole('button', { name: 'Expand city activity', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Expand city activity', exact: true }).click();
  if (!(await page.getByLabel('Filter city activity').isVisible())) {
    const expand = page.getByRole('button', { name: 'Expand city activity', exact: true });
    if (await expand.isVisible()) await expand.click();
  }
  await page.getByLabel('Filter city activity').selectOption('social');
  await expect(panel.locator('.activity-focus').first()).toBeVisible({ timeout: 30000 });
  await expect(panel).toContainText('Simulated social activity');
  const beforeCamera = await city.getAttribute('data-camera');
  await panel.locator('.activity-focus').first().click();
  await expect(page.getByRole('region', { name: 'Social life' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Social life' })).toContainText('no payments or rewards');
  await expect(page.getByRole('heading', { name: 'Recent city moments' })).toBeVisible();
  await expect.poll(() => city.getAttribute('data-camera')).not.toBe(beforeCamera);
  await page.screenshot({ path: `artifacts/society-profile-${width}.png` });
  await page.getByRole('button', { name: 'Close agent details' }).click();
  const reset = page.getByRole('button', { name: 'Reset camera', exact: true });
  if (!(await reset.isVisible())) await page.getByRole('button', { name: 'Expand controls', exact: true }).click();
  await reset.click();
  const collapse = page.getByRole('button', { name: 'Collapse controls', exact: true });
  if (await collapse.isVisible()) await collapse.click();
  await expect.poll(async () => Number(await city.getAttribute('data-social-bubbles'))).toBeLessThanOrEqual(width < 700 ? 2 : 4);
  await page.screenshot({ path: `artifacts/society-world-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await canvas.evaluate(node => node === (window as unknown as { societyCanvas: Element }).societyCanvas)).toBe(true);
  await expect(city).toHaveAttribute('data-reveal-progress', '1');
  expect(errors).toEqual([]); expect(writes).toEqual([]);
});
