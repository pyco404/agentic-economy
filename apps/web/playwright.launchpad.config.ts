import {defineConfig} from '@playwright/test';
import base from './playwright.config';
// Explicit opt-in suite: never connect to staging or a live Pinata account.
process.env.LAUNCH_WORKSPACE_URL='http://127.0.0.1:5186';
export default defineConfig({...base,testMatch:'launch-workspace.spec.ts',use:{...base.use,baseURL:process.env.LAUNCH_WORKSPACE_URL},webServer:[
 {command:'node scripts/serve-launch-workspace-test.mjs',url:'http://127.0.0.1:8796/readyz',reuseExistingServer:false,timeout:60000},
 {command:'pnpm exec vite --host 127.0.0.1 --port 5186 --strictPort',url:'http://127.0.0.1:5186',reuseExistingServer:false,env:{VITE_API_URL:'http://127.0.0.1:8796',VITE_WS_URL:'ws://127.0.0.1:8796/api/v1/ws'},timeout:60000},
]});
