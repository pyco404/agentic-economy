import * as THREE from 'three';
import type { WorkPose } from '../api/agentWork';

export const WORK_EFFECT_LIMIT = 64;
/** Four small pieces per worker, one shared draw call, no particles or scene
 * objects per agent. The caller supplies only confirmed, arrived assignments. */
export function createWorkEffects() {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: '#ffffff' }), WORK_EFFECT_LIMIT * 4);
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.workEffects = true;
  const transform = new THREE.Object3D(), color = new THREE.Color();
  let count = 0, workers = 0;
  return {
    mesh,
    begin() { count = 0; workers = 0; },
    add(kind: WorkPose, x: number, z: number, heading: number, phase: number, elevation: number) {
      if (workers >= WORK_EFFECT_LIMIT) return false;
      workers++;
      const piece = (side: number, y: number, forward: number, sx: number, sy: number, sz: number, tint: string, tilt = 0) => {
        transform.position.set(x + side * Math.cos(heading) + forward * Math.sin(heading),
          y + elevation, z - side * Math.sin(heading) + forward * Math.cos(heading));
        transform.rotation.set(tilt, heading, 0); transform.scale.set(sx, sy, sz); transform.updateMatrix();
        mesh.setMatrixAt(count, transform.matrix); color.set(tint); mesh.setColorAt(count++, color);
      };
      const sway = Math.sin(phase) * .06;
      if (kind === 'mill') {
        // Timber held across the worker's hands, with a second stacked length.
        piece(0, .68 + sway, .38, .85, .13, .13, '#a17c54');
        piece(0, .82 + sway, .38, .76, .12, .12, '#c29e71');
      } else if (kind === 'bakery') {
        piece(0, .67, .39, .54, .18, .34, '#9b8059');
        for (const side of [-.16, 0, .16]) piece(side, .82 + sway, .39, .12, .13, .26, '#d4b46c');
      } else if (kind === 'farm') {
        // Watering can, handle and short spout. No invented crop/stock changes.
        piece(.23, .61 + sway, .34, .24, .25, .24, '#728e84');
        piece(.23, .8 + sway, .34, .2, .05, .08, '#536e60');
        piece(.23, .64 + sway, .53, .08, .08, .24, '#728e84', -.3);
      } else if (kind === 'maintenance') {
        piece(.23, .72 + sway, .3, .06, .38, .06, '#a17c54', Math.sin(phase) * .4);
        piece(.23, .94 + sway, .3, .26, .1, .12, '#75817a');
      } else {
        piece(0, .65 + sway, .4, .48, .32, .35, '#ac946e');
        piece(0, .66 + sway, .585, .06, .32, .02, '#6f8065');
      }
      return true;
    },
    finish() {
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (count) mesh.computeBoundingSphere();
    },
    dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose(); },
  };
}
