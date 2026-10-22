import {defineConfig} from '@playwright/test';
import base from './playwright.launchpad.config';
// In-memory auth/drafts and mocked Pinata/RPC only. Never targets a wallet or public network.
process.env.AGENT_WORK_API_URL='http://127.0.0.1:8796';
export default defineConfig({...base,testMatch:['launch-dev-buy.spec.ts','launch-execution.spec.ts']});
