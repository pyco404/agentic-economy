import {test,expect} from '@playwright/test';
import {waitForApplicationReady} from './startup';
const fixtureMarket=(mint:string)=>({mint,status:'available',reason:null,network:'mainnet-beta',fetchedAt:'2026-10-18T08:00:00Z',sourceAsOf:null,source:'dexscreener',sourceUrl:`https://dexscreener.com/solana/${mint}`,pairAddress:mint,quoteAsset:'USDC',priceUsd:0.25,volume24hUsd:1200,marketCapUsd:24000,fdvUsd:24000,liquidityUsd:600,priceChange24h:-2,holders:null,buys24h:12,sells24h:4,graduation:'graduated',graduationProgress:null,holderIndex:{source:'helius_das',indexedSlot:100,fetchedAt:'2026-10-18T08:00:00Z',complete:false,scannedAccounts:2,owners:[{address:'11111111111111111111111111111111',amount:'30000000000000'}],reason:'Index changed during enumeration; no exact count is claimed.'},indexedMetadata:{source:'helius_das',mint,name:'Indexed test token',symbol:'TEST',fetchedAt:'2026-10-18T08:00:00Z'}});
for(const width of [1440,390])test(`attributed Explore metrics, existing sections and history at ${width}px (mocked providers)`,async({page})=>{
 test.setTimeout(180000);await page.setViewportSize({width,height:width===390?844:1000});await page.emulateMedia({reducedMotion:'reduce'});
 let heliusRequests=0;page.on('request',r=>{if(new URL(r.url()).hostname.endsWith('helius-rpc.com'))heliusRequests++;});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // Synthetic production-read envelopes test UI integration only. No actual on-chain,
 // wallet, provider, launch, receipt or payout verification is claimed by this test.
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.includes('/token-markets/')){
   const mint=url.pathname.split('/')[4]!;
   if(url.pathname.endsWith('/history'))return route.fulfill({json:{mint,pairAddress:mint,source:'geckoterminal',fetchedAt:'2026-10-18T08:00:00Z',reason:null,candles:[{time:100,open:1,high:2,low:1,close:1.5,volume:10},{time:200,open:1.5,high:3,low:1,close:2.5,volume:20}]}});
   return route.fulfill({json:fixtureMarket(mint)});
  }
  const response=await route.fetch();let body;try{body=await response.json();}catch{return route.fulfill({response});}
  if(body&&typeof body==='object'){if('mode'in body)body.mode='production';if(body.launch)body.launch.mode='production';}
  return route.fulfill({response,json:body});
 });
 await page.goto('/?source=backend#explore');await waitForApplicationReady(page);
 const hot=page.getByRole('region',{name:'Hot volume',exact:true});await expect(hot.getByRole('link').first()).toBeVisible({timeout:60000});await expect(hot).toContainText('1,200');
 await expect(page.locator('.explore-spotlights section')).toHaveCount(6);
 await expect(page.getByRole('region',{name:'Most holders',exact:true})).toContainText('Data unavailable');
 await page.getByRole('combobox',{name:'Filter quote asset'}).selectOption('USDC');await expect(page.locator('.discovery-card').first()).toContainText('/USDC');
 await page.getByRole('button',{name:'See all hot volume',exact:true}).click();await expect(page.getByRole('combobox',{name:'Sort tokens'})).toHaveValue('volume');
 await page.locator('.discovery-card').first().click();const market=page.getByRole('region',{name:'Token market data'});
 await expect(market).toContainText('FDV:');await expect(market).toContainText('DEX Screener');await expect(market).toContainText('Holders: Unavailable');await expect(market.getByRole('img',{name:'Hourly USD closing prices from GeckoTerminal'})).toBeVisible();await expect(market).toContainText('GeckoTerminal');
 await market.getByText('Holder index · Helius',{exact:true}).click();await expect(market).toContainText('Partial account enumeration');await expect(market).toContainText('not a ranking');await expect(market).toContainText('Indexed test token');expect(heliusRequests).toBe(0);
 await market.scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/token-market-mocked-${width}.png`,fullPage:true});
 expect(await page.locator('main').evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);expect(errors).toEqual([]);
});
test('demo Explore never fetches mainnet markets or displays invented values',async({page})=>{
 const requests:string[]=[];page.on('request',r=>{if(r.url().includes('/token-markets/'))requests.push(r.url());});await page.goto('/?source=fixtures#explore');await waitForApplicationReady(page);await expect(page.locator('.discovery-card').first()).toBeVisible();await page.locator('.discovery-card').first().click();await expect(page.getByRole('region',{name:'Token market data'})).toContainText('Unavailable');expect(requests).toEqual([]);
});
test('incomplete combined-venue coverage stays unavailable and explained during backfill',async({page})=>{
 test.setTimeout(180000);await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.includes('/token-markets/')){
   const mint=path.split('/')[4]!;
   if(path.endsWith('/history'))return route.fulfill({json:{mint,pairAddress:mint,source:'geckoterminal',fetchedAt:null,reason:'Unavailable',candles:[]}});
   if(path.endsWith('/trades'))return route.fulfill({json:{mint,network:'mainnet-beta',status:'unavailable',reason:'Trade history is reconciling',source:null,slot:null,complete:false,fetchedAt:null,trades:[]}});
   return route.fulfill({json:{...fixtureMarket(mint),quoteAsset:'SOL',source:'solana_rpc',sourceUrl:null,volume24hUsd:null,buys24h:null,sells24h:null,transactions24h:null,activityCoverage:{complete:false,durable:true,through:null,reason:'Trade history is reconciling; incomplete totals are not displayed.'}}});
  }
  const response=await route.fetch();let body;try{body=await response.json();}catch{return route.fulfill({response});}if(body&&typeof body==='object'){if('mode'in body)body.mode='production';if(body.launch)body.launch.mode='production';}return route.fulfill({response,json:body});
 });
 await page.goto('/?source=backend#explore');await waitForApplicationReady(page);await page.locator('.discovery-card').first().click();const panel=page.getByRole('region',{name:'Token market data'});await expect(panel).toBeVisible();await expect(panel.locator('.market-metrics > div').filter({hasText:'Trading volume'})).toContainText('Unavailable');await expect(panel).toContainText('Transactions: Unavailable');await panel.getByText('Market data sources',{exact:true}).click();await expect(panel).toContainText('incomplete totals are not displayed');await expect(panel).not.toContainText('24-hour on-chain history reconciled.');
});
