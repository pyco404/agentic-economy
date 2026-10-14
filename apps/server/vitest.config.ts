import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../vitest.base.ts";

// Postgres-backed suites share one disposable database (TEST_DATABASE_URL), so files run sequentially.
export default mergeConfig(base, defineConfig({ test: { fileParallelism: false } }));
