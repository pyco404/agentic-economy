import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createWorkEffects, WORK_EFFECT_LIMIT } from './workEffects';

it('bounds crowded work to one batch, uses distinct equipment, and clears completed effects', () => {
  const effects = createWorkEffects(), matrix = new THREE.Matrix4();
  const poses = new Set<string>();
  for (const kind of ['farm', 'mill', 'bakery', 'maintenance', 'warehouse', 'workshop'] as const) {
    effects.begin(); effects.add(kind, 10, 20, 0, 1, 1.5); effects.finish();
    expect(effects.mesh.count).toBeLessThanOrEqual(4);
    effects.mesh.getMatrixAt(0, matrix);
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).y).toBeGreaterThan(2);
    poses.add(matrix.toArray().join(','));
  }
  expect(poses.size).toBe(5); // warehouse and workshop share a supplies box
  effects.begin();
  for (let i = 0; i < 500; i++) expect(effects.add('bakery', i, 2, 0, i, 0)).toBe(i < WORK_EFFECT_LIMIT);
  effects.finish(); expect(effects.mesh.count).toBe(WORK_EFFECT_LIMIT * 4);
  expect([...effects.mesh.instanceMatrix.array].every(Number.isFinite)).toBe(true);
  effects.begin(); effects.finish(); expect(effects.mesh.count).toBe(0);
  effects.dispose();
});
