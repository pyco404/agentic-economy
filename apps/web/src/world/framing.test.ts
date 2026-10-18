import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { defaultWorldFrame, overviewFrame, inspectionTarget, WORLD_CAMERA } from "./framing";
import { generateWorld, WORLD_SEED } from "./layout";

describe("responsive world framing", () => {
  const chunks = generateWorld(WORLD_SEED, 156);
  it("keeps Civic Core prominent without fitting empty terrain or moving any buildings", () => {
    const world = structuredClone(chunks), first = world[0]!.buildings[0]!;
    for (const chunk of world) for (const building of chunk.buildings)
      if (building.kind === "town-hall") building.kind = "house";
    const civic = { ...first, id: "civic-landmark", kind: "town-hall" as const, x: 12, z: 18 };
    world[0]!.buildings.push(civic);
    const before = JSON.stringify(world), desktop = defaultWorldFrame(world, 1440, 936);
    expect(desktop.zoom).toBe(WORLD_CAMERA.desktopZoom);
    const expansion = { ...world[0]!, id: "empty-future-district", x: 20, z: 20, buildings: [] };
    expect(defaultWorldFrame([...world, expansion], 1440, 936)).toEqual(desktop);
    expect(defaultWorldFrame([...world].reverse(), 1440, 936)).toEqual(desktop);
    expect(JSON.stringify(world)).toBe(before);
  });
  it("fits the central neighborhood at portrait sizes while keeping a closer desktop default", () => {
    for (const [width, height] of [[320, 630], [390, 780], [768, 960], [1024, 704], [1440, 936], [844, 326]]) {
      const frame = defaultWorldFrame(chunks, width!, height!);
      const visibleWidth = 200 * (width! - (width! > 700 ? 72 + Math.min(300, width! * .3) : 32)) / height! / frame.zoom;
      expect(visibleWidth).toBeGreaterThanOrEqual(WORLD_CAMERA.civicWidth - .001);
      expect(frame.zoom).toBeGreaterThan(overviewFrame(chunks, width!, height!).zoom);
      expect(Number.isFinite(frame.zoom)).toBe(true);
    }
  });
  it("keeps the civic landmark clear of hero, activity and bottom HUD at every aspect ratio", () => {
    const civic = chunks.flatMap((c) => c.buildings).filter((b) => b.kind === "town-hall").sort((a,b) => a.id.localeCompare(b.id))[0]!;
    for (const [w, h] of [[320, 630], [390, 780], [768, 960], [1024, 704], [1440, 936], [844, 326]]) {
      const frame = defaultWorldFrame(chunks, w!, h!);
      const camera = new THREE.OrthographicCamera(-100*w!/h!,100*w!/h!,100,-100,.1,8000);
      camera.position.copy(frame.center).add(new THREE.Vector3(...WORLD_CAMERA.eye));
      camera.lookAt(frame.center); camera.zoom=frame.zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      const p = new THREE.Vector3(civic.x, 0, civic.z).project(camera);
      const x=(p.x+1)*w!/2, y=(1-p.y)*h!/2;
      expect(x).toBeGreaterThan(w! > 700 ? 72 : 16);
      expect(x).toBeLessThan(w! > 700 ? w!-Math.min(300,w!*.3) : w!-16);
      expect(y).toBeGreaterThan(Math.min(220,h!*.28));
      expect(y).toBeLessThan(h!-Math.min(104,h!*.24));
      const direction=camera.position.clone().sub(frame.center).normalize();
      expect(direction.toArray()).toEqual(new THREE.Vector3(...WORLD_CAMERA.eye).normalize().toArray());
    }
  });
  it("fits every occupied footprint at desktop, tablet and phone sizes", () => {
    const before = JSON.stringify(chunks);
    for (const [width, height] of [[320, 630], [390, 780], [768, 960], [1024, 704], [1440, 936], [844, 326]]) {
      const frame = overviewFrame(chunks, width!, height!);
      const camera = new THREE.OrthographicCamera(-100 * width! / height!, 100 * width! / height!, 100, -100, 0.1, 1200);
      camera.position.copy(frame.center).add(new THREE.Vector3(...WORLD_CAMERA.eye));
      camera.lookAt(frame.center); camera.zoom = frame.zoom;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      for (const c of chunks) for (const x of [0, 32]) for (const z of [0, 32]) {
        const point = new THREE.Vector3(c.x * 32 + x, 0, c.z * 32 + z).project(camera);
        expect(Math.abs(point.x)).toBeLessThanOrEqual(0.921);
        expect(Math.abs(point.y)).toBeLessThanOrEqual(0.921);
      }
    }
    expect(JSON.stringify(chunks)).toBe(before);
  });
  it("positions inspected objects beside desktop panels and above phone sheets", () => {
    for (const [width, height] of [[1440, 936], [390, 780]]) {
      const camera = new THREE.OrthographicCamera(-100 * width! / height!, 100 * width! / height!, 100, -100, 0.1, 1200);
      camera.zoom = 6;
      camera.position.set(100, 90, 100); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      const target = inspectionTarget(10, 20, camera, width!, height!);
      camera.position.copy(target).add(new THREE.Vector3(...WORLD_CAMERA.eye)); camera.lookAt(target);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      const point = new THREE.Vector3(10, 0, 20).project(camera);
      const px = (point.x + 1) * width! / 2, py = (1 - point.y) * height! / 2;
      expect(px).toBeGreaterThan(72);
      expect(px).toBeLessThan(width! > 700 ? width! - 324 : width! - 12);
      expect(py).toBeGreaterThan(90);
      expect(py).toBeLessThan(width! > 700 ? height! - 100 : height! * 0.55);
    }
  });
});
