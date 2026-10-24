// Bundles the server into self-contained ESM files for container images (no node_modules needed at runtime):
//   dist-bundle/main.mjs      — the server (all roles; selected by ROLE)
//   dist-bundle/migrate.mjs   — schema migrations (Railway pre-deploy command)
//   dist-bundle/migrations/   — SQL files (resolved relative to the bundle)
import { build } from "esbuild";
import { cp, rm, readFile, realpath, mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const out = here("../dist-bundle/");
const require=createRequire(import.meta.url);
const sharpEntry=require.resolve("sharp"),sharpDir=dirname(dirname(sharpEntry));
await rm(out, { recursive: true, force: true });
const result = await build({
  entryPoints: { main: here("../src/main.ts"), migrate: here("../src/store/migrate.ts") },
  outdir: out,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  metafile: true,
  platform: "node",
  target: "node22",
  format: "esm",
  conditions: ["@agentic-economy/source"],
  // The upstream native bigint converter has no published security fix. Force the
  // API-compatible pure-JS entry regardless of build cache/native-addon availability.
  plugins: [{name: "pure-js-bigint",setup(builder){
    builder.onResolve({filter:/^bigint-buffer$/},args=>({path:require.resolve("bigint-buffer/dist/browser.js",{paths:[args.resolveDir]})}));
  }},{name: "native-image-decoder",setup(builder){
    builder.onResolve({filter:/^sharp$/},()=>({path:`./vendor/sharp/${relative(sharpDir,sharpEntry)}`,external:true}));
  }}],
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
const inputs=Object.keys(result.metafile.inputs);
if(!inputs.some(p=>p.includes("bigint-buffer/")&&p.endsWith("/dist/browser.js")) ||
   inputs.some(p=>p.includes("bigint-buffer/")&&p.endsWith("/dist/node.js")))
  throw new Error("Production bundle must include only the pure-JS bigint converter");
// Sharp's audited decoder needs its native library. Copy only the dependency
// closure installed for this build platform; retain licenses and package metadata.
// The image remains self-contained, without a root node_modules or package manager.
await cp(sharpDir,`${out}vendor/sharp`,{recursive:true,dereference:true});
const copied=new Set();
async function copyDependency(name,from){
 if(copied.has(name))return;
 const parent=JSON.parse(await readFile(join(from,"package.json"),"utf8"));
 const source=await realpath(join(from,"node_modules",name)).catch(()=>realpath(join(from,parent.name.startsWith("@")?"../..":"..",name)).catch(()=>null));if(!source)return;
 copied.add(name);const target=`${out}vendor/node_modules/${name}`;
 await mkdir(dirname(target),{recursive:true});await cp(source,target,{recursive:true,dereference:true});
 const manifest=JSON.parse(await readFile(join(source,"package.json"),"utf8"));
 for(const dependency of Object.keys({...manifest.dependencies,...manifest.optionalDependencies}))await copyDependency(dependency,source);
}
const manifest=JSON.parse(await readFile(join(sharpDir,"package.json"),"utf8"));
for(const dependency of Object.keys({...manifest.dependencies,...manifest.optionalDependencies}))await copyDependency(dependency,sharpDir);
await cp(here("../src/store/migrations"), `${out}migrations`, { recursive: true });
console.log(`bundled server → ${out}`);
