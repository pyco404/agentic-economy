import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { generateWorld, extractChunk, chunkCoords, isWalkable, KIND_SPECS } from "../src/index.js";
import type { BuildingKind } from "@agentic-economy/shared";

const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

describe("generateWorld", () => {
  const world = generateWorld("genesis-test");

  it("is deterministic for a seed", () => {
    expect(digest(generateWorld("genesis-test"))).toBe(digest(world));
  });

  it("differs across seeds", () => {
    expect(digest(generateWorld("another-seed").buildings)).not.toBe(digest(world.buildings));
  });

  it("produces the full starter production chain and landmarks", () => {
    const count = (k: BuildingKind) => world.buildings.filter((b) => b.kind === k).length;
    expect(count("town_hall")).toBe(1);
    expect(count("market")).toBe(1);
    expect(count("bakery")).toBe(2);
    expect(count("mill")).toBe(2);
    expect(count("farm")).toBeGreaterThanOrEqual(4);
    expect(count("power_station")).toBe(1);
    expect(count("headquarters")).toBe(12);
    expect(count("house") + count("apartment")).toBeGreaterThan(150);
    for (const b of world.buildings) expect(KIND_SPECS[b.kind]).toBeDefined();
  });

  it("never overlaps footprints and keeps them on land", () => {
    const occupied = new Set<string>();
    for (const b of world.buildings) {
      for (let y = b.origin.y; y < b.origin.y + b.params.depth; y++) {
        for (let x = b.origin.x; x < b.origin.x + b.params.width; x++) {
          const key = `${x},${y}`;
          expect(occupied.has(key)).toBe(false);
          occupied.add(key);
          expect(world.terrain[y * world.width + x]).toBe("x");
        }
      }
    }
  });

  it("gives every building a walkable entrance on one connected road network", () => {
    const start = world.buildings[0]!.entrance;
    const seen = new Set<number>([start.y * world.width + start.x]);
    const stack = [start.y * world.width + start.x];
    while (stack.length) {
      const cur = stack.pop()!;
      const x = cur % world.width;
      const y = (cur - x) / world.width;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
        const j = ny * world.width + nx;
        if (!seen.has(j) && isWalkable(world.terrain[j])) {
          seen.add(j);
          stack.push(j);
        }
      }
    }
    for (const b of world.buildings) expect(seen.has(b.entrance.y * world.width + b.entrance.x)).toBe(true);
  });

  it("has water, a shoreline and bridges", () => {
    expect(world.terrain.filter((t) => t === "w").length).toBeGreaterThan(300);
    expect(world.terrain.includes("s")).toBe(true);
    expect(world.terrain.includes("b")).toBe(true);
  });

  it("splits into 16 chunks that partition buildings exactly", () => {
    const coords = chunkCoords(world);
    expect(coords).toHaveLength(16);
    const chunks = coords.map((c) => extractChunk(world, c));
    expect(chunks.reduce((n, c) => n + c.buildings.length, 0)).toBe(world.buildings.length);
    for (const ch of chunks) {
      expect(ch.terrain).toHaveLength(32 * 32);
      expect(ch.elevation).toMatch(/^[0-9]{1024}$/);
    }
  });
});
