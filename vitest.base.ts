import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Resolve workspace packages to their TypeScript sources so tests never depend on stale builds. */
export default defineConfig({
  resolve: {
    alias: {
      "@agentic-economy/shared": fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url)),
      "@agentic-economy/world-spec": fileURLToPath(new URL("./packages/world-spec/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
