import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1440, height: 1000 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
  test(`closer civic camera survives refresh, reset, routes and immersive mode at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(300000);
    page.setDefaultNavigationTimeout(90000);
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?source=backend");
    const city = page.getByTestId("city-canvas"), canvas = page.locator("canvas");
    const camera = async () => JSON.parse((await city.getAttribute("data-camera"))!);
    await expect.poll(async () => Number(await city.getAttribute("data-rendered-buildings")), { timeout: 60000 }).toBeGreaterThan(100);
    const home = await camera(), expectedZoom = Math.min(2.85, 200 * viewport.width / (viewport.height - 64) / 58);
    expect(home.zoom).toBeCloseTo(expectedZoom, 5);
    const civic = await page.evaluate(async () => {
      // @ts-expect-error Browser imports the running Vite source module.
      const { worldChunkToVisual } = await import("/src/api/adapter.ts");
      const response = await fetch("http://127.0.0.1:8787/api/v1/world/chunks?x=1&y=1&radius=4");
      const chunks = (await response.json()).chunks.map(worldChunkToVisual);
      return chunks.flatMap((c: any) => c.buildings).filter((b: any) => b.kind === "town-hall").sort((a: any, b: any) => a.id.localeCompare(b.id))[0];
    });
    expect(home.target).toEqual([civic.x, 0, civic.z]);
    const polar = (value: any) => Math.acos((value.position[1] - value.target[1]) /
      Math.hypot(...value.position.map((n: number, i: number) => n - value.target[i])));
    expect(polar(home)).toBeCloseTo(Math.atan2(Math.hypot(100, 100), 90), 6);
    await page.reload();
    await expect.poll(async () => Number(await city.getAttribute("data-rendered-buildings")), { timeout: 60000 }).toBeGreaterThan(100);
    expect(await camera()).toEqual(home);
    await canvas.evaluate((node) => { (window as any).__cameraCanvas = node; });
    await page.getByRole("button", { name: "Zoom in", exact: true }).press("Enter");
    await expect.poll(async () => (await camera()).zoom).toBeGreaterThan(home.zoom);
    await page.getByRole("button", { name: "Rotate camera" }).press("Enter");
    await canvas.focus(); await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await camera()).target[0]).not.toBe(home.target[0]);
    const manual = await camera();
    await page.setViewportSize({ width: viewport.width + 10, height: viewport.height });
    await expect.poll(async () => (await camera()).zoom).toBe(manual.zoom);
    expect((await camera()).target).toEqual(manual.target);
    await page.setViewportSize(viewport);
    await page.getByRole("link", { name: "About Agentic Economy" }).press("Enter");
    await page.getByRole("button", { name: "Close page and view city" }).press("Enter");
    expect((await camera()).zoom).toBe(manual.zoom);
    expect((await camera()).target).toEqual(manual.target);
    await page.getByRole("button", { name: "Reset camera" }).press("Enter");
    await expect.poll(async () => Math.hypot(...(await camera()).target.map((n: number, i: number) => n - home.target[i])), { timeout: 30000 }).toBeLessThan(.05);
    expect((await camera()).zoom).toBe(home.zoom);
    expect(polar(await camera())).toBeCloseTo(polar(home), 4);
    await page.getByRole("button", { name: "Enter immersive mode" }).press("Enter");
    expect((await camera()).zoom).toBe(home.zoom);
    await page.getByRole("button", { name: "Exit immersive mode" }).press("Enter");
    await page.getByRole("button", { name: "Zoom out", exact: true }).press("Enter");
    await expect.poll(async () => (await camera()).zoom).toBeLessThan(home.zoom);
    await canvas.focus(); await page.keyboard.press("Home");
    await expect.poll(async () => (await camera()).zoom).toBe(home.zoom);
    expect(await canvas.evaluate((node) => node === (window as any).__cameraCanvas)).toBe(true);
    expect(errors).toEqual([]);
  });
}
