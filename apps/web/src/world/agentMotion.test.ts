import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildPathNetwork, createDemoWalkers, observedJourney, pathBetween, samplePath, type PathNetwork } from "./agentMotion";
import { generateWorld, WORLD_SEED, type ChunkVisual } from "./layout";

describe("citizen visual motion", () => {
  it("indexes only canonical roads, paths and bridges without mutating terrain", () => {
    const chunk = { id: "0:0", x: 0, z: 0, seed: 1, size: 4,
      terrain: "rpbwgxsfrpbwgxsf", buildings: [], trees: [] } satisfies ChunkVisual;
    const before = JSON.stringify(chunk);
    const network = buildPathNetwork([chunk], 1);
    expect(network.size).toBe(6);
    expect([...network.keys()]).toEqual(["0:0", "1:0", "2:0", "0:2", "1:2", "2:2"]);
    expect(JSON.stringify(chunk)).toBe(before);
  });
  it("turns through road cells rather than drawing a shortcut across a parcel", () => {
    const network: PathNetwork = new Map([[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]
      .map(([x, z]) => [`${x}:${z}`, new THREE.Vector2(x! + 0.5, z! + 0.5)]));
    const from = new THREE.Vector2(0.5, 0.5), to = new THREE.Vector2(2.5, 2.5);
    const route = pathBetween(network, from, to)!;
    expect(route).not.toBeNull();
    for (let t = 0; t <= 1; t += 0.025) {
      const point = samplePath(route, t, new THREE.Vector2());
      expect(network.has(`${Math.floor(point.x)}:${Math.floor(point.y)}`)).toBe(true);
    }
    expect(samplePath(route, 1, new THREE.Vector2()).equals(to)).toBe(true);
    expect(pathBetween(network, from, new THREE.Vector2(1.5, 1.5))).toBeNull();
    expect(pathBetween(network, from, to, 1)).toBeNull();
  });
  it("creates reproducible fixture walkers that wait, vary speed, and remain on roads", () => {
    const chunks = generateWorld(WORLD_SEED, 156);
    const network = buildPathNetwork(chunks, WORLD_SEED);
    const buildings = chunks.flatMap((c) => c.buildings);
    const first = createDemoWalkers(network, buildings), second = createDemoWalkers(network, buildings);
    let moved = 0, waited = 0;
    let previous: THREE.Vector2 | null = null;
    for (let frame = 0; frame < 500; frame++) {
      const a = first.position("Kestrel", 0.5, 0.5, frame / 20, 0.05, false);
      const b = second.position("Kestrel", 0.5, 0.5, frame / 20, 0.05, false);
      expect(a.equals(b)).toBe(true);
      expect(network.has(`${Math.floor(a.x)}:${Math.floor(a.y)}`)).toBe(true);
      if (previous) { if (a.equals(previous)) waited++; else moved++; }
      previous = a.clone();
    }
    expect(moved).toBeGreaterThan(10); expect(waited).toBeGreaterThan(10);
    const frozen = first.position("Kestrel", 0, 0, 100, 0.05, true).clone();
    expect(first.position("Kestrel", 0, 0, 101, 0.05, true).equals(frozen)).toBe(true);
  });
});

it("recovers a long observed journey along roads at a bounded walking speed without teleporting through empty terrain",()=>{
 const network:PathNetwork=new Map(Array.from({length:40},(_,i)=>[`${i}:0`,new THREE.Vector2(i+.5,.5)]));
 const journey=observedJourney(network,new THREE.Vector2(.5,.5),new THREE.Vector2(39.5,.5),500)!;
 expect(journey.duration).toBe(9750);expect(journey.path.length).toBe(40);
 network.delete('20:0');expect(observedJourney(network,new THREE.Vector2(.5,.5),new THREE.Vector2(39.5,.5),500)).toBeNull();
});
