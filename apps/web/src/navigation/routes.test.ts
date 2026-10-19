import { describe, expect, it } from "vitest";
import { canonicalRouteUrl, isClientPath, pageIds, readRoute, routePath, routeUrl } from "./routes";

describe("Clean paths and legacy route normalization", () => {
  it("uses public paths while retaining the internal studio identity", () => {
    expect(routePath("world")).toBe("/");
    expect(routePath("studio")).toBe("/agent-studio");
    for (const page of pageIds) {
      expect(readRoute({ pathname: routePath(page), hash: "" })).toEqual({ page, mint: null });
      expect(routeUrl(page, null, "?source=backend&view=latest")).toBe(routePath(page) + "?source=backend&view=latest");
    }
  });
  it("normalizes every old root hash without losing query parameters", () => {
    for (const page of [...pageIds, "world"] as const) for (const prefix of ["#", "#/"]) {
      const location = { pathname: "/", search: "?source=backend", hash: prefix + page };
      expect(readRoute(location).page).toBe(page);
      expect(canonicalRouteUrl(location)).toBe(routePath(page) + location.search);
    }
    expect(canonicalRouteUrl({ pathname: "/world", search: "", hash: "#roadmap" })).toBe("/roadmap");
    expect(canonicalRouteUrl({ pathname: "/studio/", search: "?tab=agents", hash: "" })).toBe("/agent-studio?tab=agents");
  });
  it("preserves token deep links, encoded mints and malformed input safely", () => {
    for (const location of [{ pathname: "/", hash: "#explore/mint123" }, { pathname: "/", hash: "#/explore/mint123" },
      { pathname: "/explore/mint123", hash: "" }]) expect(readRoute(location)).toEqual({ page: "explore", mint: "mint123" });
    expect(readRoute({ pathname: "/explore/a%2Fb", hash: "" }).mint).toBe("a/b");
    expect(routePath("explore", "a/b")).toBe("/explore/a%2Fb");
    expect(readRoute({ pathname: "/", hash: "#/explore/%broken" }).mint).toBe("%broken");
  });
  it("retains meaningful section anchors instead of interpreting them as routes", () => {
    for (const hash of ["#about-faq", "#roadmap"]) {
      const location = { pathname: "/about", search: "?view=details", hash };
      expect(readRoute(location).page).toBe("about");
      expect(canonicalRouteUrl(location)).toBe("/about?view=details" + hash);
    }
    expect(canonicalRouteUrl({ pathname: "/", search: "", hash: "#main" })).toBe("/#main");
    expect(canonicalRouteUrl({ pathname: "/unknown", search: "?x=1", hash: "#section" })).toBe("/unknown?x=1#section");
    for (const path of ["/api", "/api/v1/world", "/assets/missing.js", "/fonts/missing.woff2", "/healthz", "/about/extra"])
      expect(isClientPath(path)).toBe(false);
    expect(readRoute({ pathname: "/api/v1/world", hash: "" }).page).toBe("world");
    expect(readRoute({ pathname: "/about/extra", hash: "" }).page).toBe("world");
  });
});
