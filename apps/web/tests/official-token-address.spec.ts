import { test, expect } from '@playwright/test';
import { officialToken } from '../src/content/project';

for (const width of [1440, 820, 344, 690]) test(`official CA remains readable and copyable at ${width}px`, async ({ page, context }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width, height: 1000 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?source=fixtures');
  await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'ready', { timeout: 180000 });
  const hero = page.locator('.world-header .official-token-address');
  await expect(hero.getByRole('heading')).toHaveText('Official $AECO Contract Address');
  await expect(hero.locator('code')).toHaveText(officialToken.mint);
  const footer = page.locator('.official-world-footer');
  await expect(footer).toBeVisible();
  for (const address of [hero, footer]) {
    await expect(address.getByRole('link', { name: 'View on Solscan' })).toHaveAttribute('href', officialToken.solscanUrl);
    await expect(address.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
    await address.getByRole('button', { name: 'Copy official $AECO contract address' }).click();
    await expect(address.getByRole('status')).toHaveText('Contract address copied.');
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
  await expect(address.locator('code')).toHaveText(officialToken.mint);
});
