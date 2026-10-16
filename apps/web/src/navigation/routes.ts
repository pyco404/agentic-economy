export const pageIds = ["explore", "communities", "studio", "economy", "treasury", "launchpad", "about"] as const;
export type Page = "world" | typeof pageIds[number];
export function readRoute(location: Pick<Location, "pathname" | "hash">): { page: Page; mint: string | null } {
  const raw = location.hash && location.hash !== "#" ? location.hash.slice(1) : location.pathname;
  const [segment, encodedMint] = raw.replace(/^\/+|\/+$/g, "").split("/");
  const page = pageIds.some((id) => id === segment) ? segment as Page : "world";
  let mint: string | null = null;
  if (page === "explore" && encodedMint) {
    try { mint = decodeURIComponent(encodedMint); } catch { mint = encodedMint; }
  }
  return { page, mint };
}
export function routeUrl(page: Page, mint: string | null = null) {
  const url = new URL(window.location.href);
  url.pathname = "/";
  url.hash = page === "world" ? "" : page === "explore" && mint ? `explore/${encodeURIComponent(mint)}` : page;
  return url.pathname + url.search + url.hash;
}
