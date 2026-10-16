import { useEffect, useMemo, useState } from "react";
import { HttpAdapter, type ApiAdapter, type Dashboard } from "./adapter";
import { routes, LaunchResponse, Community, type TokenLaunch } from "./shared";
import launchFixture from "../../../../packages/shared/fixtures/launch.json";
import communityFixture from "../../../../packages/shared/fixtures/communities.json";
export interface VerifiedToken { community: Community; launch: TokenLaunch }
export function isVerifiedPlatformToken(c: Community, launch: TokenLaunch, mode: Dashboard["mode"]) {
  return launch.status === "confirmed" && launch.mode === mode && launch.id === c.launchId &&
    launch.communityId === c.id && launch.mint === c.mint && launch.signature !== null &&
    launch.signature === c.launchSignature;
}
export function useTokens(api: ApiAdapter, data: Dashboard) {
  const [launches, setLaunches] = useState<TokenLaunch[]>([]), [loading, setLoading] = useState(true),
    [error, setError] = useState(""), [revision, setRevision] = useState(0);
  const key = JSON.stringify(data.communities.map((c) => [c.id, c.launchId, c.mint, c.launchSignature]));
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setLaunches([]);
    if (!(api instanceof HttpAdapter)) {
      setLaunches([LaunchResponse.parse(launchFixture).launch]); setLoading(false);
      return () => controller.abort();
    }
    void (async () => {
      const ids = (JSON.parse(key) as string[][]).map((c) => c[1]!);
      const found: TokenLaunch[] = [];
      let failures = 0;
      for (let i = 0; i < ids.length; i += 4) {
        const responses = await Promise.allSettled(ids.slice(i, i + 4).map((id) =>
          api.request(routes.launch.path.replace(":id", encodeURIComponent(id)), routes.launch.response,
            { signal: controller.signal })));
        for (const response of responses) {
          if (response.status === "fulfilled") found.push(response.value.launch);
          else failures++;
        }
      }
      if (!controller.signal.aborted) {
        setLaunches(found); setLoading(false);
        if (failures) setError(`${failures} launch records could not be verified. Those registrations are omitted.`);
      }
    })().catch(() => { if (!controller.signal.aborted) { setError("Launch verification is unavailable. No unverified tokens are shown."); setLoading(false); } });
    return () => controller.abort();
  }, [api, key, revision]);
  const communities = useMemo(() => api.kind === "demo"
    ? communityFixture.items.map((c) => Community.parse(c)) : data.communities,
  [api.kind, data.communities]);
  const tokens = useMemo(() => {
    const result = new Map<string, VerifiedToken>(), duplicate = new Set<string>();
    for (const c of communities) {
      const launch = launches.find((l) => l.id === c.launchId);
      if (!launch || !isVerifiedPlatformToken(c, launch, data.mode) || duplicate.has(c.mint)) continue;
      if (result.has(c.mint)) { result.delete(c.mint); duplicate.add(c.mint); }
      else result.set(c.mint, { community: c, launch });
    }
    return [...result.values()];
  }, [communities, launches, data.mode]);
  return { tokens, loading, error, retry: () => setRevision((n) => n + 1) };
}
