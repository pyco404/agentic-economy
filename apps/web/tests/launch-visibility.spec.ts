import {expect,test} from '@playwright/test';
for(const supported of [true,false])test(`disconnected launch form stays visible with ${supported?'current':'legacy'} backend`,async({page})=>{
 await page.setViewportSize({width:390,height:844});
 if(!supported)await page.route('**/api/v1/launchpad/capabilities',route=>route.fulfill({status:404,contentType:'application/json',body:'{"error":{"message":"Unavailable"}}'}));
 const writes:string[]=[];page.on('request',r=>{if(r.method()!=='GET'&&/\/api\/v1\//.test(r.url()))writes.push(r.url());});
 await page.goto('/launchpad?source=backend');
 await expect(page.getByRole('heading',{name:'Token details',exact:true})).toBeVisible();
 await expect(page.getByLabel('Token name',{exact:true})).toBeEditable();
 await expect(page.getByRole('button',{name:'Upload Token Logo',exact:true})).toBeVisible();
 const connect=page.locator('form').getByRole('button',{name:'Connect wallet',exact:true});
 await expect(connect).toBeVisible();await expect(connect).toBeEnabled();
 // Empty/invalid details must never prevent opening wallet selection.
 await page.getByLabel('Symbol',{exact:true}).fill('BAD TICKER');
 await connect.click();await expect(page.getByRole('dialog')).toContainText('Connect your wallet');
 await page.getByRole('button',{name:'Close wallet selection'}).click();
 await expect(page.getByLabel('Symbol',{exact:true})).toHaveValue('BAD TICKER');
 await expect(page.getByRole('button',{name:/^Create (a )?draft$/i})).toHaveCount(0);
 expect(writes).toEqual([]);
});
