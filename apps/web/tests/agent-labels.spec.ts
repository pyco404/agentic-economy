import { test, expect } from '@playwright/test';

// Local memory-only city: crowded disposable identities, no wallet signing or DB writes.
for (const width of [1440, 820, 344, 690]) test(`agent labels follow authoritative identities at ${width}px`, async ({ page, request }) => {
  test.setTimeout(240000); const errors: string[] = [], writes: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) && r.url().includes('/api/v1/')) writes.push(r.url()); });
  await page.setViewportSize({ width, height: 1000 }); await page.goto('/');
  await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'ready', { timeout: 180000 });
  const city = page.getByTestId('city-canvas'), labels = page.locator('.agent-world-label:visible');
  await expect(city).toHaveAttribute('data-world-state', 'FULLY_ACTIVE');
  await expect.poll(() => labels.count()).toBeGreaterThan(0);
  const api = process.env.SOCIETY_TEST_API ?? 'http://127.0.0.1:8791';
  const roster = (await (await request.get(`${api}/api/v1/world/agents`)).json()).agents;
  const ids = new Set(roster.map((a: { id: string }) => a.id));
  for (const id of await labels.evaluateAll(nodes => nodes.map(n => (n as HTMLElement).dataset.agentId))) expect(ids.has(id)).toBe(true);
  const names = await labels.evaluateAll(nodes => nodes.map(n => (n as HTMLElement).dataset.displayName)); expect(new Set(names).size).toBe(names.length);
  // The label button carries its true moving head anchor, independently of any collision offset.
  const moving = page.locator('.agent-world-label[data-state="walking"]:visible').first();
  await expect(moving).toBeVisible(); const id = await moving.getAttribute('data-agent-id');
  const tracked = page.locator(`.agent-world-label[data-agent-id="${id}"]`);
  const anchor = await tracked.evaluate(n => `${(n as HTMLElement).dataset.anchorX}:${(n as HTMLElement).dataset.anchorY}`);
  await expect.poll(() => tracked.evaluate(n => `${(n as HTMLElement).dataset.anchorX}:${(n as HTMLElement).dataset.anchorY}`), { timeout: 20000 }).not.toBe(anchor);
  // Raycast a rendered agent whose routine name was culled. A genuine canvas hover must reveal it.
  await page.getByRole('button', { name: 'Pause city animation', exact: true }).click();
  let revealedHidden = false;
  for (let round = 0; round < 3 && !revealedHidden; round++) {
    const targets = await city.evaluate(host => {
      const box = host.getBoundingClientRect();
      const visible = new Set([...host.querySelectorAll('.agent-world-label:not([hidden])')].map(n => (n as HTMLElement).dataset.agentId));
      return (JSON.parse((host as HTMLElement).dataset.agentLabelPositions ?? '[]') as Array<{ id: string; x: number; y: number }>).filter(a => !visible.has(a.id))
        .map(a => ({ ...a, x: a.x + box.left, y: a.y + box.top })).filter(a => document.elementFromPoint(a.x, a.y)?.tagName === 'CANVAS').slice(0, 30);
    });
    for (const target of targets) {
      await page.mouse.move(target.x, target.y);
      const revealed = page.locator(`.agent-world-label[data-agent-id="${target.id}"][data-focused="true"]:visible`);
      try { await expect(revealed).toBeVisible({ timeout: 350 }); revealedHidden = true; break; } catch { /* Try another visible body; buildings may cover the torso. */ }
    }
    if (!revealedHidden) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  }
  expect(revealedHidden).toBe(true);
  // Hovered labels expose full identity, then click opens the authoritative detail endpoint.
  const focused = page.locator('.agent-world-label[data-focused="true"]:visible').first(); await expect(focused).toBeVisible();
  const chosen = await focused.getAttribute('data-agent-id'); await expect(focused.locator('small')).toContainText(chosen!);
  await focused.click(); const profile = page.getByRole('complementary', { name: 'Agent details', exact: true });
  await expect(profile).toBeVisible(); await expect(page.getByTestId('agent-canonical-id')).toHaveText(chosen!);
  await expect(profile).toContainText('Identity type'); await expect(profile).toContainText('Current activity');
  const record = roster.find((a: { id: string }) => a.id === chosen);
  if (record.identity.kind === 'aeco_observed') {
    await expect(profile).toContainText(record.identity.wallet); await expect(profile).toContainText(record.identity.tokenMint);
  }
  await page.getByRole('button', { name: 'Follow agent', exact: true }).click();
  await expect.poll(async () => JSON.parse((await city.getAttribute('data-camera'))!).zoom).toBeGreaterThanOrEqual(3.6);
  await page.getByRole('button', { name: 'Close agent details', exact: true }).click();
  // Existing mobile follow framing reserves space for the inspector. After closing it,
  // pan the subject below the hero rather than expecting a name through an obstructing HUD.
  if (width < 700 && await labels.count() === 0) {
    const canvas = page.locator('canvas'); await canvas.focus();
    for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowLeft'); }
  }
  await expect.poll(() => labels.count()).toBeGreaterThan(0);
  await page.screenshot({ path: `artifacts/agent-labels-close-${width}.png` });
  for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect.poll(async () => JSON.parse((await city.getAttribute('data-camera'))!).zoom).toBeLessThan(1.2);
  expect(await labels.count()).toBeLessThanOrEqual(6);
  await page.screenshot({ path: `artifacts/agent-labels-far-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(Number(await city.getAttribute('data-agent-occlusion-queries'))).toBeLessThanOrEqual(18);
  expect(errors).toEqual([]); expect(writes).toEqual([]);
});
