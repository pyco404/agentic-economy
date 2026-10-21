import {describe,it,expect} from 'vitest';
import {normalizeProjectLink} from './LaunchProjectLinks';
import {NewLaunchDraftFields} from '../api/shared';
describe('optional project URLs',()=>{
 it('canonicalizes complete HTTPS URLs without substituting a platform account',()=>{
  expect(normalizeProjectLink(' https://Example.com/about?q=Token#team ')).toBe('https://example.com/about?q=Token#team');
  expect(normalizeProjectLink('https://x.com/mycoin')).toBe('https://x.com/mycoin');
  expect(normalizeProjectLink('  ')).toBe('');
 });
 it('does not guess a host, upgrade HTTP or accept credentials and oversized URLs',()=>{
  for(const value of ['example.com','http://example.com','javascript:alert(1)','https://user:secret@example.com','https://example.com/'+ 'a'.repeat(201)]){
   expect(normalizeProjectLink(value)).toBe(value);
   expect(NewLaunchDraftFields.shape.website.safeParse(value).success).toBe(false);
  }
 });
 it('leaves all links optional under the existing backend contract',()=>{
  const fields=NewLaunchDraftFields.parse({name:'Moss',symbol:'MOSS'});
  expect([fields.website,fields.twitter,fields.telegram]).toEqual([null,null,null]);
 });
});
