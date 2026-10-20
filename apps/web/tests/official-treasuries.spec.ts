import { test, expect } from '@playwright/test';
import { waitForApplicationReady } from './startup';

// Fixture mode deliberately performs no Mainnet reads; it must still show official identities
// and honest unavailable states, never substitute simulated receipts as wallet balances.
for (const width of [1440, 768, 390]) test(`official treasury monitoring fallback at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/treasury?source=fixtures');
  await waitForApplicationReady(page);
  const section = page.getByRole('region', { name: 'Official treasury wallets', exact: true });
  await section.scrollIntoViewIfNeeded();
  await expect(section).toContainText('Mainnet');
  await expect(section).toContainText('Unavailable');
  await expect(section).toContainText('payouts remain disabled');
  await expect(section.locator('a[href="https://explorer.solana.com/address/HmmnNqZbfUZ2YK4mWVLXEGTsAU2NUUAvFzLFxgdgKUT2"]')).toBeVisible();
  await expect(section.locator('a[href="https://explorer.solana.com/address/GEDMCV4WXHCAnySqH4CWNh3NYBrDfAUb3t4BBVBWVnJi"]')).toBeVisible();
  expect(await page.locator('body').evaluate(n => n.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(await section.evaluate(n => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: `artifacts/official-treasuries-${width}.png`, fullPage: true });
});
