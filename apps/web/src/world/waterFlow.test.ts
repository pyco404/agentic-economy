import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createWaterMaterial, waterDirection } from "./waterFlow";

describe("water surface flow", () => {
  it("travels screen-right at every orbit orientation without a vertical component", () => {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
      camera.position.set(Math.cos(angle) * 100, 90, Math.sin(angle) * 100);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const flow = waterDirection(camera);
      const origin = new THREE.Vector3().project(camera);
      const moved = new THREE.Vector3(flow.x, 0, flow.y).project(camera);
      expect(flow.length()).toBeCloseTo(1);
      expect(moved.x).toBeGreaterThan(origin.x);
      expect(moved.y).toBeCloseTo(origin.y);
    }
  });

  it("uses opaque depth-writing water rather than transparent overlays", () => {
    for (const vertexColors of [false, true]) {
      const material = createWaterMaterial(vertexColors);
      expect(material.transparent).toBe(false);
      expect(material.depthWrite).toBe(true);
      expect(material.vertexColors).toBe(vertexColors);
      material.dispose();
    }
  });
});
