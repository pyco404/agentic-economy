import * as THREE from "three";

/** Presentation time only. No simulation tick, wallet state or world mutation. */
export const CITY_REVEAL = { duration: 3.4, buildingStart: .35, buildingSpread: 1.45,
  environmentStart: 2.05, environmentSpread: .55, actorsAt: 2.9, entranceSeconds: .22,
  frameBudgetMs: 6, maxJobsPerFrame: 2, slowFrameMs: 120 } as const;
export type RevealLayer = "ground" | "buildings" | "environment";
type Entry = { key: string; object: THREE.Object3D; at: number; layer: RevealLayer; done: boolean; baseScaleY: number };
export class CityReveal {
  private entries: Entry[] = [];
  private started: number | null = null;
  private finishedKeys = new Set<string>();
  private slowFrames = 0;
  private fast = false;
  private ready = false;
  private activated = false;
  private completed = false;
  private elapsed = 0;
  counts = { ground: 0, buildings: 0, environment: 0 };
  readonly jobs: (() => void)[] = [];
  constructor(private reduced: boolean) {}
  begin(seconds: number) { this.started ??= seconds; }
  register(key: string, root: THREE.Object3D, rank: number, seconds: number, layer?: RevealLayer) {
    this.begin(seconds);
    const immediateMode = this.reduced || this.fast;
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Sprite)) return;
      const material = (object as THREE.Mesh).material as THREE.Material | undefined;
      const category = layer ?? (object.userData.buildingIds?.some(Boolean) ? "buildings" :
        object.userData.role?.startsWith("tree-") || material?.userData.waterFlow || object.userData.scenicMotion ? "environment" : "ground");
      const entryKey = `${key}:${category}`;
      const immediate = immediateMode || this.finishedKeys.has(entryKey);
      const late = this.completed && !this.finishedKeys.has(entryKey);
      const at = category === "ground" ? 0 : late ? this.elapsed + .03 : category === "buildings"
        ? CITY_REVEAL.buildingStart + rank * CITY_REVEAL.buildingSpread
        : CITY_REVEAL.environmentStart + rank * CITY_REVEAL.environmentSpread;
      const done = immediate || this.elapsed >= at + CITY_REVEAL.entranceSeconds;
      if (!done) { object.userData.revealHidden = true; object.visible = false; }
      else this.finishedKeys.add(entryKey);
      this.entries.push({ key: entryKey, object, at, layer: category, done, baseScaleY: object.scale.y });
    });
  }
  forget(root: THREE.Object3D) {
    const disposed = new Set<THREE.Object3D>(); root.traverse((o) => disposed.add(o));
    this.entries = this.entries.filter((entry) => !disposed.has(entry.object));
  }
  accelerate() { this.fast = true; }
  setReady(ready: boolean) { this.ready = ready; }
  setReduced(reduced: boolean) { this.reduced = reduced; }
  work(now: () => number = () => performance.now()) {
    const started = now(); let count = 0;
    while (this.jobs.length && count < CITY_REVEAL.maxJobsPerFrame && now() - started < CITY_REVEAL.frameBudgetMs) {
      this.jobs.shift()!(); count++;
    }
    return count;
  }
  update(seconds: number, frameMs: number, detail: boolean) {
    if (this.started !== null) this.elapsed = Math.max(this.elapsed, seconds - this.started);
    if (frameMs > CITY_REVEAL.slowFrameMs && this.started !== null) this.slowFrames++;
    else this.slowFrames = 0;
    if (this.slowFrames >= 3) this.fast = true;
    for (const entry of this.entries) {
      if (entry.done) continue;
      const progress = this.reduced || this.fast ? 1 : THREE.MathUtils.clamp((this.elapsed - entry.at) / CITY_REVEAL.entranceSeconds, 0, 1);
      const visible = progress > 0 || entry.layer === "ground";
      entry.object.userData.revealHidden = !visible;
      entry.object.visible = visible && (!entry.object.userData.detail || detail);
      // A tiny architectural rise on existing batches, with exact final pose.
      // No transparency, extra passes, per-instance timers or mesh regeneration.
      entry.object.scale.y = entry.baseScaleY * (entry.layer === "buildings" && progress < 1 ? .97 + .03 * progress : 1);
      if (progress === 1 || entry.layer === "ground") { entry.done = true; entry.object.scale.y = entry.baseScaleY; this.finishedKeys.add(entry.key); }
    }
    if (this.entries.length) this.counts = this.entries.reduce((counts, entry) => { if (entry.object.visible) counts[entry.layer]++; return counts; }, { ground: 0, buildings: 0, environment: 0 });
    if (this.started !== null && (this.reduced || this.fast || this.elapsed >= CITY_REVEAL.actorsAt) && this.ready && !this.jobs.length) this.activated = true;
    if (this.activated && this.entries.every((entry) => entry.done)) { this.completed = true; this.entries.length = 0; }
  }
  get actorsVisible() { return this.activated; }
  get complete() { return this.completed; }
  get stage() { return this.complete ? "complete" : this.started === null || this.elapsed < CITY_REVEAL.buildingStart ? "ground" :
    this.elapsed < CITY_REVEAL.environmentStart ? "buildings" : this.actorsVisible ? "actors" : "environment"; }
}
