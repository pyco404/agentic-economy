import {test,expect} from '@playwright/test';

// UI integration only: synthetic envelopes in the backend's exact shapes. Chain reading itself is verified
// by the server tests (real devnet trade fixture) and read-only devnet checks, not by this test.
const sig='3ovv3YnP4xmgy5LiAwroV7T6CLMqRuqLfhZ85V2SdJhZukyMJrQ9cDNS9q6m8rY7vrXZLcRg8Bwen5M1CBUUpCej';
const chainMarket=(mint:string)=>({mint,status:'unavailable',reason:'Public market providers do not cover testing-network launches. On-chain holders and graduation progress are shown.',network:'devnet',
 fetchedAt:null,sourceAsOf:null,source:null,sourceUrl:null,pairAddress:null,quoteAsset:null,priceUsd:null,volume24hUsd:null,marketCapUsd:null,liquidityUsd:null,priceChange24h:null,
 holders:19,holdersLowerBound:true,buys24h:null,sells24h:null,graduation:'bonding_curve',graduationProgress:37.5,
 chain:{source:'solana_rpc',network:'devnet',slot:512779916,asOf:'2026-10-19T10:00:00.000Z',fetchedAt:'2026-10-19T10:00:05.000Z'}});
const trades=(mint:string)=>({mint,network:'devnet',status:'available',reason:null,source:'solana_rpc',slot:512779916,complete:true,fetchedAt:'2026-10-19T10:00:05.000Z',trades:[
 {signature:sig,slot:512778627,blockTime:'2026-10-19T09:58:00.000Z',side:'sell',user:'7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',tokenAmount:'3497882795867',tokenDecimals:6,quoteAmount:'981171',quoteAsset:'SOL',quoteDecimals:9,creatorFee:'2944'}]});

for(const width of [1440,390])test(`on-chain holders, graduation progress, freshness and trades at ${width}px`,async({page})=>{
 test.setTimeout(180000);await page.setViewportSize({width,height:width===390?844:1000});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.includes('/token-markets/')){
   const mint=url.pathname.split('/')[4]!;
   if(url.pathname.endsWith('/trades'))return route.fulfill({json:trades(mint)});
   if(url.pathname.endsWith('/history'))return route.fulfill({json:{mint,pairAddress:null,source:'geckoterminal',fetchedAt:null,reason:'Historical data unavailable for this market.',candles:[]}});
   return route.fulfill({json:chainMarket(mint)});
  }
  const response=await route.fetch();let body;try{body=await response.json();}catch{return route.fulfill({response});}
  if(body&&typeof body==='object'){if('mode'in body)body.mode='production';if(body.launch)body.launch.mode='production';}
  return route.fulfill({response,json:body});
 });
 await page.goto('/?source=backend#explore');
 await expect(page.locator('.discovery-card').first()).toBeVisible({timeout:60000});
 await page.locator('.discovery-card').first().click();
 const market=page.getByRole('region',{name:'Token market data'});
 // A lower bound is never shown as an exact count; prices stay unavailable rather than invented.
 await expect(market).toContainText('Holders: ≥ 19');
 await expect(market).toContainText('Progress: 37.5%');
 await expect(market.getByRole('progressbar',{name:'Bonding-curve graduation progress'})).toHaveAttribute('value','37.5');
 await expect(market).toContainText('read directly from Solana devnet at slot 512,779,916');
 await expect(market).toContainText('the holder count is a minimum');
 await expect(market.locator('.market-metrics')).toContainText('Unavailable');
 // Trades: exact base-unit conversion and a link to the token's own network.
 const row=market.getByRole('row').filter({hasText:'Sell'});
 await expect(row).toContainText('3,497,882.795867');
 await expect(row).toContainText('0.000981171 SOL');
 await expect(row.getByRole('link')).toHaveAttribute('href',`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
 await market.scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/token-chain-metrics-${width}.png`,fullPage:true});
 expect(await page.locator('main').evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);expect(errors).toEqual([]);
});
