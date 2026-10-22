import { fileURLToPath } from 'node:url';
import base from '../../apps/web/playwright.config';

// Public-origin regression only: never starts the local integration backend or a database.
export default {
  ...base,
  testDir: fileURLToPath(new URL('../../apps/web/tests', import.meta.url)),
  testMatch: 'public-mobile.spec.ts',
  outputDir: fileURLToPath(new URL('../../apps/web/artifacts/public-mobile', import.meta.url)),
  use: { ...base.use, baseURL: process.env.PUBLIC_UI_URL ?? 'https://useaeco.xyz', deviceScaleFactor: 0.5 },
  webServer: [],
};
