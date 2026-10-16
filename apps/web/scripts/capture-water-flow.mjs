// Isolate the water material at identical cameras against the live demo world.
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:5173/?source=backend");
  await page.getByTestId("connection-status").filter({ hasText: "connected" }).waitFor({ timeout: 45000 });
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="city-canvas"]')?.dataset.renderedBuildings) > 100);
  await page.getByRole("button", { name: "Pause city animation" }).click();
  const results = [];
  for (const view of ["default", "close", "wide"]) {
    // Invoke the existing toolbar handlers together; avoid twelve expensive
    // Playwright stability checks while software-rendering this large world.
    if (view !== "default") await page.getByRole("button", {
      name: view === "close" ? "Zoom in" : "Zoom out", exact: true,
    }).evaluate((button, count) => {
      for (let i = 0; i < count; i++) button.click();
    }, view === "close" ? 6 : 12);
    await page.waitForTimeout(1200);
    for (const phase of ["before", "after"]) {
      await page.evaluate(async (strength) => {
        const path = "/src/world/waterFlow.ts";
        const { waterFlowUniforms } = await import(path);
        waterFlowUniforms.waterStrength.value = strength;
      }, phase === "before" ? 0 : 1);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `artifacts/water-${phase}-${view}.png` });
      results.push({ view, phase, ...await page.getByTestId("city-canvas").evaluate((node) => ({
        camera: JSON.parse(node.dataset.camera), calls: Number(node.dataset.drawCalls),
        triangles: Number(node.dataset.triangles), geometryBuilds: Number(node.dataset.geometryBuilds),
      })) });
      await writeFile("artifacts/water-comparison.json", JSON.stringify(results, null, 2));
    }
  }
  await writeFile("artifacts/water-comparison.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
