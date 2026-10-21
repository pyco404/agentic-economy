import {defineConfig} from '@playwright/test';
import base from './playwright.launchpad.config';
// Reuse the isolated in-memory API and mocked upload fixture; never staging or Devnet.
export default defineConfig({...base,testMatch:'communities.spec.ts'});
