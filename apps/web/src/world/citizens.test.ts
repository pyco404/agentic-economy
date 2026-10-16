import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createCitizens } from "./citizens";

describe("procedural citizens", () => {
  it("keeps 512 complete characters in three batches and maps body parts to their citizen", () => {
    const citizens = createCitizens(512);
    for (let i = 0; i < 512; i++) citizens.set(i, i, 2, 0, i, true, "#789684");
    citizens.finish(512);
    expect(citizens.meshes.map((mesh) => mesh.count)).toEqual([
      1536, 1536, 1024,
    ]);
    expect(
      citizens.meshes.map(
        (mesh) =>
          (mesh.geometry.index?.count ??
            mesh.geometry.getAttribute("position").count) / 3,
      ),
    ).toEqual([12, 20, 12]);
    citizens.meshes.forEach((mesh) => {
      expect(mesh.boundingSphere?.radius).toBeGreaterThan(0);
      expect([...mesh.instanceMatrix.array].every(Number.isFinite)).toBe(true);
    });
    expect(Math.floor(1023 / citizens.meshes[2]!.userData.citizenStride)).toBe(
      511,
    );
    expect(Math.floor(1535 / citizens.meshes[0]!.userData.citizenStride)).toBe(
      511,
    );
    expect(Math.floor(1535 / citizens.meshes[1]!.userData.citizenStride)).toBe(
      511,
    );
    citizens.finish(2);
    expect(citizens.meshes.map((mesh) => mesh.count)).toEqual([6, 6, 4]);
    citizens.dispose();
  });

  it("faces travel direction and rests both feet when stationary", () => {
    const citizens = createCitizens(1),
      matrix = new THREE.Matrix4();
    citizens.set(0, 10, 20, Math.PI / 2, Math.PI / 2, true, "#789684");
    citizens.meshes[0]!.getMatrixAt(0, matrix);
    const forward = new THREE.Vector3(0, 0, 1).transformDirection(matrix);
    expect(forward.x).toBeCloseTo(1);
    citizens.meshes[2]!.getMatrixAt(0, matrix);
    expect(matrix.elements[13]).toBeCloseTo(0.36);
    const movingLeg = matrix.clone();
    citizens.set(0, 10, 20, Math.PI / 2, Math.PI / 2, false, "#789684");
    citizens.meshes[2]!.getMatrixAt(0, matrix);
    expect(matrix.equals(movingLeg)).toBe(false);
    expect(matrix.elements[1]).toBeCloseTo(0);
    citizens.meshes[0]!.getMatrixAt(0, matrix);
    expect(matrix.elements[13]).toBeCloseTo(0.73);
    citizens.set(0, 10, 20, Math.PI / 2, 0, false, "#789684", true);
    for (const hand of [1, 2]) {
      citizens.meshes[1]!.getMatrixAt(hand, matrix);
      // Both hands reach forward with the citizen's heading, at crate height.
      expect(matrix.elements[12]).toBeGreaterThan(10.2);
      expect(matrix.elements[13]).toBeGreaterThan(0.7);
      expect(matrix.elements[13]).toBeLessThan(0.8);
    }
    citizens.dispose();
  });
});
