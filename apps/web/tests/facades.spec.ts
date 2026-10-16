import { test, expect } from "@playwright/test";

test("windows and doors contribute visible pixels at the normal gameplay camera", async ({ page }) => {
  await page.route("**/*", (route) => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Facade readability</title>" })
    : route.continue());
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const geometryPath = "/src/world/geometry.ts";
    const threePath = "/node_modules/.vite/deps/three.js";
    const { generateBuilding, geometryLibrary, createBatch, disposeGroup } = await import(geometryPath);
    const THREE = await import(threePath);
    const width = 1440, height = 914;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f3e7cd");
    scene.add(new THREE.HemisphereLight("#ffffff", "#e0d3b8", 0.9));
    const sun = new THREE.DirectionalLight("#fff6e7", 1.71);
    sun.position.set(-60, 100, 30);
    scene.add(sun);
    const library = geometryLibrary();
    const parts = generateBuilding({ id: "readability", seed: 10, kind: "house",
      x: 0, z: 0, width: 6, depth: 5, height: 6, floors: 3, roofStyle: "gable",
      roofColor: "#d39477", rotation: 0, name: "Readability", chunkId: "0:0",
      windowPattern: "grid" });
    const group = createBatch(parts, library);
    scene.add(group);
    const camera = new THREE.OrthographicCamera(-100 * width / height,
      100 * width / height, 100, -100, 0.1, 1200);
    camera.position.set(100, 90, 100);
    camera.lookAt(0, 0, 0);
    const gl = renderer.getContext();
    const capture = () => {
      renderer.render(scene, camera);
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const results = [];
    for (const zoom of [1.65, 2.8512]) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      group.children.forEach((mesh: any) => { mesh.visible = !mesh.userData.detail || zoom > 2.3; });
      const baseline = capture();
      for (const role of ["window", "door"]) {
        const meshes = group.children.filter((mesh: any) => mesh.userData.role === role);
        const visible = meshes.every((mesh: any) => mesh.visible);
        meshes.forEach((mesh: any) => { mesh.visible = false; });
        const without = capture();
        let changedPixels = 0;
        for (let i = 0; i < baseline.length; i += 4)
          if (Math.max(...[0, 1, 2].map((c) => Math.abs(baseline[i + c]! - without[i + c]!))) > 12)
            changedPixels++;
        meshes.forEach((mesh: any) => { mesh.visible = true; });
        results.push({ zoom, role, visible, changedPixels });
      }
    }
    disposeGroup(group, new Set(Object.values(library)));
    Object.values(library).forEach((g: any) => g.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    return results;
  });
  for (const result of results) {
    expect(result.visible, `${result.role} at zoom ${result.zoom}`).toBe(true);
    expect(result.changedPixels, `${result.role} at zoom ${result.zoom}`).toBeGreaterThan(10);
  }
});
