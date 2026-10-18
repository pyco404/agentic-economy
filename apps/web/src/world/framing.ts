import * as THREE from "three";
import type { ChunkVisual } from "./layout";

/** One front-facing isometric direction for every viewport and reset path.
 * Orthographic zoom changes apparent size without changing any world geometry.
 */
export const WORLD_CAMERA = {
  id: "front-facing-civic", eye: [100, 65, 100], desktopZoom: 2.85,
  civicWidth: 58, civicHeight: 36,
} as const;
export const worldCameraOffset = () => new THREE.Vector3(...WORLD_CAMERA.eye);

/** Stable gameplay framing based on the civic landmark, never on newly loaded
 * outskirts. Dimensions are the canvas below navigation, not the browser screen.
 * Reserve space for the hero, HUD and (on larger screens) the activity panel.
 */
export function defaultWorldFrame(chunks: ChunkVisual[], width: number, height: number) {
  const buildings = chunks.flatMap((c) => c.buildings);
  if (!buildings.length) return overviewFrame(chunks, width, height);
  const civic = buildings.filter((b) => b.kind === "town-hall").sort((a, b) => a.id.localeCompare(b.id))[0];
  const center = civic ? new THREE.Vector3(civic.x, 0, civic.z) : new THREE.Vector3(
    (Math.min(...buildings.map((b) => b.x - b.width / 2)) + Math.max(...buildings.map((b) => b.x + b.width / 2))) / 2,
    0,
    (Math.min(...buildings.map((b) => b.z - b.depth / 2)) + Math.max(...buildings.map((b) => b.z + b.depth / 2))) / 2,
  );
  const w = Math.max(1, width), h = Math.max(1, height);
  const left = w > 700 ? 72 : 16;
  const right = w > 700 ? Math.min(300, w * .3) : 16;
  const top = Math.min(220, h * .28), bottom = Math.min(104, h * .24);
  const usableWidth = Math.max(1, w - left - right);
  const usableHeight = Math.max(1, h - top - bottom);
  const zoom = Math.min(WORLD_CAMERA.desktopZoom,
    200 / h * usableWidth / WORLD_CAMERA.civicWidth,
    200 / h * usableHeight / WORLD_CAMERA.civicHeight);
  const pixelsPerUnit = h * zoom / 200;
  const eye = worldCameraOffset().normalize();
  const rightAxis = new THREE.Vector3(eye.z, 0, -eye.x).normalize();
  const groundUp = new THREE.Vector3(-eye.x, 0, -eye.z).normalize();
  // Keep the landmark below the hero and just left of the activity panel.
  // Wide desktops match the reference's centered Civic Core; narrower layouts
  // move it into the clear space beside the activity panel, without a breakpoint jump.
  const panelCenter = (left + w - right) / 2;
  const desktopBalance = THREE.MathUtils.clamp((w - 1024) / 256, 0, 1);
  const anchorX = THREE.MathUtils.lerp(panelCenter, w / 2, desktopBalance);
  const anchorY = (top + h - bottom) / 2;
  center.addScaledVector(rightAxis, (w / 2 - anchorX) / pixelsPerUnit);
  center.addScaledVector(groundUp, (anchorY - h / 2) / pixelsPerUnit / eye.y);
  return { center, zoom };
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
