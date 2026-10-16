import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CAMERA_EASE_RATE, ORBIT_RADIANS_PER_PIXEL, TOUCH_GESTURES, TapTracker, frameDamping, orbitRotateSpeed } from "./cameraControls";

const at = (pointerId: number, clientX: number, clientY: number) => ({ pointerId, clientX, clientY });

describe("AgenticPad camera feel", () => {
  it("orbits with one finger and pinches/pans with two", () => {
    expect(TOUCH_GESTURES).toEqual({ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN });
  });

  it("turns the same angle per dragged pixel on every screen height", () => {
    for (const height of [480, 844, 1000, 1440]) {
      // OrbitControls: radians per pixel = 2π · rotateSpeed / clientHeight.
      expect((2 * Math.PI * orbitRotateSpeed(height)) / height).toBeCloseTo(ORBIT_RADIANS_PER_PIXEL, 10);
    }
  });

  it("damps by elapsed time, not by frame count", () => {
    // Remaining motion after 0.1 s is the same at 30, 60 and 120 frames per second.
    const remaining = (fps: number) => {
      let left = 1;
      for (let i = 0; i < fps / 10; i++) left *= 1 - frameDamping(1 / fps);
      return left;
    };
    for (const fps of [30, 60, 120]) expect(remaining(fps)).toBeCloseTo(Math.exp(-CAMERA_EASE_RATE * 0.1), 10);
    expect(frameDamping(-1)).toBe(0);
    expect(frameDamping(2)).toBeCloseTo(frameDamping(0.05), 12); // a long hitch never jumps the camera
  });

  it("treats only a still, single-pointer press as a tap", () => {
    const t = new TapTracker();
    t.down(at(1, 100, 100));
    expect(t.up(at(1, 103, 102))).toBe(true);

    t.down(at(2, 100, 100));
    t.move(at(2, 140, 100)); // dragged away and back: still a drag
    expect(t.up(at(2, 101, 100))).toBe(false);

    // A pinch: neither finger selects, even if one barely moved.
    t.down(at(3, 100, 100));
    t.down(at(4, 200, 200));
    t.move(at(4, 260, 260));
    expect(t.up(at(3, 100, 100))).toBe(false);
    expect(t.up(at(4, 260, 260))).toBe(false);

    t.down(at(5, 10, 10));
    t.cancel(at(5, 10, 10));
    expect(t.up(at(5, 10, 10))).toBe(false);
  });
});
