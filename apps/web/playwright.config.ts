import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://127.0.0.1:5173",
    // Optional lower framebuffer cost for functional tests on CPU-only WebGL.
    deviceScaleFactor: process.env.PLAYWRIGHT_SOFTWARE_LOW_RES === "1" ? 0.5 : 1,
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
      args: [
        "--no-sandbox",
        "--enable-unsafe-swiftshader",
        "--use-angle=swiftshader",
      ],
    },
  },
  webServer: [
    {
      command: "node scripts/serve-integration-backend.mjs",
      url: "http://127.0.0.1:8787/readyz",
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: "npm run dev",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      timeout: 60000,
    },
  ],
  reporter: "list",
});
