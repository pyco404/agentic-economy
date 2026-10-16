import { expect, test } from "@playwright/test";
const routes = ["World", "Explore", "Communities", "Agent Studio", "Economy", "Treasury", "Launchpad"];
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`one persistent live world beneath every route at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize(viewport);
    const errors: string[] = [], sockets: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("websocket", (socket) => { if (socket.url().includes("/api/v1/ws")) sockets.push(socket.url()); });
    await page.goto("/?source=backend");
    await expect(page.getByTestId("connection-status")).toContainText("connected", { timeout: 60000 });
    const city = page.getByTestId("city-canvas"), canvas = page.locator("canvas");
    await expect.poll(async () => Number(await city.getAttribute("data-rendered-buildings"))).toBeGreaterThan(100);
    const initialCamera = await city.getAttribute("data-camera");
    await page.getByRole("button", { name: "Rotate camera" }).click();
    await expect.poll(() => city.getAttribute("data-camera")).not.toBe(initialCamera);
    await canvas.evaluate((node) => { (window as any).__globalCanvas = node; });
    const camera = JSON.parse((await city.getAttribute("data-camera"))!);
    const builds = Number(await city.getAttribute("data-geometry-builds"));
    const firstSeq = Number(await page.locator(".app").getAttribute("data-stream-seq"));
    const navigate = async (name: string) => {
      if (viewport.width < 700 && name !== "World") await page.getByRole("button", { name: "Toggle navigation" }).click();
      if (name === "World") await page.getByRole("link", { name: "Agentic Economy home" }).click();
      else await page.getByRole("link", { name, exact: true }).click();
    };
    await page.screenshot({ path: `artifacts/global-${viewport.width}-world.png` });
    for (const route of routes.slice(1)) {
      await navigate(route);
      const layer = page.getByTestId("global-world");
      await expect(layer).toHaveAttribute("inert", "");
      await expect(canvas).toHaveCount(1);
      expect(await canvas.evaluate((node) => node === (window as any).__globalCanvas)).toBe(true);
      await expect(canvas).toHaveAttribute("tabindex", "-1");
      await page.waitForTimeout(350);
      const bounds = await canvas.boundingBox(); expect(bounds!.height + bounds!.y).toBe(viewport.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(JSON.parse((await city.getAttribute("data-camera"))!)).toEqual(camera);
      if (route === "Communities") {
        await page.getByLabel("Search communities").fill("no-such-community");
        await expect(page.locator(".discovery-card")).toHaveCount(0);
        await page.getByLabel("Search communities").fill("");
      }
      if (route === "Treasury") {
        const water = await city.getAttribute("data-water-flow-time");
        await page.waitForTimeout(400); expect(await city.getAttribute("data-water-flow-time")).toBe(water);
      }
      if (route === "Launchpad") {
        await page.getByLabel("Token name").fill("Persistent City");
        await page.getByLabel("Symbol", { exact: true }).fill("CITY");
        await page.getByRole("button", { name: "Review draft" }).click();
        await expect(page.getByRole("button", { name: "Wallet signing unavailable" })).toBeDisabled();
      }
      await page.mouse.wheel(0, 100); await page.waitForTimeout(100);
      expect(JSON.parse((await city.getAttribute("data-camera"))!)).toEqual(camera);
      await page.evaluate(() => document.getElementById("main")?.scrollTo(0, 0));
      await page.screenshot({ path: `artifacts/global-${viewport.width}-${route.toLowerCase().replace(" ", "-")}.png` });
    }
    await navigate("World");
    await expect(page.getByTestId("global-world")).not.toHaveAttribute("inert", "");
    await expect(canvas).toHaveAttribute("tabindex", "0");
    expect(JSON.parse((await city.getAttribute("data-camera"))!)).toEqual(camera);
    expect(Number(await city.getAttribute("data-geometry-builds"))).toBe(builds);
    expect(Number(await page.locator(".app").getAttribute("data-stream-seq"))).toBeGreaterThan(firstSeq);
    expect(sockets).toHaveLength(1); expect(errors).toEqual([]);
    expect(await canvas.evaluate((node) => node === (window as any).__globalCanvas)).toBe(true);
  });
}
