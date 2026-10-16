import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  page.setDefaultNavigationTimeout(120000);
  await page.goto("http://127.0.0.1:5173/?source=backend");
  await expect.poll(async () => Number(await page.getByTestId("city-canvas").getAttribute("data-rendered-buildings")), { timeout: 60000 }).toBeGreaterThan(100);
  for (const [width, height, label] of [[390, 844, "mobile"], [820, 1000, "tablet"]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole("button", { name: "Toggle navigation" }).press("Enter");
    await page.screenshot({ path: `artifacts/navigation-${label}.png`, timeout: 120000, animations: "disabled" });
    await page.getByRole("button", { name: "Close navigation" }).press("Enter");
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "artifacts/navigation-desktop.png", timeout: 120000, animations: "disabled" });
  console.log("Saved mobile, tablet and unchanged desktop navigation review captures.");
} finally { await browser.close(); }
