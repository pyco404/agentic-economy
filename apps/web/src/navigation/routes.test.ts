import { describe, expect, it } from "vitest";
import { pageIds, readRoute } from "./routes";
describe("Root world and secondary routes", () => {
  it("defaults to World internally and recognizes secondary links for canonicalization", () => {
    for (const [pathname, hash] of [["/", ""], ["/world", ""], ["/", "#world"], ["/", "#/world"]])
      expect(readRoute({ pathname: pathname!, hash: hash! })).toEqual({ page: "world", mint: null });
    expect(pageIds).not.toContain("world");
    for (const page of pageIds) for (const location of [{ pathname: `/${page}`, hash: "" },
      { pathname: "/", hash: `#/${page}` }, { pathname: "/world", hash: `#${page}` }])
      expect(readRoute(location).page).toBe(page);
  });
  it("reads token details identically through old hashes, slash hashes and direct paths", () => {
    for (const location of [{ pathname: "/", hash: "#explore/mint123" }, { pathname: "/", hash: "#/explore/mint123" },
      { pathname: "/explore/mint123", hash: "" }]) expect(readRoute(location)).toEqual({ page: "explore", mint: "mint123" });
  });
  it("tolerates unknown routes and malformed escaping", () => {
    expect(readRoute({ pathname: "/unknown", hash: "" }).page).toBe("world");
    expect(readRoute({ pathname: "/", hash: "#/explore/%broken" }).mint).toBe("%broken");
  });
});
