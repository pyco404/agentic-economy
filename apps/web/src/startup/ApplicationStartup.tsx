import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { WorldLoading } from "../world/WorldLoading";
import type { WorldPhase } from "../world/worldReadiness";
import "./startup.css";

const StartupContext = createContext({
  assetsReady: false, skipWorld: false,
  worldPhase: (_phase: WorldPhase) => {},
  worldUnavailable: (_unavailable: boolean) => {},
});
export const useApplicationStartup = () => useContext(StartupContext);

/** A bounded fallback for an unavailable font/image, never a readiness delay. */
function settleAsset(work: Promise<unknown>, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const finish = () => { clearTimeout(deadline); signal.removeEventListener("abort", finish); resolve(); };
    const deadline = setTimeout(finish, 8000);
    signal.addEventListener("abort", finish, { once: true });
    void work.then(finish, finish);
    if (signal.aborted) finish();
  });
}

export function ApplicationStartup({ children }: { children: ReactNode }) {
  const [assetsReady, setAssetsReady] = useState(false);
  const [phase, setPhase] = useState<WorldPhase>("INITIALIZING");
  const [unavailable, setUnavailable] = useState(false);
  const [skipWorld, setSkipWorld] = useState(false);
  const [finished, setFinished] = useState(false);
  const [slow, setSlow] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const timings = useRef<Record<string, number>>({});
  const worldPhase = useCallback((next: WorldPhase) => setPhase(next), []);
  const worldUnavailable = useCallback((next: boolean) => setUnavailable(next), []);
  useEffect(() => {
    const controller = new AbortController();
    const brand = new Image(); brand.src = "/aeco-website-logo.png";
    // Styles and route components are static imports. These are the only extra
    // shell assets; market data, sessions and WebSockets are deliberately absent.
    const fonts = document.fonts
      ? Promise.all([document.fonts.load('400 16px "DM Sans"'), document.fonts.load('400 30px "Libre Caslon Display"')])
      : Promise.resolve();
    void Promise.all([settleAsset(fonts, controller.signal), settleAsset(brand.decode(), controller.signal)])
      .then(() => { if (!controller.signal.aborted) setAssetsReady(true); });
    return () => controller.abort();
  }, []);
  const failed = phase === "ERROR" || unavailable || skipWorld;
  const presented = phase === "INTERACTIVE" || phase === "FULLY_ACTIVE";
  const usable = finished || (assetsReady && (failed || phase === "FULLY_ACTIVE"));
  const welcome = !usable && !(assetsReady && presented);
  const state = usable ? failed ? "degraded" : "ready" : welcome ? "preparing" : "revealing";
  useEffect(() => { if (usable) setFinished(true); }, [usable]);
  useEffect(() => {
    const mark = (key: string) => { timings.current[key] ??= performance.now(); };
    mark("shellMounted");
    if (assetsReady) mark("assetsReady");
    if (presented) mark("worldPresented");
    if (usable) mark("applicationUsable");
    if (host.current) host.current.dataset.startupTimings = JSON.stringify(timings.current);
  }, [assetsReady, presented, usable]);
  useEffect(() => {
    if (usable) return;
    // A stalled graphics driver/worker must leave an explicit way into the app.
    // This is an escape hatch, not permission to show an incomplete world.
    const deadline = setTimeout(() => setSlow(true), 30000);
    return () => clearTimeout(deadline);
  }, [usable]);
  return <StartupContext.Provider value={{ assetsReady, skipWorld, worldPhase, worldUnavailable }}>
    <div ref={host} className="application-startup" data-testid="application-startup" data-startup-state={state} data-assets-ready={assetsReady}>
      <div className="application-shell" inert={!usable} aria-hidden={!usable}>
        {children}
      </div>
      <WorldLoading active={welcome} status={!assetsReady ? "Preparing the experience…" : phase === "STATIC_WORLD_READY" ? "Almost ready…" : "Building the world…"}
        onContinue={slow && welcome ? () => setSkipWorld(true) : undefined} />
      {!usable && !welcome && <span className="startup-announcement" role="status">Bringing the city to life…</span>}
    </div>
  </StartupContext.Provider>;
}
