import { architectureProfile } from "./architecture";
import { cityPalette } from "./palette";
import * as THREE from "three";
import { visualEnvelope } from "./planning";
import type { BuildingVisual, ChunkVisual } from "./layout";
import { CHUNK_SIZE, isLand, random, shoreline } from "./layout";
import { gableGeometry, shedGeometry } from "./roofGeometry";
import { generateWindow, windowFamily } from "./windows";
import { planVegetation } from "./vegetation";
import { generateTreeParts } from "./vegetationGeometry";
import { buildingWallColor, pastelWalls } from "./buildingPalette";
import { createWaterMaterial } from "./waterFlow";
import { shadeFacade } from "./facadeShading";

export interface Part {
  geometry: string;
  color: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
  detail?: boolean;
  outline?: boolean;
  buildingId?: string;
  role?: "roof" | "window" | "door" | "window-frame" | "window-reflection" | "tree-trunk" | "tree-crown"
    | "street-surface" | "street-sidewalk" | "street-marking" | "bridge-edge" | "field-row"
    | "rail-pier" | "rail-fill" | "rail-sleeper" | "rail-buffer";
}
export const geometryLibrary = () => {
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    roof: gableGeometry(),
    shed: shedGeometry(),
    hip: new THREE.ConeGeometry(0.71, 1, 4).rotateY(Math.PI / 4),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    cone: new THREE.ConeGeometry(0.5, 1, 7),
    round: new THREE.IcosahedronGeometry(0.5, 1),
    sphere: new THREE.SphereGeometry(0.5, 8, 6),
  };
};
export type GeometryLibrary = ReturnType<typeof geometryLibrary>;
export function generateBuilding(b: BuildingVisual): Part[] {
  const p: Part[] = [],
    quarterTurn = Math.abs(Math.sin(b.rotation)) > 0.5;
  // Setbacks alter the visual envelope inside each persisted parcel, never its location or logical footprint.
  const envelope = visualEnvelope(b);
  const w = b.sourceKind && quarterTurn ? envelope.depth : envelope.width,
    d = b.sourceKind && quarterTurn ? envelope.width : envelope.depth,
    h = b.height,
    rng = random(b.seed),
    profile = architectureProfile(b);
  if (b.status === "reserved_lot")
    return [
      {
        geometry: "box",
        color: "#dedbca",
        position: [b.x, (b.elevation ?? 0) + 0.07, b.z],
        scale: [b.width, 0.14, b.depth],
        outline: true,
        buildingId: b.id,
      },
    ];
  if (b.status === "under_construction") {
    const frame: Part[] = [
      {
        geometry: "box",
        color: "#d4ceba",
        position: [b.x, (b.elevation ?? 0) + 0.1, b.z],
        scale: [b.width, 0.2, b.depth],
        outline: true,
        buildingId: b.id,
      },
    ];
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        frame.push({
          geometry: "box",
          color: "#aa9d7e",
          position: [
            b.x + (x * b.width) / 2,
            (b.elevation ?? 0) + h / 2,
            b.z + (z * b.depth) / 2,
          ],
          scale: [0.15, h, 0.15],
          outline: true,
          buildingId: b.id,
        });
    for (let f = 1; f <= b.floors; f++)
      frame.push({
        geometry: "box",
        color: "#bcae8b",
        position: [b.x, (b.elevation ?? 0) + (f * h) / b.floors, b.z],
        scale: [b.width, 0.1, b.depth],
        outline: true,
        buildingId: b.id,
      });
    return frame;
  }
  const put = (
    geometry: string,
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    detail = false,
    rotation?: [number, number, number],
  ) =>
    p.push({
      geometry,
      color,
      position: [x, y, z],
      scale: [sx, sy, sz],
      detail,
      rotation,
      outline: true,
      buildingId: b.id,
    });
  const box = (
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    detail = false,
  ) => put("box", color, x, y, z, sx, sy, sz, detail);
  // Primary openings belong to the building silhouette at every gameplay zoom.
  // Keep their surfaces solid, with no per-pane outlines or extra frame meshes.
  const opening = (
    role: "window" | "door",
    x: number, y: number, z: number,
    sx: number, sy: number, sz: number,
  ) => {
    box(cityPalette[role], x, y, z, sx, sy, sz);
    Object.assign(p[p.length - 1]!, { role, outline: false });
  };
  const putRoof = (...args: Parameters<typeof put>) => {
    put(...args);
    p[p.length - 1]!.role = "roof";
  };
  const wall = buildingWallColor(b);
  box(
    cityPalette.courtyard,
    0,
    0.04,
    0,
    (b.sourceKind && quarterTurn ? b.depth : b.width) * 0.94,
    0.08,
    (b.sourceKind && quarterTurn ? b.width : b.depth) * 0.94,
  );
  box("#d5d1c5", 0, 0.12, 0, w + 0.12, 0.24, d + 0.12);
  if (b.kind === "house") {
    box("#9da98a", w * 0.38, 0.24, d * 0.43, w * 0.25, 0.3, 0.28);
    box("#d7cbb7", 0, 0.24, d * 0.45, w * 0.34, 0.14, 0.45);
  }
  if (b.kind === "farm") {
    box("#c2bd98", 0, 0.25, 0, w, 0.15, d);
    for (let i = 0; i < 6; i++)
      box(
        i % 2 ? "#b6b781" : "#a7aa77",
        -w / 2 + 0.4 + (i * w) / 6,
        0.38,
        0,
        0.22,
        0.2,
        d - 0.3,
      );
    box(wall, -w * 0.25, h / 2 + 0.3, -d * 0.25, w * 0.45, h, d * 0.4);
    putRoof(
      "roof",
      b.roofColor,
      -w * 0.25,
      h + 0.315,
      -d * 0.25,
      w * 0.55,
      0.7,
      d * 0.5,
    );
    put(
      "cylinder",
      "#b6c0b0",
      w * 0.3,
      h * 0.6,
      -d * 0.3,
      w * 0.2,
      h * 1.1,
      w * 0.2,
    );
    for (const x of [-w / 2, w / 2]) box("#9b9d83", x, 0.65, 0, 0.1, 0.5, d);
  } else {
    const family = windowFamily(b);
    const columns = family === "house" ? 2
      : family === "apartment" ? Math.min(3, profile.columns)
      : family === "office" ? Math.max(3, profile.columns) : profile.columns;
    const paneLimit = family === "house" ? 1 : family === "workshop" ? 1.1 : 0.8;
    const floorHeight = h / b.floors;
    const doorWidth = Math.min(0.85, w * 0.36);
    const doorHeight = Math.min(1.3, floorHeight * 0.85);
    const podiumHeight = profile.podiumFloors * floorHeight;
    const rw = profile.stepped ? w * 0.82 : w;
    const rd = profile.stepped ? d * 0.84 : d;
    const rx = profile.stepped ? w * profile.upperX : 0;
    const rz = profile.stepped ? -d * 0.05 : 0;
    if (b.kind !== "quarry") {
      if (profile.stepped) {
        box(wall, 0, podiumHeight / 2 + 0.25, 0, w, podiumHeight, d);
        box(
          wall,
          rx,
          podiumHeight + (h - podiumHeight) / 2 + 0.25,
          rz,
          rw,
          h - podiumHeight,
          rd,
        );
        // Solid terrace deck sits above, rather than coplanar with, the podium top.
        box(b.roofColor, 0, podiumHeight + 0.31, 0, w + 0.08, 0.1, d + 0.08);
      } else box(wall, 0, h / 2 + 0.25, 0, w, h, d);
    }
    const roofHeight = Math.min(rw * 0.32, 1.6),
      eaveY = h + 0.265;
    if (b.roofStyle === "gable") {
      putRoof(
        "roof",
        b.roofColor,
        rx,
        eaveY,
        rz,
        rw + 0.5,
        roofHeight,
        rd + 0.5,
      );
      if (profile.rooftop)
        box(
          b.roofColor,
          rx,
          eaveY + roofHeight + 0.025,
          rz,
          0.08,
          0.05,
          rd + 0.3,
          true,
        );
    }
    if (b.roofStyle === "hip")
      putRoof(
        "hip",
        b.roofColor,
        rx,
        eaveY + roofHeight / 2,
        rz,
        rw + 0.5,
        roofHeight,
        rd + 0.5,
      );
    if (b.roofStyle === "flat") {
      putRoof("box", b.roofColor, rx, eaveY + 0.1, rz, rw + 0.3, 0.2, rd + 0.3);
      // Seat parapets on the slab. Butt the corner instead of overlapping two
      // coplanar top faces (the old L-shaped trim intersected itself).
      const parapetY = eaveY + 0.32;
      box(
        "#dbd6c9",
        rx - 0.06,
        parapetY,
        rz - rd / 2 - 0.09,
        rw + 0.18,
        0.24,
        0.12,
      );
      box("#dbd6c9", rx + rw / 2 + 0.09, parapetY, rz, 0.12, 0.24, rd + 0.3);
      if (profile.rooftop)
        box(
          "#91aeb1",
          rx - rw * 0.12,
          eaveY + 0.29,
          rz,
          rw * 0.28,
          0.18,
          rd * 0.25,
          true,
        );
    }
    if (b.roofStyle === "shed")
      putRoof(
        "shed",
        b.roofColor,
        rx,
        eaveY,
        rz,
        rw + 0.4,
        0.2 + (rw + 0.4) * Math.sin(0.13),
        rd + 0.4,
      );
    if (b.roofStyle === "dome")
      put(
        "sphere",
        b.roofColor,
        rx,
        h + 0.3,
        rz,
        rw,
        Math.min(rw, rd) * 0.8,
        rd,
      );
    if (b.roofStyle === "sawtooth")
      for (let i = 0; i < 3; i++)
        putRoof(
          "shed",
          b.roofColor,
          rx,
          eaveY,
          rz - rd / 3 + (i * rd) / 3,
          rd / 3,
          0.8,
          rw + 0.3,
          false,
          [0, Math.PI / 2, 0],
        );
    // Respect canonical patterns; seed controls rhythm, proportions and restrained trim.
    for (let f = 0; f < b.floors; f++) {
      const upper = profile.stepped && f >= profile.podiumFloors;
      const fw = upper ? rw : w,
        fd = upper ? rd : d,
        fx = upper ? rx : 0,
        fz = upper ? rz : 0;
      const band = b.windowPattern === "bands";
      const shop = b.windowPattern === "storefront" && f === 0;
      const count =
        b.windowPattern === "none"
          ? 0
          : b.windowPattern === "sparse"
            ? 1
            : band || shop
              ? 2
              : columns;
      const paneH = Math.min(
        shop ? 1.4 : 1,
        floorHeight * (shop ? 0.75 : band ? 0.4 : profile.windowHeight + 0.08),
      );
      const y = 0.25 + (f + 0.56) * floorHeight;
      if (
        f &&
        (profile.facade === "lintels" || band || f === profile.podiumFloors)
      )
        box(
          "#d0cabb",
          fx,
          0.25 + f * floorHeight,
          fz,
          fw + 0.05,
          0.08,
          fd + 0.05,
          true,
        );
      for (const side of [-1, 1])
        for (let i = 0; i < count; i++) {
          const spacing = (i - (count - 1) / 2) / count;
          const x = fx + spacing * fw * 0.84,
            z = fz + spacing * fd * 0.84;
          const paneW = band
            ? fw * 0.39
            : shop
              ? fw * 0.34
              : Math.min(paneLimit, (fw * 0.68) / count);
          const paneD = band
            ? fd * 0.39
            : shop
              ? fd * 0.34
              : Math.min(paneLimit, (fd * 0.68) / count);
          // Leave a clear entrance bay rather than overlapping door and glazing.
          const entranceBay =
            f === 0 && side === 1 &&
            Math.abs(x) < (paneW + doorWidth) / 2 + 0.02;
          const pane = (axis: "front" | "side", span: number) => {
            // Restrict projecting trim to selected bays on two facades. Fine
            // joinery stays behind LOD; primary glass and tonal cues never vanish.
            const decorated = side === 1 && (i + f + b.seed) % 3 === 0;
            const pieces = generateWindow(span, paneH, {
              framed: decorated && !band,
              mullion: decorated && span > 0.72 &&
                (shop || family === "house" || family === "office"),
              reflection: (i + f + b.seed) % 2 === 0,
              sill: decorated && !band &&
                (family === "house" || family === "apartment" || family === "civic"),
            });
            for (const piece of pieces) {
              const [px, py, normal] = piece.position;
              const [sx, sy, depth] = piece.scale;
              p.push({
                ...piece,
                buildingId: b.id,
                position: axis === "front"
                  ? [x + px, y + py, fz + side * (fd / 2 + normal)]
                  : [fx + side * (fw / 2 + normal), y + py, z + px],
                scale: axis === "front" ? [sx, sy, depth] : [depth, sy, sx],
              });
            }
          };
          if (!entranceBay) pane("front", paneW);
          pane("side", paneD);
        }
      if (
        profile.facade === "balconies" &&
        count &&
        f > 0 &&
        f % 2 === 1 &&
        f < 5 &&
        b.kind === "house"
      ) {
        const level = 0.25 + f * floorHeight;
        box(
          "#d0cabb",
          fx,
          level + 0.08,
          fz + fd / 2 + 0.14,
          fw * 0.48,
          0.1,
          0.38,
          true,
        );
        box(
          cityPalette.trimIvory,
          fx,
          level + 0.38,
          fz + fd / 2 + 0.3,
          fw * 0.48,
          0.06,
          0.05,
          true,
        );
        for (const side of [-1, 1])
          box(
            cityPalette.trimIvory,
            fx + side * fw * 0.22,
            level + 0.24,
            fz + fd / 2 + 0.3,
            0.05,
            0.28,
            0.05,
            true,
          );
      }
    }
    if (profile.facade === "pilasters")
      for (const side of [-1, 1])
        box(
          cityPalette.trimIvory,
          side * w * 0.38,
          0.25 + podiumHeight / 2,
          d / 2 + 0.04,
          0.11,
          podiumHeight,
          0.1,
          true,
        );
    opening("door", 0, 0.25 + doorHeight / 2, d / 2 + 0.04,
      doorWidth, doorHeight, 0.08);
    if (b.kind === "house" && rng() > 0.4) {
      box("#cfc7b7", rx + rw * 0.3, h + 0.5, rz - rd * 0.2, 0.4, 1.5, 0.4);
    }
    if (b.kind === "bakery" || b.kind === "market") {
      box(b.roofColor, 0, 1.65, d / 2 + 0.65, w + 0.25, 0.12, 1.4);
      for (const x of [-w * 0.45, w * 0.45])
        box("#939487", x, 0.85, d / 2 + 1, 0.12, 1.7, 0.12);
      for (let i = 0; i < 4; i++)
        box(
          i % 2 ? "#e9debf" : b.roofColor,
          ((i - 1.5) * w) / 4,
          1.735,
          d / 2 + 0.75,
          w / 4,
          0.05,
          1.35,
          true,
        );
      box("#c5aa80", 0, 0.65, d / 2 + 0.35, w * 0.8, 0.8, 0.4, true);
      if (b.kind === "bakery") {
        box(
          "#b89d88",
          -w * 0.3,
          h * 0.55,
          -d * 0.2,
          w * 0.3,
          h * 0.65,
          d * 0.45,
        );
        put(
          "cylinder",
          "#bba28c",
          -w * 0.3,
          h + 0.9,
          -d * 0.2,
          0.35,
          1.5,
          0.35,
        );
        put("sphere", "#d1b992", 0, 1.15, d / 2 + 0.15, 0.65, 0.35, 0.15, true);
      } else {
        for (const side of [-1, 1]) {
          box("#c5b491", side * w * 0.3, 0.7, 0, w * 0.3, 1.1, d * 0.65);
          box("#a4b293", side * w * 0.3, 1.3, 0, w * 0.35, 0.15, d * 0.7);
        }
      }
    }
    if (b.kind === "warehouse") {
      box("#9aabac", 0, 1.5, d / 2 + 0.04, w * 0.55, 2.4, 0.07);
      for (let i = 0; i < 4; i++)
        box(
          "#d3b591",
          w * 0.35,
          0.45 + i * 0.36,
          d / 2 + 0.5,
          0.7,
          0.35,
          0.7,
          true,
        );
    }
    if (b.kind === "factory") {
      put("cylinder", "#b6a797", w * 0.32, h * 0.7, -d * 0.25, 0.7, h + 2, 0.7);
      box("#9ba7a2", -w * 0.2, h + 0.8, 0, w * 0.4, 0.75, d * 0.65);
      for (let i = 0; i < 3; i++)
        put(
          "roof",
          "#adb7b1",
          -w * 0.2,
          h + 1.2,
          -d * 0.3 + i * d * 0.25,
          w * 0.5,
          0.5,
          d * 0.25,
        );
    }
    if (b.kind === "lumber-yard") {
      for (let row = 0; row < 3; row++)
        for (let n = 0; n < 3 - row; n++)
          put(
            "cylinder",
            "#b4a285",
            -w * 0.3 + n * 0.3,
            0.5 + row * 0.25,
            d * 0.2,
            0.25,
            w * 0.55,
            0.25,
            false,
            [0, 0, Math.PI / 2],
          );
      box("#b3aa95", w * 0.28, 0.6, d * 0.2, w * 0.35, 1.1, d * 0.55);
    }
    if (b.kind === "quarry") {
      for (let row = 0; row < 3; row++)
        box(
          ["#ccc9bc", "#bdbfaf", "#aeafa2"][row]!,
          0,
          0.35 + row * 0.3,
          0,
          w * (1 - row * 0.22),
          0.3,
          d * (1 - row * 0.22),
        );
      put("round", "#b3b8aa", w * 0.3, 0.65, -d * 0.25, 0.9, 0.7, 0.9);
    }
    if (b.kind === "power-station") {
      for (const side of [-1, 1])
        put(
          "cylinder",
          "#a2b1b0",
          side * w * 0.25,
          h + 0.65,
          0,
          w * 0.28,
          1.2,
          w * 0.28,
        );
      box("#b9b9a7", 0, h + 1.1, -d * 0.25, 0.16, 2, 0.16);
      box("#aeb1a0", 0, h + 1.65, -d * 0.25, w * 0.6, 0.1, 0.15);
    }
    if (b.kind === "mill") {
      put("cylinder", "#e4dfcd", 0, h + 0.5, 0, w * 0.65, 2, w * 0.65);
      put("cone", b.roofColor, 0, h + 2, 0, w * 0.8, 1.5, w * 0.8);
      box("#807f70", 0, h + 0.75, d / 2 + 0.3, 0.2, 0.2, 0.7);
      for (const angle of [Math.PI / 4, (Math.PI * 3) / 4])
        put(
          "box",
          "#c1b799",
          0,
          h + 0.75,
          d / 2 + 0.65,
          w * 1.25,
          0.25,
          0.12,
          false,
          [0, 0, angle],
        );
    }
    if (b.kind === "headquarters") {
      box("#a8b4a8", 0, h + 0.7, 0, w * 0.45, 0.65, d * 0.5);
      box("#7e8c7a", w * 0.32, h + 1.5, 0, 0.08, 2, 0.08);
      box(b.roofColor, w * 0.32 + 0.45, h + 2.2, 0, 0.9, 0.55, 0.06);
      box("#d8d1bd", 0, 0.5, d / 2 + 0.45, w * 0.7, 0.2, 0.7);
    }
    if (b.kind === "town-hall") {
      box("#e6e1d1", 0, h + 1.6, 0, w * 0.35, 2.4, d * 0.35);
      put("hip", "#a5b3a6", 0, h + 3.3, 0, w * 0.55, 1.1, d * 0.55);
      put(
        "cylinder",
        "#ddd7c6",
        0,
        h + 1.7,
        d * 0.175 + 0.02,
        0.5,
        0.06,
        0.5,
        false,
        [Math.PI / 2, 0, 0],
      );
      for (const x of [-w * 0.3, 0, w * 0.3])
        box("#d5d0c0", x, 1.45, d / 2 + 0.6, 0.25, 2.5, 0.25);
      box("#c6bfad", 0, 0.5, d / 2 + 0.8, w, 0.3, 1.3);
    }
  }
  const transform = new THREE.Matrix4().makeRotationY(b.rotation);
  for (const part of p) {
    const v = new THREE.Vector3(...part.position).applyMatrix4(transform);
    part.position = [v.x + b.x, v.y + (b.elevation ?? 0), v.z + b.z];
    const e = new THREE.Euler(...(part.rotation ?? [0, 0, 0]));
    const q = new THREE.Quaternion()
      .setFromEuler(e)
      .premultiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          b.rotation,
        ),
      );
    const result = new THREE.Euler().setFromQuaternion(q);
    part.rotation = [result.x, result.y, result.z];
  }
  return p;
}
export function createBatch(
  parts: Part[],
  library: GeometryLibrary,
  outlines = true,
): THREE.Group {
  const group = new THREE.Group(),
    batch = new Map<string, Part[]>(),
    lines: number[] = [];
  const matrix = new THREE.Matrix4(),
    quaternion = new THREE.Quaternion(),
    v = new THREE.Vector3(), instanceColor = new THREE.Color();
  const edgeCache = new Map<string, THREE.EdgesGeometry>();
  const facadeColors = new Set<string>(Object.values(pastelWalls));
  const flavor = (part: Part) => part.color === cityPalette.water && !part.buildingId ? "water"
    : part.buildingId ? part.geometry === "box" && facadeColors.has(part.color) ? "facade" : "architecture" : "landscape";
  for (const p of parts) {
    // Colors travel through the instance buffer instead of multiplying draw
    // calls as the curated palette grows. Keep shading/role/LOD boundaries.
    const key = `${p.geometry}:${flavor(p)}:${p.role ?? "solid"}:${p.detail ? "detail" : "base"}`;
    const list = batch.get(key) ?? [];
    list.push(p);
    batch.set(key, list);
  }
  for (const [key, list] of batch) {
    const first = list[0]!,
      geo = library[first.geometry as keyof GeometryLibrary];
    const building = !!first.buildingId;
    const water = flavor(first) === "water";
    const material = water
      ? createWaterMaterial() : new THREE.MeshLambertMaterial({
      color: "#ffffff",
      // Cone-based hip roofs otherwise interpolate normals across hard corners,
      // creating a soft gradient over a solid architectural plane.
      flatShading:
        building && (first.geometry === "hip" || first.geometry === "roof"),
    });
    // Keep pale architecture luminous through its diffuse response, not an
    // angle-independent emissive veil. No extra material batches or render passes.
    if (building) material.color.multiplyScalar(1.08);
    if (flavor(first) === "facade")
      shadeFacade(material);
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    mesh.userData.detail = !!first.detail;
    mesh.userData.role = first.role;
    mesh.userData.buildingIds = list.map((p) => p.buildingId);
    list.forEach((p, i) => {
      quaternion.setFromEuler(new THREE.Euler(...(p.rotation ?? [0, 0, 0])));
      matrix.compose(
        new THREE.Vector3(...p.position),
        quaternion,
        new THREE.Vector3(...p.scale),
      );
      mesh.setMatrixAt(i, matrix);
      if (!water) mesh.setColorAt(i, instanceColor.set(p.color));
      if (outlines && p.outline && !p.detail) {
        let edge = edgeCache.get(p.geometry);
        if (!edge) {
          edge = new THREE.EdgesGeometry(geo, 24);
          edgeCache.set(p.geometry, edge);
        }
        const attr = edge.getAttribute("position");
        for (let j = 0; j < attr.count; j++) {
          v.fromBufferAttribute(attr, j).applyMatrix4(matrix);
          lines.push(v.x, v.y, v.z);
        }
      }
    });
    mesh.name = key;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  if (lines.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    group.add(
      new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({
          color: "#6e746a",
          transparent: true,
          opacity: 0.35,
        }),
      ),
    );
  }
  edgeCache.forEach((g) => g.dispose());
  return group;
}
export function generateLandscape(chunk: ChunkVisual, seed: number,
  context: ChunkVisual[] = [chunk]): Part[] {
  const parts: Part[] = [];
  const x0 = chunk.x * CHUNK_SIZE,
    z0 = chunk.z * CHUNK_SIZE;
  const size = chunk.size ?? 32;
  const adjacent = new Map(context.map((c) => [`${c.x}:${c.z}`, c]));
  const at = (x: number, z: number) => {
    const wx = x0 + x, wz = z0 + z;
    const cx = Math.floor(wx / size), cz = Math.floor(wz / size);
    const c = adjacent.get(`${cx}:${cz}`);
    return c?.terrain?.[(wz - cz * size) * size + wx - cx * size];
  };
  const arterial = (x: number, z: number) =>
    (at(x - 1, z) === "r" && at(x + 1, z) === "r" &&
      (at(x, z - 1) === "r" || at(x, z + 1) === "r")) ||
    (at(x, z - 1) === "r" && at(x, z + 1) === "r" &&
      (at(x - 1, z) === "r" || at(x + 1, z) === "r"));
  if (chunk.terrain) {
    const size = chunk.size ?? 32,
      colors: Record<string, string> = {
        g: cityPalette.terrain,
        s: cityPalette.sand,
        r: cityPalette.road,
        p: cityPalette.plaza,
        f: cityPalette.field,
        b: "#c9bfa8",
        x: cityPalette.terrain,
      };
    for (let i = 0; i < size; i++)
      for (let j = 0; j < size; j++) {
        const code = chunk.terrain[j * size + i] ?? "g";
        if (code === "w") {
          parts.push({ geometry: "box", color: cityPalette.water,
            position: [chunk.x * size + i + 0.5, -0.265, chunk.z * size + j + 0.5],
            scale: [1, 0.03, 1] });
          continue;
        }
        const elevation = Number(chunk.elevation?.[j * size + i] ?? "0") * 0.08;
        parts.push({
          geometry: "box",
          color: code === "r" && arterial(i, j)
            ? cityPalette.arterialRoad : colors[code] ?? colors.g!,
          position: [
            chunk.x * size + i + 0.5,
            elevation - 0.1,
            chunk.z * size + j + 0.5,
          ],
          scale: [1, 0.2, 1],
        });
      }
  } else {
    for (let i = 0; i < 16; i++)
      for (let j = 0; j < 16; j++) {
        const x = x0 + i * 2 + 1,
          z = z0 + j * 2 + 1;
        if (!isLand(x, z, seed))
          parts.push({ geometry: "box", color: cityPalette.water,
            position: [x, -0.265, z], scale: [2, 0.03, 2] });
        if (isLand(x, z, seed))
          parts.push({
            geometry: "box",
            color:
              x > shoreline(z, seed) - 3
                ? cityPalette.sand
                : cityPalette.terrain,
            position: [x, -0.13, z],
            scale: [2, 0.22, 2],
          });
        if (isLand(x, z, seed) && (i % 8 === 0 || j % 8 === 0))
          parts.push({
            geometry: "box",
            color: cityPalette.road,
            position: [x, 0.005, z],
            scale: [2, 0.07, 2],
          });
      }
  }
  for (const park of chunk.parks ?? []) {
    parts.push({
      geometry: "box",
      color: "#c6d09c",
      position: [park.x, 0.04, park.z],
      scale: [park.size, 0.1, park.size],
    });
    for (const side of [-1, 1]) {
      parts.push({
        geometry: "box",
        color: "#c0ad8f",
        position: [park.x + side * 2, 0.55, park.z],
        scale: [0.55, 0.15, 2],
        outline: true,
      });
      parts.push({
        geometry: "box",
        color: "#b0b397",
        position: [park.x + side * 2, 0.85, park.z - 0.7],
        scale: [0.6, 0.45, 0.12],
        outline: true,
      });
    }
    parts.push({
      geometry: "cylinder",
      color: "#b6c3b7",
      position: [park.x, 0.3, park.z],
      scale: [1.6, 0.45, 1.6],
      outline: true,
    });
  }
  if (chunk.terrain) {
    for (let x = 0; x < size; x++)
      for (let z = 0; z < size; z++) {
        const code = at(x, z),
          wx = chunk.x * size + x + 0.5,
          wz = chunk.z * size + z + 0.5,
          level = Number(chunk.elevation?.[z * size + x] ?? "0") * 0.08;
        if (code === "p" && (x + z) % 11 === 0) {
          parts.push({
            geometry: "box",
            color: "#b9aa91",
            position: [wx, level + 0.3, wz],
            scale: [0.8, 0.12, 0.3],
            outline: true,
          });
        }
        if (code === "f" && (x + z) % 3 === 0)
          parts.push({
            geometry: "box",
            role: "field-row",
            color: "#98aa68",
            position: [wx, level + 0.15, wz],
            scale: [0.12, 0.2, 0.8],
          });
      }
  }
  for (const prop of chunk.props ?? []) {
    if (prop.kind.startsWith("tree")) continue;
    if (prop.kind === "lamp") {
      parts.push({
        geometry: "cylinder",
        color: "#9fa494",
        position: [prop.x, 1.2, prop.z],
        scale: [0.08, 2.4, 0.08],
      });
      parts.push({
        geometry: "box",
        color: "#d1cfb6",
        position: [prop.x, 2.4, prop.z],
        scale: [0.25, 0.3, 0.25],
        outline: true,
      });
    } else
      parts.push({
        geometry: "round",
        color: prop.kind === "bush" ? cityPalette.bush : "#b9bcb0",
        position: [prop.x, 0.4 * prop.scale, prop.z],
        scale: [prop.scale, 0.7 * prop.scale, prop.scale],
        outline: true,
      });
  }
  for (const tree of planVegetation(chunk, seed, context)) {
    parts.push(...generateTreeParts(tree));
  }
  if (!chunk.terrain) {
    // A seeded waterfront walk and short jetty are geometry, never imported assets.
    for (let localZ = 0; localZ < 32; localZ += 2) {
      const z = z0 + localZ,
        shore = shoreline(z, seed);
      if (shore >= x0 && shore < x0 + 32) {
        parts.push({
          geometry: "box",
          color: "#dbd5bf",
          position: [shore - 1, 0.1, z],
          scale: [1.1, 0.25, 2.2],
        });
        parts.push({
          geometry: "box",
          color: "#a6a68e",
          position: [shore - 0.3, 0.65, z],
          scale: [0.08, 0.9, 0.08],
        });
      }
    }
    if (chunk.x === 1 && chunk.z === 0) {
      const start = shoreline(16, seed) - 1,
        length = 12;
      parts.push({
        geometry: "box",
        color: "#c9bda2",
        position: [start + length / 2, 0.1, 16],
        scale: [length, 0.25, 2.8],
        outline: true,
      });
      for (const side of [-1, 1]) {
        parts.push({
          geometry: "box",
          color: "#aaa68e",
          position: [start + length / 2, 0.95, 16 + side * 1.25],
          scale: [length, 0.1, 0.08],
        });
        for (let i = 0; i < 5; i++)
          parts.push({
            geometry: "box",
            color: "#aaa68e",
            position: [start + (i * length) / 4, 0.55, 16 + side * 1.25],
            scale: [0.12, 1.2, 0.12],
            outline: true,
          });
      }
    }
  }
  // Road markings, sidewalks and a procedural promenade.
  if (!chunk.terrain)
    for (let i = 0; i < 32; i += 4) {
      for (const lane of [0, 16]) {
        if (isLand(x0 + lane, z0 + i, seed))
          parts.push({
            geometry: "box",
            color: "#d5d4c8",
            position: [x0 + lane, 0.055, z0 + i],
            scale: [0.12, 0.04, 1.5],
            detail: true,
          });
        if (isLand(x0 + i, z0 + lane, seed))
          parts.push({
            geometry: "box",
            color: "#d5d4c8",
            position: [x0 + i, 0.055, z0 + lane],
            scale: [1.5, 0.04, 0.12],
            detail: true,
          });
      }
    }
  return parts;
}
export function disposeGroup(
  group: THREE.Object3D,
  shared?: Set<THREE.BufferGeometry>,
) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Sprite) {
      if (!(object instanceof THREE.Sprite) && !shared?.has(object.geometry)) object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((m) => m.dispose());
      if (object instanceof THREE.InstancedMesh) object.dispose();
    }
  });
}
