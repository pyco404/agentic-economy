import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CityActivityInfo } from './CityActivityInfo';
import { demoDashboard } from '../api/adapter';

it('provides a keyboard-operable collapsed source explanation without inventing economic service totals', () => {
  const stats = { ...demoDashboard().stats, population: 850, activeAgents: 42, verifiedTasks: 7, communities: 0 };
  const html = renderToStaticMarkup(createElement(CityActivityInfo, { stats }));
  expect(html).toContain('<summary>About city activity</summary>');
  expect(html).not.toContain('<details open');
  for (const label of ['On-chain', 'City World', 'Economic Services', 'Qualifying $AECO holder wallets', 'Active Common Agents', 'Active city-group residents', 'Virtual household population', 'Completed city activities', 'Token communities', 'City groups']) expect(html).toContain(label);
  expect(html).toContain('not verified Mainnet activity');
  expect(html).toContain('not wallets or a count of visible agents');
  expect(html).toContain('No independently verified economic-service total is available');
  expect(html).toContain('<dt>Token communities</dt><dd>0</dd>');
  expect(html).toContain('<dt>Completed city activities</dt><dd>7</dd>');
  expect(html).toContain('<dt>Virtual household population</dt><dd>850</dd>');
});
