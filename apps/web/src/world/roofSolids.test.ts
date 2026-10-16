import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { gableGeometry, shedGeometry } from "./roofGeometry";

describe("closed procedural roof solids", () => {
  for (const [name, make, volume] of [
    ["gable", gableGeometry, 0.5],
    ["shed", shedGeometry, 0.59],
  ] as const) {
    it(`${name} has outward, non-degenerate triangles and a watertight boundary`, () => {
      const geometry = make(),
        positions = geometry.getAttribute("position"),
        edges = new Map<string, number>();
      let signedVolume = 0;
      const inside = new THREE.Vector3(0, 0.2, 0);
      for (let i = 0; i < positions.count; i += 3) {
        const [a, b, c] = [0, 1, 2].map((offset) =>
          new THREE.Vector3().fromBufferAttribute(positions, i + offset),
        ) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
        const normal = b.clone().sub(a).cross(c.clone().sub(a));
        expect(normal.length()).toBeGreaterThan(0.0001);
        expect(
          normal.dot(
            a
              .clone()
              .add(b)
              .add(c)
              .multiplyScalar(1 / 3)
              .sub(inside),
          ),
        ).toBeGreaterThan(0);
        signedVolume += a.dot(b.clone().cross(c)) / 6;
        const vertices = [a, b, c];
        for (let j = 0; j < 3; j++) {
          const key = [
            vertices[j]!.toArray().join(","),
            vertices[(j + 1) % 3]!.toArray().join(","),
          ]
            .sort()
            .join("|");
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      expect([...edges.values()].every((count) => count === 2)).toBe(true);
      expect(signedVolume).toBeCloseTo(volume, 5);
      geometry.dispose();
    });
  }

  it("front-side rays from above hit both gable slopes, never the coplanar underside", () => {
    const geometry = gableGeometry(),
      material = new THREE.MeshLambertMaterial(),
      mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld();
    for (const x of [-0.2, 0.2]) {
      const hits = new THREE.Raycaster(
        new THREE.Vector3(x, 3, 0),
        new THREE.Vector3(0, -1, 0),
      ).intersectObject(mesh);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]!.point.y).toBeCloseTo(0.6);
      expect(hits[0]!.face!.normal.y).toBeGreaterThan(0);
    }
    geometry.dispose();
    material.dispose();
  });
});
