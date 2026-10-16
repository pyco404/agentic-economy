// Live-city review from four azimuths at two zoom levels, plus the overview.
// All resulting screenshots and diagnostics stay under ignored artifacts/.
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
  ],
});
const report = {
  source: "live backend",
  viewport: { width: 1440, height: 1000 },
  views: [],
  errors: [],
};
try {
  const page = await browser.newPage({
    viewport: report.viewport,
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(60000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/?source=backend");
  await page
    .getByTestId("connection-status")
    .filter({ hasText: "connected" })
    .waitFor({ timeout: 60000 });
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector('[data-testid="city-canvas"]')?.dataset
          .renderedBuildings,
      ) > 100,
  );
  await page.getByRole("button", { name: "Pause city animation" }).click();
  const capture = async (name) => {
    await page.waitForTimeout(1500);
    const diagnostic = await page
      .getByTestId("city-canvas")
      .evaluate((el) => ({
        camera: JSON.parse(el.dataset.camera),
        calls: Number(el.dataset.drawCalls),
        triangles: Number(el.dataset.triangles),
        geometryBuilds: Number(el.dataset.geometryBuilds),
      }));
    await page.screenshot({ path: `artifacts/roof-inspection-${name}.png` });
    report.views.push({ name, ...diagnostic });
    console.log(JSON.stringify({ name, ...diagnostic }));
  };
  await capture("overview");
  for (const zoom of ["district", "close"]) {
    for (let i = 0; i < 3; i++)
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    for (let angle = 0; angle < 4; angle++) {
      await capture(`${zoom}-${angle * 90}`);
      for (let i = 0; i < 2; i++)
        await page
          .getByRole("button", { name: "Rotate camera", exact: true })
          .click();
    }
  }
  await writeFile(
    "artifacts/roof-inspection.json",
    JSON.stringify(report, null, 2),
  );
} finally {
  await browser.close();
}
