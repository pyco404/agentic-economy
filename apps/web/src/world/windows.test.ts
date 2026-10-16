import { describe, expect, it } from "vitest";
import { generateWindow, windowFamily } from "./windows";
import { generateBuilding } from "./geometry";
import type { BuildingVisual } from "./layout";

const building: BuildingVisual = {
  id: "windows", seed: 22, kind: "house", x: 0, z: 0, width: 6, depth: 5,
  height: 6, floors: 3, roofStyle: "gable", roofColor: "#d39477",
  rotation: 0, name: "Windows", chunkId: "0:0", windowPattern: "grid",
};

describe("stylized architectural glazing", () => {
  it("seats glass behind the reveal and separates the reflection from its surface", () => {
    const parts = generateWindow(0.9, 0.8, {
      framed: true, mullion: true, reflection: true, sill: true,
    });
    const glass = parts.find((p) => p.role === "window")!;
    const reflection = parts.find((p) => p.role === "window-reflection")!;
    const front = (p: typeof glass) => p.position[2] + p.scale[2] / 2;
    expect(reflection.position[2] - reflection.scale[2] / 2).toBeGreaterThan(front(glass));
    for (const frame of parts.filter((p) => p.role === "window-frame")) {
      expect(front(frame)).toBeGreaterThan(front(reflection));
      expect(frame.detail).toBe(true);
    }
    expect(glass.detail).toBe(false);
    expect(reflection.detail).toBe(false);
    expect(parts.every((p) => !p.outline)).toBe(true);
    expect(parts.length).toBeLessThanOrEqual(8);
  });

  it("uses canonical kinds for residential rhythm and office/workplace treatments", () => {
    expect(windowFamily({ ...building, sourceKind: "apartment" })).toBe("apartment");
    expect(windowFamily({ ...building, sourceKind: "headquarters" })).toBe("office");
    expect(windowFamily({ ...building, sourceKind: "factory" })).toBe("workshop");
    const windows = (sourceKind: string) => generateBuilding({ ...building, sourceKind })
      .filter((p) => p.role === "window");
    const houses = windows("house"), apartments = windows("apartment");
    expect(houses.length).toBeLessThan(apartments.length);
    expect(Math.max(...houses.map((p) => Math.max(p.scale[0], p.scale[2]))))
      .toBeGreaterThan(Math.max(...apartments.map((p) => Math.max(p.scale[0], p.scale[2]))));
    const before = JSON.stringify(building);
    const parts = generateBuilding(building);
    generateBuilding({ ...building, seed: 999 });
    expect(generateBuilding(building)).toEqual(parts);
    expect(JSON.stringify(building)).toBe(before);
  });
});
