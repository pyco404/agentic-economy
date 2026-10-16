import { chromium, expect } from "@playwright/test";

// Native-resolution review captures; deliberately outside the tracked file set.
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:5173/?source=backend#about");
  await expect(page.locator(".about-connection")).toContainText("Connected to the demo city", { timeout: 60000 });
  await expect.poll(async () => Number(await page.getByTestId("city-canvas").getAttribute("data-rendered-buildings"))).toBeGreaterThan(100);
  await page.screenshot({ path: "artifacts/about-desktop-hero.png", timeout: 120000 });
  for (const [section, file] of [["about-how-it-works", "how-it-works"], ["about-agents", "agents"],
    ["about-economic-model", "economic-model"], ["about-technology", "technology"], ["about-status", "status"]]) {
    await page.locator(`#${section}`).evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
    await page.screenshot({ path: `artifacts/about-${file}.png`, timeout: 120000 });
  }
  for (const [width, height, label] of [[900, 1000, "tablet"], [390, 844, "mobile"]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.getElementById("main")?.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: `artifacts/about-${label}.png`, timeout: 120000 });
  }
  console.log("Saved eight native-resolution About screenshots to artifacts/.");
} finally { await browser.close(); }
