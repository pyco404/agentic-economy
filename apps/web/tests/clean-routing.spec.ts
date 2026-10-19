import { expect, test, type Page } from "@playwright/test";
const pages = [
  ["Launch", "/launchpad"], ["Explore", "/explore"], ["Communities", "/communities"],
  ["Agent Studio", "/agent-studio"], ["Economy", "/economy"], ["Treasury", "/treasury"], ["Roadmap", "/roadmap"],
] as const;
async function navigate(page: Page, name: string) {
  const desktop = page.locator('.topbar .nav').getByRole('link', { name, exact: true });
  if (await desktop.isVisible()) await desktop.click();
  else {
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await page.getByRole('dialog', { name: 'Navigation', exact: true }).getByRole('link', { name, exact: true }).click();
  }
}
for (const width of [1440, 390]) test(`clean navigation keeps one world and supports history at ${width}px`, async ({ page }) => {
  test.setTimeout(240000); await page.setViewportSize({ width, height: 1000 });
  await page.goto('/?source=fixtures&view=latest', { waitUntil: 'domcontentloaded' });
  const city = page.getByTestId('city-canvas');
  await expect(city).toHaveAttribute('data-world-state', 'FULLY_ACTIVE', { timeout: 150000 });
  await city.evaluate(node => {
    (window as any).__cleanWorld = { canvas: node.querySelector('canvas'), camera: node.getAttribute('data-camera'), builds: node.getAttribute('data-geometry-builds'), states: [] };
    new MutationObserver(() => (window as any).__cleanWorld.states.push(node.getAttribute('data-world-state'))).observe(node, { attributes: true, attributeFilter: ['data-world-state'] });
  });
  for (const [name, path] of pages) {
    await navigate(page, name);
    await expect(page).toHaveURL(new RegExp(path + '\\?source=fixtures&view=latest$'));
    expect(new URL(page.url()).hash).toBe('');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://useaeco.xyz' + path);
    await expect(page.getByRole('button', { name: 'Close page and view city', exact: true })).toBeVisible();
  }
  await page.getByRole('link', { name: 'About Agentic Economy', exact: true }).click();
  await expect(page.locator('#about-title')).toBeVisible();
  await page.goBack(); await expect(page.locator('#roadmap-title')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/roadmap');
  await page.goForward(); await expect(page.locator('#about-title')).toBeVisible();
  await page.getByRole('button', { name: 'Close page and view city', exact: true }).click();
  await page.getByRole('button', { name: 'Show page', exact: true }).click();
  await expect(page.locator('#about-title')).toBeVisible();
  expect(await city.evaluate(node => {
    const saved = (window as any).__cleanWorld;
    return node.querySelector('canvas') === saved.canvas && node.getAttribute('data-camera') === saved.camera
      && node.getAttribute('data-geometry-builds') === saved.builds && saved.states.every((s: string) => s === 'FULLY_ACTIVE');
  })).toBe(true);
  await navigate(page, 'Explore');
  const card = page.locator('.discovery-card').first();
  await expect(card).toHaveAttribute('href', /^\/explore\/[^#]+/);
  await card.click(); await expect(page.locator('.token-header')).toBeVisible();
  const detail = page.url(); expect(new URL(detail).pathname).toMatch(/^\/explore\/[^/]+$/);
  await page.goBack(); await expect(page.locator('.discovery-grid')).toBeVisible();
  await page.goForward(); await expect(page.locator('.token-header')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.token-header')).toBeVisible(); expect(page.url()).toBe(detail);
  await page.goto('/communities?source=fixtures', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Different communities. One world.' })).toBeVisible();
  await page.screenshot({ path: `artifacts/clean-routing-${width}.png` });
});

test('legacy links normalize while queries and section anchors survive', async ({ page }) => {
  test.setTimeout(180000);
  for (const [legacy, clean] of [['launchpad', '/launchpad'], ['communities', '/communities'], ['explore', '/explore'], ['studio', '/agent-studio'], ['agent-studio', '/agent-studio'], ['economy', '/economy'], ['treasury', '/treasury'], ['roadmap', '/roadmap'], ['about', '/about'], ['world', '/']]) {
    await page.goto(`/?source=fixtures&from=shared#/${legacy}`, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => { const url = new URL(page.url()); return url.pathname + url.search + url.hash; }).toBe(clean + '?source=fixtures&from=shared');
    expect(new URL(page.url()).search).toBe('?source=fixtures&from=shared'); expect(new URL(page.url()).hash).toBe('');
  }
  await page.goto('/about?source=fixtures#about-faq', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#about-faq')).toBeInViewport(); expect(new URL(page.url()).hash).toBe('#about-faq');
  await page.goto('/studio?source=fixtures', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => new URL(page.url()).pathname).toBe('/agent-studio');
});

test('client fallback preserves real endpoint and missing asset responses', async ({ request }) => {
  for (const [, path] of pages) {
    const response = await request.get(path); expect(response.status()).toBe(200); expect(await response.text()).toContain('id="root"');
  }
  expect((await request.get('/healthz')).status()).toBe(200);
  for (const path of ['/api', '/api/v1/world/bootstrap', '/assets/missing.js', '/fonts/missing.woff2', '/missing.png', '/unknown-route']) {
    const response = await request.get(path); expect(response.status(), path).toBe(404); expect(await response.text()).not.toContain('id="root"');
  }
});
