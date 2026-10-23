import { expandWorldControls } from "./world-controls";
import { expect, test } from "@playwright/test";
import { defaultWorldFrame, WORLD_CAMERA } from "../src/world/framing";
import { generateWorld, WORLD_SEED } from "../src/world/layout";

type CameraSnapshot = { position: number[]; target: number[]; zoom: number };
type CameraWindow = Window & { __cameraCanvas?: Element };

const viewports = [
  { width: 320, height: 694 }, { width: 390, height: 844 },
  { width: 768, height: 1024 }, { width: 1024, height: 768 },
  { width: 1280, height: 800 }, { width: 1440, height: 1089 },
  { width: 844, height: 390 },
];
for (const viewport of viewports) {
  test(`front-facing responsive default and reset at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?source=backend");
    const city = page.getByTestId("city-canvas"), canvas = page.locator("canvas");
    const camera = async () => JSON.parse((await city.getAttribute("data-camera"))!);
    await expect.poll(async () => Number(await city.getAttribute("data-rendered-buildings")), { timeout: 90000 }).toBeGreaterThan(100);
    const home = await camera();
    const expectHome = async () => {
      const value = await camera();
      expect(value.zoom).toBeCloseTo(home.zoom, 8);
      for (const key of ["position", "target"] as const) value[key].forEach((n: number, i: number) =>
        expect(n).toBeCloseTo(home[key][i], 8));
    };
    const rect = (await city.boundingBox())!;
    const expected = defaultWorldFrame(generateWorld(WORLD_SEED, 156), rect.width, rect.height);
    expect(home.zoom).toBeCloseTo(expected.zoom, 5);
    const direction = (value: CameraSnapshot) => {
      const delta = value.position.map((n: number, i: number) => n - value.target[i]!);
      const length = Math.hypot(...delta); return delta.map((n: number) => n / length);
    };
    const length = Math.hypot(...WORLD_CAMERA.eye);
    direction(home).forEach((n: number, i: number) => expect(n).toBeCloseTo(WORLD_CAMERA.eye[i]! / length, 6));
    await expect(city).toHaveAttribute("data-reveal-stage", "complete", { timeout: 180000 });
    await expect(city).toHaveAttribute("data-reveal-scenery-ready", "true", { timeout: 180000 });
    await expectHome(); // Static scenery and transport readiness never reframe the camera.
    await page.screenshot({ path: `artifacts/camera-approved-${viewport.width}x${viewport.height}.png` });
    await canvas.evaluate((node) => { (window as CameraWindow).__cameraCanvas = node; });
    await expandWorldControls(page); await page.getByRole("button", { name: "Rotate camera" }).press("Enter");
    await expect.poll(async () => (await camera()).position[0]).not.toBe(home.position[0]);
    const manual = await camera();
    await page.setViewportSize({ width: viewport.width + 10, height: viewport.height });
    await expect.poll(async () => (await city.boundingBox())!.width).toBe(viewport.width + 10);
    expect((await camera()).zoom).toBe(manual.zoom);
    expect((await camera()).target).toEqual(manual.target);
    direction(await camera()).forEach((n: number, i: number) => expect(n).toBeCloseTo(direction(manual)[i]!, 6));
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "Zoom in", exact: true }).press("Enter");
    await expect.poll(async () => (await camera()).zoom).toBeGreaterThan(home.zoom);
    await expandWorldControls(page); await page.getByRole("button", { name: "Reset camera" }).press("Enter");
    await expect.poll(async () => Math.hypot(...(await camera()).target.map((n: number, i: number) => n - home.target[i]))).toBeLessThan(.05);
    expect((await camera()).zoom).toBe(home.zoom);
    direction(await camera()).forEach((n: number, i: number) => expect(n).toBeCloseTo(direction(home)[i]!, 5));
    if (viewport.width === 1440) {
      await page.getByRole("button", { name: "Enter immersive mode" }).press("Enter");
      expect((await camera()).zoom).toBe(home.zoom);
      await page.screenshot({ path: "artifacts/camera-approved-immersive.png" });
      await page.getByRole("button", { name: "Exit immersive mode" }).press("Enter");
      await page.getByRole("link", { name: "About Agentic Economy" }).press("Enter");
      await page.getByRole("button", { name: "Close page and view city" }).press("Enter");
      expect((await camera()).zoom).toBe(home.zoom);
      await page.screenshot({ path: "artifacts/camera-approved-return.png" });
      await page.reload();
      await expect(city).toHaveAttribute("data-reveal-stage", "complete", { timeout: 180000 });
      await expectHome();
      await page.screenshot({ path: "artifacts/camera-approved-refresh.png" });
      await canvas.evaluate((node) => { (window as CameraWindow).__cameraCanvas = node; });
    }
    await canvas.focus(); await page.keyboard.press("Home");
    await expect.poll(async () => (await camera()).zoom).toBe(home.zoom);
    expect(await canvas.evaluate((node) => node === (window as CameraWindow).__cameraCanvas)).toBe(true);
    expect(errors).toEqual([]);
  });
}
