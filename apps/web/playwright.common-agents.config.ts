import { fileURLToPath } from 'node:url';
import base from './playwright.config';
const web = fileURLToPath(new URL('.', import.meta.url));
const server = fileURLToPath(new URL('../server', import.meta.url));
/** In-memory, loopback-only fixture acceptance. Never starts a database or Devnet gateway. */
export default { ...base, workers: 1, metadata: { commonAgentsFixture: true }, testMatch: '**/common-agents.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5197', deviceScaleFactor: .5 },
  webServer: [
    { command: 'pnpm exec tsx --conditions=@agentic-economy/source scripts/verify-common-agents.ts', cwd: server, url: 'http://127.0.0.1:5198/healthz', reuseExistingServer: false, timeout: 60_000 },
    { command: 'pnpm exec vite --host 127.0.0.1 --port 5197 --strictPort', cwd: web, url: 'http://127.0.0.1:5197', reuseExistingServer: false, timeout: 60_000,
      env: { VITE_API_URL: 'http://127.0.0.1:5198', VITE_WS_URL: 'ws://127.0.0.1:5198/api/v1/ws' } },
  ],
};
