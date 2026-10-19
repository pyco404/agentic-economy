export const pageIds = ["explore", "communities", "studio", "economy", "treasury", "launchpad", "about", "roadmap"] as const;
export type Page = "world" | typeof pageIds[number];
type LocationRoute = Pick<Location, "pathname" | "hash">;
const segments: Record<Page, string> = { world: "", explore: "explore", communities: "communities", studio: "agent-studio", economy: "economy", treasury: "treasury", launchpad: "launchpad", about: "about", roadmap: "roadmap" };

function parse(raw: string): { page: Page; mint: string | null } | null {
  const [segment = "", encodedMint, ...rest] = raw.replace(/^\/+|\/+$/g, "").split("/");
  const page = segment === "" || segment === "world" ? "world" : segment === "agent-studio" ? "studio" : pageIds.find(id => id === segment);
  if (!page || rest.length || (encodedMint && page !== "explore")) return null;
  let mint: string | null = null;
  if (page === "explore" && encodedMint) {
    try { mint = decodeURIComponent(encodedMint); } catch { mint = encodedMint; }
  }
  return { page, mint };
}
function legacyRoute(location: LocationRoute) {
  // Ordinary section anchors on clean pages must never become page navigation.
  return ["/", "/world", "/world/"].includes(location.pathname) && location.hash.length > 1
    ? parse(location.hash.slice(1)) : null;
}
export const isClientPath = (pathname: string) => parse(pathname) !== null;
export function readRoute(location: LocationRoute): { page: Page; mint: string | null } {
  return legacyRoute(location) ?? parse(location.pathname) ?? { page: "world", mint: null };
}
export function routePath(page: Page, mint: string | null = null) {
  return `/${segments[page]}${page === "explore" && mint ? `/${encodeURIComponent(mint)}` : ""}`;
}
export function routeUrl(page: Page, mint: string | null = null, search = window.location.search) {
  return routePath(page, mint) + search;
}
export function canonicalRouteUrl(location: LocationRoute & Pick<Location, "search">) {
  const legacy = legacyRoute(location), route = legacy ?? parse(location.pathname);
  return route ? routePath(route.page, route.mint) + location.search + (legacy ? "" : location.hash)
    : location.pathname + location.search + location.hash;
}
