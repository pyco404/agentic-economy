import { describe, expect, it } from 'vitest';
import { planGroundCover, grassCluster, GROUND_COVER } from './groundCover';
import { generateFrontier } from './frontier';
import { railTerrain } from './railTerrain';
import { generateLandscape, createBatch, geometryLibrary, disposeGroup, type Part } from './geometry';
import { generateWorld, type ChunkVisual } from './layout';
import * as THREE from 'three';
const chunk: ChunkVisual = { id: '0:0', x: 0, z: 0, seed: 42, terrain: 'g'.repeat(1024), elevation: '0'.repeat(1024), buildings: [], trees: [] };
const footprint = { contains: (x: number, z: number) => x >= -16 && x < 48 && z >= -16 && z < 48 };

describe('conservative ground cover', () => {
  it('is deterministic, irregular, bounded, palette-matched and never creates economic entities', () => {
    const frontier = generateFrontier(42, [chunk]), before = JSON.stringify({ chunk, frontier });
    const a = planGroundCover([chunk], frontier, 42, footprint), b = planGroundCover([chunk], frontier, 42, footprint);
    expect(a).toEqual(b); expect(JSON.stringify({ chunk, frontier })).toBe(before);
    expect(a.clusters).toBeGreaterThan(10); expect(a.clusters).toBeLessThanOrEqual(GROUND_COVER.maxClusters);
    expect(a.parts.length).toBeLessThanOrEqual(GROUND_COVER.maxClusters * 4);
    expect(a.parts.every(p => !p.buildingId && ['cone', 'round'].includes(p.geometry) && p.scale[1] < .5 && GROUND_COVER.tones.includes(p.color as typeof GROUND_COVER.tones[number]))).toBe(true);
    expect(new Set(a.parts.map(p => p.color)).size).toBe(3);
    expect(a.parts.some(p => p.rotation?.[1] !== 0)).toBe(true);
    expect(planGroundCover([chunk], frontier, 43, footprint)).not.toEqual(a);
    expect(planGroundCover([chunk], frontier, 42, { contains: () => false }).parts).toEqual([]);
  });
  it('keeps roads, paths, crops, water, rail sweeps, entrances and rotated infrastructure clear', () => {
    const codes = chunk.terrain!.split('');
    for (let z = 0; z < 32; z++) { codes[z * 32 + 8] = 'r'; codes[z * 32 + 9] = 'p'; codes[z * 32 + 16] = 'f'; codes[z * 32 + 24] = 'w'; }
    const building = { ...generateWorld(42, 0)[0]!.buildings[0]!, id: 'bld_coverTest', x: 4, z: 15, width: 3, depth: 3, entrance: { x: 6, z: 15 } };
    const terrain = { ...chunk, terrain: codes.join(''), buildings: [building] }, frontier = generateFrontier(42, [terrain]);
    const rail = { points: [{ x: -20, z: -8 }, { x: 50, z: -8 }] };
    const pad: Part = { geometry: 'box', color: '#ccc', position: [12, .05, -14], scale: [8, .1, 4], rotation: [0, Math.PI / 4, 0] };
    const plan = planGroundCover([terrain], frontier, 42, footprint, [rail], [pad]);
    expect(plan.clusters).toBeGreaterThan(0);
    const ground = railTerrain([terrain], frontier);
    for (const p of plan.parts) {
      const [x, , z] = p.position;
      expect(Math.abs(z + 8)).toBeGreaterThan(3.4);
      expect(Math.hypot(x - 6, z - 15)).toBeGreaterThan(2);
      expect(ground(x, z)?.wet).toBe(false);
      expect(footprint.contains(x, z)).toBe(true);
      if (x >= 0 && x < 32 && z >= 0 && z < 32) expect(terrain.terrain[Math.floor(z) * 32 + Math.floor(x)]).toBe('g');
      expect(Math.abs(x - 12) > 4 || Math.abs(z + 14) > 4).toBe(true);
    }
    expect(generateLandscape(terrain, 42).some(p => p.role === 'field-row')).toBe(true);
  });
  it('protects unloaded parcels and actual sidewalk tiles independently of the terrain code', () => {
    const frontier = generateFrontier(42, [chunk]), streets = new Map<string, true>();
    for (let x = -16; x < 48; x += .25) for (let z = -16; z < 48; z += .25) streets.set(`${Math.floor(x / .25)}:${Math.floor(z / .25)}`, true);
    expect(planGroundCover([chunk], frontier, 42, footprint, [], [], streets).parts).toEqual([]);
    const a = planGroundCover([chunk], frontier, 42, footprint, [], [], new Map(), [{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }]);
    expect(a.parts.some(p => p.position[0] >= 32 && p.position[2] >= 0 && p.position[2] < 32)).toBe(false);
  });
  it('batches all three tones into only two existing shared-geometry draws without outlines or animation', () => {
    const parts = Array.from({ length: 200 }, (_, i) => grassCluster(i % 20, Math.floor(i / 20), 0, i, i % 17 === 0)).flat();
    const library = geometryLibrary(), group = createBatch(parts, library, false), meshes: THREE.InstancedMesh[] = [];
    group.traverse(o => { if (o instanceof THREE.InstancedMesh) meshes.push(o); });
    expect(meshes).toHaveLength(2); expect(meshes.reduce((n, m) => n + m.count, 0)).toBe(parts.length);
    expect(parts.every(p => !p.outline && !p.detail)).toBe(true);
    disposeGroup(group, new Set(Object.values(library))); Object.values(library).forEach(g => g.dispose());
  });
});
