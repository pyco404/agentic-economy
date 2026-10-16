// Alternating A/B measurements isolate light/compositor changes from separate browser starts.
// The opt-in lighting hook exists only in Vite development mode. No simulation state is altered.
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const before = JSON.parse(
  await readFile("artifacts/clarity-before.json", "utf8"),
);
const after = JSON.parse(
  await readFile("artifacts/clarity-after.json", "utf8"),
);
assert.equal(before.geometryHash, after.geometryHash);
for (let i = 0; i < before.views.length; i++)
  assert.deepEqual(
    before.views[i].samples.at(-1).camera,
    after.views[i].samples.at(-1).camera,
  );
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
  ],
});
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
try {
  // Same logical viewport/camera, half pixel ratio to keep software profiling practical.
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 0.5,
  });
  await page.goto("http://127.0.0.1:5173/?source=backend&lightingBenchmark=1");
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
  await page.addStyleTag({
    content:
      '.world-main[data-benchmark-legacy="true"]::before{content:"";position:absolute;top:0;left:0;right:0;height:210px;background:linear-gradient(180deg,#f2f3eae6,#f2f3ea00);pointer-events:none;z-index:1}',
  });
  const result = {
    renderer: "Chrome SwiftShader (software)",
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 0.5,
    identicalScreenshotCameras: true,
    identicalScreenshotGeometry: true,
    views: [],
  };
  for (const view of ["overview", "detail"]) {
    if (view === "detail")
      for (let i = 0; i < 3; i++)
        await page
          .getByRole("button", { name: "Zoom in", exact: true })
          .click();
    const blocks = [];
    for (const phase of [
      "before",
      "after",
      "after",
      "before",
      "before",
      "after",
    ]) {
      await page.evaluate((phase) => {
        document.querySelector(".world-main").dataset.benchmarkLegacy = String(
          phase === "before",
        );
        document
          .querySelector('[data-testid="city-canvas"]')
          .dispatchEvent(
            new CustomEvent("city-lighting-preview", {
              detail:
                phase === "before"
                  ? { fill: 1.7, sun: 0.8 }
                  : { fill: 1.2, sun: 1.05 },
            }),
          );
      }, phase);
      const samples = [];
      let previous = -1;
      for (let i = 0; i < 14; i++) {
        await page.waitForFunction(
          (previous) =>
            Number(
              document.querySelector('[data-testid="city-canvas"]').dataset
                .frameNumber,
            ) > previous,
          previous,
        );
        const sample = await page
          .getByTestId("city-canvas")
          .evaluate((el) => ({
            frame: Number(el.dataset.frameNumber),
            ms: Number(el.dataset.frameMs),
            calls: Number(el.dataset.drawCalls),
            triangles: Number(el.dataset.triangles),
            geometryBuilds: Number(el.dataset.geometryBuilds),
          }));
        previous = sample.frame;
        if (i >= 2) samples.push(sample);
      }
      blocks.push({ phase, samples });
    }
    const summary = Object.fromEntries(
      ["before", "after"].map((phase) => {
        const samples = blocks
          .filter((b) => b.phase === phase)
          .flatMap((b) => b.samples);
        return [
          phase,
          {
            medianFrameMs: median(samples.map((s) => s.ms)),
            medianCalls: median(samples.map((s) => s.calls)),
            medianTriangles: median(samples.map((s) => s.triangles)),
            geometryBuilds: [...new Set(samples.map((s) => s.geometryBuilds))],
          },
        ];
      }),
    );
    const changePercent =
      (summary.after.medianFrameMs / summary.before.medianFrameMs - 1) * 100;
    result.views.push({ view, summary, changePercent, blocks });
    console.log(JSON.stringify({ view, summary, changePercent }));
  }
  await writeFile(
    "artifacts/clarity-performance.json",
    JSON.stringify(result, null, 2),
  );
} finally {
  await browser.close();
}
