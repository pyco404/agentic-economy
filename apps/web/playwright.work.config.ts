import { defineConfig } from '@playwright/test';
import base from './playwright.config';

process.env.AGENT_WORK_API_URL = 'http://127.0.0.1:8832';

export default defineConfig({
  ...base, testMatch: 'agent-work.spec.ts', outputDir:'/tmp/aeco-work-browser-results',
  use:{ ...base.use, baseURL:'http://127.0.0.1:5187' },
  webServer:[
    { command:'pnpm --filter @agentic-economy/server exec tsx --conditions=@agentic-economy/source scripts/local-work.ts',
      cwd:'../..', url:'http://127.0.0.1:8832/readyz', reuseExistingServer:false, timeout:60000 },
    { command:'pnpm exec vite --host 127.0.0.1 --port 5187 --strictPort',
      url:'http://127.0.0.1:5187', reuseExistingServer:false, timeout:60000,
      env:{VITE_DATA_MODE:'api', VITE_API_URL:'http://127.0.0.1:8832', VITE_WS_URL:'ws://127.0.0.1:8832/api/v1/ws'} },
  ],
});
