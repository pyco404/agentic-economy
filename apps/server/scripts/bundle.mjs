// Bundles the server into self-contained ESM files for container images (no node_modules needed at runtime):
//   dist-bundle/main.mjs      — the server (all roles; selected by ROLE)
//   dist-bundle/migrate.mjs   — schema migrations (Railway pre-deploy command)
//   dist-bundle/migrations/   — SQL files (resolved relative to the bundle)
import { build } from "esbuild";
import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const out = here("../dist-bundle/");
await rm(out, { recursive: true, force: true });
await build({
  entryPoints: { main: here("../src/main.ts"), migrate: here("../src/store/migrate.ts") },
  outdir: out,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  conditions: ["@agentic-economy/source"],
  // Optional native accelerators that `ws` / `pg` probe for with try/require.
  external: ["bufferutil", "utf-8-validate", "pg-native"],
  // CommonJS dependencies inside an ESM bundle need require/__dirname.
  banner: {
    js: [
      'import { createRequire as __aeCreateRequire } from "node:module";',
      'import { fileURLToPath as __aeFileURLToPath } from "node:url";',
      'import { dirname as __aeDirname } from "node:path";',
      "const require = __aeCreateRequire(import.meta.url);",
      "const __filename = __aeFileURLToPath(import.meta.url);",
      "const __dirname = __aeDirname(__filename);",
    ].join("\n"),
  },
  sourcemap: "linked",
  legalComments: "linked",
  logLevel: "warning",
});
await cp(here("../src/store/migrations"), `${out}migrations`, { recursive: true });
console.log(`bundled server → ${out}`);
