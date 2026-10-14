import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { routes } from "@agentic-economy/shared";

/** Deployment-specific checks: Docker build inputs, Railway IaC invariants, env templates, and the real bundle. */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const dockerfile = read("infra/railway/Dockerfile");
const dockerignore = read("infra/railway/Dockerfile.dockerignore");
const iac = read(".railway/railway.ts");

/** Minimal .dockerignore semantics (patterns relative to the context root, `**`, `*`, `!` negation). */
function ignored(path: string): boolean {
  let result = false;
  for (const raw of dockerignore.split("\n").map((l) => l.trim())) {
    if (!raw || raw.startsWith("#")) continue;
    const neg = raw.startsWith("!");
    const pat = neg ? raw.slice(1) : raw;
    const re = new RegExp(
      "^" +
        pat
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*\*\//g, "(?:.*/)?")
          .replace(/\*\*/g, ".*")
          .replace(/(?<!\.)\*/g, "[^/]*") +
        "(?:/.*)?$",
    );
    if (re.test(path)) result = !neg;
  }
  return result;
}

function workspacePackages(): Map<string, string> {
  const map = new Map<string, string>();
  for (const dir of ["packages/shared", "packages/world-spec", "apps/server"]) map.set(JSON.parse(read(`${dir}/package.json`)).name, dir);
  return map;
}

function workspaceDepsOf(dir: string, all = workspacePackages(), seen = new Set<string>()): Set<string> {
  const pkg = JSON.parse(read(`${dir}/package.json`));
  for (const [name, spec] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }) as Array<[string, string]>) {
    if (!spec.startsWith("workspace:") || seen.has(name)) continue;
    const depDir = all.get(name);
    if (!depDir) throw new Error(`workspace dependency ${name} not found`);
    seen.add(depDir);
    workspaceDepsOf(depDir, all, seen);
  }
  return seen;
}

describe("Docker build configuration", () => {
  const buildStage = dockerfile.slice(0, dockerfile.indexOf("AS runtime"));
  const copies = [...buildStage.matchAll(/^COPY (?!--from)(.+?) (\S+)$/gm)].flatMap((m) => m[1]!.split(/\s+/));

  it("builds from the repository root and every COPY source exists there", () => {
    expect(dockerfile).toMatch(/Build context: repository root/);
    for (const src of copies) expect(existsSync(join(ROOT, src)), src).toBe(true);
  });

  it("copies the root workspace files and every (transitive) workspace dependency of apps/server", () => {
    for (const f of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json"]) expect(copies).toContain(f);
    const deps = workspaceDepsOf("apps/server");
    expect([...deps].sort()).toEqual(["packages/shared", "packages/world-spec"]);
    for (const dir of deps) {
      expect(copies, `${dir}/package.json (install layer)`).toContain(`${dir}/package.json`);
      expect(copies.some((c) => dir === c || dir.startsWith(`${c}/`)), `${dir} sources`).toBe(true);
    }
    expect(copies).toContain("apps/server");
    expect(dockerfile).toMatch(/pnpm install --frozen-lockfile --filter "\.\/packages\/\*" --filter \.\/apps\/server/);
  });

  it("never includes the frontend (apps/web is Codex-owned)", () => {
    for (const src of copies) expect(src.startsWith("apps/web")).toBe(false);
    expect(ignored("apps/web/src/main.tsx")).toBe(true);
  });

  it("does not ignore any tracked file the build needs", () => {
    const needed = execFileSync("git", ["ls-files", "apps/server", "packages", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json"], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter((f) => f && !f.endsWith(".md") && !f.includes("/test/") && !f.includes("/fixtures/"));
    expect(needed.length).toBeGreaterThan(30);
    const dropped = needed.filter(ignored);
    expect(dropped).toEqual([]);
  });

  it("pins the same Node base image in both stages and the repo's pnpm version", () => {
    const froms = [...dockerfile.matchAll(/^FROM (\S+)/gm)].map((m) => m[1]);
    expect(froms).toHaveLength(2);
    expect(froms[0]).toBe(froms[1]);
    expect(froms[0]).toMatch(/^node:\d+\.\d+\.\d+-slim$/);
    const pm = JSON.parse(read("package.json")).packageManager as string;
    expect(dockerfile).toContain(`corepack prepare ${pm} --activate`);
  });

  it("runs as non-root with an exec-form CMD (SIGTERM reaches node for graceful leadership release)", () => {
    expect(dockerfile).toMatch(/^USER node$/m);
    expect(dockerfile).toMatch(/^CMD \["node", "main\.mjs"\]$/m);
  });
});

describe("Railway IaC and environment templates", () => {
  it("keeps staging safe: fee routing unverified, no production mode, readiness healthcheck, migrations pre-deploy", () => {
    expect(iac).toMatch(/FEE_ROUTING_VERIFIED: "false"/);
    expect(iac).not.toMatch(/MODE:\s*"production"/);
    expect(iac).toMatch(/MODE: "demo",/); // pinned for staging; not left to a code default
    expect(iac).toMatch(/healthcheckPath: "\/readyz"/);
    expect(iac).toMatch(/preDeployCommand: \["node migrate\.mjs"\]/);
    expect(iac).toMatch(/const TOPOLOGY: "single" \| "split" = "single";/);
    const df = /dockerfilePath: "([^"]+)"/.exec(iac)?.[1];
    expect(df && existsSync(join(ROOT, df))).toBe(true);
    for (const w of ["apps/server/**", "packages/**", "infra/railway/**", "pnpm-lock.yaml"]) expect(iac).toContain(`"${w}"`);
  });

  it("env templates never enable launches or production and contain no secrets", () => {
    for (const role of ["all", "api", "sim", "indexer"]) {
      const env = read(`infra/railway/env/${role}.env.example`);
      expect(env).toMatch(new RegExp(`^ROLE=${role}$`, "m"));
      expect(env).not.toMatch(/^MODE=production$/m);
      if (role !== "sim") expect(env, role).toMatch(/^FEE_ROUTING_VERIFIED=false$/m);
      expect(env).toMatch(/^DATABASE_URL=\$\{\{Postgres\.DATABASE_URL\}\}$/m);
      for (const key of ["SOLANA_RPC_URL", "PLATFORM_TREASURY", "AGENT_REWARDS_TREASURY"]) {
        const m = new RegExp(`^${key}=(.*)$`, "m").exec(env);
        if (m) expect(m[1], `${role}:${key}`).toBe("");
      }
      expect(env).not.toMatch(/[1-9A-HJ-NP-Za-km-z]{80,}/); // no base58 secret keys
      expect(env).not.toMatch(/\[\s*\d+\s*,\s*\d+/); // no JSON keypair arrays
    }
    expect(read("infra/railway/env/sim.env.example")).not.toMatch(/SOLANA_RPC_URL|TREASURY/);
  });
});

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });

describe("production bundle (what the image runs)", () => {
  it("builds, starts with no node_modules, passes readiness, serves the contract and shuts down cleanly on SIGTERM", async () => {
    execFileSync("node", ["scripts/bundle.mjs"], { cwd: join(ROOT, "apps/server"), stdio: "pipe" });
    const dir = await mkdtemp(join(tmpdir(), "ae-bundle-"));
    await cp(join(ROOT, "apps/server/dist-bundle"), dir, { recursive: true });
    expect(existsSync(join(dir, "node_modules"))).toBe(false);
    expect(existsSync(join(dir, "migrations/001_init.sql"))).toBe(true);

    const port = await freePort();
    const child = spawn("node", ["main.mjs"], {
      cwd: dir,
      env: { PATH: process.env.PATH, MODE: "demo", ROLE: "all", HOST: "127.0.0.1", PORT: String(port), LOG_LEVEL: "warn", FEE_ROUTING_VERIFIED: "false" },
      stdio: "pipe",
    });
    let stderr = "";
    child.stderr.on("data", (b) => (stderr += String(b)));
    const exited = new Promise<number | null>((r) => child.on("exit", (code) => r(code)));
    try {
      const base = `http://127.0.0.1:${port}`;
      let ready: Response | null = null;
      for (let i = 0; i < 100 && !ready?.ok; i++) {
        ready = await fetch(`${base}/readyz`).catch(() => null);
        if (!ready?.ok) await new Promise((r) => setTimeout(r, 100));
      }
      expect(ready?.status, stderr).toBe(200);
      const health = await (await fetch(`${base}/healthz`)).json();
      expect(routes.health.response.safeParse(health).success).toBe(true);
      expect(health).toMatchObject({ mode: "demo", role: "all", financialFeaturesEnabled: false });
      const boot = await fetch(`${base}/api/v1/world/bootstrap`);
      expect(boot.status).toBe(200);
      const launch = await fetch(`${base}/api/v1/launches/prepare`, { method: "POST" });
      expect(launch.status).toBe(401); // auth still enforced in the bundle
    } finally {
      child.kill("SIGTERM");
    }
    const code = await Promise.race([exited, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 10_000))]);
    expect(code, stderr).toBe(0);
  }, 60_000);
});
