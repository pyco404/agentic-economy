import { expect, test } from "@playwright/test";

test("live Riverside through railway preserves the bridge and persisted parcels", async ({ page, request }) => {
  test.setTimeout(240000);
  const geometry = async () => {
    const response = await request.get("http://127.0.0.1:8787/api/v1/world/chunks?x=1&y=1&radius=4");
    expect(response.ok()).toBe(true);
    return (await response.json()).chunks.flatMap((c: any) => c.buildings.map((b: any) =>
      [b.id, b.origin, b.entrance, b.params.width, b.params.depth])).sort((a: any, b: any) => a[0].localeCompare(b[0]));
  };
  const before = await geometry(), errors: string[] = [], writes: string[] = [], sockets: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (r.method() !== "GET" && r.url().includes("/api/v1/")) writes.push(r.url()); });
  page.on("websocket", (s) => { if (s.url().includes("/api/v1/ws")) sockets.push(s.url()); });
  await page.goto("/?source=backend");
  const city = page.getByTestId("city-canvas"), canvas = page.locator("canvas");
  await expect.poll(async () => JSON.parse(await city.getAttribute("data-railway") ?? "null")?.mode, { timeout: 60000 }).toBe("riverside");
  const report = JSON.parse((await city.getAttribute("data-railway"))!);
  expect(report.issues).toEqual([]); expect(report.minRoadHeadroom).toBeGreaterThan(1.65);
  expect(report.tunnel.continuous).toBe(true); expect(report.tunnel.hiddenSeconds).toBe(120);
  expect(report.minWaterHeadroom).toBeGreaterThan(2); expect(report.maxGrade).toBeLessThan(0.045);
  expect(JSON.parse((await city.getAttribute("data-ambient-actors"))!)).toEqual({ train: 2, cars: 6, plane: 1, helicopter: 1, balloon: 1 });
  const state = async () => JSON.parse(await city.getAttribute("data-rail-service") ?? "{}");
  await expect.poll(async () => (await state()).cars?.length).toBe(3);
  await page.getByRole("button", { name: "Collapse city activity" }).press("Enter");
  await page.screenshot({ path: "artifacts/riverside-browser-overview.png" });
  await canvas.evaluate((node) => { (window as any).__railCanvas = node; });
  await page.getByRole("button", { name: "Explore buildings" }).press("Enter");
  await page.getByLabel("Search buildings").fill("Depot D");
  await page.getByRole("button", { name: /Depot D/ }).press("Enter");
  await expect(page.getByRole("complementary", { name: "Building details", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close building details" }).press("Enter");
  await page.getByRole("button", { name: "Collapse city activity" }).press("Enter");
  await page.waitForTimeout(1500);
  // Observe actual movement at the depot's normal inspection zoom. It also avoids
  // spending the entire wait rasterizing distant districts on CPU-only WebGL.
  await page.getByRole("button", { name: "View railway" }).press("Enter");
  await expect.poll(async () => (await state()).state, { timeout: 90000 }).toBe("surface");
  const first = await state(); await expect.poll(async () => (await state()).distance, { timeout: 90000 }).toBeGreaterThan(first.distance + 1);
  await page.screenshot({ path: "artifacts/riverside-browser-depot.png" });
  await page.getByRole("button", { name: "Rotate camera" }).press("Enter");
  await page.screenshot({ path: "artifacts/riverside-browser-depot-rotated.png" });
  await page.getByRole("button", { name: "Reset camera" }).press("Enter");
  await page.getByRole("button", { name: "Zoom out", exact: true }).press("Enter");
  await page.screenshot({ path: "artifacts/riverside-browser-wide.png" });
  expect(await canvas.evaluate((node) => node === (window as any).__railCanvas)).toBe(true);
  expect(await geometry()).toEqual(before); expect(writes).toEqual([]); expect(errors).toEqual([]); expect(sockets).toHaveLength(1);
});

test("Riverside rail stays mounted behind page overlays and on a mobile world", async ({ page }) => {
  test.setTimeout(180000); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?source=backend"); const city = page.getByTestId("city-canvas");
  await expect.poll(async () => JSON.parse(await city.getAttribute("data-railway") ?? "null")?.mode, { timeout: 60000 }).toBe("riverside");
  const builds = await city.getAttribute("data-geometry-builds"), canvas = page.locator("canvas");
  await canvas.evaluate((node) => { (window as any).__mobileRailCanvas = node; });
  await page.getByRole("button", { name: "Toggle navigation" }).press("Enter");
  await page.getByRole("link", { name: "Communities", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Close page and view city" }).press("Enter");
  expect(await canvas.evaluate((node) => node === (window as any).__mobileRailCanvas)).toBe(true);
  expect(await city.getAttribute("data-geometry-builds")).toBe(builds);
  await page.screenshot({ path: "artifacts/riverside-browser-mobile.png" });
});
