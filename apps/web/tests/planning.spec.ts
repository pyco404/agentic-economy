import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

test("live district landscaping preserves canonical parcels and keeps full crowns off access routes", async ({ page, request }) => {
  const base = "http://127.0.0.1:8787/api/v1";
  const bootstrap = await (await request.get(`${base}/world/bootstrap`)).json();
  const response = await (await request.get(`${base}/world/chunks?x=1&y=1&radius=4`)).json();
  await page.route("**/*", (route) => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Live planning inspection</title>" })
    : route.continue());
  await page.goto("/");
  const result = await page.evaluate(async (input) => {
    const adapterPath = "/src/api/adapter.ts", planningPath = "/src/world/vegetation.ts";
    const { worldChunkToVisual, numericSeed } = await import(adapterPath);
    const { planVegetation } = await import(planningPath);
    const before = JSON.stringify(input.chunks);
    const chunks = input.chunks.map((c: any) => worldChunkToVisual(c));
    const cells = new Map<string, string>();
    const buildings = input.chunks.flatMap((c: any) => c.buildings);
    for (const chunk of input.chunks)
      for (let z = 0; z < chunk.size; z++) for (let x = 0; x < chunk.size; x++)
        cells.set(`${chunk.coord.cx * chunk.size + x}:${chunk.coord.cy * chunk.size + z}`,
          chunk.terrain[z * chunk.size + x]);
    const trees = chunks.flatMap((c: any) => planVegetation(c, numericSeed(input.seed), chunks));
    const violations: string[] = [];
    const zones: Record<string, number> = {}, species: Record<string, number> = {};
    for (const tree of trees) {
      zones[tree.zone] = (zones[tree.zone] ?? 0) + 1;
      species[tree.kind] = (species[tree.kind] ?? 0) + 1;
      const radius = tree.scale * 0.8;
      for (let x = Math.floor(tree.x - radius); x <= Math.floor(tree.x + radius); x++)
        for (let z = Math.floor(tree.z - radius); z <= Math.floor(tree.z + radius); z++) {
          const distance = Math.hypot(Math.max(x - tree.x, 0, tree.x - x - 1),
            Math.max(z - tree.z, 0, tree.z - z - 1));
          if (distance < radius && cells.get(`${x}:${z}`) !== "g") violations.push("terrain");
        }
      for (const b of buildings) {
        const distance = Math.hypot(Math.max(b.origin.x - tree.x, 0, tree.x - b.origin.x - b.params.width),
          Math.max(b.origin.y - tree.z, 0, tree.z - b.origin.y - b.params.depth));
        if (distance < radius + 0.65 - 0.00001) violations.push(`parcel:${b.id}`);
        if (Math.hypot(tree.x - b.entrance.x - 0.5, tree.z - b.entrance.y - 0.5) < radius + 2.5 - 0.00001)
          violations.push(`entrance:${b.id}`);
      }
    }
    return { sourceTrees: input.chunks.flatMap((c: any) => c.props)
      .filter((p: any) => p.kind.startsWith("tree")).length,
      plannedTrees: trees.length, zones, species, violations,
      canonicalInputsUnchanged: before === JSON.stringify(input.chunks),
      buildingCount: buildings.length,
      visualBuildingCount: chunks.flatMap((c: any) => c.buildings).length };
  }, { chunks: response.chunks, seed: bootstrap.seed });
  const staticLayout = response.chunks.map((c: any) => ({ coord: c.coord, terrain: c.terrain,
    elevation: c.elevation, props: c.props, buildings: c.buildings.map((b: any) => ({
      id: b.id, kind: b.kind, origin: b.origin, entrance: b.entrance, params: b.params })) }));
  await writeFile("artifacts/planning-validation.json", JSON.stringify({ ...result,
    canonicalLayoutHash: createHash("sha256").update(JSON.stringify(staticLayout)).digest("hex"),
  }, null, 2));
  expect(result.canonicalInputsUnchanged).toBe(true);
  expect(result.visualBuildingCount).toBe(result.buildingCount);
  expect(result.violations).toEqual([]);
  expect(Object.keys(result.species).length).toBeGreaterThanOrEqual(4);
  expect(result.plannedTrees).toBeLessThan(result.sourceTrees * 0.75);
});
