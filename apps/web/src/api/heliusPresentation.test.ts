import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TokenMarket } from './shared';
import type { ApiAdapter } from './adapter';
import { TokenMarketPanel } from '../components/TokenMarketPanel';
const mint='11111111111111111111111111111111';
const market=TokenMarket.parse({mint,status:'unavailable',reason:'No verified price',network:'devnet',source:null,sourceUrl:null,pairAddress:null,quoteAsset:null,priceUsd:null,volume24hUsd:null,marketCapUsd:null,liquidityUsd:null,priceChange24h:null,holders:null,buys24h:null,sells24h:null,graduation:'unknown',graduationProgress:null,fetchedAt:null,sourceAsOf:null,
 holderIndex:{source:'helius_das',indexedSlot:100,fetchedAt:'2026-10-20T18:00:00Z',complete:false,scannedAccounts:2,owners:[{address:mint,amount:'30000000000000'}],reason:'Index changed during enumeration; count unavailable.'},indexedMetadata:{source:'helius_das',mint,name:'Indexed token',symbol:'TEST',fetchedAt:'2026-10-20T18:00:00Z'}});
describe('Helius data presentation (synthetic indexed observations)',()=>{
 it('shows partial coverage and raw owner amounts without inventing a holder count, price or ranking',()=>{
  const html=renderToStaticMarkup(createElement(TokenMarketPanel,{mint,market,api:{} as ApiAdapter}));
  expect(html).toContain('Holders: Unavailable');expect(html).toContain('Partial account enumeration');expect(html).toContain('not a ranking');expect(html).toContain('30000000000000');expect(html).toContain('Indexed token');expect(html).not.toContain('api-key');
 });
 it('supports complete unique-owner counts while keeping indexed metadata distinct from launch metadata',()=>{
  const html=renderToStaticMarkup(createElement(TokenMarketPanel,{mint,market:{...market,holders:1,holderIndex:{...market.holderIndex!,complete:true,reason:null}},api:{} as ApiAdapter}));
  expect(html).toContain('Holders: 1');expect(html).toContain('Complete account enumeration');expect(html).toContain('Saved launch metadata remains authoritative');
 });
});
