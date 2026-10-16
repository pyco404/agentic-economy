import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.setDefaultNavigationTimeout(120000);
  const panel = page.locator("#world-activity-panel");
  const views = process.argv.includes("--mobile") ? [[390, 844, "mobile"]]
    : [[1440, 1000, "desktop"], [820, 1000, "tablet"], [390, 844, "mobile"]];
  for (const [width, height, label] of views) {
    await page.setViewportSize({ width, height });
    // Fresh navigation per size shows initial mobile state rather than carrying
    // an expanded desktop panel into a resized mobile screenshot.
    await page.goto("http://127.0.0.1:5173/?source=backend#about");
    await expect.poll(async () => Number(await page.getByTestId("city-canvas").getAttribute("data-rendered-buildings")), { timeout: 60000 }).toBeGreaterThan(100);
    await page.getByRole("button", { name: "Close page and view city" }).press("Enter");
    await panel.evaluate((node) => { node.scrollTop = 0; });
    await page.screenshot({ path: `artifacts/activity-scroll-${label}.png`, timeout: 120000 });
    const expand = page.getByRole("button", { name: "Expand city activity" });
    if (await expand.isVisible()) {
      await expand.press("Enter");
      await page.screenshot({ path: `artifacts/activity-scroll-${label}-expanded.png`, timeout: 120000 });
    }
    await panel.evaluate((node) => { node.scrollTop = 320; });
    await page.screenshot({ path: `artifacts/activity-scroll-${label}-scrolled.png`, timeout: 120000 });
  }
  await page.getByRole("button", { name: "Collapse city activity" }).press("Enter");
  await page.screenshot({ path: "artifacts/activity-scroll-collapsed.png", timeout: 120000 });
  await page.getByRole("button", { name: "Enter immersive mode" }).press("Enter");
  await page.screenshot({ path: "artifacts/activity-scroll-immersive.png", timeout: 120000 });
  console.log("Saved activity scrolling and Show page review screenshots in artifacts/.");
} finally { await browser.close(); }
