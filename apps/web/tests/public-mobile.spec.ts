import { expect, test } from '@playwright/test';
import { waitForApplicationReady } from './startup';

// Run against a production build or the actual public origin, never a Vite development build.
test('public mobile navigation, clean world controls and persistent city', async ({ page }, info) => {
  test.skip(process.env.PUBLIC_UI_VERIFY !== '1', 'Requires a production build/public-origin verification run');
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Optional local candidate replaces frontend bytes only. API and WSS stay on the real production service.
  const candidate = process.env.PUBLIC_UI_CANDIDATE;
  if (candidate) await page.route('https://useaeco.xyz/**', async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: candidate + url.pathname + url.search });
    await route.fulfill({ response });
  });
  await page.setViewportSize({ width: 344, height: 882 });
  await page.goto('/');
  await waitForApplicationReady(page);
  await page.locator('canvas').evaluate(node => { (window as any).__publicMobileCanvas = node; });
  const forbidden = /(?:production|staging)\s*·\s*connected|Backend demo|Simulation tick|\bTick \d+|Persisted buildings|\d+ FPS|\d+ draw calls|Canonical ID/i;
  for (const [width, height] of [[344, 882], [690, 829], [820, 1180], [1440, 1000]] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('.demo-badge, [data-testid="connection-status"]')).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toMatch(forbidden);
    const wallet = page.locator('.topbar .wallet-button');
    await expect(wallet).toBeVisible();
    if (width <= 850) {
      const toggle = page.getByRole('button', { name: 'Toggle navigation' });
      for (const control of [wallet, toggle, page.locator(".topbar .brand")]) {
        const box = (await control.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(await control.evaluate(node => { const r = node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
      }
      await wallet.click();await expect(page.getByRole('dialog', {name:'Connect your wallet'})).toBeVisible();
      await page.getByRole('button', {name:'Close wallet selection'}).click();
      await expect(page.getByRole('button', { name: 'Rotate camera', exact:true })).not.toBeVisible();
      const more=page.getByRole('button',{name:'More world controls'});
      await more.click();await expect(more).toHaveAttribute('aria-expanded','true');
      await expect(page.getByRole('button', {name:'Rotate camera',exact:true})).toBeVisible();
      const toolbar = page.getByRole('group', {name:'Camera controls',exact:true});
      const toolbarBox = (await toolbar.boundingBox())!;
      for (const control of await toolbar.locator('button:visible').all()) {
        const box = (await control.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(toolbarBox.x);
        expect(box.x + box.width).toBeLessThanOrEqual(toolbarBox.x + toolbarBox.width);
        expect(box.width).toBe(44);expect(box.height).toBe(44);
      }
      await more.press('Escape');await expect(more).toHaveAttribute('aria-expanded','false');
      await page.screenshot({path:info.outputPath(`world-${width}.png`)});
      await toggle.click();const dialog=page.getByRole('dialog',{name:'Navigation',exact:true});
      await expect(dialog).toBeVisible();await expect(dialog.getByRole('link',{name:'World',exact:true})).toHaveCount(0);
      for (const link of await dialog.locator('a').all()) { const box=(await link.boundingBox())!; expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44); }
      await page.screenshot({path:info.outputPath(`navigation-${width}.png`)});
      await page.keyboard.press('Escape');await expect(toggle).toBeFocused();
    } else {
      await expect(page.locator('.topbar .nav')).toBeVisible();
      await expect(page.getByRole('button',{name:'Toggle navigation'})).not.toBeVisible();
      await expect(page.getByRole('button',{name:'Rotate camera',exact:true})).toBeVisible();
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await page.setViewportSize({width:344,height:882});
  for (const [name,path] of [['Launch','/launchpad'],['Explore','/explore'],['Communities','/communities'],['Roadmap','/roadmap'],['About the world','/about']] as const) {
    await page.getByRole('button',{name:'Toggle navigation'}).click();
    await page.getByRole('dialog',{name:'Navigation',exact:true}).getByRole('link',{name,exact:true}).click();
    await expect(page).toHaveURL(new RegExp(path+'$'));
    await expect(page.getByRole('dialog',{name:'Navigation',exact:true})).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toMatch(forbidden);
    expect(await page.locator('canvas').evaluate(node => node === (window as any).__publicMobileCanvas)).toBe(true);
  }
  await page.goBack();await page.goForward();
  expect(await page.locator('canvas').evaluate(node => node === (window as any).__publicMobileCanvas)).toBe(true);
  expect(errors).toEqual([]);
  await info.attach('verification-scope',{body:JSON.stringify({candidate:!!candidate,realProductionAPI:true,physicalDevice:false,transactions:0,viewports:[344,690,820,1440],pageErrors:errors}),contentType:'application/json'});
});
