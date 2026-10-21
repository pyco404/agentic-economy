import {test,expect} from '@playwright/test';
import {waitForApplicationReady} from './startup';

// Uses only the isolated in-memory demo API. The historical message is a mocked
// envelope for an existing mock-chain-confirmed token, never a real launch claim.
for(const width of [1440,390])test(`platform branding and historical activity at ${width}px`,async({page,request})=>{
 test.setTimeout(240000);await page.setViewportSize({width,height:1000});
 const communities=await (await request.get('http://127.0.0.1:8796/api/v1/communities')).json();
 const community=communities.items[0];
 const result=await (await request.get(`http://127.0.0.1:8796/api/v1/launches/${community.launchId}`)).json();
 expect(result.launch.status).toBe('confirmed');
 const original=`${community.name} ($${community.symbol}) launched on Pump.fun through Agentic Economy`;
 const historical=Object.freeze({id:'evt_BrandingHistory',seq:1000000,tick:0,at:new Date().toISOString(),type:'launch.confirmed',summary:original,agentId:null,buildingId:null,communityId:community.id,data:{mint:community.mint,signature:result.launch.signature}});
 await page.route('**/api/v1/activities*',async route=>{const response=await route.fetch();const body=await response.json();await route.fulfill({response,json:{...body,items:[historical,...body.items]}});});
 await page.goto('/explore?source=backend');await waitForApplicationReady(page);
 await page.locator('.discovery-card').filter({hasText:community.name}).first().click();
 const life=page.locator('.surface').filter({has:page.getByRole('heading',{name:'Life in the city.',exact:true})});
 const expected=`${community.name} ($${community.symbol}) launched on Agentic Economy.`;
 await expect(life).toContainText(expected);await expect(life).not.toContainText('Pump.fun');
 expect(historical.summary).toBe(original);
 // No provenance is invented for the legacy demo record.
 await expect(page.locator('.token-header .launch-origin-tag')).toContainText('origin unverified');
 const external=page.locator('.token-links details');await expect(external).not.toHaveAttribute('open','');
 await external.locator('summary').click();
 const protocol=external.getByRole('link',{name:'Pump.fun · external protocol ↗'});
 await expect(protocol).toHaveAttribute('href',community.links.pumpFun);
 await expect(protocol).toHaveAttribute('target','_blank');
 await external.locator('summary').click();
 await life.scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/public-branding-activity-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Explore Community',exact:true}).click();
 await expect(page.getByRole('dialog',{name:`${community.name} community`,exact:true})).toContainText(expected);
 await page.getByRole('button',{name:'Back to communities',exact:true}).click();
 const navigate=async(name:string)=>{
  const nav=page.locator('.topbar .nav');
  if(await nav.isVisible())await nav.getByRole('link',{name,exact:true}).click();
  else{await page.getByRole('button',{name:'Toggle navigation'}).click();await page.getByRole('dialog',{name:'Navigation',exact:true}).getByRole('link',{name,exact:true}).click();}
 };
 for(const route of ['Launch','Economy','Treasury','Agent Studio','Roadmap']){
  await navigate(route);
  expect(await page.locator('main').innerText()).not.toMatch(/Pump\.fun|Pumpfun|PumpSwap/i);
 }
 await page.getByRole('link',{name:'About Agentic Economy',exact:true}).click();
 expect(await page.locator('.about-page').innerText()).not.toMatch(/Pump\.fun|Pumpfun|PumpSwap/i);
 expect(await page.locator('main').evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
});
