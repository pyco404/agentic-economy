import { expect, test, type Page } from '@playwright/test';

test.use({ video: { mode: 'on', size: { width: 1440, height: 1000 } } });
async function holdOuterWorld(page: Page) {
  await page.addInitScript(() => {
    const Native = window.Worker, pending: { worker: Worker; data: unknown }[] = [];
    let released = false;
    (window as any).__heldWorld = () => pending.length;
    (window as any).__releaseWorld = () => {
      released = true;
      for (const message of pending.splice(0)) message.worker.dispatchEvent(new MessageEvent('message', { data: message.data }));
    };
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('scenery.worker')) this.addEventListener('message', event => {
          if (event.data.kind === 'scenery' && !released) { event.stopImmediatePropagation(); pending.push({ worker: this, data: event.data }); }
        });
      }
    };
  });
}
for (const entry of [
  { path: '/', width: 1440, height: 1000 },
  { path: '/launchpad', width: 390, height: 844 },
  { path: '/communities', width: 768, height: 1024 },
]) test(`whole application waits for outer terrain and reveals once at ${entry.path} ${entry.width}px`, async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize(entry); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await holdOuterWorld(page);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${entry.path}?source=backend`, { waitUntil: 'domcontentloaded' });
  const startup = page.getByTestId('application-startup'), city = page.getByTestId('city-canvas');
  await expect(page.getByTestId('world-loading')).toBeVisible();
  await expect(startup).toHaveAttribute('data-startup-state', 'preparing');
  await expect(page.locator('.application-shell')).toHaveAttribute('inert', '');
  await expect(page.locator('.topbar')).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__heldWorld()), { timeout: 120000 }).toBeGreaterThan(0);
  await expect(city).toHaveAttribute('data-world-state', 'BUILDING_WORLD');
  await expect(startup).toHaveAttribute('data-startup-state', 'preparing');
  await page.screenshot({ path: `artifacts/startup-welcome-${entry.width}.png` });
  await page.locator('canvas').evaluate(node => { (window as any).__startupCanvas = node; });
  await page.evaluate(() => (window as any).__releaseWorld());
  await expect(startup).toHaveAttribute('data-startup-state', 'revealing', { timeout: 120000 });
  await expect(page.locator('.application-shell')).toHaveAttribute('inert', '');
  await expect(page.locator('.topbar')).not.toBeVisible();
  const builds = await city.getAttribute('data-geometry-builds');
  await page.screenshot({ path: `artifacts/startup-reveal-${entry.width}.png` });
  await expect(startup).toHaveAttribute('data-startup-state', 'ready', { timeout: 120000 });
  await expect(page.locator('.application-shell')).not.toHaveAttribute('inert');
  await expect(page.getByTestId('world-loading')).not.toBeVisible();
  expect(new URL(page.url()).pathname).toBe(entry.path);
  const timings = JSON.parse((await city.getAttribute('data-world-timings'))!);
  const application = JSON.parse((await startup.getAttribute('data-startup-timings'))!);
  for (const section of ['coreReady', 'outerTerrainReady', 'railwaysReady', 'waterwaysReady', 'STATIC_WORLD_READY', 'gpuReady']) expect(timings[section]).toBeLessThanOrEqual(timings.revealStarted);
  expect(application.assetsReady).toBeLessThanOrEqual(timings.revealStarted);
  expect(timings.revealFinished - timings.revealStarted).toBeGreaterThanOrEqual(2600);
  expect(timings.revealFinished - timings.revealStarted).toBeLessThan(3800);
  expect(await city.getAttribute('data-geometry-builds')).toBe(builds);
  expect(JSON.parse((await city.getAttribute('data-landmass'))!).rectangleFill).toBeLessThan(.85);
  expect(JSON.parse((await city.getAttribute('data-mirrored-railway'))!).mode).toBe('mirrored');
  const camera = JSON.parse((await city.getAttribute('data-camera'))!);
  await page.screenshot({ path: `artifacts/startup-complete-${entry.width}.png` });
  await test.info().attach('startup-timings', { body: JSON.stringify({ timings, application }, null, 2), contentType: 'application/json' });
  await page.getByRole('link', { name: 'About Agentic Economy', exact: true }).press('Enter');
  await expect(page.locator('#about-title')).toBeVisible();
  await page.goBack(); await expect(page.locator('.app')).toHaveAttribute('data-page', entry.path === '/' ? 'world' : entry.path.slice(1));
  await page.goForward(); await expect(page.locator('#about-title')).toBeVisible();
  await expect(startup).toHaveAttribute('data-startup-state', 'ready');
  expect(await page.locator('canvas').evaluate(node => node === (window as any).__startupCanvas)).toBe(true);
  expect(await city.getAttribute('data-geometry-builds')).toBe(builds);
  const after = JSON.parse((await city.getAttribute('data-camera'))!);
  expect(after.zoom).toBe(camera.zoom);
  for (const key of ['position', 'target']) after[key].forEach((n: number, i: number) => expect(n).toBeCloseTo(camera[key][i], 8));
  expect(errors).toEqual([]);
});

test('direct roadmap and cached refresh keep their route with reduced motion', async ({ page }) => {
  test.setTimeout(180000); await page.emulateMedia({ reducedMotion: 'reduce' });
  for (let visit = 0; visit < 2; visit++) {
    if (visit) await page.reload({ waitUntil: 'domcontentloaded' });
    else await page.goto('/roadmap?source=fixtures#roadmap-title', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'ready', { timeout: 90000 });
    await expect(page.locator('#roadmap-title')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/roadmap'); expect(new URL(page.url()).hash).toBe('#roadmap-title');
    const timings = JSON.parse((await page.getByTestId('city-canvas').getAttribute('data-world-timings'))!);
    expect(timings.revealFinished - timings.revealStarted).toBeLessThan(1000);
  }
});

test('optional dashboard, wallet restoration and WebSocket failures do not block prepared world', async ({ page }) => {
  test.setTimeout(180000);
  await page.route('**/api/v1/treasury', route => route.fulfill({ status: 503, json: { error: { message: 'Treasury unavailable' } } }));
  await page.route('**/api/v1/launchpad/capabilities', route => route.abort());
  await page.routeWebSocket('**/api/v1/ws', socket => socket.close());
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/world/bootstrap', async route => { await held; await route.continue(); });
  await page.goto('/?source=backend', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.load-error')).toContainText('Treasury unavailable');
  await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'preparing');
  release();
  await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'ready', { timeout: 120000 });
  await expect(page.getByText('The city is ready. Dashboard information is temporarily unavailable.')).toBeVisible();
});

test('unavailable backend releases application into explicit error without fabricating a city', async ({ page }) => {
  await page.route('**/api/v1/**', route => route.abort());
  await page.goto('/launchpad?source=backend', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'degraded');
  await expect(page.getByTestId('world-loading')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expect(page.getByTestId('city-canvas')).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe('/launchpad');
});

test('WebGL initialization failure keeps launch page usable', async ({ page }) => {
  await page.addInitScript(() => {
    const context = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: any[]) {
      if (String(args[0]).startsWith('webgl')) return null;
      return (context as any).apply(this, args);
    } as typeof context;
  });
  await page.goto('/launchpad?source=fixtures', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'degraded');
  await expect(page.getByRole('region', { name: 'Live token preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Close page and view city', exact: true }).press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: '3D rendering is unavailable' })).toBeVisible();
});

test('failed optional branding assets use fallbacks and do not trap startup', async ({ page }) => {
  test.setTimeout(120000); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/fonts/*.woff2', route => route.abort());
  await page.route('**/aeco-website-logo.png', route => route.abort());
  await page.goto('/about?source=fixtures', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'ready', { timeout: 90000 });
  await expect(page.locator('#about-title')).toBeVisible();
});

test('stalled required scenery has an explicit escape without showing partial geometry', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const timeout = window.setTimeout.bind(window);
    // Exercise the 30-second escape hatch without making this test wait 30s.
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: any[]) => timeout(handler, delay === 30000 ? 200 : delay, ...args)) as typeof window.setTimeout;
  });
  await holdOuterWorld(page);
  await page.goto('/launchpad?source=fixtures', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Taking longer than expected. Continue without 3D' }).click();
  await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'degraded');
  await expect(page.getByTestId('city-canvas')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Live token preview' })).toBeVisible();
});

test('failed WebSocket and session restoration do not hold authenticated-route presentation', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('**/api/v1/auth/browser/session', route => route.fulfill({ status: 503, json: { error: { message: 'Session unavailable' } } }));
  await page.routeWebSocket('**/api/v1/ws', socket => socket.close());
  await page.goto('/launchpad?source=backend', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'ready', { timeout: 90000 });
  await expect(page.getByRole('region', { name: 'Live token preview' })).toBeVisible();
  await expect(page.locator('form').getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible();
});

test('remaining direct routes each initialize the shared world without changing destination', async ({ page }) => {
  test.setTimeout(300000); await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const path of ['/explore', '/agent-studio', '/economy', '/treasury', '/about']) {
    await page.goto(path + '?source=fixtures', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'ready', { timeout: 90000 });
    expect(new URL(page.url()).pathname).toBe(path);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByTestId('city-canvas')).toHaveAttribute('data-world-state', 'FULLY_ACTIVE');
  }
});
