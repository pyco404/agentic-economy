import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const state = async (page: Page) => JSON.parse(await page.getByTestId("city-canvas").getAttribute("data-rail-service") ?? "{}");
const review = async (page: Page, detail: { time?: number; rate?: number; focus?: { x: number; z: number; zoom: number } }) => {
  const city = page.getByTestId("city-canvas"), before = await city.getAttribute("data-frame-number");
  await city.evaluate((node, value) => node.dispatchEvent(new CustomEvent("city-rail-review", { detail: value })), detail);
  await expect.poll(() => city.getAttribute("data-frame-number"), { timeout: 30000 }).not.toBe(before);
};
const ready = async (page: Page) => {
  page.setDefaultNavigationTimeout(90000);
  await page.goto("/?source=backend&railReview=1");
  await expect.poll(async () => JSON.parse(await page.getByTestId("city-canvas").getAttribute("data-railway") ?? "{}").tunnel?.continuous, { timeout: 90000 }).toBe(true);
};

test("connected railway renders every transition and repeats forward without remounting the world", async ({ page, request }) => {
  test.setTimeout(240000);
  const geometry = async () => {
    const response = await request.get("http://127.0.0.1:8787/api/v1/world/chunks?x=1&y=1&radius=4");
    return (await response.json()).chunks.flatMap((c: any) => c.buildings.map((b: any) => [b.id, b.origin, b.params.width, b.params.depth])).sort((a: any, b: any) => a[0].localeCompare(b[0]));
  };
  const before = await geometry(), writes: string[] = [], errors: string[] = [], sockets: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/v1/") && r.method() !== "GET") writes.push(r.url()); });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("websocket", (s) => { if (s.url().includes("/api/v1/ws")) sockets.push(s.url()); });
  await ready(page);
  const city = page.getByTestId("city-canvas"), report = JSON.parse((await city.getAttribute("data-railway"))!);
  expect(report.issues).toEqual([]); expect(report.tunnel.hiddenSeconds).toBe(120); expect(report.tunnel.minCover).toBeGreaterThanOrEqual(.3);
  expect(report.maxGrade).toBeLessThan(.045); expect(report.minWaterHeadroom).toBeGreaterThan(2);
  await page.locator("canvas").evaluate((node) => { (window as any).__undergroundCanvas = node; });
  const service = await state(page), cases = [
    [service.hiddenAt - 5, "surface", 3], [service.hiddenAt - 2, "entering-tunnel", 2],
    [service.hiddenAt - .5, "entering-tunnel", 1], [service.hiddenAt + 1, "underground", 0],
    [service.emergesAt - .01, "underground", 0], [service.emergesAt + .5, "emerging-tunnel", 1],
    [service.emergesAt + 2, "emerging-tunnel", 2], [service.emergesAt + 4, "emerging-tunnel", 3],
    [service.emergesAt + 8, "surface", 3],
  ] as const;
  for (const [time, expected, visible] of cases) {
    await review(page, { time, rate: 0 });
    await expect.poll(async () => (await state(page)).state).toBe(expected);
    expect((await state(page)).cars.filter((c: any) => c.visible)).toHaveLength(visible);
    expect((await state(page)).trackVisible).toBe(true);
  }
  await page.getByRole("button", { name: "Toggle ambient scenery" }).press("Enter");
  expect((await state(page)).trackVisible).toBe(true);
  await page.getByRole("button", { name: "Toggle ambient scenery" }).press("Enter");
  await page.getByRole("button", { name: "View railway" }).press("Enter");
  // The overview fits the viewport; OrbitControls may clamp to its world-aware
  // minimum zoom. A desktop constant is not valid for every canvas aspect.
  await expect.poll(async () => JSON.parse((await city.getAttribute("data-camera"))!).zoom).toBeLessThanOrEqual(1.1);
  expect(JSON.parse((await city.getAttribute("data-camera"))!).zoom).toBeGreaterThanOrEqual(.3);
  await review(page, { time: 0, rate: 30 });
  await expect.poll(async () => Number(await city.getAttribute("data-rail-seconds")), { timeout: 45000 }).toBeGreaterThan(service.period * 2 + 1);
  expect((await state(page)).trackVisible).toBe(true);
  expect(await geometry()).toEqual(before); expect(writes).toEqual([]); expect(errors).toEqual([]); expect(sockets).toHaveLength(1);
  expect(await page.locator("canvas").evaluate((node) => node === (window as any).__undergroundCanvas)).toBe(true);
});

test("the production-duration journey stays hidden for two real minutes and emerges automatically", async ({ page }) => {
  test.setTimeout(240000);
  await ready(page); const city = page.getByTestId("city-canvas"), service = await state(page);
  // Seek only to the entry boundary, then use unaccelerated production duration.
  await review(page, { time: service.hiddenAt + .05, rate: 1, focus: { x: 86, z: 1, zoom: 3 } });
  await expect.poll(async () => (await state(page)).state).toBe("underground");
  const started = Date.now(), samples: unknown[] = [];
  let latest = await state(page);
  while (latest.state === "underground" && Date.now() - started < 135000) {
    expect(latest.trackVisible).toBe(true); expect(latest.cars.filter((c: any) => c.visible)).toHaveLength(0);
    expect(await city.getAttribute("data-rail-clock-rate")).toBe("1");
    samples.push({ wallSeconds: (Date.now() - started) / 1000, rail: latest });
    await page.waitForTimeout(1000);
    latest = await state(page);
  }
  const elapsed = (Date.now() - started) / 1000;
  expect(elapsed).toBeGreaterThan(118); expect(elapsed).toBeLessThan(126);
  expect(latest.state).toMatch(/emerging-tunnel|surface/);
  await expect.poll(async () => (await state(page)).cars.filter((c: any) => c.visible).length, { timeout: 15000 }).toBe(3);
  expect(service.emergesAt - service.hiddenAt).toBeCloseTo(120, 8);
  await writeFile("artifacts/underground-real-time-cycle.json", JSON.stringify({ hiddenSeconds: 120, clockRate: 1, observedWallSeconds: elapsed, samples, emerged: await state(page) }, null, 2));
});

test("mobile railway overview and route navigation retain the active train service", async ({ page }) => {
  test.setTimeout(150000); await page.setViewportSize({ width: 390, height: 844 }); await ready(page);
  const city = page.getByTestId("city-canvas"), service = await state(page);
  await review(page, { time: service.hiddenAt + 5, rate: 1 });
  const time = Number(await city.getAttribute("data-rail-seconds"));
  await page.getByRole("button", { name: "View railway" }).press("Enter");
  await page.getByRole("link", { name: "About Agentic Economy" }).press("Enter");
  await page.getByRole("button", { name: "Close page and view city" }).press("Enter");
  expect(Number(await city.getAttribute("data-rail-seconds"))).toBeGreaterThanOrEqual(time);
  expect((await state(page)).state).toBe("underground"); expect((await state(page)).trackVisible).toBe(true);
});
