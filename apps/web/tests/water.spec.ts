import { expect, test } from "@playwright/test";

test("water pixels advect left to right while banks stay fixed, including instanced canals", async ({ page }) => {
  await page.route("**/*", (route) => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Water flow</title>" })
    : route.continue());
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const modulePath = "/src/world/waterFlow.ts", threePath = "/node_modules/.vite/deps/three.js";
    const { createWaterMaterial, updateWaterFlow } = await import(modulePath);
    const THREE = await import(threePath);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(400, 260);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f3e7cd");
    scene.add(new THREE.AmbientLight("white", 2));
    const water = new THREE.InstancedMesh(new THREE.BoxGeometry(24, 0.03, 18), createWaterMaterial(), 1);
    water.setMatrixAt(0, new THREE.Matrix4());
    scene.add(water);
    const camera = new THREE.OrthographicCamera(-400 / 26, 400 / 26, 10, -10, 0.1, 1000);
    camera.position.set(100, 90, 100);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const gl = renderer.getContext();
    const capture = (time: number) => {
      updateWaterFlow(time, camera);
      renderer.render(scene, camera);
      const pixels = new Uint8Array(400 * 260 * 4);
      gl.readPixels(0, 0, 400, 260, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const results = [];
    for (const zoom of [1, 1.65, 4.9269]) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      const before = capture(0), after = capture(10 / (0.85 * 13 * zoom));
      let shiftedError = 0, stillError = 0, outsideChanges = 0;
      for (let y = 112; y < 148; y++) for (let x = 175; x < 215; x++)
        for (let c = 0; c < 3; c++) {
          const i = (y * 400 + x) * 4 + c;
          shiftedError += Math.abs(before[i]! - after[i + 40]!);
          stillError += Math.abs(before[i]! - after[i]!);
        }
      if (zoom === 1) for (let y = 0; y < 25; y++) for (let x = 0; x < 400; x++)
        if (before[(y * 400 + x) * 4] !== after[(y * 400 + x) * 4]) outsideChanges++;
      results.push({ zoom, shiftedError, stillError, outsideChanges,
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
    }
    water.geometry.dispose();
    water.material.dispose();
    renderer.dispose();
    return results;
  });
  for (const result of results) {
    expect(result.stillError).toBeGreaterThan(100);
    expect(result.shiftedError).toBeLessThan(result.stillError * 0.15);
    expect(result.outsideChanges).toBe(0);
    expect(result.calls).toBe(1);
    expect(result.triangles).toBe(12);
  }
});

test("live water pauses, respects reduced motion, and survives camera rotation", async ({ page }) => {
  await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204 }));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${message.text()} ${message.location().url}`);
  });
  await page.goto("/?source=backend");
  const city = page.getByTestId("city-canvas");
  await expect(page.getByTestId("connection-status")).toContainText("connected", { timeout: 45000 });
  await expect(city).toHaveAttribute("data-water-flow-direction", "screen-right");
  await expect.poll(async () => Number(await city.getAttribute("data-water-flow-time"))).toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "Pause city animation" }).click();
  const paused = await city.getAttribute("data-water-flow-time");
  await page.waitForTimeout(250);
  expect(await city.getAttribute("data-water-flow-time")).toBe(paused);
  await page.getByRole("button", { name: /Resume city animation/ }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(200);
  const reduced = await city.getAttribute("data-water-flow-time");
  await page.waitForTimeout(250);
  expect(await city.getAttribute("data-water-flow-time")).toBe(reduced);
  await page.getByRole("button", { name: /Rotate/ }).click();
  expect(errors).toEqual([]);
});
