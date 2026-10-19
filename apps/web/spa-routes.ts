import type { IncomingMessage } from "node:http";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import { isClientPath } from "./src/navigation/routes";

/** Guard Vite's HTML fallback without interfering with its module/asset servers. */
export function clientRouteFallback(): Plugin {
  const install = (server: ViteDevServer | PreviewServer) => {
    const originalPaths = new WeakMap<IncomingMessage, string>();
    server.middlewares.use((request, response, next) => {
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      originalPaths.set(request, path);
      if (path === "/healthz") {
        response.setHeader("Content-Type", "text/plain"); response.end("ok"); return;
      }
      next();
    });
    // Vite invokes this after static serving and HTML fallback, before index HTML.
    return () => server.middlewares.use((request, response, next) => {
      const original = originalPaths.get(request) ?? "/";
      if (request.url === "/index.html" && original !== "/index.html" && !isClientPath(original)) {
        response.statusCode = 404; response.end("Not found"); return;
      }
      next();
    });
  };
  return { name: "known-client-route-fallback", configureServer: install, configurePreviewServer: install };
}
