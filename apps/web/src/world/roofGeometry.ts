import * as THREE from "three";

/** Closed solids, outward CCW winding. Base is y=0, ridge/high edge is y=1. */
function solid(vertices: number[], triangles: number[]) {
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  indexed.setIndex(triangles);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

export function gableGeometry() {
  return solid(
    [
      -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1,
      0.5,
    ],
    [0, 2, 1, 3, 4, 5, 0, 5, 2, 0, 3, 5, 1, 5, 4, 1, 2, 5, 0, 4, 3, 0, 1, 4],
  );
}

export function shedGeometry() {
  return solid(
    [
      -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, -0.5, -0.5, 0.18, -0.5, -0.5, 0, 0.5,
      0.5, 0, 0.5, 0.5, 1, 0.5, -0.5, 0.18, 0.5,
    ],
    [
      0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5, 3,
      7, 6, 3, 6, 2, 0, 1, 5, 0, 5, 4,
    ],
  );
}
