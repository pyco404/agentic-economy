import * as THREE from "three";

// Camera feel ported from AgenticPad (pyco404/oxude, web/lib/world/projection.ts and
// web/app/village/world-camera.tsx): drag moves a target angle at a fixed rate per pixel,
// and the camera eases toward it with frame-rate-independent exponential damping.

/** AgenticPad turns the view 0.006 radians per dragged pixel. */
export const ORBIT_RADIANS_PER_PIXEL = 0.006;
/** AgenticPad eases angle and zoom with 1 - e^(-14·dt): settles in ~0.3 s, no long glide. */
export const CAMERA_EASE_RATE = 14;
/** Frames longer than this (tab switch, hitch) ease as if they were this long, as in AgenticPad. */
const MAX_FRAME_SECONDS = 0.05;
/** A press that moves farther than this is a camera drag, never a tap (selection). */
export const TAP_SLOP_PX = 5;

/**
 * One finger orbits (left/right reveals other sides, up/down changes elevation); two fingers pinch to
 * zoom and move together to pan. Desktop keeps left-drag orbit, right-drag pan, wheel zoom.
 */
export const TOUCH_GESTURES = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

/** OrbitControls turns 2π·rotateSpeed/height per pixel; this keeps AgenticPad's rate on every screen. */
export function orbitRotateSpeed(viewportHeight: number) {
  return (ORBIT_RADIANS_PER_PIXEL * Math.max(1, viewportHeight)) / (2 * Math.PI);
}

/** OrbitControls applies `dampingFactor` of the remaining motion per update; make that time-based. */
export function frameDamping(frameSeconds: number, rate = CAMERA_EASE_RATE) {
  const seconds = Math.min(MAX_FRAME_SECONDS, Math.max(0, frameSeconds));
  return 1 - Math.exp(-rate * seconds);
}

/**
 * Tells a tap from a camera gesture. A press selects only if it stayed within TAP_SLOP_PX and no
 * other pointer joined while it was down (a pinch or two-finger pan never selects).
 */
export class TapTracker {
  private readonly active = new Map<number, { x: number; y: number; multi: boolean; moved: boolean }>();

  down(e: Pick<PointerEvent, "pointerId" | "clientX" | "clientY">) {
    const multi = this.active.size > 0;
    if (multi) for (const p of this.active.values()) p.multi = true;
    this.active.set(e.pointerId, { x: e.clientX, y: e.clientY, multi, moved: false });
  }

  move(e: Pick<PointerEvent, "pointerId" | "clientX" | "clientY">) {
    const p = this.active.get(e.pointerId);
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_SLOP_PX) p.moved = true;
  }

  /** Returns whether the released pointer was a tap, and forgets it. */
  up(e: Pick<PointerEvent, "pointerId" | "clientX" | "clientY">): boolean {
    const p = this.active.get(e.pointerId);
    this.active.delete(e.pointerId);
    if (!p) return false;
    this.move(e);
    return !p.multi && !p.moved;
  }

  cancel(e: Pick<PointerEvent, "pointerId">) {
    this.active.delete(e.pointerId);
  }
}
