import { expect, test } from '@playwright/test';
import { waitForApplicationReady } from './startup';
const count = Number(process.env.AECO_COMMON_AGENTS_FIXTURE_COUNT ?? 400);
test.beforeEach(({}, info) => { test.skip(!info.config.metadata.commonAgentsFixture, 'Use playwright.common-agents.config.ts for the isolated fixture world'); });
for (const width of [390, 768, 1440]) test(`public Common Agents are visible and move at ${width}px`, async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/?source=backend');
  await waitForApplicationReady(page);
  await expect(page.locator('.world-bottom')).toContainText(`${count.toLocaleString('en-US')} $AECO Holders`);
  await expect(page.locator('.world-bottom')).toContainText(`${count.toLocaleString('en-US')} Common Agents`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const agents = await page.request.get('http://127.0.0.1:5198/api/v1/world/agents');
  const first = await agents.json(); expect(first.agents).toHaveLength(count);
  expect(first.agents.every((a: { ownerWallet: string | null }) => a.ownerWallet === null)).toBe(true);
  await expect.poll(async () => {
    const next = await (await page.request.get('http://127.0.0.1:5198/api/v1/world/agents')).json();
    return next.agents.some((a: { id: string; pos: { x: number; y: number } }) => {
      const before = first.agents.find((b: { id: string }) => b.id === a.id); return before && (before.pos.x !== a.pos.x || before.pos.y !== a.pos.y);
    });
  }, { timeout: 20_000 }).toBe(true);
  await expect.poll(async () => Number(await page.getByTestId('city-canvas').getAttribute('data-rendered-agents'))).toBeGreaterThan(0);
  expect(Number(await page.getByTestId('city-canvas').getAttribute('data-rendered-agents'))).toBeLessThanOrEqual(512);
  await page.screenshot({ path: `artifacts/common-agents-${count}-${width}.png`, fullPage: true });
  if (width === 1440) {
    await page.getByRole('link', { name: 'Agent Studio', exact: true }).first().click();
    await expect(page.locator('.agent-list .agent-row')).toHaveCount(50);
    await page.getByRole('button', { name: 'Next agents', exact: true }).click();
    await page.locator('.agent-list .agent-row').first().click();
    const profile = page.getByRole('complementary', { name: 'Agent details' });
    await expect(profile).toContainText('Common Agent');
    await expect(profile).toContainText('Public wallet');
    await expect(profile).toContainText('No wallet control or reward entitlement');
    await expect(profile.getByRole('button', { name: 'Pause agent', exact: true })).toHaveCount(0);
    await profile.screenshot({ path: `artifacts/common-agent-profile-${count}.png` });
  }
});
