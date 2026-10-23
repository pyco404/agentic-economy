import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { officialToken } from '../content/project';
import { OfficialTokenAddress } from './OfficialTokenAddress';

describe('official token identity', () => {
  it('pins the independently verified official Mainnet mint', () => {
    expect(officialToken.mint).toBe('ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco');
  });
  for (const prominent of [true, false]) it(`renders a minimal address row without headings or external links (prominent=${prominent})`, () => {
    const html = renderToStaticMarkup(createElement(OfficialTokenAddress, { prominent }));
    expect(html).toContain(officialToken.mint);
    expect(html).toContain('$AECO');
    expect(html).not.toContain('<h2');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('View on Solscan');
    expect(html).toContain('aria-label="Copy official $AECO contract address"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('cluster=devnet');
  });
});
