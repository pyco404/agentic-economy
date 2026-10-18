import { expect,test } from '@playwright/test';
for(const width of [1440,820,390])test(`Explore discovery sections and full-list navigation at ${width}px`,async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:width===390?844:1000});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?source=fixtures#explore');
 const highlights=page.locator('.explore-spotlights');await expect(highlights.locator('section')).toHaveCount(6);
 const newest=page.getByRole('region',{name:'New launches',exact:true});await expect(newest.getByRole('link')).toHaveCount(1);await expect(newest).toContainText('Demo Stonewright Co');await expect(newest).toContainText('Demo');
 for(const name of ['Hot volume','Top market cap','Graduating soon','Most holders']){
  const panel=page.getByRole('region',{name,exact:true});await expect(panel).toContainText('Data unavailable');await expect(panel.getByRole('link')).toHaveCount(0);
  expect(await panel.innerText()).not.toMatch(/\$\d|\d+%/);
 }
 await expect(page.getByRole('region',{name:'Most active agents',exact:true})).toContainText('3');
 await highlights.scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/explore-spotlights-${width}.png`,fullPage:true});
 expect(await page.locator('main').evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
 await page.getByRole('button',{name:'See all most active agents',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Sort tokens'})).toHaveValue('agents');await expect(page.getByRole('heading',{name:'All launches',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'See all new launches',exact:true}).click();await expect(page.getByRole('combobox',{name:'Sort tokens'})).toHaveValue('newest');
 await newest.getByRole('link').click();await expect(page.locator('.token-header')).toContainText('Demo Stonewright Co');
 await page.getByRole('button',{name:'All tokens',exact:true}).click();await expect(newest).toBeVisible();
 await page.getByRole('textbox',{name:'Search tokens'}).fill('No matching community');await expect(highlights).toHaveCount(0);await expect(page.getByRole('heading',{name:'Search results',exact:true})).toBeVisible();await expect(page.getByText('No tokens match this view.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(highlights).toBeVisible();
 expect(errors).toEqual([]);
});
test('unverified launch records do not appear in discovery highlights',async({page})=>{
 test.setTimeout(120000);
 await page.route('**/api/v1/launches/*',route=>route.fulfill({status:503,json:{error:{message:'Verification unavailable'}}}));
 await page.goto('/?source=backend#explore');await expect(page.locator('.discovery-error')).toBeVisible();
 await expect(page.locator('.explore-spotlights a')).toHaveCount(0);await expect(page.getByRole('region',{name:'New launches',exact:true})).toContainText('could not be verified');
 await expect(page.getByRole('region',{name:'Hot volume',exact:true})).toContainText('Data unavailable');
});
