import { expect, test } from "@playwright/test";

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
    await expect(phases.nth(1)).toHaveAttribute('open', '');
    await expect(page.locator('[data-status="planned"]')).toHaveCount(6);
    await expect(phases.nth(1)).toContainText('staging remains demo');
    await phases.nth(6).locator('summary').press('Enter');
    await expect(phases.nth(6)).toContainText('50% Agent Rewards / 40% Platform / 10% Current Renter');
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
    await page.screenshot({ path: `artifacts/roadmap-${width}.png`, fullPage: true });
  });
}
