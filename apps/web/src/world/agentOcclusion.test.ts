import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createAgentOcclusion } from './agentOcclusion';
function fixture() {
  const group = new THREE.Group(), geometry = new THREE.BoxGeometry(3, 4, 3), material = new THREE.MeshBasicMaterial();
  const building = new THREE.InstancedMesh<THREE.BufferGeometry>(geometry, material, 1); building.userData.buildingIds = ['bld_test'];
  building.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 2, 0)); group.add(building);
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 100); camera.position.set(0, 10, 20); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const occlusion = createAgentOcclusion(); occlusion.rebuild([group], 1);
  return { group, geometry, material, building, camera, occlusion };
}
describe('existing geometry agent occlusion', () => {
  it('hides labels behind a building but preserves agents in front, beside and above it', () => {
    const { camera, occlusion } = fixture();
    expect(occlusion.blocked(new THREE.Vector3(0, 1.7, -3), camera)).toBe(true);
    for (const p of [[0, 1.7, 3], [4, 1.7, -3], [0, 8, -3]]) expect(occlusion.blocked(new THREE.Vector3(...p), camera)).toBe(false);
    occlusion.dispose(); expect(occlusion.surfaces).toBe(0);
  });
  it('does not treat empty bounding-box space, non-building decoration or hidden detail as a solid building', () => {
    const { group, camera, occlusion, building } = fixture();
    building.geometry = new THREE.ConeGeometry(2, 4, 4); occlusion.rebuild([group], 2);
    // The upper bounding-box corner is outside the cone's actual triangles.
    expect(occlusion.blocked(new THREE.Vector3(1.8, 2.4, -3), camera)).toBe(false);
    building.userData.buildingIds = [undefined]; occlusion.rebuild([group], 3); expect(occlusion.surfaces).toBe(0);
    building.userData.buildingIds = ['bld_test']; building.userData.detail = true; occlusion.rebuild([group], 4); expect(occlusion.surfaces).toBe(0);
  });
  it('rebuilds on geometry replacement and respects rotation/elevation without changing geometry', () => {
    const { group, building, camera, occlusion } = fixture(), before = building.instanceMatrix.array.slice();
    building.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(8, 3, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4), new THREE.Vector3(1, 1, 1))); occlusion.rebuild([group], 2);
    expect(occlusion.blocked(new THREE.Vector3(0, 1.7, -3), camera)).toBe(false);
    expect(occlusion.blocked(new THREE.Vector3(8, 1.7, -3), camera)).toBe(true);
    expect(before[12]).toBe(0); expect(building.instanceMatrix.array[12]).toBe(8);
  });
});
