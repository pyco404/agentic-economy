import {test,expect} from '@playwright/test';
import {waitForApplicationReady} from './startup';

test('community identity, image errors, registered HQ and Explore links',async({page,request})=>{
 page.on('pageerror',error=>console.log('Community UI error:',error.message));
 test.setTimeout(240000);await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const communities=(await (await request.get('http://127.0.0.1:8796/api/v1/communities')).json()).items;
 const [community,missing]=communities;
 const artwork=(id:string)=>id===community.id?'https://artwork.example/logo.png':id===missing.id?'https://artwork.example/missing.png':null;
 // Browser-only artwork fixtures over immutable mock-chain launch records. No writes/uploads.
 await page.route('**/api/v1/communities*',async route=>{const response=await route.fetch(),body=await response.json();await route.fulfill({response,json:{...body,items:body.items.map((c:any)=>({...c,imageUri:artwork(c.id)}))}});});
 await page.route('**/api/v1/launches/*',async route=>{const response=await route.fetch(),body=await response.json();if(!body.launch)return route.fulfill({response});const launch=body.launch;await route.fulfill({response,json:{...body,launch:{...launch,draft:{...launch.draft,imageUri:artwork(launch.communityId)}}}});});
 await page.routeWebSocket('**/api/v1/ws',client=>{const server=client.connectToServer();client.onMessage(m=>server.send(m));server.onMessage(m=>{if(typeof m!=='string')return client.send(m);const e=JSON.parse(m);if(e.type==='community.updated')e.data.community={...e.data.community,imageUri:artwork(e.data.community.id)};client.send(JSON.stringify(e));});});
 await page.route('https://artwork.example/logo.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWNYtbuDIGIYVcQwCIMAAJ5MFWCkU82kAAAAAElFTkSuQmCC','base64')}));
 await page.route('https://artwork.example/missing.png',route=>route.fulfill({status:404,body:'Not found'}));
 // UI integration stubs only Three.js rendering. Community/API state and routing stay real.
 // This checks controller focus arguments, not GPU rendering or camera gestures.
 await page.route('**/src/world/City.tsx*',route=>route.fulfill({contentType:'application/javascript',body:`
 import React from '/node_modules/.vite/deps/react.js';const {forwardRef,useEffect,useImperativeHandle,createElement}=React;
 export const City=forwardRef(function City(p,ref){
  useEffect(()=>{p.onReadyChange?.(true);p.onPhaseChange?.('FULLY_ACTIVE');},[]);
  useImperativeHandle(ref,()=>({focus:(x,z)=>{window.__communityFocus={x,z};},zoom:()=>{},reset:()=>{},rotate:()=>{},railway:()=>{},follow:()=>{}}),[]);
  return createElement('div',{'data-testid':'city-canvas','data-world-state':'FULLY_ACTIVE'},createElement('canvas'));
 });`}));
 await page.goto('/communities?source=backend');await waitForApplicationReady(page);
 const canvas=page.locator('canvas');await canvas.evaluate(n=>(window as any).__communityCanvas=n);
 const card=page.getByRole('article',{name:`${community.name} community`,exact:true});
 await expect(card.getByRole('img',{name:`${community.name} token logo`,exact:true})).toBeVisible();
 await expect(page.getByRole('article',{name:`${missing.name} community`,exact:true}).getByRole('img',{name:`${missing.name} logo unavailable`,exact:true})).toBeVisible();
 expect(await card.locator('img').evaluate(n=>getComputedStyle(n).objectFit)).toBe('contain');
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.locator('main').evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);}
 await page.getByRole('textbox',{name:'Search communities'}).fill(community.symbol);await expect(page.locator('.community-card')).toHaveCount(1);
 await page.getByRole('combobox',{name:'Filter communities'}).selectOption('headquarters');await expect(card).toBeVisible();
 await card.getByRole('button',{name:'Explore Community',exact:true}).click();
 const detail=page.getByRole('dialog',{name:`${community.name} community`,exact:true});
 await expect(detail.locator('.community-mint')).toContainText(community.mint);
 expect((await detail.locator('.community-detail-section').allTextContents()).join(' ')).not.toContain('simulation tick');
 await detail.getByRole('button',{name:'View Token',exact:true}).click();await expect(page).toHaveURL(new RegExp('/explore/'+community.mint));
 await page.getByRole('button',{name:'Explore Community',exact:true}).click();await expect(detail).toBeVisible();
 await detail.getByRole('button',{name:'View Headquarters',exact:true}).click();
 const building=page.getByRole('complementary',{name:'Building details'});await expect(building).toHaveAttribute('data-building-id',community.headquartersBuildingId);await expect(building).toContainText(community.name);
 expect(await canvas.evaluate(n=>n===(window as any).__communityCanvas)).toBe(true);
 const focused=await page.evaluate(()=>(window as any).__communityFocus);expect(Number.isFinite(focused.x)&&Number.isFinite(focused.z)).toBe(true);
});
