import * as THREE from 'three';

interface Surface { box: THREE.Box3; matrix: THREE.Matrix4; geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }
interface Branch { box: THREE.Box3; left?: Branch; right?: Branch; surfaces?: Surface[] }
function tree(surfaces: Surface[]): Branch | undefined {
  if (!surfaces.length) return;
  const box = new THREE.Box3(); for (const surface of surfaces) box.union(surface.box);
  if (surfaces.length <= 8) return { box, surfaces };
  const size = box.getSize(new THREE.Vector3()), axis = size.x > size.z ? 'x' : 'z';
  surfaces.sort((a, b) => a.box.min[axis] + a.box.max[axis] - b.box.min[axis] - b.box.max[axis]);
  const middle = surfaces.length >> 1;
  return { box, left: tree(surfaces.slice(0, middle)), right: tree(surfaces.slice(middle)) };
}

/** CPU-only BVH of existing building geometry. No extra draw calls, materials or GPU readbacks.
 * Bounding boxes only prune candidates; actual triangles decide occlusion (including roof openings).
 * Rebuild only when the city's existing geometry changes, never per moving agent. */
export function createAgentOcclusion() {
  let root: Branch | undefined, revision: number | string = -1, surfaces = 0;
  const raycaster = new THREE.Raycaster(), direction = new THREE.Vector3(), matrix = new THREE.Matrix4();
  const mesh = new THREE.Mesh(), hits: THREE.Intersection[] = [];
  return {
    rebuild(groups: THREE.Object3D[], nextRevision: number | string) {
      if (revision === nextRevision) return;
      revision = nextRevision;
      const entries: Surface[] = [];
      for (const group of groups) {
        group.updateWorldMatrix(true, true);
        group.traverse(object => {
          if (!(object instanceof THREE.InstancedMesh) || !object.userData.buildingIds || object.userData.detail) return;
          const geometry = object.geometry;
          if (!geometry.boundingBox) geometry.computeBoundingBox();
          if (!geometry.boundingSphere) geometry.computeBoundingSphere();
          for (let i = 0; i < object.count; i++) {
            if (!object.userData.buildingIds[i]) continue;
            object.getMatrixAt(i, matrix); matrix.premultiply(object.matrixWorld);
            entries.push({ box: geometry.boundingBox!.clone().applyMatrix4(matrix), matrix: matrix.clone(), geometry, material: object.material });
          }
        });
      }
      surfaces = entries.length; root = tree(entries);
    },
    blocked(point: THREE.Vector3, camera: THREE.OrthographicCamera) {
      camera.getWorldDirection(direction).negate();
      raycaster.set(point, direction); raycaster.near = .03; raycaster.far = camera.far;
      const visit = (branch: Branch | undefined): boolean => {
        if (!branch || !raycaster.ray.intersectsBox(branch.box)) return false;
        if (branch.surfaces) for (const surface of branch.surfaces) {
          if (!raycaster.ray.intersectsBox(surface.box)) continue;
          mesh.geometry = surface.geometry; mesh.material = surface.material; mesh.matrixWorld.copy(surface.matrix);
          hits.length = 0; mesh.raycast(raycaster, hits);
          if (hits.length) return true;
        }
        return visit(branch.left) || visit(branch.right);
      };
      return visit(root);
    },
    get surfaces() { return surfaces; },
    dispose() { root = undefined; surfaces = 0; },
  };
}
