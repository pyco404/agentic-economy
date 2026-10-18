import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CityReveal, CITY_REVEAL } from './reveal';
const mesh = () => new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
describe('prepared-world cinematic presentation', () => {
  it('holds core geometry until the final outer, water and railway job finishes', () => {
    const r = new CityReveal(false), core = mesh(), outer = mesh(), rail = mesh();
    r.register('core', core, 0, 0); r.update(100, 16, true);
    expect(core.visible).toBe(false);
    r.jobs.push(() => r.register('outer-water', outer, 1, 100));
    r.jobs.push(() => r.register('railways', rail, 1, 100));
    r.setReady(true); r.update(200, 16, true); expect(r.staticReady).toBe(false);
    r.work(); r.update(201, 16, true); expect(r.staticReady).toBe(true);
    expect(r.fraction).toBe(0); expect([core, outer, rail].every(o => o.visible)).toBe(true);
    r.begin(205); r.update(206.3, 16, true);
    expect(r.fraction).toBeCloseTo(.5); expect(r.actorsVisible).toBe(false);
    r.update(205 + CITY_REVEAL.duration + .001, 16, true);
    expect(r.complete).toBe(true); expect(r.ambientVisible).toBe(true);
  });
  it('keeps reduced motion behind the same structural barrier', () => {
    const r = new CityReveal(true), house = mesh(); r.register('house', house, 0, 0);
    r.update(500, 150, true); expect(house.visible).toBe(false);
    r.setReady(true); r.update(501, 150, true); expect(r.complete).toBe(true); expect(r.fraction).toBe(1);
  });
  it('budgets geometry assembly independently from presentation time', () => {
    const r = new CityReveal(false); let now = 0;
    for (let i = 0; i < 5; i++) r.jobs.push(() => { now += 4; });
    r.register('world', mesh(), 0, 0); r.setReady(true);
    expect(r.work(() => now)).toBe(CITY_REVEAL.maxJobsPerFrame);
    r.update(1000, 16, true); expect(r.staticReady).toBe(false);
    r.work(() => now); r.work(() => now); r.update(1001, 16, true);
    expect(r.staticReady).toBe(true); expect(r.fraction).toBe(0);
  });
  it('preserves final transforms and never replays on navigation or later registrations', () => {
    const r = new CityReveal(false), house = mesh(); house.scale.y = .71; const geometry = house.geometry;
    r.register('house', house, 0, 0); r.setReady(true); r.update(1, 16, true); r.begin(1);
    r.update(4, 16, true); r.setReady(false); r.begin(20);
    const later = mesh(); r.register('later', later, 0, 20); r.update(20, 16, true);
    expect(house.scale.y).toBe(.71); expect(house.geometry).toBe(geometry);
    expect(later.visible).toBe(true); expect(r.fraction).toBe(1);
  });
  it('chains existing water shader hooks and covers instanced and merged geometry', () => {
    const r = new CityReveal(false), house = mesh();
    house.material.onBeforeCompile = shader => { shader.uniforms.waterTime = { value: 1 }; };
    r.register('all', house, 0, 0);
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <clipping_planes_fragment>' };
    house.material.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0], {} as THREE.WebGLRenderer);
    expect(shader.uniforms).toHaveProperty('waterTime'); expect(shader.uniforms).toHaveProperty('cityRevealProgress');
    expect(shader.vertexShader).toContain('instanceMatrix * revealVertex');
    expect(shader.fragmentShader).toContain('floor(cityRevealWorld.xz / 16.0)');
  });
  it('keeps decorative outlines from exposing hidden structures and restores exact opacity', () => {
    const r = new CityReveal(false), material = new THREE.LineBasicMaterial({transparent: true, opacity: .35});
    const line = new THREE.LineSegments(new THREE.BufferGeometry(), material);
    r.register('outlines', line, 0, 0); r.setReady(true); r.update(1, 16, true); r.begin(1);
    expect(line.visible).toBe(true); expect(material.opacity).toBe(0);
    r.update(2.3, 16, true); expect(material.opacity).toBe(0);
    r.update(4, 16, true); expect(material.opacity).toBe(.35);
  });
  it('respects detail LOD and disposed registrations', () => {
    const r = new CityReveal(false), detail = mesh(); detail.userData.detail = true;
    r.register('detail', detail, 0, 0); r.setReady(true); r.update(1, 16, false);
    expect(detail.visible).toBe(false); r.forget(detail); r.begin(1); r.update(4, 16, true);
    expect(detail.visible).toBe(false);
  });
});
