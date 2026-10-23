import { test, expect } from '@playwright/test';
import { officialToken } from '../src/content/project';

for (const width of [1440, 820, 344, 690]) test(`official CA remains readable and copyable at ${width}px`, async ({ page, context }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width, height: 1000 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?source=fixtures');
  await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'ready', { timeout: 180000 });
  const hero = page.locator('.world-header .official-token-address');
  await expect(hero.getByRole('heading')).toHaveCount(0);
  await expect(hero.locator('code')).toHaveText(officialToken.mint);
  const pill = page.locator('.official-world-address');
  await expect(pill).toBeVisible();
  await expect(page.locator('.official-world-footer')).toHaveCount(0);
  const bounds = await pill.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1000);
  expect(bounds!.width).toBeLessThan(310);
  expect(await page.locator('.world-main').evaluate(el => Math.round(el.getBoundingClientRect().bottom))).toBe(1000);
  for (const selector of ['.world-bottom', '.camera-tools', '.activity-panel', '.topbar']) {
    const control = page.locator(selector);
    if (!await control.isVisible()) continue;
    const box = (await control.boundingBox())!;
    const overlaps = bounds!.x < box.x + box.width && bounds!.x + bounds!.width > box.x
      && bounds!.y < box.y + box.height && bounds!.y + bounds!.height > box.y;
    expect(overlaps, `CA pill overlaps ${selector}`).toBe(false);
  }
  if (width > 700) {
    const row = await hero.boundingBox();
    expect(row!.height).toBeLessThanOrEqual(44);
  }
  for (const address of [hero, pill]) {
    await expect(address.getByRole('link')).toHaveCount(0);
    await address.getByRole('button', { name: 'Copy official $AECO contract address' }).click();
    await expect(address.getByRole('status')).toHaveText('Contract address copied.');
    await expect(address.getByRole('button').locator('span')).toBeVisible();
    await expect(address.getByRole('button').locator('span')).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(officialToken.mint);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/official-address-home-${width}.png` });
  // Same component on every public overlay, including About/Roadmap's separate shell.
  for (const route of ['launchpad', 'explore', 'communities', 'agent-studio', 'economy', 'treasury', 'roadmap', 'about']) {
    await page.evaluate(path => { history.pushState(null, "", path); window.dispatchEvent(new PopStateEvent("popstate")); }, `/${route}?source=fixtures`);
    const address = page.locator('.page-footer .official-token-address');
    await expect(address).toHaveCount(1);
    await address.scrollIntoViewIfNeeded();
    await expect(address).toBeVisible();
    await expect(address.locator('code')).toHaveText(officialToken.mint);
    await expect(address.getByRole('link')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('clipboard failures give a usable fallback without false copied confirmation', async ({ page }) => {
  test.setTimeout(240000);
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }));
  await page.goto('/about?source=fixtures');
  await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'ready', { timeout: 180000 });
  const address = page.locator('.page-footer .official-token-address');
  await address.scrollIntoViewIfNeeded();
  await address.getByRole('button').click();
  await expect(address.getByRole('status')).toHaveText('Could not copy. Select the full address to copy it.');
  await expect(address.getByRole('status')).toBeVisible();
  await expect(address.locator('code')).toHaveText(officialToken.mint);
});
