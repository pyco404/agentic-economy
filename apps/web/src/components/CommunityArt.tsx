import * as THREE from "three";
import { generateBuilding, geometryLibrary } from "../world/geometry";
import { hashSeed, type BuildingVisual } from "../world/layout";

const artCache = new Map<string, string>();
let library: ReturnType<typeof geometryLibrary> | undefined;
export function communityArtwork(id: string, building?: BuildingVisual) {
  const seed = hashSeed([...id].reduce((n, c) => Math.imul(n, 31) + c.charCodeAt(0), 7), 13, 91);
  const b: BuildingVisual = building ?? { id: `identity:${id}`, seed, kind: "headquarters",
    x: 0, z: 0, width: 5 + seed % 3, depth: 5, height: 3 + seed % 4, floors: 2 + seed % 3,
    roofStyle: ["gable", "hip", "flat"][seed % 3] as BuildingVisual["roofStyle"],
    roofColor: ["#8f9b6d", "#c97c5d", "#7f97b2"][seed % 3]!,
    rotation: (seed % 4) * Math.PI / 2, name: "Identity study", chunkId: "identity" };
  const key = JSON.stringify([id, b.seed, b.x, b.z, b.kind, b.sourceKind, b.width, b.depth,
    b.height, b.floors, b.roofStyle, b.roofColor, b.rotation, b.material, b.windowPattern]);
  const cached = artCache.get(key);
  if (cached) return cached;
  library ??= geometryLibrary();
  const camera = new THREE.OrthographicCamera(-10, 10, 7.2, -7.2, 0.1, 100);
  camera.position.set(18, 16, 20);
  camera.lookAt(0, b.height * 0.38, 0);
  camera.updateMatrixWorld();
  const extent = Math.max(8, b.width * 1.5, b.depth * 1.5, b.height * 1.35);
  camera.zoom = 11 / extent;
  camera.updateProjectionMatrix();
  const faces: { points: string; depth: number; color: string }[] = [];
  const normal = new THREE.Vector3(), edge = new THREE.Vector3(), light = new THREE.Vector3(-0.4, 0.9, 0.6).normalize();
  const view = new THREE.Vector3().subVectors(camera.position, camera.getWorldDirection(new THREE.Vector3())).normalize();
  for (const part of generateBuilding(b).filter((p) => !p.detail)) {
    const geometry = library[part.geometry as keyof typeof library];
    const pos = geometry.getAttribute("position"), indices = geometry.index;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(part.position[0] - b.x, part.position[1] - (b.elevation ?? 0), part.position[2] - b.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation ?? [0, 0, 0]))), new THREE.Vector3(...part.scale));
    for (let i = 0; i < (indices?.count ?? pos.count); i += 3) {
      const points = [0, 1, 2].map((offset) => new THREE.Vector3().fromBufferAttribute(pos,
        indices ? indices.getX(i + offset) : i + offset).applyMatrix4(matrix));
      normal.subVectors(points[1]!, points[0]!).cross(edge.subVectors(points[2]!, points[0]!)).normalize();
      if (normal.dot(view) < 0) continue;
      const depth = points.reduce((sum, p) => sum + p.clone().applyMatrix4(camera.matrixWorldInverse).z, 0) / 3;
      const projected = points.map((p) => p.project(camera));
      const color = new THREE.Color(part.color).multiplyScalar(0.7 + Math.max(0, normal.dot(light)) * 0.4).getHexString();
      faces.push({ depth, color: `#${color}`, points: projected.map((p) => `${((p.x + 1) * 240).toFixed(2)},${((1 - p.y) * 170).toFixed(2)}`).join(" ") });
    }
  }
  faces.sort((a, b) => a.depth - b.depth);
  const ground = ["#e4e9d6", "#ecdfce", "#dce6e4"][seed % 3]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 340"><rect width="480" height="340" fill="${ground}"/><path d="M45 225 230 128 432 224 247 321Z" fill="#f4eddf"/><path d="M75 237 258 142M113 257 298 162M150 276 337 182" fill="none" stroke="#d5ceba" stroke-width="1"/><ellipse cx="247" cy="265" rx="89" ry="19" fill="#7d8064" opacity=".1"/>${faces.map((f) => `<polygon points="${f.points}" fill="${f.color}"/>`).join("")}</svg>`;
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  if (artCache.size > 48) artCache.delete(artCache.keys().next().value!);
  artCache.set(key, uri);
  return uri;
}
export function CommunityArt({ id, name, building }: { id: string; name: string; building?: BuildingVisual }) {
  return <div className="discovery-art"><img src={communityArtwork(id, building)}
    alt={building ? `${name} procedural headquarters study` : `${name} procedural identity study; no placed headquarters shown`} />
    <span>{building ? "Headquarters study" : "Procedural identity"}</span></div>;
}
