import * as THREE from "three";
import { createBatch, type GeometryLibrary } from "./geometry";
import { frontierDrift, type FrontierData } from "./frontier";
import { createWaterMaterial } from "./waterFlow";
import { excavateRailTerrain, type RailCut } from "./railExcavation";

export function createFrontierScene(data: FrontierData, library: GeometryLibrary, cuts: readonly RailCut[] = []) {
  const group = new THREE.Group();
  const surface = (positions: number[], colors: number[], water = false) => {
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    group.add(new THREE.Mesh(geometry, water ? createWaterMaterial(true)
      : new THREE.MeshLambertMaterial({ vertexColors: true })));
  };
  const excavated = cuts.length ? excavateRailTerrain(data.positions, data.colors, cuts) : data;
  surface(excavated.positions, excavated.colors);
  surface(data.water, data.waterColors, true);
  group.add(createBatch(data.parts, library, false));
  const shimmerMaterial = new THREE.MeshBasicMaterial({ color: "#fff8e9", transparent: true,
    opacity: 0.055, depthWrite: false, side: THREE.DoubleSide });
  const shimmer = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), shimmerMaterial,
    Math.max(1, data.shimmer.length));
  shimmer.count = data.shimmer.length;
  shimmer.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shimmer.userData.scenicMotion = true;
  group.add(shimmer);
  const pose = new THREE.Object3D();
  let lastUpdate = -Infinity;
  const update = (seconds: number, animate: boolean) => {
    const time = animate ? seconds : 0;
    if (Math.abs(time - lastUpdate) < 0.25) return;
    lastUpdate = time;
    shimmerMaterial.opacity = animate ? frontierDrift(time, 0).opacity : 0.04;
    data.shimmer.forEach((point, i) => {
      const drift = frontierDrift(time, point.phase);
      pose.position.set(point.x + drift.x, point.y, point.z + drift.z);
      pose.rotation.set(-Math.PI / 2, 0, point.phase);
      pose.scale.set(2.1, 0.14, 1);
      pose.updateMatrix();
      shimmer.setMatrixAt(i, pose.matrix);
    });
    shimmer.instanceMatrix.needsUpdate = true;
    shimmer.computeBoundingSphere();
  };
  update(0, false);
  return { group, update };
}
