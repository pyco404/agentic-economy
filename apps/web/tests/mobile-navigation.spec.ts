import { waitForApplicationReady } from "./startup";
import { expect, test } from "@playwright/test";

for (const width of [390, 820]) test(`floating navigation keeps the live world intact at ${width}px`, async ({ page }) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  const sockets: string[] = [], errors: string[] = [];
  page.on("websocket", (socket) => { if (socket.url().includes("/api/v1/ws")) sockets.push(socket.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?source=backend");
  await waitForApplicationReady(page);
  const canvas = page.locator("canvas"), city = page.getByTestId("city-canvas");
  await expect.poll(async () => Number(await city.getAttribute("data-rendered-buildings")), { timeout: 60000 }).toBeGreaterThan(100);
  await canvas.evaluate((node) => { (window as any).__menuCanvas = node; });
  const original = JSON.parse((await city.getAttribute("data-camera"))!);
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  const dialog = page.getByRole("dialog", { name: "Navigation", exact: true });
  await toggle.press("Enter");
  await expect(dialog).toBeVisible(); await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(page.locator(".app")).toHaveAttribute("inert", "");
  await expect(dialog.getByRole("button", { name: "Close navigation" })).toBeFocused();
  const links = dialog.locator(".mobile-navigation-pages a"), boxes = await links.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect(); return { y: rect.y, x: rect.x, height: rect.height, width: rect.width };
  }));
  expect(boxes).toHaveLength(7);
  await expect(links).toHaveText(["Launch", "Explore", "Communities", "Agent Studio", "Economy", "Treasury", "Roadmap"]);
  for (let i = 0; i < boxes.length; i++) {
    expect(boxes[i]!.height).toBeGreaterThanOrEqual(44);
    expect(boxes[i]!.width).toBeGreaterThan(220);
    if (i) expect(boxes[i]!.y).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height);
  }
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("link", { name: "View Agentic Economy on GitHub" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close navigation" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0); await expect(toggle).toBeFocused();
  await expect(page.locator(".app")).not.toHaveAttribute("inert", "");
  await toggle.press("Enter");
  await page.mouse.click(5, width === 390 ? 800 : 900);
  await expect(dialog).toHaveCount(0); await expect(toggle).toBeFocused();
  for (const [label, route] of [["Launch", "launchpad"], ["Explore", "explore"], ["Communities", "communities"], ["Agent Studio", "studio"],
    ["Economy", "economy"], ["Treasury", "treasury"], ["Roadmap", "roadmap"]]) {
    await toggle.press("Enter");
    await dialog.getByRole("link", { name: label, exact: true }).press("Enter");
    await expect(dialog).toHaveCount(0); expect(new URL(page.url()).pathname).toBe(route === "studio" ? "/agent-studio" : `/${route}`); expect(new URL(page.url()).hash).toBe("");
    await expect(page.getByRole("button", { name: "Close page and view city", exact: true })).toBeFocused();
    await toggle.press("Enter"); await expect(dialog.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    await dialog.getByRole("button", { name: "Close navigation" }).press("Enter");
    await page.getByRole("button", { name: "Close page and view city", exact: true }).press("Enter");
  }
  await toggle.press("Enter");
  await expect(dialog.locator('[aria-current="page"]')).toHaveCount(0);
  await dialog.getByRole("link", { name: "About the world" }).press("Enter");
  await expect(page.locator("#about-title")).toBeVisible();
  await page.getByRole("button", { name: "Close page and view city", exact: true }).press("Enter");
  const after = JSON.parse((await city.getAttribute("data-camera"))!);
  expect(after.zoom).toBe(original.zoom);
  for (const field of ["position", "target"]) after[field].forEach((value: number, i: number) => expect(value).toBeCloseTo(original[field][i], 8));
  expect(await canvas.evaluate((node) => node === (window as any).__menuCanvas)).toBe(true);
  expect(sockets).toHaveLength(1); expect(errors).toEqual([]);
  await toggle.press("Enter"); await page.setViewportSize({ width: 1200, height: 1000 });
  await expect(dialog).toHaveCount(0); await expect(page.locator(".app")).not.toHaveAttribute("inert", "");
  await expect(page.getByRole("link", { name: "Explore", exact: true })).toBeVisible();
  await expect(page.locator("nav.nav a")).toHaveText(["Launch", "Explore", "Communities", "Agent Studio", "Economy", "Treasury", "Roadmap"]);
});

test("mobile menu scrolls in short viewports and respects reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 450 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?source=fixtures");
  await waitForApplicationReady(page);
  await page.getByRole("button", { name: "Toggle navigation" }).press("Enter");
  const dialog = page.getByRole("dialog", { name: "Navigation", exact: true });
  const box = (await dialog.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(12); expect(box.y + box.height).toBeLessThanOrEqual(438);
  expect(await dialog.evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
  await dialog.getByRole("link", { name: "About the world" }).focus();
  await expect.poll(() => dialog.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press("Enter"); await expect(page.locator("#about-title")).toBeVisible();
});
