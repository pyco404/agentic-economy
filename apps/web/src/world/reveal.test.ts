import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CityReveal, CITY_REVEAL } from "./reveal";
const mesh = (role?: string) => { const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); m.userData.role = role; return m; };
describe("one-shot city presentation", () => {
  it("orders terrain, civic-first chunks, environment and actors without altering instance data", () => {
    const reveal = new CityReveal(false), land = mesh(), civic = mesh(), outer = mesh(), tree = mesh("tree-crown");
    tree.scale.y = .71;
    const matrix = civic.matrix.toArray();
    reveal.register("ground", land, 0, 10, "ground");
    reveal.register("civic", civic, 0, 10, "buildings"); reveal.register("outer", outer, 1, 10, "buildings");
    reveal.register("trees", tree, 1, 10, "environment"); reveal.setReady(true);
    reveal.update(10, 16, true); expect(land.visible).toBe(true); expect(civic.visible).toBe(false); expect(reveal.actorsVisible).toBe(false);
    reveal.update(10.5, 16, true); expect(civic.visible).toBe(true); expect(outer.visible).toBe(false); expect(tree.visible).toBe(false);
    reveal.update(12, 16, true); expect(outer.visible).toBe(true); expect(tree.visible).toBe(false);
    reveal.update(12.8, 16, true); expect(tree.visible).toBe(true); expect(reveal.actorsVisible).toBe(false);
    reveal.update(13.4, 16, true); expect(reveal.complete).toBe(true); expect(reveal.actorsVisible).toBe(true);
    expect(tree.scale.y).toBe(.71);
    expect(civic.scale.toArray()).toEqual([1, 1, 1]); expect(civic.matrix.toArray()).toEqual(matrix);
  });
  it("retains already-visible content and actors across navigation, updates and late chunk arrivals", () => {
    const reveal = new CityReveal(false), first = mesh();
    reveal.register("same", first, 0, 0, "buildings"); reveal.setReady(true); reveal.update(4, 16, true);
    const replacement = mesh(), later = mesh();
    reveal.register("same", replacement, 0, 4, "buildings"); expect(replacement.visible).toBe(true);
    reveal.register("later", later, 0, 4, "buildings"); expect(later.visible).toBe(false);
    reveal.setReady(false); reveal.update(4.1, 16, true);
    expect(reveal.actorsVisible).toBe(true); expect(reveal.stage).toBe("complete"); expect(first.visible).toBe(true);
    reveal.update(4.4, 16, true); expect(later.visible).toBe(true);
  });
  it("respects reduced motion and skips entrance effects after sustained slow frames", () => {
    for (const reduced of [true, false]) {
      const reveal = new CityReveal(reduced), house = mesh();
      reveal.register("house", house, 1, 0, "buildings"); reveal.setReady(true);
      for (let i = 0; i < 3; i++) reveal.update(i * .2, 150, false);
      expect(house.visible).toBe(true); expect(house.scale.y).toBe(1); expect(reveal.complete).toBe(true);
    }
  });
  it("budgets work per frame and refuses to expose actors before infrastructure is ready", () => {
    const reveal = new CityReveal(false); let jobs = 0, now = 0;
    for (let i = 0; i < 5; i++) reveal.jobs.push(() => { jobs++; now += 4; });
    expect(reveal.work(() => now)).toBe(CITY_REVEAL.maxJobsPerFrame); expect(jobs).toBe(2);
    reveal.register("ground", mesh(), 0, 0, "ground"); reveal.update(8, 16, true); expect(reveal.actorsVisible).toBe(false);
    reveal.work(() => now); reveal.work(() => now); reveal.setReady(true); reveal.update(8, 16, true); expect(reveal.actorsVisible).toBe(true);
  });
  it("does not override detail LOD or keep disposed objects registered", () => {
    const reveal = new CityReveal(false), detail = mesh(); detail.userData.detail = true;
    reveal.register("detail", detail, 0, 0, "buildings"); reveal.update(.5, 16, false); expect(detail.visible).toBe(false);
    reveal.forget(detail); reveal.update(1, 16, true); expect(detail.visible).toBe(false);
  });
});
