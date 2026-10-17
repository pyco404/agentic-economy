import * as THREE from "three";
import type { ChunkVisual } from "./layout";

/** Gameplay framing, independent of the expanding terrain footprint. Orthographic
 * zoom changes apparent scale only; the original isometric eye direction stays.
 * Portrait screens retain enough horizontal room for the civic neighborhood.
 */
export const WORLD_CAMERA = { id: "civic-isometric", eye: [100, 90, 100], desktopZoom: 2.85, civicWidth: 58, minDefaultZoom: .8 } as const;
/** Initialization, reset and framing all use the same named camera preset. */
export const worldCameraOffset = () => new THREE.Vector3(...WORLD_CAMERA.eye);
export function defaultWorldFrame(chunks: ChunkVisual[], width: number, height: number) {
  const buildings = chunks.flatMap((c) => c.buildings);
  if (!buildings.length) return overviewFrame(chunks, width, height);
  const civic = buildings.filter((b) => b.kind === "town-hall").sort((a, b) => a.id.localeCompare(b.id))[0];
  const center = civic ? new THREE.Vector3(civic.x, 0, civic.z) : new THREE.Vector3(
    (Math.min(...buildings.map((b) => b.x - b.width / 2)) + Math.max(...buildings.map((b) => b.x + b.width / 2))) / 2,
    0,
    (Math.min(...buildings.map((b) => b.z - b.depth / 2)) + Math.max(...buildings.map((b) => b.z + b.depth / 2))) / 2,
  );
  return { center, zoom: Math.max(WORLD_CAMERA.minDefaultZoom,
    Math.min(WORLD_CAMERA.desktopZoom, 200 * Math.max(1, width) / Math.max(1, height) / WORLD_CAMERA.civicWidth)) };
}

/** Fit actual footprint corners and building peaks, without changing world data. */
export function overviewFrame(chunks: ChunkVisual[], width: number, height: number) {
  if (!chunks.length) return { center: new THREE.Vector3(), zoom: 1 };
  const minX = Math.min(...chunks.map((c) => c.x * 32));
  const minZ = Math.min(...chunks.map((c) => c.z * 32));
  const maxX = Math.max(...chunks.map((c) => (c.x + 1) * 32));
  const maxZ = Math.max(...chunks.map((c) => (c.z + 1) * 32));
  const center = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(center).add(worldCameraOffset());
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const points = chunks.flatMap((c) => [
    ...[0, 32].flatMap((x) => [0, 32].map((z) => new THREE.Vector3(c.x * 32 + x, 0, c.z * 32 + z))),
    ...c.buildings.map((b) => new THREE.Vector3(b.x, (b.elevation ?? 0) + b.height + 2, b.z)),
  ]).map((p) => p.applyMatrix4(camera.matrixWorldInverse));
  const extentX = Math.max(...points.map((p) => Math.abs(p.x)), 1);
  const extentY = Math.max(...points.map((p) => Math.abs(p.y)), 1);
  return { center, zoom: Math.min(100 * width / height / extentX, 100 / extentY) * 0.92 };
}

/** Ground-plane target that leaves the selected object beside/above its inspector. */
export function inspectionTarget(x: number, z: number, camera: THREE.OrthographicCamera,
  width: number, height: number) {
  const target = new THREE.Vector3(x, 0, z);
  const scale = height * camera.zoom / 200;
  if (width > 700) {
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    target.addScaledVector(right, Math.min(174, width * 0.2) / scale);
  } else {
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const groundUp = new THREE.Vector3(up.x, 0, up.z).normalize();
    target.addScaledVector(groundUp, -height * 0.21 / scale / Math.max(0.2, groundUp.dot(up)));
  }
  return target;
}
