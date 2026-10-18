import * as THREE from 'three';

/** Preparation is independent of presentation. No reveal step creates geometry. */
export const CITY_REVEAL = {
  duration: 2.6, actorsAt: 2.6, ambientAt: 2.6, entranceSeconds: .18,
  frameBudgetMs: 6, maxJobsPerFrame: 2, slowFrameMs: 120,
} as const;
export type RevealLayer = 'ground' | 'buildings' | 'environment';
type Entry = { object: THREE.Object3D; layer: RevealLayer };

/** A world-space mask covers ordinary, instanced and merged frontier geometry.
 * Complete supporting ground first, then reveal vertical scenery by spatial cell.
 * The same mask includes outer terrain, water and both railway infrastructures. */
export class CityReveal {
  private entries: Entry[] = [];
  private materials = new WeakSet<THREE.Material>();
  private outlineOpacity = new WeakMap<THREE.Material, number>();
  private progress = { value: 0 };
  private ready = false;
  private committed = false;
  private startedAt: number | null = null;
  private completed = false;
  counts = { ground: 0, buildings: 0, environment: 0 };
  readonly jobs: (() => void)[] = [];
  constructor(private reduced: boolean) {}
  begin(seconds: number) { if (this.committed && this.startedAt === null) this.startedAt = seconds; }
  private prepareMaterial(material: THREE.Material) {
    if (this.materials.has(material)) return;
    this.materials.add(material);
    const compile = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      shader.uniforms.cityRevealProgress = this.progress;
      shader.vertexShader = shader.vertexShader.replace('#include <common>',
        '#include <common>\nvarying vec3 cityRevealWorld;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 revealVertex = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            revealVertex = instanceMatrix * revealVertex;
          #endif
          cityRevealWorld = (modelMatrix * revealVertex).xyz;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
        '#include <common>\nuniform float cityRevealProgress;\nvarying vec3 cityRevealWorld;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (cityRevealProgress < 1.0) {
            vec2 cell = floor(cityRevealWorld.xz / 16.0);
            float rank = fract(sin(dot(cell, vec2(12.9898,78.233))) * 43758.5453);
            // Finish all supporting ground before any raised scenery starts.
            float raised = step(0.3, cityRevealWorld.y);
            float start = mix(rank * 0.10, 0.22 + rank * 0.60, raised);
            float span = mix(0.10, 0.17, raised);
            float coverage = smoothstep(start, start + span, cityRevealProgress);
            // Open contiguous tiles, rather than stippling the whole screen.
            vec2 local = abs(fract(cityRevealWorld.xz / 16.0) - 0.5) * 2.0;
            if (coverage <= max(local.x, local.y)) discard;
          }`);
    };
    material.customProgramCacheKey = () => `${key}:city-spatial-reveal-v1`;
    material.needsUpdate = true;
  }
  register(_key: string, root: THREE.Object3D, _rank: number, _seconds: number, layer?: RevealLayer) {
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const category = layer ?? (object.userData.buildingIds?.some(Boolean) ? 'buildings'
        : object.userData.role?.startsWith('tree-') || materials.some(m => m.userData.waterFlow)
          ? 'environment' : 'ground');
      if (!this.completed) materials.forEach(material => {
        if (object instanceof THREE.LineSegments) {
          if (!this.outlineOpacity.has(material)) this.outlineOpacity.set(material, material.opacity);
          material.opacity = 0;
        } else this.prepareMaterial(material);
      });
      object.userData.revealHidden = !this.committed;
      object.visible = this.committed;
      if (!this.completed) this.entries.push({ object, layer: category });
    });
  }
  forget(root: THREE.Object3D) {
    const disposed = new Set<THREE.Object3D>(); root.traverse(o => disposed.add(o));
    this.entries = this.entries.filter(e => !disposed.has(e.object));
  }
  setReady(ready: boolean) { this.ready = ready; }
  setReduced(reduced: boolean) { this.reduced = reduced; }
  work(now: () => number = () => performance.now()) {
    const started = now(); let count = 0;
    while (this.jobs.length && count < CITY_REVEAL.maxJobsPerFrame && now() - started < CITY_REVEAL.frameBudgetMs) {
      this.jobs.shift()!(); count++;
    }
    return count;
  }
  update(seconds: number, _frameMs: number, detail: boolean) {
    if (!this.committed && this.ready && !this.jobs.length && this.entries.length) this.committed = true;
    if (!this.committed || this.completed) return;
    // Compile the first complete frame behind the loader. begin() follows that
    // render, so GPU preparation cannot consume the presentation interval.
    this.progress.value = this.reduced ? 1 : this.startedAt === null ? 0
      : Math.min(1, Math.max(0, (seconds - this.startedAt) / CITY_REVEAL.duration));
    this.counts = { ground: 0, buildings: 0, environment: 0 };
    for (const entry of this.entries) {
      if (entry.object instanceof THREE.LineSegments) {
        const materials = Array.isArray(entry.object.material) ? entry.object.material : [entry.object.material];
        const amount = THREE.MathUtils.smoothstep(this.progress.value, .9, 1);
        materials.forEach(material => { material.opacity = (this.outlineOpacity.get(material) ?? 1) * amount; });
      }
      entry.object.userData.revealHidden = false;
      entry.object.visible = !entry.object.userData.detail || detail;
      if (entry.object.visible) this.counts[entry.layer]++;
    }
    if (this.progress.value === 1) { this.completed = true; this.entries.length = 0; }
  }
  get staticReady() { return this.committed; }
  get actorsVisible() { return this.completed; }
  get ambientVisible() { return this.completed; }
  get complete() { return this.completed; }
  get fraction() { return this.progress.value; }
  get stage() { return this.complete ? 'complete' : this.startedAt !== null ? 'revealing' : 'preparing'; }
}
