import { test, expect } from "@playwright/test";

test("real WebGL renders outward roof slopes over the wall instead of white underside triangles", async ({
  page,
}) => {
  // Load a minimal same-origin document: this GPU geometry regression does not
  // depend on simulation activity or compete with a second full-city renderer.
  await page.route("**/*", (route) =>
    route.request().isNavigationRequest()
      ? route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Roof regression</title>",
        })
      : route.continue(),
  );
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/src/world/geometry.ts",
      threePath = "/node_modules/.vite/deps/three.js";
    const { geometryLibrary } = await import(path),
      THREE = await import(threePath);
    const library = geometryLibrary();
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(160, 160);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#111111");
    const roofMaterial = new THREE.MeshBasicMaterial({ color: "#d39477" });
    const wallGeometry = new THREE.BoxGeometry(1, 0.5, 1),
      wallMaterial = new THREE.MeshBasicMaterial({ color: "#fff8e9" });
    const roof = new THREE.Mesh(library.roof, roofMaterial),
      wall = new THREE.Mesh(wallGeometry, wallMaterial);
    roof.position.y = 0.015;
    wall.position.y = -0.25;
    scene.add(roof, wall);
    const camera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 20);
    const pixels = [];
    for (const side of [-1, 1]) {
      camera.position.set(side * 3, 2.7, 3);
      camera.lookAt(0, 0.4, 0);
      camera.updateMatrixWorld();
      renderer.render(scene, camera);
      const point = new THREE.Vector3(side * 0.22, 0.575, 0.05).project(camera);
      const pixel = new Uint8Array(4),
        gl = renderer.getContext();
      gl.readPixels(
        Math.floor((point.x + 1) * 80),
        Math.floor((point.y + 1) * 80),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel,
      );
      pixels.push([...pixel]);
    }
    renderer.dispose();
    renderer.forceContextLoss();
    roofMaterial.dispose();
    wallMaterial.dispose();
    wallGeometry.dispose();
    Object.values(library).forEach((g: any) => g.dispose());
    return pixels;
  });
  for (const pixel of result) {
    // Lighting-independent roof albedo, not the pale coplanar wall top.
    expect(pixel.slice(0, 3)).toEqual([211, 148, 119]);
    expect(pixel[3]).toBe(255);
  }
});
