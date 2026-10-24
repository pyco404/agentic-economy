import { test, expect } from '@playwright/test';

// Local memory-only city: disposable authoritative identities, no wallet signing or DB writes.
for (const width of [1440, 820, 344, 690]) test(`agent labels remain steady through movement and camera changes at ${width}px`, async ({ page, request }) => {
  test.setTimeout(240000); const errors: string[] = [], writes: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) && r.url().includes('/api/v1/')) writes.push(r.url()); });
  await page.setViewportSize({ width, height: width < 700 ? 780 : 1000 }); await page.goto('/');
  await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'ready', { timeout: 180000 });
  const city = page.getByTestId('city-canvas'), labels = page.locator('.agent-world-label:not([hidden])');
  await expect(city).toHaveAttribute('data-world-state', 'FULLY_ACTIVE');
  const api = process.env.SOCIETY_TEST_API ?? 'http://127.0.0.1:8791';
  const roster = (await (await request.get(`${api}/api/v1/world/agents`)).json()).agents;
  const ids = new Set(roster.map((a: { id: string }) => a.id));
  const allRenderedLabeled = async () => {
    await expect(city).toHaveAttribute('data-world-state', 'FULLY_ACTIVE');
    await expect.poll(async () => Number(await city.getAttribute('data-agent-labels')) - Number(await city.getAttribute('data-rendered-agents'))).toBe(0);
    await expect.poll(() => labels.count()).toBeGreaterThan(0);
    expect(await city.getAttribute('data-agent-occlusion-queries')).toBe('0');
  };
  await allRenderedLabeled();
  for (const id of await labels.evaluateAll(nodes => nodes.map(n => (n as HTMLElement).dataset.agentId))) expect(ids.has(id)).toBe(true);
  const names = await labels.evaluateAll(nodes => nodes.map(n => (n as HTMLElement).dataset.displayName)); expect(new Set(names).size).toBe(names.length);
  const moving = page.locator('.agent-world-label[data-state="walking"]:not([hidden])').first();
  await expect(moving).toBeVisible(); const id = await moving.getAttribute('data-agent-id');
  const tracked = page.locator(`.agent-world-label[data-agent-id="${id}"]`);
  const anchor = await tracked.evaluate(n => `${(n as HTMLElement).dataset.anchorX}:${(n as HTMLElement).dataset.anchorY}`);
  await expect.poll(() => tracked.evaluate(n => `${(n as HTMLElement).dataset.anchorX}:${(n as HTMLElement).dataset.anchorY}`), { timeout: 20000 }).not.toBe(anchor);
  await page.getByRole('button', { name: 'Pause city animation', exact: true }).click();
  await allRenderedLabeled();
  // Track exact DOM identities: camera motion must not replace/discard their label nodes.
  const original = await labels.elementHandles();
  for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect.poll(async () => JSON.parse((await city.getAttribute('data-camera'))!).zoom).toBeLessThan(1.2);
  await allRenderedLabeled(); expect(await labels.count()).toBeGreaterThan(6);
  await page.screenshot({ path: `artifacts/agent-labels-far-${width}.png` });
  const canvas = page.locator('canvas'); await canvas.focus();
  for (const key of ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft']) {
    await page.keyboard.press(key); await page.keyboard.press(key); await allRenderedLabeled();
  }
  for (const node of original) expect(await node.evaluate(el => el.isConnected)).toBe(true);
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await allRenderedLabeled();
  await page.screenshot({ path: `artifacts/agent-labels-close-${width}.png` });
  // Identity and keyboard inspection remain available even in a crowded label layout.
  const chosen = await labels.first().getAttribute('data-agent-id'); const focused = page.locator(`.agent-world-label[data-agent-id="${chosen}"]`);
  await focused.focus(); await expect(focused.locator('small')).toContainText(chosen!); await page.keyboard.press('Enter');
  const profile = page.getByRole('complementary', { name: 'Agent details', exact: true });
  await expect(profile).toBeVisible(); await expect(page.getByTestId('agent-canonical-id')).toHaveText(chosen!);
  await expect(profile).toContainText('Identity type'); await expect(profile).toContainText('Current activity');
  const record = roster.find((a: { id: string }) => a.id === chosen);
  if (record.identity.kind === 'aeco_observed') { await expect(profile).toContainText(record.identity.wallet); await expect(profile).toContainText(record.identity.tokenMint); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]); expect(writes).toEqual([]);
});

test('persistent renderer retains 512 labels through old zoom thresholds, full overlap and offscreen recovery', async ({ page }) => {
  test.setTimeout(180000); await page.goto('/');
  await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'ready', { timeout: 180000 });
  const report = await page.evaluate(async () => {
    const modulePath = '/src/world/agentLabels.ts', threePath = '/node_modules/.vite/deps/three.js';
    const { createAgentLabels } = await import(/* @vite-ignore */ modulePath) as typeof import('../src/world/agentLabels');
    const { OrthographicCamera } = await import(/* @vite-ignore */ threePath) as typeof import('three');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px;pointer-events:none;'; document.body.append(host);
    const camera = new OrthographicCamera(-10, 10, 7.5, -7.5, .1, 100); camera.position.set(0, 20, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const actors = Array.from({ length: 512 }, (_, i) => ({ id: `agt_persistence_${i}`, name: `agt_persistence_${i}`, x: (i % 32) * .05 - .8, z: Math.floor(i / 32) * .05 - .4, state: 'walking' }));
    const renderer = createAgentLabels(host, () => {}, () => {}); renderer.identities(actors);
    const nodes = () => [...host.querySelectorAll<HTMLButtonElement>('.agent-world-label')];
    const blocked = [{ left: 0, top: 0, width: 800, height: 600 }];
    const failures: string[] = [], start = performance.now(); let references: HTMLButtonElement[] = [], firstAnchor = '';
    try {
      for (let frame = 0; frame < 30; frame++) {
        camera.zoom = [.8, 1.19, 1.21, 3.59, 3.61, 5][frame % 6]!; camera.position.x = Math.sin(frame) * .02; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
        renderer.update(frame * .05, camera, actors.map(a => ({ ...a, x: a.x + frame * .001 })), 800, 600, blocked);
        const current = nodes(); if (!frame) { references = current; firstAnchor = current[0]!.style.transform; }
        if (current.length !== 512 || current.some(n => n.hidden)) failures.push(`hidden at frame ${frame}`);
        if (current.some((n, i) => n !== references[i])) failures.push(`replaced at frame ${frame}`);
      }
      const moved = nodes()[0]!.style.transform !== firstAnchor;
      renderer.update(2, camera, actors.map(a => ({ ...a, x: 1000 })), 800, 600);
      const offscreen = nodes().every(n => n.hidden);
      renderer.update(2.1, camera, actors, 800, 600);
      const restored = nodes().length === 512 && nodes().every((n, i) => !n.hidden && n === references[i]);
      return { failures, moved, offscreen, restored, totalMs: performance.now() - start };
    } finally { renderer.dispose(); host.remove(); }
  });
  expect(report.failures).toEqual([]); expect(report.moved).toBe(true); expect(report.offscreen).toBe(true); expect(report.restored).toBe(true);
  console.log(`512-label renderer: ${report.totalMs.toFixed(1)}ms for 32 deterministic updates including initial DOM construction.`);
});
