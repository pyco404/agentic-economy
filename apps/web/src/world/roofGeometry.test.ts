import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { generateBuilding, geometryLibrary } from "./geometry";
import type { BuildingVisual, RoofStyle } from "./layout";

const building: BuildingVisual = {
  id: "roof-test",
  seed: 21,
  kind: "house",
  x: 0,
  z: 0,
  width: 6,
  depth: 5,
  height: 5,
  floors: 3,
  roofStyle: "gable",
  roofColor: "#d39477",
  rotation: 0,
  name: "Roof test",
  chunkId: "0:0",
};

describe("procedural roof placement", () => {
  it("places pitched roofs above wall tops and keeps sawtooth rows disjoint", () => {
    const library = geometryLibrary();
    for (const style of ["gable", "hip", "shed", "sawtooth"] as RoofStyle[]) {
      const roofs = generateBuilding({ ...building, roofStyle: style }).filter(
        (part) => part.role === "roof",
      );
      expect(roofs.length).toBeGreaterThan(0);
      const boxes = roofs.map((part) => {
        const matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(...part.position),
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(...(part.rotation ?? [0, 0, 0])),
          ),
          new THREE.Vector3(...part.scale),
        );
        const geometry = library[part.geometry as keyof typeof library];
        geometry.computeBoundingBox();
        const box = geometry.boundingBox!.clone().applyMatrix4(matrix);
        expect(box.min.y).toBeGreaterThan(building.height + 0.25);
        return box;
      });
      if (style === "sawtooth") {
        boxes.sort((a, b) => a.min.z - b.min.z);
        for (let i = 1; i < boxes.length; i++)
          expect(boxes[i - 1]!.max.z).toBeLessThanOrEqual(
            boxes[i]!.min.z + 0.00001,
          );
      }
    }
    Object.values(library).forEach((g) => g.dispose());
  });

  it("butts flat-roof parapets without overlapping top faces and seats awning stripes above the canopy", () => {
    const parts = generateBuilding({ ...building, roofStyle: "flat" });
    const parapets = parts.filter((part) => part.color === "#dbd6c9");
    expect(parapets).toHaveLength(2);
    const boxes = parapets.map((part) =>
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(...part.position),
        new THREE.Vector3(...part.scale),
      ),
    );
    const overlap = boxes[0]!
      .clone()
      .intersect(boxes[1]!)
      .getSize(new THREE.Vector3());
    expect(overlap.x * overlap.y * overlap.z).toBeLessThan(0.000001);
    const slab = parts.find((part) => part.role === "roof")!;
    for (const box of boxes)
      expect(box.min.y).toBeCloseTo(slab.position[1] + slab.scale[1] / 2);
    const bakery = generateBuilding({ ...building, kind: "bakery" });
    const canopy = bakery.find(
      (part) => part.position[1] === 1.65 && part.scale[1] === 0.12,
    )!;
    const stripes = bakery.filter((part) => part.position[1] === 1.735);
    expect(stripes).toHaveLength(4);
    for (const stripe of stripes)
      expect(stripe.position[1] - stripe.scale[1] / 2).toBeCloseTo(
        canopy.position[1] + canopy.scale[1] / 2,
      );
  });
});
