import type { SocialPresence } from "../api/shared";
import type { WorkPose } from "../api/agentWork";
import * as THREE from "three";

/** Three shared batches for the entire population; no per-citizen scene objects. */
export function createCitizens(capacity: number) {
  const material = (color: string) => new THREE.MeshLambertMaterial({ color });
  const body = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.34, 0.43, 0.24),
    material("#ffffff"),
    capacity * 3,
  );
  const heads = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.19, 0),
    material("#deceb5"),
    capacity * 3,
  );
  const legs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.115, 0.32, 0.13),
    material("#687568"),
    capacity * 2,
  );
  const meshes = [body, heads, legs];
  meshes.forEach((mesh) => {
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.citizenStride = mesh === legs ? 2 : 3;
  });
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  return {
    meshes,
    set(
      index: number,
      x: number,
      z: number,
      heading: number,
      phase: number,
      moving: boolean,
      coat: string,
      carrying = false,
      interacting = false,
      work?: WorkPose,
      elevation = 0,
      reaction?: SocialPresence["reaction"],
    ) {
      const bob = moving ? Math.abs(Math.sin(phase)) * 0.045 : interacting ? Math.sin(phase) * 0.01 : 0;
      const step = moving ? Math.sin(phase) * 0.48 : 0;
      const place = (
        mesh: THREE.InstancedMesh,
        slot: number,
        side: number,
        y: number,
        forward: number,
        tilt = 0,
        sx = 1,
        sy = 1,
        sz = 1,
      ) => {
        transform.position.set(
          x + side * Math.cos(heading) + forward * Math.sin(heading),
          y + elevation,
          z - side * Math.sin(heading) + forward * Math.cos(heading),
        );
        transform.rotation.set(0, heading, 0);
        transform.rotateX(tilt);
        transform.scale.set(sx, sy, sz);
        transform.updateMatrix();
        mesh.setMatrixAt(slot, transform.matrix);
      };
      // Feet sit at the same street baseline as the previous markers.
      place(body, index * 3, 0, 0.73 + bob, 0);
      // A slight forward offset makes the otherwise featureless head directional.
      place(heads, index * 3, 0, 1.12 + bob, 0.035);
      // Sleeves share the torso batch; small faceted hands share the head batch.
      // Shoulder pivots keep wrists attached as arms swing or reach around a crate.
      for (let side = 0; side < 2; side++) {
        const socialTilt = reaction === 'cheer' ? -2.3 + Math.sin(phase) * .18
          : reaction === 'wave' && side === 1 ? -2 + Math.sin(phase * 2) * .2
            : reaction === 'talk' && side === 1 ? -.8 + Math.sin(phase) * .2
              : reaction === 'consider' && side === 1 ? -1.1 : null;
        const tilt = !moving && socialTilt !== null ? socialTilt : carrying ? -1.05 : interacting ? (work === "farm" ? -.95 : work === "bakery" ? -.8 : work === "maintenance" ? -.2 : -.5) + Math.sin(phase * (work === "mill" ? 1.4 : 1) + (work === "bakery" ? 0 : side)) * (work === "farm" ? .3 : .18)
          : (side === 0 ? -1 : 1) * step * 0.75;
        const shoulder = 0.88 + bob;
        const offset = side === 0 ? -0.23 : 0.23;
        const slot = index * 3 + side + 1;
        place(
          body,
          slot,
          offset,
          shoulder - Math.cos(tilt) * 0.135,
          -Math.sin(tilt) * 0.135,
          tilt,
          0.11 / 0.34,
          0.27 / 0.43,
          0.12 / 0.24,
        );
        place(
          heads,
          slot,
          offset,
          shoulder - Math.cos(tilt) * 0.31,
          -Math.sin(tilt) * 0.31,
          0,
          0.34,
          0.34,
          0.34,
        );
      }
      place(legs, index * 2, -0.095, 0.36, Math.sin(step) * 0.12, step);
      place(legs, index * 2 + 1, 0.095, 0.36, -Math.sin(step) * 0.12, -step);
      color.set(coat);
      for (let part = 0; part < 3; part++)
        body.setColorAt(index * 3 + part, color);
    },
    finish(count: number) {
      meshes.forEach((mesh) => {
        mesh.count = count * mesh.userData.citizenStride;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
      });
    },
    dispose() {
      meshes.forEach((mesh) => {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        mesh.dispose();
      });
    },
  };
}
