import {defineConfig} from '@playwright/test';
import base from './playwright.launchpad.config';
// Isolated in-memory drafts and mock uploads; never enables real financial execution.
export default defineConfig({...base,testMatch:['launch-workspace.spec.ts','launch-quotes.spec.ts','ui-borders.spec.ts']});
