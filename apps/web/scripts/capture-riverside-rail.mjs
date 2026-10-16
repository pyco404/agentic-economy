import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
try {
  const metrics = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const record = async (view) => metrics.push({ view, ...await page.getByTestId("city-canvas").evaluate((node) => ({
    report: JSON.parse(node.dataset.railway), service: JSON.parse(node.dataset.railService), camera: JSON.parse(node.dataset.camera),
    calls: Number(node.dataset.drawCalls), triangles: Number(node.dataset.triangles), geometryBuilds: Number(node.dataset.geometryBuilds),
  })) });
  await page.goto("http://127.0.0.1:5173/?source=backend");
  await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="city-canvas"]')?.dataset.railway ?? "null")?.mode === "riverside", {}, { timeout: 60000 });
  await page.getByRole("button", { name: "Pause city animation" }).press("Enter");
  await page.screenshot({ path: "artifacts/riverside-after-overview.png" });
  await record("default");
  await page.getByRole("button", { name: "Collapse city activity" }).press("Enter");
  await page.screenshot({ path: "artifacts/riverside-after-overview-clear.png" });
  await page.getByRole("button", { name: "Explore buildings" }).press("Enter");
  await page.getByLabel("Search buildings").fill("Depot D");
  await page.getByRole("button", { name: /Depot D/ }).press("Enter");
  await page.getByRole("button", { name: "Close building details" }).press("Enter");
  await page.getByRole("button", { name: "Collapse city activity" }).press("Enter");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "artifacts/riverside-after-depot.png" });
  await record("depot");
  await page.getByRole("button", { name: "Rotate camera" }).press("Enter");
  await page.screenshot({ path: "artifacts/riverside-after-depot-rotated.png" });
  await record("depot-rotated");
  await page.getByRole("button", { name: "Expand city activity" }).press("Enter");
  await page.getByLabel("Search buildings").fill("Residence 6");
  await page.getByRole("button", { name: /^Residence 6\b/ }).press("Enter");
  await page.getByRole("button", { name: "Close building details" }).press("Enter");
  await page.getByRole("button", { name: "Collapse city activity" }).press("Enter");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "artifacts/riverside-after-canal-bridge.png" });
  await record("canal-bridge");
  await writeFile("artifacts/riverside-render-metrics.json", JSON.stringify(metrics, null, 2));
} finally { await browser.close(); }
