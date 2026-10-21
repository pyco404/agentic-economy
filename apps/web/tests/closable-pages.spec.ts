import { expect, test } from "@playwright/test";
for (const width of [1440, 390]) test(`Oxude-style hidden pages reopen over the same live city at ${width}px`, async ({ page }) => {
  test.setTimeout(600000);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  const sockets: string[] = []; page.on("websocket", (ws) => { if (ws.url().includes("/api/v1/ws")) sockets.push(ws.url()); });
  await page.goto("/?source=backend");
  const canvas = page.locator("canvas"), city = page.getByTestId("city-canvas");
  await expect.poll(async () => Number(await city.getAttribute("data-rendered-buildings")), { timeout: 60000 }).toBeGreaterThan(100);
  await expect(page.getByRole("link", { name: "World", exact: true })).toHaveCount(0);
  await canvas.evaluate((node) => { (window as any).__closeCanvas = node; });
  const camera = await city.getAttribute("data-camera");
  const nav = async (name: string) => {
    if (width === 390) await page.getByRole("button", { name: "Toggle navigation" }).press("Enter");
    await page.getByRole("link", { name, exact: true }).press("Enter");
  };
  const close = page.getByRole("button", { name: "Close page and view city", exact: true });
  for (const name of ["Explore", "Communities", "Agent Studio", "Economy", "Treasury", "Launch"]) {
    await nav(name); await expect(close).toBeFocused();
    const bounds = (await close.boundingBox())!; expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44);
    const url = page.url();
    if (name === "Communities") await page.getByRole("button", {name: "Explore Community", exact: true}).first().press("Enter");
    if (name === "Explore") await close.click();
    else await close.press("Enter");
    await expect(page.getByRole("heading", { name: "A city in motion." })).toBeVisible();
    await expect(canvas).toBeFocused(); expect(page.url()).toBe(url);
    await expect(page.locator('.nav [aria-current="page"]')).toHaveCount(0);
    expect(await canvas.evaluate((node) => node === (window as any).__closeCanvas)).toBe(true);
    expect(await city.getAttribute("data-camera")).toBe(camera);
    await expect(page.getByTestId("global-world")).toHaveAttribute("data-interactive", "true");
    await page.getByRole("button", { name: "Show page", exact: true }).press("Enter");
    await expect(page.getByTestId("global-world")).toHaveAttribute("data-interactive", "false");
    await expect(close).toBeVisible(); expect(page.url()).toBe(url);
    if (name === "Communities") { await expect(page.getByRole("dialog")).toBeVisible(); await page.getByRole("button", { name: "Back to communities" }).press("Enter"); }
  }
  await nav("Explore");
  const token = page.locator(".discovery-card").first();
  if (await token.count()) {
    await token.press("Enter"); const detail = page.url(); await close.press("Enter");
    expect(page.url()).toBe(detail); await page.getByRole("button", { name: "Show page", exact: true }).press("Enter"); expect(page.url()).toBe(detail);
  }
  await nav("Economy"); await nav("Launch"); await close.focus(); await page.keyboard.press("Enter");
  await page.goBack(); await expect(page.getByRole("heading", { name: "From fields to front doors." })).toBeVisible();
  await page.goForward(); await expect(page.getByRole("heading", { name: "Give your community a home." })).toBeVisible();
  expect(sockets).toHaveLength(1);
  await page.getByLabel("Token name").fill("Retained Community"); await page.getByLabel("Symbol", { exact: true }).fill("KEEP");
  await page.getByRole("textbox", { name: "Description", exact: true }).fill("A draft, never a transaction.");
  await close.press("Enter"); await page.screenshot({ path: `artifacts/root-city-${width}-show-page.png` });
  await page.getByRole("button", { name: "Show page", exact: true }).press("Enter");
  await expect(page.getByLabel("Token name")).toHaveValue("Retained Community");
  await page.reload(); await expect(page.getByRole("textbox", { name: "Description", exact: true })).toHaveValue("A draft, never a transaction.", { timeout: 60000 });
  await page.keyboard.press("Escape"); await expect(page.getByLabel("Token name")).toHaveValue("Retained Community");
  await page.getByRole("link", { name: "Agentic Economy home" }).press("Enter");
  expect(new URL(page.url()).pathname).toBe("/"); expect(new URL(page.url()).hash).toBe("");
  await expect(page.getByRole("button", { name: "Show page", exact: true })).toHaveCount(0);
});
test("legacy World URLs normalize to root and secondary deep links remain available", async ({ page }) => {
  test.setTimeout(180000);
  for (const suffix of ["/world?source=fixtures", "/?source=fixtures#world", "/?source=fixtures#/world"]) {
    await page.goto(suffix); await expect(page.getByRole("heading", { name: "A city in motion." })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/"); expect(new URL(page.url()).hash).toBe("");
  }
  await page.goto("/economy?source=fixtures"); await page.reload();
  await expect(page.getByRole("heading", { name: "From fields to front doors." })).toBeVisible();
  await page.goto("/?source=fixtures#/studio"); await page.getByLabel("Agent name", { exact: true }).fill("Strategy Draft");
  await page.getByRole("combobox", { name: "Risk", exact: true }).selectOption("high");
  await page.getByRole("button", { name: "Close page and view city" }).press("Enter");
  await page.getByRole("button", { name: "Show page", exact: true }).press("Enter");
  await expect(page.getByLabel("Agent name", { exact: true })).toHaveValue("Strategy Draft");
  await page.reload(); await expect(page.getByRole("combobox", { name: "Risk", exact: true })).toHaveValue("high", { timeout: 60000 });
});
test("hiding does not discard memory-only drafts and route changes remain guarded", async ({ page }) => {
  await page.goto("/?source=fixtures#launchpad");
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error("Storage disabled"); }; });
  await page.getByLabel("Token name").fill("Memory Draft");
  await page.getByRole("button", { name: "Close page and view city" }).press("Enter");
  await page.getByRole("button", { name: "Show page", exact: true }).press("Enter");
  await expect(page.getByLabel("Token name")).toHaveValue("Memory Draft");
  let answer = false; page.on("dialog", (dialog) => answer ? dialog.accept() : dialog.dismiss());
  await page.getByRole("link", { name: "Economy", exact: true }).press("Enter");
  await expect(page.getByLabel("Token name")).toHaveValue("Memory Draft");
  answer = true; await page.getByRole("link", { name: "Economy", exact: true }).press("Enter");
  await page.goBack(); await expect(page.getByLabel("Token name")).toHaveValue("Memory Draft");
  await expect(page.getByRole("note")).toContainText("Browser storage unavailable");
});
test("backend-error overlays can hide and reopen without changing their route", async ({ page }) => {
  await page.route("**/api/v1/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Unavailable" } }) }));
  await page.goto("/treasury?source=backend");
  await expect(page.getByRole("heading", { name: "Couldn’t load the city" })).toBeVisible();
  const url = page.url(); await page.getByRole("button", { name: "Close page and view city" }).press("Enter");
  expect(page.url()).toBe(url); await page.getByRole("button", { name: "Show page", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Close page and view city" })).toBeVisible();
});
