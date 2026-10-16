import { chromium } from "@playwright/test";
const phase = process.argv[2];
if (!["before", "after"].includes(phase)) throw new Error("Pass before or after");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto("http://127.0.0.1:5173/?source=backend#communities");
  await page.getByRole("heading", { name: "Different communities. One world." }).waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `artifacts/communities-${phase}-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `artifacts/communities-${phase}-mobile.png`, fullPage: true });
  if (phase === "after") {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("http://127.0.0.1:5173/?source=backend#explore");
    await page.getByRole("heading", { name: "Discover what's being built." }).waitFor();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: "artifacts/explore-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "artifacts/explore-mobile.png", fullPage: true });
  }
} finally { await browser.close(); }
