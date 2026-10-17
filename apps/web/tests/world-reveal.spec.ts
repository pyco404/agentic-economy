import { expect, test, type Page } from "@playwright/test";
const state = async (page: Page) => JSON.parse(await page.getByTestId("city-canvas").getAttribute("data-reveal-visible") ?? "{}");
async function seek(page: Page, time: number) {
  const city = page.getByTestId("city-canvas");
  await city.evaluate((node, time) => node.dispatchEvent(new CustomEvent("city-reveal-review", { detail: { time } })), time);
  await expect(city).toHaveAttribute("data-reveal-rendered-time", String(time), { timeout: 45000 });
}
test("spatial reveal keeps UI, live state, controls and one persistent world", async ({ page }) => {
  test.setTimeout(300000); await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [], writes: string[] = [], sockets: any[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("websocket", (socket) => { if (new URL(socket.url()).pathname === "/api/v1/ws") sockets.push(socket); });
  page.on("request", (r) => { if (r.url().includes("/api/v1/") && r.method() !== "GET") writes.push(r.url()); });
  await page.goto("/?source=backend&revealReview=1");
  await expect(page.getByRole("heading", { name: "A city in motion." })).toBeVisible();
  const city = page.getByTestId("city-canvas"), canvas = page.locator("canvas");
  await expect(city).toHaveAttribute("data-scenery-worker", "active");
  await expect(city).toHaveAttribute("data-reveal-scenery-ready", "true", { timeout: 120000 });
  await expect(city).toHaveAttribute("data-reveal-pending", "0", { timeout: 45000 });
  expect((await state(page)).ground).toBeGreaterThan(0); expect((await state(page)).buildings).toBe(0);
  await expect(page.locator(".agent-world-label:visible")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/reveal-1-ground.png" });
  const seq = Number(await page.locator(".app").getAttribute("data-stream-seq"));
  await canvas.evaluate((node) => { (window as any).__revealCanvas = node; });
  const initial = JSON.parse((await city.getAttribute("data-camera"))!);
  await canvas.focus(); await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => JSON.parse((await city.getAttribute("data-camera"))!).target[0]).not.toBe(initial.target[0]);
  const camera = JSON.parse((await city.getAttribute("data-camera"))!);
  await seek(page, .9); expect((await state(page)).buildings).toBeGreaterThan(0); expect((await state(page)).environment).toBe(0);
  await page.screenshot({ path: "artifacts/reveal-2-buildings.png" });
  await seek(page, 2.75); expect((await state(page)).environment).toBeGreaterThan(0);
  await page.screenshot({ path: "artifacts/reveal-3-environment.png" });
  await seek(page, 3.5); await expect(city).toHaveAttribute("data-reveal-stage", "complete");
  await expect.poll(() => page.locator(".agent-world-label:visible").count()).toBeGreaterThan(0);
  await page.screenshot({ path: "artifacts/reveal-4-complete.png" });
  const after = JSON.parse((await city.getAttribute("data-camera"))!);
  expect(after.zoom).toBe(camera.zoom);
  for (const key of ["position", "target"]) after[key].forEach((v: number, i: number) => expect(v).toBeCloseTo(camera[key][i], 7));
  await expect(city).toHaveAttribute("data-reveal-scenery-ready", "true", { timeout: 90000 });
  await expect(city).toHaveAttribute("data-reveal-pending", "0", { timeout: 45000 });
  const builds = await city.getAttribute("data-geometry-builds");
  await page.getByRole("link", { name: "About Agentic Economy", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Close page and view city", exact: true }).press("Enter");
  await expect(city).toHaveAttribute("data-reveal-stage", "complete");
  expect(await canvas.evaluate((node) => node === (window as any).__revealCanvas)).toBe(true);
  expect(await city.getAttribute("data-geometry-builds")).toBe(builds);
  await expect.poll(async () => Number(await page.locator(".app").getAttribute("data-stream-seq"))).toBeGreaterThan(seq);
  await page.getByRole("button", { name: "Explore buildings" }).click();
  await page.locator(".building-list button").first().click();
  await expect(page.getByRole("complementary", { name: "Building details", exact: true })).toBeVisible();
  expect(errors).toEqual([]); expect(writes).toEqual([]); expect(sockets).toHaveLength(1);
});
for (const viewport of [{ width: 820, height: 1180 }, { width: 390, height: 844 }]) {
  test(`reduced-motion world loads and refreshes without a replay on routes at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(240000); await page.setViewportSize(viewport); await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?source=backend"); const city = page.getByTestId("city-canvas");
    await expect(city).toHaveAttribute("data-reveal-stage", "complete", { timeout: 120000 });
    await expect.poll(async () => Number(await city.getAttribute("data-rendered-buildings"))).toBeGreaterThan(100);
    const camera = await city.getAttribute("data-camera");
    await page.screenshot({ path: `artifacts/reveal-complete-${viewport.width}.png` });
    await page.getByRole("link", { name: "About Agentic Economy", exact: true }).press("Enter");
    await page.getByRole("button", { name: "Close page and view city", exact: true }).press("Enter");
    await expect(city).toHaveAttribute("data-reveal-stage", "complete"); expect(await city.getAttribute("data-camera")).toBe(camera);
    await page.reload(); await expect(city).toHaveAttribute("data-reveal-stage", "complete", { timeout: 120000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("normal reveal tolerates slow initial fetch and WebSocket reconnect without restarting", async ({ page }) => {
  test.setTimeout(240000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let first: import("@playwright/test").WebSocketRoute | undefined, connections = 0;
  await page.route("**/api/v1/world/bootstrap", async (route) => { await new Promise((resolve) => setTimeout(resolve, 500)); await route.continue(); });
  await page.routeWebSocket("**/api/v1/ws", (socket) => {
    connections++; if (!first) first = socket;
    const server = socket.connectToServer();
    socket.onMessage((message) => server.send(message)); server.onMessage((message) => socket.send(message));
  });
  await page.goto("/?source=backend");
  await expect(page.getByRole("link", { name: "About Agentic Economy", exact: true })).toBeVisible();
  const city = page.getByTestId("city-canvas"), canvas = page.locator("canvas");
  await expect(city).toHaveAttribute("data-reveal-stage", "complete", { timeout: 120000 });
  const builds = await city.getAttribute("data-geometry-builds");
  await canvas.evaluate((node) => { (window as any).__reconnectedRevealCanvas = node; });
  const beforeReconnect = Number(await page.locator(".app").getAttribute("data-stream-seq"));
  await first!.close({ code: 1013, reason: "Reveal reconnect verification" });
  await expect.poll(() => connections, { timeout: 45000 }).toBeGreaterThan(1);
  await expect.poll(async () => Number(await page.locator(".app").getAttribute("data-stream-seq")), { timeout: 45000 }).toBeGreaterThan(beforeReconnect);
  await expect(page.getByTestId("connection-status")).toContainText("connected", { timeout: 45000 });
  await expect(city).toHaveAttribute("data-reveal-stage", "complete");
  expect(await city.getAttribute("data-geometry-builds")).toBe(builds);
  expect(await canvas.evaluate((node) => node === (window as any).__reconnectedRevealCanvas)).toBe(true);
});
