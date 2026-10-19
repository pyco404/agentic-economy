import { defineConfig } from '@playwright/test';
import base from './playwright.launchpad.config';
const servers = Array.isArray(base.webServer) ? base.webServer : base.webServer ? [base.webServer] : [];

// Uses the existing isolated memory backend; never starts database migrations.
// Build with the same 8796 API URLs before selecting STARTUP_PREVIEW=1.
export default defineConfig({
  ...base,
  testMatch: ['application-startup.spec.ts', 'world-reveal.spec.ts', 'clean-routing.spec.ts'],
  webServer: servers.map(server => process.env.STARTUP_PREVIEW === '1' && server.command.includes('vite')
    ? { ...server, command: 'pnpm exec vite preview --host 127.0.0.1 --port 5186 --strictPort' }
    : server),
});
