import { expect, test } from "@playwright/test";

test("palette instancing preserves rendered colors while reducing material draw calls", async ({ page }) => {
  await page.route("**/*", (route) => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Palette batching</title>" }) : route.continue());
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/src/world/geometry.ts", threePath = "/node_modules/.vite/deps/three.js";
    const { createBatch, geometryLibrary, disposeGroup } = await import(path);
    const THREE = await import(threePath);
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(320, 240);
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#f3e7cd");
    scene.add(new THREE.AmbientLight("white", 1));
    const camera = new THREE.OrthographicCamera(-10, 10, 7.5, -7.5, 0.1, 100);
    camera.position.set(15, 18, 15); camera.lookAt(5, 0, 5);
    const library = geometryLibrary(), matrix = new THREE.Matrix4();
    const colors = ["#ab6a55", "#6892a2", "#e5c795"];
    const parts = Array.from({ length: 36 }, (_, i) => ({ geometry: "box", color: colors[i % 3],
      position: [i % 6 * 2, 0.5, Math.floor(i / 6) * 2], scale: [1, 1, 1] }));
    const reference = new THREE.Group();
    for (const color of colors) {
      const subset = parts.filter((p) => p.color === color);
      const mesh = new THREE.InstancedMesh(library.box, new THREE.MeshLambertMaterial({ color }), subset.length);
      subset.forEach((p, i) => { matrix.makeTranslation(...p.position); mesh.setMatrixAt(i, matrix); });
      reference.add(mesh);
    }
    const gl = renderer.getContext();
    const pixels = () => {
      renderer.render(scene, camera);
      const data = new Uint8Array(320 * 240 * 4);
      gl.readPixels(0, 0, 320, 240, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return data;
    };
    scene.add(reference); const before = pixels(), oldCalls = renderer.info.render.calls;
    scene.remove(reference);
    const batch = createBatch(parts, library, false); scene.add(batch);
    const after = pixels(), newCalls = renderer.info.render.calls;
    let maxDifference = 0;
    for (let i = 0; i < before.length; i++) maxDifference = Math.max(maxDifference, Math.abs(before[i]! - after[i]!));
    const shared = new Set(Object.values(library));
    disposeGroup(reference, shared); disposeGroup(batch, shared);
    Object.values(library).forEach((g: any) => g.dispose()); renderer.dispose();
    return { oldCalls, newCalls, maxDifference };
  });
  expect(result.oldCalls).toBe(3);
  expect(result.newCalls).toBe(1);
  expect(result.maxDifference).toBeLessThanOrEqual(1);
});
