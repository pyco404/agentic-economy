// Compare the live, persisted city with the same viewport and unchanged home camera.
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const phase = process.argv[2];
assert.ok(["before", "after"].includes(phase), "Pass before or after");
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
  await page.goto("http://127.0.0.1:5173/?source=backend");
  await page
    .getByTestId("connection-status")
    .filter({ hasText: "connected" })
    .waitFor({ timeout: 45000 });
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[data-testid="city-canvas"]')
          ?.getAttribute("data-rendered-buildings"),
      ) > 100,
  );
  await page.getByRole("button", { name: "Pause city animation" }).click();
  const chunks = await (
    await fetch("http://127.0.0.1:8787/api/v1/world/chunks?x=1&y=1&radius=4")
  ).json();
  const geometry = chunks.chunks
    .flatMap((c) => c.buildings)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, kind, origin, params }) => ({ id, kind, origin, params }));
  const result = {
    phase,
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    geometryHash: createHash("sha256")
      .update(JSON.stringify(geometry))
      .digest("hex"),
    views: [],
  };
  for (const view of ["overview", "detail"]) {
    if (view === "detail")
      for (let i = 0; i < 3; i++)
        await page
          .getByRole("button", { name: "Zoom in", exact: true })
          .click();
    await page.waitForTimeout(4000);
    const samples = [];
    for (let i = 0; i < 12; i++) {
      samples.push(
        await page
          .getByTestId("city-canvas")
          .evaluate((el) => ({
            camera: JSON.parse(el.dataset.camera),
            calls: Number(el.dataset.drawCalls),
            triangles: Number(el.dataset.triangles),
            geometryBuilds: Number(el.dataset.geometryBuilds),
            frameMs: Number(el.dataset.frameMs),
          })),
      );
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: `artifacts/clarity-${phase}-${view}.png` });
    result.views.push({ view, samples });
  }
  await writeFile(
    `artifacts/clarity-${phase}.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify({
      phase,
      geometryHash: result.geometryHash,
      cameras: result.views.map((v) => ({ view: v.view, ...v.samples.at(-1) })),
    }),
  );
} finally {
  await browser.close();
}
