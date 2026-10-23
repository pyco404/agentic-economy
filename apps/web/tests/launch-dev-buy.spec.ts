import { waitForApplicationReady } from "./startup";
import { test, expect, type Page } from '@playwright/test';

const origin = process.env.LAUNCH_WORKSPACE_URL;
test.skip(!origin, 'Requires the isolated Launchpad API fixture; never runs against a live network.');

/** Server-shaped quote (devnet configuration): exact base units and lamports as the API returns them. */
const quote=(sol:string)=>{
 const budget=BigInt(sol.split('.')[0]||'0')*1_000_000_000n+BigInt((sol.split('.')[1]||'').padEnd(9,'0'));
 if(budget>10_000_000n)return {status:'unavailable',bps:0,budgetLamports:budget.toString(),reason:'Developer Buy exceeds 3.5% of supply. Maximum permitted budget for this quote: 0.01 SOL.'};
 return {status:'available',bps:0,quoteAsset:'SOL',network:'devnet',totalSupply:'1000000000000000',tokenDecimals:6,tokenAmount:(35_000_000_000_000n*budget/10_000_000n).toString(),capTokenAmount:'35000000000000',estimatedQuoteCost:(budget-1n).toString(),pumpFees:'1',maxQuoteCost:budget.toString(),budgetLamports:budget.toString(),maxAllowedQuoteCost:'10000000',priceImpactBps:1,slot:512900000};
};

async function open(page: Page, devBuy: 'available' | 'unavailable') {
  await page.route('**/api/v1/launchpad/capabilities', async (route) => { const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), launchEnabled: true, devBuy: { status: devBuy, maxBps: 350, quoteAssets: ['SOL'], reason: devBuy === 'available' ? null : 'Developer Buy is available only where coin creation is enabled on a verified test network' } } }); });
  await page.route(/\/api\/v1\/launchpad\/dev-buy-quote\?sol=/, (route) => route.fulfill({ json: quote(new URL(route.request().url()).searchParams.get('sol')!) }));
  await page.goto(origin + '/launchpad?source=backend'); await waitForApplicationReady(page);
  await expect(page.getByRole('heading', { name: 'Token details', exact: true })).toBeVisible({ timeout: 30000 });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 820, height: 1180 }, { width: 390, height: 844 }, { width: 344, height: 882 }, { width: 690, height: 829 }])
  test(`token limits and optional Developer Buy at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(180000); await page.setViewportSize(viewport);
    const errors: string[] = [], writes: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => { if (r.method() !== 'GET' && /\/(logo|metadata|launch)$|pinata/.test(r.url())) writes.push(r.url()); });
    let d:Record<string,unknown>|null=null;
    await page.route('**/api/v1/launchpad/drafts',route=>route.request().method()==='GET'?route.fulfill({json:{items:d?[d]:[]}}):route.fulfill({json:d={id:'3d850366-84c9-438b-847f-17bcb084e531',wallet:'11111111111111111111111111111111',version:0,fields:route.request().postDataJSON(),image:null,metadata:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}));
    await page.route('**/api/v1/launchpad/drafts/3d850366-84c9-438b-847f-17bcb084e531',route=>route.fulfill({json:route.request().method()==='PATCH'?d={...d,fields:route.request().postDataJSON().fields,version:Number(d?.version??0)+1}:d}));
    await page.route('**/api/v1/auth/browser/session',route=>route.fulfill({json:{wallet:'11111111111111111111111111111111',sessionExpiresAt:new Date(Date.now()+3600000).toISOString()}}));
    await open(page, 'available');
    const name = page.getByLabel('Token name', { exact: true }), symbol = page.getByLabel('Symbol', { exact: true });

    // Live counters in the protocol's unit (UTF-8 bytes); nothing is truncated or rewritten.
    await name.fill('AECO'); await expect(page.locator('#name-meta')).toContainText('4/32');
    await name.fill('é'.repeat(17));
    await expect(name).toHaveValue('é'.repeat(17)); await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#name-meta')).toContainText('34/32'); await expect(page.locator('#name-error')).toContainText('34/32 bytes');
    await name.fill('Moss Valley'); await expect(name).toHaveAttribute('aria-invalid', 'false');
    await symbol.fill('ABCDEFGHIJKLM'); await expect(page.locator('#symbol-meta')).toContainText('13/13'); await expect(page.locator('#symbol-error')).toHaveCount(0);
    await symbol.fill('ABCDEFGHIJKLMN'); await expect(symbol).toHaveValue('ABCDEFGHIJKLMN'); await expect(page.locator('#symbol-error')).toContainText('14/13');
    await symbol.fill('MOSS');

    // Developer Buy: optional, off by default, capped at 3.5% of supply.
    const group = page.getByRole('group', { name: /Developer Buy/ }), toggle = group.getByRole('switch');
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    const amount=group.getByRole('textbox',{name:'Amount in SOL',exact:true});
    await expect(amount).toHaveValue('');await expect(amount).toHaveAttribute('inputmode','decimal');
    await amount.fill('0.001');await expect(group).toContainText('3,500,000 MOSS');
    await amount.fill('0.01');await expect(group).toContainText('35,000,000 MOSS');
    await expect(group).toContainText('3.5%');await expect(group).toContainText('0.009999999 SOL');
    await expect(page.getByRole('region',{name:'Live token preview'})).toContainText('0.01 SOL maximum');
    await expect(page.locator('.launch-save-status')).toHaveText('Saved');
    await amount.fill('0.010000001');await expect(group.getByRole('alert')).toContainText('Maximum permitted budget');
    await expect(page.locator('form').getByRole('button',{name:'Create Coin',exact:true})).toBeDisabled();
    await amount.fill('0.0000000001');await expect(amount).toHaveAttribute('aria-invalid','true');
    await expect(group.getByRole('alert')).toContainText('nine decimal');
    await amount.fill('0.000000001');await expect(group).toContainText('3.5 MOSS');
    await amount.fill('');await expect(amount).toHaveAttribute('aria-invalid','false');
    await toggle.uncheck();await expect(amount).toHaveCount(0);
    await expect(page.getByRole('region',{name:'Live token preview'})).not.toContainText('Developer Buy');
    await toggle.check();await expect(amount).toHaveValue('');
    await amount.fill('0.001');await expect(group).toContainText('3,500,000 MOSS');
    await expect(page.locator('.launch-save-status')).toHaveText('Saved');
    // Restore the exact entered budget from the wallet-owned saved draft.
    await expect(page.getByRole('button',{name:'My Drafts',exact:true})).toHaveCount(0);
    await page.evaluate(()=>{history.pushState(null,'','/explore?source=backend');window.dispatchEvent(new PopStateEvent('popstate'));});
    await expect(page).toHaveURL(/\/explore/);await page.goBack();
    await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state','ready');
    await expect(amount).toHaveValue('0.001');
    expect(writes).toEqual([]);

    await group.scrollIntoViewIfNeeded();
    await group.screenshot({path:`artifacts/launch-sol-budget-card-${viewport.width}.png`});
    await page.screenshot({path:`artifacts/launch-sol-budget-form-${viewport.width}.png`});
    if (viewport.width <= 820) {
      const close = page.getByRole('button', { name: 'Close page and view city', exact: true });
      const size = await close.boundingBox();
      expect(size?.width).toBeGreaterThanOrEqual(44); expect(size?.height).toBeGreaterThanOrEqual(44);
      expect(await page.locator('.page-overlay-controls').evaluate(n => getComputedStyle(n).position)).toBe('static');
      await page.locator('#launch-logo-title').scrollIntoViewIfNeeded();
      const logo = await page.locator('#launch-logo-title').boundingBox(), button = await close.boundingBox();
      expect(!!logo && !!button && button.y < logo.y && button.y + button.height <= logo.y).toBe(true);
      await page.locator('.page-main').evaluate(n => { n.scrollTop = 0; });
      await expect(close).toBeInViewport();
    }
    await page.screenshot({ path: `artifacts/launch-dev-buy-${viewport.width}.png`, fullPage: true });
    expect(await page.locator('main').evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
    expect(writes).toEqual([]); // background text saves never upload artwork
    expect(errors).toEqual([]);
  });

test('Developer Buy stays off and explains why where it is unavailable', async ({ page }) => {
  test.setTimeout(120000);
  await open(page, 'unavailable');
  const group = page.getByRole('group', { name: /Developer Buy/ });
  await expect(group.getByRole('switch')).toBeDisabled(); await expect(group.getByRole('switch')).not.toBeChecked();
  await expect(group.getByRole('note')).toContainText('verified test network');
});
