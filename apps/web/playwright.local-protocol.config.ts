import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testMatch:'local-protocol-launch.spec.ts',timeout:480000,webServer:[
 {command:'pnpm exec vite --host 127.0.0.1 --port 5186 --strictPort',url:'http://127.0.0.1:5186',reuseExistingServer:false,env:{VITE_DATA_MODE:'api',VITE_API_URL:'http://127.0.0.1:8796',VITE_WS_URL:'ws://127.0.0.1:8796/api/v1/ws'},timeout:60000},
]});
