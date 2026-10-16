// Same home camera and zoom for the live persisted city, before/after material tuning.
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const phase = process.argv[2];
const prefix = process.argv[3] ?? "buildings";
const frontierStyle = process.argv[4];
if (frontierStyle && !["frontier", "coastal"].includes(frontierStyle)) throw new Error("Invalid frontier style");
if (!/^[a-z-]+$/.test(prefix)) throw new Error("Invalid capture prefix");
if (!["before", "after"].includes(phase))
  throw new Error("Pass before or after");
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.goto(`http://127.0.0.1:5173/?source=backend${frontierStyle ? `&frontierStyle=${frontierStyle}` : ""}`);
  await page
    .getByTestId("connection-status")
    .filter({ hasText: "connected" })
    .waitFor({ timeout: 45000 });
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector('[data-testid="city-canvas"]')?.dataset
          .renderedBuildings,
      ) > 100,
  );
  await page.getByRole("button", { name: "Pause city animation" }).click();
  const chunks = await (
    await fetch("http://127.0.0.1:8787/api/v1/world/chunks?x=1&y=1&radius=4")
  ).json();
  const shapes = chunks.chunks
    .flatMap((c) => c.buildings)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, kind, origin, params }) => ({ id, kind, origin, params }));
  const result = {
    phase,
    canvas: await page.locator("canvas").evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const ancestors = [];
      for (let node = canvas; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        ancestors.push({
          element: node.tagName,
          className: node.className,
          filter: style.filter,
          opacity: style.opacity,
          backdropFilter: style.backdropFilter,
        });
      }
      return {
        width: canvas.width,
        height: canvas.height,
        cssWidth: rect.width,
        cssHeight: rect.height,
        devicePixelRatio,
        ancestors,
      };
    }),
    geometryHash: createHash("sha256")
      .update(JSON.stringify(shapes))
      .digest("hex"),
    views: [],
  };
  for (const view of ["overview", "detail", "architecture"]) {
    if (view !== "overview")
      for (let i = 0; i < 3; i++)
        await page
          .getByRole("button", { name: "Zoom in", exact: true })
          .click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `artifacts/${prefix}-${phase}-${view}.png` });
    result.views.push({
      view,
      ...(await page.getByTestId("city-canvas").evaluate((el) => ({
        camera: JSON.parse(el.dataset.camera),
        calls: Number(el.dataset.drawCalls),
        triangles: Number(el.dataset.triangles),
        geometryBuilds: Number(el.dataset.geometryBuilds),
      }))),
    });
  }
  await writeFile(
    `artifacts/${prefix}-${phase}.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
