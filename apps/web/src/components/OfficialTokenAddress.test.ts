import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { officialToken } from '../content/project';
import { OfficialTokenAddress } from './OfficialTokenAddress';

describe('official token identity', () => {
  it('pins the independently verified official Mainnet mint', () => {
    expect(officialToken.mint).toBe('ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco');
  });
  for (const prominent of [true, false]) it(`renders the same full Mainnet mint and safe verification link (prominent=${prominent})`, () => {
    const html = renderToStaticMarkup(createElement(OfficialTokenAddress, { prominent }));
    expect(html).toContain(officialToken.mint);
    expect(html).toContain(`href="https://solscan.io/token/${officialToken.mint}"`);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="Copy official $AECO contract address"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('cluster=devnet');
  });
});
