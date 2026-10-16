import { expect, test } from "@playwright/test";

test("About uses the live world without rebuilding its canvas, camera or socket", async ({ page }) => {
  test.setTimeout(300000);
  const sockets: string[] = [], errors: string[] = [];
  page.on("websocket", (socket) => { if (socket.url().includes("/api/v1/ws")) sockets.push(socket.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?source=backend");
  const city = page.getByTestId("city-canvas"), canvas = page.locator("canvas");
  await expect(page.getByTestId("connection-status")).toContainText("connected", { timeout: 60000 });
  await expect.poll(async () => Number(await city.getAttribute("data-rendered-buildings"))).toBeGreaterThan(100);
  await canvas.evaluate((node) => { (window as any).__aboutCanvas = node; });
  const camera = await city.getAttribute("data-camera"), builds = await city.getAttribute("data-geometry-builds");
  const open = async () => page.getByRole("link", { name: "About Agentic Economy", exact: true }).press("Enter");
  await open();
  await expect(page.locator("#about-title")).toContainText("that works");
  await expect(page.locator(".about-connection")).toContainText("Connected to the demo city");
  await expect(page.getByTestId("global-world")).toHaveAttribute("inert", "");
  await page.locator("#about-economic-model").scrollIntoViewIfNeeded();
  await page.mouse.move(700, 500); await page.mouse.wheel(0, 300);
  expect(await city.getAttribute("data-camera")).toBe(camera);
  const brokenLabels = await page.locator(".about-page [aria-labelledby]").evaluateAll((nodes) => nodes.flatMap((node) =>
    node.getAttribute("aria-labelledby")!.split(" ").filter((id) => !document.getElementById(id))));
  expect(brokenLabels).toEqual([]);
  await expect(page.locator(".about-launch-charge")).toContainText("0.05");
  await expect(page.locator(".about-split")).toHaveAttribute("aria-label", "60% Agent Rewards Treasury; 40% Platform Treasury");
  for (const [name, route] of [["Discover Communities", "communities"], ["Meet the communities", "communities"],
    ["Explore platform tokens", "explore"], ["Visit the Launchpad", "launchpad"], ["Understand the Treasury", "treasury"]]) {
    await page.getByRole("link", { name, exact: true }).press("Enter");
    expect(new URL(page.url()).hash).toBe(`#${route}`);
    await page.goBack(); await expect(page.locator("#about-title")).toBeVisible();
  }
  await page.getByRole("button", { name: "Close page and view city", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "A city in motion." })).toBeVisible();
  await page.getByRole("button", { name: "Show page", exact: true }).press("Enter");
  await expect(page.locator("#about-title")).toBeVisible();
  await page.getByRole("link", { name: "Enter the World", exact: true }).press("Enter");
  expect(new URL(page.url()).pathname).toBe("/"); expect(new URL(page.url()).hash).toBe("");
  await open(); await page.getByRole("link", { name: "Explore the World", exact: true }).press("Enter");
  expect(new URL(page.url()).hash).toBe("");
  expect(await canvas.evaluate((node) => node === (window as any).__aboutCanvas)).toBe(true);
  expect(await city.getAttribute("data-camera")).toBe(camera);
  expect(await city.getAttribute("data-geometry-builds")).toBe(builds);
  expect(sockets).toHaveLength(1); expect(errors).toEqual([]);
});

for (const width of [390, 900]) test(`About deep links, refresh and responsive layout at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/about?source=fixtures"); await page.reload();
  await expect(page.locator("#about-title")).toBeVisible();
  expect(await page.locator(".about-shell").evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
  await expect(page.locator(".about-connection")).toContainText("Offline fixture preview");
  const close = page.getByRole("button", { name: "Close page and view city", exact: true });
  const box = (await close.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  for (const id of ["about-how-it-works", "about-agents", "about-economic-model", "about-technology", "about-status"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await page.locator(`#${id}`).boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  }
  await close.press("Enter"); await expect(page.getByRole("heading", { name: "A city in motion." })).toBeVisible();
  await page.getByRole("button", { name: "Show page", exact: true }).press("Enter");
  await expect(page.locator("#about-title")).toBeVisible();
  await page.goto("/?source=fixtures#/about"); await expect(page.locator("#about-title")).toBeVisible();
});

test("About remains readable during backend failure without inventing a connected world", async ({ page }) => {
  await page.route("**/api/v1/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":{"message":"Unavailable"}}' }));
  await page.goto("/about?source=backend");
  await expect(page.locator("#about-title")).toBeVisible();
  await expect(page.locator(".about-connection")).toContainText("City connection unavailable");
  await expect(page.locator(".about-page")).toContainText("no automatic fixture fallback");
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Close page and view city", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Couldn’t load the city" })).toBeVisible();
});
