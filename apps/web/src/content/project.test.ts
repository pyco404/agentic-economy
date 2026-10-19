import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TokenSocialLinks} from '../components/TokenSocialLinks';
import {ProjectLinks} from '../components/ProjectLinks';
import {project} from './project';
describe('platform identity and independent token links',()=>{
 it('keeps official platform accounts out of empty or malicious token social fields',()=>{
  for(const props of [{},{website:'javascript:alert(1)',twitter:'data:text/html,unsafe',telegram:'https://user:password@example.com'}]){
   expect(renderToStaticMarkup(createElement(TokenSocialLinks,props))).toBe('');
  }
 });
 it('preserves the user’s independent social account with safe new-tab navigation',()=>{
  const html=renderToStaticMarkup(createElement(TokenSocialLinks,{twitter:'https://x.com/examplecoin',website:'https://example.com'}));
  expect(html).toContain('https://x.com/examplecoin');expect(html).not.toContain(project.x);
  expect(html).toContain('noopener noreferrer');expect(html).toContain('target="_blank"');
 });
 it('makes platform profiles accessible without embedding third-party widgets',()=>{
  const html=renderToStaticMarkup(createElement(ProjectLinks));
  expect(html).toContain(project.x);expect(html).toContain(project.github);expect(html).toContain('aria-label="Follow @useaeco on X"');
  expect(html).not.toMatch(/iframe|script|useaeco\.xyz\/redirect/);
 });
});
