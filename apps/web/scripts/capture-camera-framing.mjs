import { chromium, expect } from "@playwright/test";
const phase = process.argv[2];
if (!["before", "after"].includes(phase)) throw new Error("Pass before or after");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.setDefaultNavigationTimeout(120000);
  const ready = async () => {
    await expect.poll(async () => Number(await page.getByTestId("city-canvas").getAttribute("data-rendered-buildings")), { timeout: 60000 }).toBeGreaterThan(100);
  };
  const capture = async (label) => page.screenshot({ path: `artifacts/camera-${phase}-${label}.png`, timeout: 120000 });
  await page.goto("http://127.0.0.1:5173/?source=backend"); await ready();
  await capture("first-load");
  if (phase === "after") {
    await page.reload(); await ready(); await capture("refresh");
    await page.getByRole("button", { name: "Zoom in", exact: true }).press("Enter");
    await page.getByRole("button", { name: "Rotate camera" }).press("Enter");
    await page.getByRole("button", { name: "Reset camera" }).press("Enter");
    await page.waitForTimeout(1800); await capture("reset");
    await page.getByRole("link", { name: "About Agentic Economy" }).press("Enter");
    await page.getByRole("button", { name: "Close page and view city" }).press("Enter"); await capture("return-world");
    await page.getByRole("button", { name: "Enter immersive mode" }).press("Enter"); await capture("immersive");
    await page.getByRole("button", { name: "Exit immersive mode" }).press("Enter");
    for (const [width, height, label] of [[820, 1180, "tablet"], [390, 844, "mobile"]]) {
      await page.setViewportSize({ width, height });
      await page.getByRole("button", { name: "Reset camera" }).press("Enter");
      await page.waitForTimeout(1800); await capture(label);
    }
  }
  console.log(`Camera ${phase} captures saved in artifacts/.`);
} finally { await browser.close(); }
