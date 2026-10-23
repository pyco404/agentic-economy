import {expect,test} from '@playwright/test';
import {waitForApplicationReady} from './startup';
for(const viewport of [{width:1440,height:1000},{width:820,height:1180},{width:390,height:844}]){
 test(`SOL-only coin preparation and accessible wallet connection at ${viewport.width}px`,async({page})=>{
  test.setTimeout(360000);await page.setViewportSize(viewport);
  // A stale API capability must never reintroduce the removed launch option.
  await page.route('**/api/v1/launchpad/capabilities',async route=>{
   const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),quotes:{SOL:'draft',USDC:'draft',AECO:'future'}}});
  });
  const writes:string[]=[];page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/launchpad/'))writes.push(r.url());});
  await page.goto('/launchpad?source=backend');await waitForApplicationReady(page);
  const pair=page.getByRole('status',{name:'Trading pair preview'});
  await expect(pair).toContainText('TOKEN / SOL');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.locator('form')).not.toContainText('USDC');
  await expect(page.locator('form')).not.toContainText('AECO');
  await page.getByLabel('Token name',{exact:true}).fill('Home');
  await page.getByLabel('Symbol',{exact:true}).fill('HOME');
  await expect(pair).toContainText('HOME / SOL');
  await expect(page.getByText('Tokens are paired with Solana.')).toBeVisible();
  await expect(page.getByRole('switch')).not.toBeChecked();
  await expect(page.getByText(/Enter the amount of SOL/)).toBeVisible();
  await page.locator('form').getByRole('button',{name:'Connect wallet',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Connect your wallet');
  await page.getByRole('button',{name:'Close wallet selection'}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`artifacts/sol-only-${viewport.width}.png`});
  expect(writes).toEqual([]);
 });
}
