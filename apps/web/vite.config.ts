import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { clientRouteFallback } from "./spa-routes";
export default defineConfig({
  appType: "spa",
  plugins: [react(), clientRouteFallback()],
  test: { include: ["src/**/*.test.ts"] },
  server: { port: 5173, strictPort: true },
});
