import { CityActivityInfo } from "./components/CityActivityInfo";
import { activityCategory, cityPopulation } from "./api/activityPresentation";
import { activityFocus, interestingActivity, isSocialActivity } from "./api/socialActivity";
import { OfficialTokenAddress } from "./components/OfficialTokenAddress";
import { ProjectLinks } from "./components/ProjectLinks";
import { WalletButton } from "./components/WalletButton";
import { useApplicationStartup } from "./startup/ApplicationStartup";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Info,
  ArrowDownLeft,
  ArrowRight,
  Blocks,
  Building2,
  ChartNoAxesCombined,
  ChevronDown,
  Layers,
  Leaf,
  LocateFixed,
  Menu,
  Maximize2,
  Minimize2,
  Minus,
  Move,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Rocket,
  Route,
  RotateCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wind,
  TrainFront,
  X,
} from "lucide-react";
import { createAdapter, numericSeed } from "./api/adapter";
import { displayActivity, type IdentityAgent } from "./api/agentIdentity";
import { useWorld } from "./api/useWorld";
import { canonicalRouteUrl, readRoute, routePath, routeUrl, type Page } from "./navigation/routes";
import { hasMemoryOnlyDrafts, useDraftUnloadGuard } from "./navigation/drafts";
import { City, type CityHandle } from "./world/City";
import { generateWorld, WORLD_SEED, type BuildingVisual } from "./world/layout";
import {
  AgentPanel,
  Economy,
  Launchpad,
  Studio,
  Treasury,
  readable,
} from "./components/Pages";
import "./styles.css";
import "./world.css";
import "./discovery.css";
import "./global-world.css";
import { OverlayClose } from "./components/OverlayClose";
import { Communities } from "./components/Communities";
import { Explore } from "./components/Explore";
import { About } from "./components/About";
import { Roadmap } from "./components/Roadmap";
import "./about.css";
import { MobileNavigation } from "./components/MobileNavigation";
import "./mobile-navigation.css";
const pages = [
  { id: "launchpad", label: "Launch", icon: Rocket },
  { id: "explore", label: "Explore", icon: Search },
  { id: "communities", label: "Communities", icon: Users },
  { id: "studio", label: "Agent Studio", icon: Blocks },
  { id: "economy", label: "Economy", icon: ChartNoAxesCombined },
  { id: "treasury", label: "Treasury", icon: ShieldCheck },
  { id: "roadmap", label: "Roadmap", icon: Route },
] as const;
export default function App() {
  useDraftUnloadGuard();
  const { assetsReady, skipWorld, worldPhase, worldUnavailable } = useApplicationStartup();
  const api = useMemo(createAdapter, []),
    [page, setPage] = useState<Page>(() => readRoute(window.location).page),
    [tokenMint, setTokenMint] = useState<string | null>(() => readRoute(window.location).mint),
    [pageOpen, setPageOpen] = useState(true),
    [menu, setMenu] = useState(false),
    [touchPan, setTouchPan] = useState(false),
    [worldToolsExpanded, setWorldToolsExpanded] = useState(false),
    [paused, setPaused] = useState(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [overlay, setOverlay] = useState(false),
    [explorer, setExplorer] = useState(false),
    [immersive, setImmersive] = useState(false),
    [ambientEnabled, setAmbientEnabled] = useState(true),
    [worldReady, setWorldReady] = useState(false),
    [mobileWorld, setMobileWorld] = useState(() => window.matchMedia("(max-width: 700px)").matches),
    [activityCollapsed, setActivityCollapsed] = useState(() => window.matchMedia("(max-width: 700px)").matches),
    [regionMarkers, setRegionMarkers] = useState<
      { id: string; name: string; x: number; y: number }[]
    >([]),
    [buildingFilter, setBuildingFilter] = useState("all"),
    [activityFilter, setActivityFilter] = useState("all"),
    [district, setDistrict] = useState(""),
    [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(
      null,
    ),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<BuildingVisual | null>(null),
    [agentId, setAgentId] = useState<string | null>(null),
    [communityId, setCommunityId] = useState<string | null>(null),
    [followingAgentId, setFollowingAgentId] = useState<string | null>(null),
    [workplaceHighlights, setWorkplaceHighlights] = useState<string[]>([]),
    [growth, setGrowth] = useState(0),
    [metrics, setMetrics] = useState({
      chunks: 0,
      buildings: 0,
      drawCalls: 0,
      fps: 0,
    });
  const city = useRef<CityHandle>(null);
  const closeMenu = useCallback(() => setMenu(false), []);
  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 700px)");
    const resize = () => setMobileWorld(viewport.matches);
    viewport.addEventListener("change", resize);
    return () => viewport.removeEventListener("change", resize);
  }, []);
  const worldVisible = page === "world" || !pageOpen;
  const closePage = () => {
    setPageOpen(false); setMenu(false); setAgentId(null); setSelected(null); setHover(null); setImmersive(false);
  };
  const {
    data,
    world,
    worldLoading,
    worldError,
    error,
    loading,
    status: streamStatus,
    notice,
    diagnostics,
    subscribe,
    refresh,
  } = useWorld(api, paused);
  const go = (p: Page) => {
    const draftPrefix = page === "launchpad" ? "launchpad:" : page === "studio" ? "studio:" : null;
    if (p !== page && draftPrefix && hasMemoryOnlyDrafts(draftPrefix) &&
      !window.confirm("Browser storage is unavailable. Your draft stays in this running app, but refreshing or closing the tab may lose it. Leave this page?")) return false;
    const nextUrl = routeUrl(p);
    if (window.location.pathname + window.location.search + window.location.hash !== nextUrl) window.history.pushState(null, "", nextUrl);
    setWorldToolsExpanded(false);
    setPage(p);
    setPageOpen(true);
    setMenu(false);
    setAgentId(null);
    setSelected(null);
    setHover(null);
    setImmersive(false);
    setTokenMint(null);
    return true;
  };
  const openToken = (mint: string) => {
    window.history.pushState(null, "", routeUrl("explore", mint));
    setPage("explore"); setPageOpen(true); setTokenMint(mint); setMenu(false); setAgentId(null);
  };
  useEffect(() => {
    const sync = () => {
      const route = readRoute(window.location);
      const canonical = canonicalRouteUrl(window.location);
      if (canonical !== window.location.pathname + window.location.search + window.location.hash)
        window.history.replaceState(null, "", canonical);
      setPage(route.page); setPageOpen(true); setTokenMint(route.mint);
      setSelected(null); setHover(null); setAgentId(null); setMenu(false); setImmersive(false);
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); };
  }, []);
  useEffect(() => {
    const canonical = new URL(routePath(page, tokenMint), "https://useaeco.xyz").href;
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute("href", canonical);
    document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.setAttribute("content", canonical);
  }, [page, tokenMint]);
  useEffect(() => {
    document.getElementById("main")?.scrollTo(0, 0);
    // The destination receives focus without moving the camera or scrolling the page.
    const frame = requestAnimationFrame(() => {
      if (worldVisible) document.querySelector<HTMLCanvasElement>(".global-world-layer canvas")?.focus({ preventScroll: true });
      else {
        (document.querySelector<HTMLButtonElement>(".community-dialog .page-close") ?? document.querySelector<HTMLButtonElement>(".page-close"))?.focus({ preventScroll: true });
        if (window.location.hash) {
          try { document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView({ block: "start" }); } catch { /* Ignore malformed section anchors. */ }
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [page, tokenMint, loading, worldVisible]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAgentId(null);
        setSelected(null);
        setMenu(false);
        setImmersive(false);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  const visualBootstrap=data?.bootstrap??world?.bootstrap;
  useEffect(() => worldUnavailable(!visualBootstrap && (api.kind === "http" ? !worldLoading && !!worldError : !loading && !!error)), [api.kind, loading, worldLoading, visualBootstrap, error, worldError, worldUnavailable]);
  const population = (data?.stats.activeAgents ?? (world?0:156)) + growth,
    seed = visualBootstrap ? numericSeed(visualBootstrap.seed) : WORLD_SEED;
  const chunks = useMemo(
    () => data?.chunks ?? world?.chunks ?? generateWorld(seed, population),
    [data?.chunks, world?.chunks, seed, population],
  );
  const buildings = useMemo(() => chunks.flatMap((c) => c.buildings), [chunks]);
  const focus = (b: BuildingVisual) => {
    setSelected(b);
    setAgentId(null);
    city.current?.focus(b.x, b.z);
  };
  const exploreCommunity = (id: string) => {
    const c = data?.communities.find(c => c.id === id);
    const hq=c?.headquartersBuildingId??data?.stats.simulation?.groups.find(g=>g.id===id)?.headquartersBuildingId;
    const b = hq ? buildings.find(b => b.id === hq) : undefined;
    if (b && go("world")) focus(b);
  };
  const openCommunity = (id: string) => { if (go("communities")) setCommunityId(id); };

  const regionUpdate = useCallback(
    (markers: typeof regionMarkers) => setRegionMarkers(markers),
    [],
  );
  const onMetrics = useCallback((m: typeof metrics) => setMetrics(m), []);
  const hoveredNow = hover ? buildings.find((b) => b.id === hover.id) : null;
  const hovered = useCallback(
    (building: BuildingVisual | null, x: number, y: number) =>
      setHover(building ? { id: building.id, x, y } : null),
    [],
  );
  const selectedNow = selected
    ? (buildings.find((b) => b.id === selected.id) ?? selected)
    : null;
  const inspectedAgent = agentId ? data?.agents.find((a) => a.id === agentId) : null;
  const viewWorkplace = (id:string) => {
    const building = buildings.find(b=>b.id===id);
    if (!building || !go("world")) return;
    setAgentId(null); setSelected(building); city.current?.follow(null);
    city.current?.focus(building.x,building.z,6);
  };
  const watchAgent = (id:string) => {
    if (!go("world")) return;
    setAgentId(id); setSelected(null);
  };
  const isDemo = (data?.mode ?? world?.bootstrap.mode) === "demo" || api.kind === "demo";
  return (
    <div
      className="app"
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
        if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
        const url = new URL(anchor.href);
        if (url.origin !== window.location.origin || url.hash) return;
        const route = readRoute(url);
        if (routePath(route.page, route.mint) !== url.pathname || url.search !== window.location.search) return;
        event.preventDefault();
        if (route.page === "explore" && route.mint) openToken(route.mint);
        else go(route.page);
      }}
      data-route={worldVisible ? "world" : page}
      data-world-ready={(!data && !world) || worldReady}
      data-page={page}
      data-page-open={!worldVisible}
      data-source={api.kind === "demo" ? "fixtures" : "backend"}
      data-world-tick={data?.streamTick ?? data?.stats.tick ?? 0}
      data-stream-seq={diagnostics.sequence}
      data-replayed={diagnostics.replayed}
      data-agent-position={
        data?.agents[0]
          ? `${data.agents[0].id}:${data.agents[0].pos.x}:${data.agents[0].pos.y}`
          : ""
      }
      data-production={Object.values(data?.stats.goodsProduced ?? {}).reduce(
        (sum, count) => sum + (count ?? 0),
        0,
      )}
    >
      <a
        href="#main"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="topbar">
        <a href={routeUrl("world")} className="brand" aria-label="Agentic Economy home" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); go("world"); }}>
          <span className="brand-mark">
            <img src="/aeco-website-logo.png" alt="" width={32} height={32} />
          </span>
          <span>
            Agentic <b>Economy</b>
            <small>A WORLD THAT WORKS</small>
          </span>
        </a>
        <nav className="nav" aria-label="Main navigation">
          {pages.map((p) => (
            <a
              key={p.id}
              className={!worldVisible && page === p.id ? "active" : ""}
              href={routeUrl(p.id)}
              onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); go(p.id); }}
              aria-current={!worldVisible && page === p.id ? "page" : undefined}
            >
              {p.label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <ProjectLinks compact />
          <a href={routeUrl("about")} className={`about-nav-link${!worldVisible && page === "about" ? " is-current" : ""}`}
            aria-label="About Agentic Economy" title="About Agentic Economy" aria-current={!worldVisible && page === "about" ? "page" : undefined}
            onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); go("about"); }}>
            <Info size={18} aria-hidden="true" /><span>About</span></a>
          {import.meta.env.DEV && <span className="demo-badge">
            <i />
            {isDemo ? "Demo Mode" : `${data?.mode ?? "API"} · ${streamStatus}`}
          </span>}
          <WalletButton />
          <button
            className="menu-button"
            aria-label="Toggle navigation"
            aria-expanded={menu}
            aria-haspopup="dialog"
            aria-controls="mobile-navigation"
            onClick={() => setMenu((open) => !open)}
          >
            <Menu size={22} />
          </button>
        </div>
      </header>
      {menu && <MobileNavigation items={pages} active={worldVisible ? "world" : page} onNavigate={go} onClose={closeMenu} />}
      {visualBootstrap && !skipWorld && <div className="global-world-layer" data-testid="global-world" data-interactive={worldVisible}
        inert={!worldVisible} aria-hidden={!worldVisible}>
                  <City
                    ref={city}
                    onReadyChange={setWorldReady}
                    onPhaseChange={worldPhase}
                    presentationReady={assetsReady}
                    touchPan={touchPan}
                    seed={seed}
                    population={population}
                    chunks={chunks}
                    agents={(data?.agents ?? []).map((a) => ({
                      id: a.id,
                      name: a.name,
                      ownerWallet: a.ownerWallet ?? undefined,
                      identity: (a as IdentityAgent).identity,
                      displayName: (a as IdentityAgent).displayName,
                      demoName: api.kind === "demo",
                      x: a.pos.x,
                      z: a.pos.y,
                      paused: a.status === "paused",
                      state: a.state,
                      work: a.work,
                      social: a.social,
                    }))}
                    demo={api.kind === "demo"}
                    selectedAgentId={agentId}
                    highlightBuildingIds={workplaceHighlights}
                    onFollowChange={setFollowingAgentId}
                    ambientEnabled={ambientEnabled}
                    importantAgentIds={data?.actions?.slice(0, 3).map((action) => action.agentId)}
                    paused={paused || (!worldVisible && page === "treasury")}
                    interactive={worldVisible}
                    background={!worldVisible}
                    visualStill={!worldVisible && page === "treasury"}
                    overlay={overlay}
                    onSelect={(b) => {
                      setSelected(b);
                      setAgentId(null);
                    }}
                    onAgentSelect={(id) => {
                      setAgentId(id);
                      setSelected(null);
                    }}
                    onMetrics={onMetrics}
                    onViewChange={subscribe}
                    regions={visualBootstrap.regions}
                    onRegionMarkers={regionUpdate}
                    chunkCatalog={
                      api.kind === "http" ? visualBootstrap.chunks : undefined
                    }
                    onHover={hovered}
                    tickMs={visualBootstrap.sim.tickMs}
                    activity={data?.cityActivity}
                    agentTicks={data?.agentTicks}
                    inspection={!worldVisible ? null : selectedNow ? { id: selectedNow.id, x: selectedNow.x, z: selectedNow.z }
                      : inspectedAgent ? { id: inspectedAgent.id, x: inspectedAgent.pos.x,
                          z: inspectedAgent.pos.y } : null}
                  />
      </div>}
      <div className="world-atmosphere" aria-hidden="true" />
      {skipWorld && worldVisible && <div className="world-preparation-warning" role="status">The 3D world was skipped. You can still use the pages. Reload to retry the world.</div>}
      {worldVisible && page !== "world" && <button className="page-reopen" type="button" aria-label="Show page"
        onClick={() => { setPageOpen(true); setAgentId(null); setSelected(null); setImmersive(false); }}>
        <Layers size={16} /><span>Show page<small>{page === "about" ? "About" : pages.find((p) => p.id === page)?.label}</small></span>
      </button>}
      <main
        id="main"
        tabIndex={-1}
        className={worldVisible ? `world-main${immersive ? " is-immersive" : ""}` : "page-main"}
      >
        {(page === "about" || page === "roadmap") && <div hidden={worldVisible} className="page-content about-shell">
          <div className="page-overlay-controls"><OverlayClose onClose={closePage} /></div>
          {page === "roadmap" ? <Roadmap /> : <About onNavigate={go} source={api.kind} mode={data?.mode} connected={!!data && !error && streamStatus === "connected"} />}
          {data && <CityActivityInfo stats={data.stats} />}
          <footer className="page-footer"><span>Agentic Economy · A World That Works</span><ProjectLinks /><OfficialTokenAddress /></footer>
        </div>}
        {((page !== "about" && page !== "roadmap") || worldVisible) && (worldVisible && world && !data ? (
          <div className="world-summary-pending" role="status">
            <h1>A city in motion.</h1>
            <p>{error ? "The city is ready. Dashboard information is temporarily unavailable." : "The city is ready. Loading dashboard information…"}</p>
            {error && <button onClick={refresh}>Retry dashboard</button>}
          </div>
        ) : loading ? (
          <div className="loading" role="status">
            {!worldVisible && <OverlayClose className="page-loading-close" onClose={closePage} />}
            <span className="loading-dot" />
            <h2>Growing Genesis…</h2>
            <p>Loading the shared city</p>
          </div>
        ) : error && !data ? (
          <div className="load-error" role="alert">
            {!worldVisible && <OverlayClose className="page-loading-close" onClose={closePage} />}
            <h1>Couldn’t load the city</h1>
            <p>{import.meta.env.DEV ? error : "Please check your connection and try again."}</p>
            <button
              className="primary"
              onClick={() => {
                refresh();
              }}
            >
              Try again
            </button>
            {import.meta.env.DEV && <><p className="small muted">
              The selected data source is {api.kind}. Backend failures never
              silently switch to demo.
            </p>
            <button
              className="secondary"
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set("source", "fixtures");
                window.location.href = url.href;
              }}
            >
              Use offline fixtures (explicit fallback)
            </button></>}
          </div>
        ) : (
          data && (
            <>
              {(error || notice) && (
                <div className="connection-notice" role="status">
                  {error || notice} · Showing last received state.
                </div>
              )}
              {worldVisible && (
                <>
                  {mobileWorld && !immersive ? (
                    <button className="world-view-toggle mobile-activity-toggle" aria-expanded={!activityCollapsed}
                      aria-controls="world-activity-panel" aria-label={activityCollapsed ? "Expand city activity" : "Collapse city activity"}
                      title={activityCollapsed ? "Show City Activity" : "Hide City Activity"}
                      onClick={() => setActivityCollapsed((collapsed) => !collapsed)}>
                      {activityCollapsed ? <Maximize2 size={17} /> : <Minimize2 size={17} />}
                    </button>
                  ) : (
                    <button className="world-view-toggle" aria-pressed={immersive}
                      onClick={() => setImmersive(!immersive)}
                      aria-label={immersive ? "Exit immersive mode" : "Enter immersive mode"}>
                      {immersive ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                      <span>{immersive ? "Exit immersive" : "Immerse"}</span>
                    </button>
                  )}
                  <div className="world-header">
                    <div>
                      <div className="eyebrow">
                        <span className="live-dot" />
                        GENESIS DISTRICT{" "}
                        <span className="coordinates">01 / SHARED WORLD</span>
                      </div>
                      <h1>A city in motion.</h1>
                      <p>
                        A World That Works. Token creation and discovery meet a persistent living economy on Solana.
                      </p>
                      <OfficialTokenAddress prominent />
                    </div>
                    <div className="district-badge">
                      <Leaf size={17} />
                      <select
                        aria-label="Focus district"
                        value={district}
                        onChange={(e) => {
                          setDistrict(e.target.value);
                          const region = data.bootstrap.regions.find(
                            (r) => r.id === e.target.value,
                          );
                          if (region) {
                            const bounds = region.bounds;
                            city.current?.focus(
                              (bounds.minX + bounds.maxX) / 2,
                              (bounds.minY + bounds.maxY) / 2,
                              Math.min(
                                3.5,
                                Math.max(
                                  1,
                                  110 /
                                    Math.max(
                                      bounds.maxX - bounds.minX,
                                      bounds.maxY - bounds.minY,
                                    ),
                                ),
                              ),
                            );
                          } else city.current?.reset();
                        }}
                      >
                        <option value="">Genesis · overview</option>
                        {data.bootstrap.regions.map((region) => (
                          <option key={region.id} value={region.id}>
                            {region.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} />
                    </div>
                  </div>
                  {api.kind === "http" ? (
                    regionMarkers.map((marker) => (
                      <div
                        key={marker.id}
                        className="district-label"
                        style={{
                          left: marker.x,
                          top: marker.y,
                          transform: "translate(-50%,-50%)",
                        }}
                      >
                        <span />
                        {marker.name}
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="district-label north">
                        <span />
                        THE COMMONS
                      </div>
                      <div className="district-label south">
                        <span />
                        MAKERS’ QUARTER
                      </div>
                    </>
                  )}
                  <div className="water-label">GENESIS BAY</div>
                  <aside id="world-activity-panel" className={`activity-panel${activityCollapsed ? " is-collapsed" : ""}`}
                    aria-label="City activity panel" tabIndex={0} hidden={mobileWorld && activityCollapsed}>
                    <div className="surface-title">
                      <h2>{explorer ? "Building explorer" : "City activity"}</h2>
                      <div className="activity-heading-actions">
                        {!mobileWorld && <button className="activity-toggle" aria-expanded={!activityCollapsed}
                          aria-controls="world-activity-content"
                          aria-label={activityCollapsed ? "Expand city activity" : "Collapse city activity"}
                          onClick={() => setActivityCollapsed(!activityCollapsed)}>
                          <ChevronDown size={15} />
                        </button>}
                      <button
                        className="text-button"
                        aria-label={
                          explorer ? "Show activity" : "Explore buildings"
                        }
                        onClick={() => { setExplorer(!explorer); setActivityCollapsed(false); }}
                      >
                        {explorer ? (
                          <Activity size={17} />
                        ) : (
                          <Search size={17} />
                        )}
                      </button>
                      </div>
                    </div>
                    <div id="world-activity-content" hidden={activityCollapsed}>
                    {explorer ? (
                      <>
                        <CityActivityInfo stats={data.stats} />
                        <div className="activity-filters">
                          <label className="search small-search">
                            <Search size={15} />
                            <input
                              aria-label="Search buildings"
                              placeholder="Find a building…"
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                            />
                          </label>
                          <select
                            className="world-filter"
                            aria-label="Filter building type"
                            value={buildingFilter}
                            onChange={(e) => setBuildingFilter(e.target.value)}
                          >
                            <option value="all">All buildings and plots</option>
                            <option value="economic">Economic buildings</option>
                            <option value="farm">Farms</option>
                            <option value="mill">Mills</option>
                            <option value="bakery">Bakeries</option>
                            <option value="warehouse">Warehouses</option>
                            <option value="factory">Factories</option>
                            <option value="market">Markets</option>
                            <option value="headquarters">Headquarters</option>
                          </select>
                        </div>
                        <div className="building-list">
                          {buildings
                            .filter((b) =>
                              buildingFilter === "all" ||
                              buildingFilter === "economic"
                                ? buildingFilter === "all" ||
                                  !["house", "town-hall"].includes(b.kind)
                                : b.kind === buildingFilter,
                            )
                            .filter((b) =>
                              `${b.name} ${b.sourceKind ?? b.kind}`
                                .toLowerCase()
                                .includes(query.toLowerCase()),
                            )
                            .slice(0, 60)
                            .map((b) => (
                              <button key={b.id} onClick={() => focus(b)}>
                                <Building2 size={15} />
                                <span>
                                  {b.name}
                                  <small>Chunk {b.chunkId}</small>
                                </span>
                                <ArrowDownLeft size={13} />
                              </button>
                            ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <CityActivityInfo stats={data.stats} />
                        <div className="activity-filters">
                          <div className="feed-label">
                            <i />
                            {api.kind === "demo"
                              ? "Offline fixture activity"
                              : "City activity"}
                          </div>
                          <select
                            className="world-filter"
                            aria-label="Filter city activity"
                            value={activityFilter}
                            onChange={(e) => setActivityFilter(e.target.value)}
                          >
                            <option value="all">City highlights</option>
                            <option value="social">Social life</option>
                            <option value="production.completed">
                              Production
                            </option>
                            <option value="task.verified">
                              City activities
                            </option>
                            <option value="building.placed">
                              Construction / headquarters
                            </option>
                            <option value="maintenance.completed">
                              Infrastructure maintenance
                            </option>
                          </select>
                        </div>
                        <div className="feed">
                          {data.activities
                            .filter(
                              (a) =>
                                activityFilter === "all" ? interestingActivity(a) : activityFilter === "social" ? isSocialActivity(a) : a.type === activityFilter,
                            )
                            .map((a) => (
                              <div className="feed-item" key={a.id} data-event-id={a.id}>
                                <button type="button" className="activity-focus" disabled={!activityFocus(a, data.agents, buildings)} onClick={() => {
                                  const focus = activityFocus(a, data.agents, buildings);
                                  if (!focus) return;
                                  setSelected(null); setAgentId(focus.agentId); city.current?.focus(focus.x, focus.z, 3.6);
                                }}>
                                  <span className="feed-icon" data-kind={a.type}>{a.type === "task.verified" ? <CheckMark /> : <Activity size={14} />}</span>
                                  <span className="activity-copy">{displayActivity(a, data.agents)}
                                    <span className="activity-category" title={activityCategory(a, data.communities, data.mode).detail}>{activityCategory(a, data.communities, data.mode).label}{activityFocus(a, data.agents, buildings) ? " · View in city ↗" : ""}</span>
                                  </span>
                                </button>
                              </div>
                            ))}
                        </div>
                        {!data.activities.length && (
                          <p className="muted small">No activity yet.</p>
                        )}
                        <button
                          className="feed-link"
                          onClick={() => go("economy")}
                        >
                          View the economy <ArrowRight size={14} />
                        </button>
                      </>
                    )}
                    </div>
                  </aside>
                  <div className="camera-tools" role="group" aria-label="Camera controls" onKeyDown={(event) => { if (event.key === "Escape" && worldToolsExpanded) { setWorldToolsExpanded(false); event.currentTarget.querySelector<HTMLButtonElement>(".world-tools-toggle")?.focus(); } }}>
                    <button
                      aria-label="Zoom in"
                      onClick={() => city.current?.zoom(1.2)}
                    >
                      <Plus size={19} />
                    </button>
                    <button
                      aria-label="Zoom out"
                      onClick={() => city.current?.zoom(1 / 1.2)}
                    >
                      <Minus size={19} />
                    </button>
                    <div id="world-secondary-controls" className={`camera-tools-secondary${worldToolsExpanded ? " is-expanded" : ""}`}>
                    <button className="touch-pan-control" aria-label="Pan with one finger"
                      aria-pressed={touchPan} title={touchPan ? "Pan mode on · tap to restore one-finger rotation" : "Pan with one finger · tap to enable"}
                      onClick={() => setTouchPan((enabled) => !enabled)}>
                      <Move size={18} /><span>{touchPan ? "Orbit" : "Pan"}</span>
                    </button>
                    <span className="camera-tools-divider" aria-hidden="true" />
                    <button
                      aria-label="Rotate camera"
                      onClick={() => city.current?.rotate()}
                    >
                      <RotateCw size={17} />
                    </button>
                    <button
                      aria-label="Reset camera"
                      onClick={() => city.current?.reset()}
                    >
                      <LocateFixed size={18} />
                    </button>
                    <span className="camera-tools-divider" aria-hidden="true" />
                    <button
                      aria-label="Toggle economy overlay"
                      aria-pressed={overlay}
                      className={overlay ? "pressed" : ""}
                      onClick={() => setOverlay(!overlay)}
                    >
                      <Layers size={18} />
                    </button>
                    <button aria-label="Toggle ambient scenery" aria-pressed={ambientEnabled}
                      title="Decorative transport and aircraft; not economic agents"
                      onClick={() => setAmbientEnabled(!ambientEnabled)}>
                      <Wind size={18} />
                    </button>
                    <button aria-label="View railway" title="View railway and tunnel entrances" onClick={() => city.current?.railway()}>
                      <TrainFront size={18} />
                    </button>
                    {mobileWorld && !immersive && <button aria-label="Enter immersive mode"
                      title="Hide world interface" onClick={() => setImmersive(true)}><Maximize2 size={17} /></button>}
                    </div>
                    <button type="button" className="world-tools-toggle" aria-label={worldToolsExpanded ? "Collapse controls" : "Expand controls"}
                      aria-expanded={worldToolsExpanded} aria-controls="world-secondary-controls"
                      onClick={() => setWorldToolsExpanded((open) => !open)}>
                      {worldToolsExpanded ? <ChevronDown size={19} /> : <SlidersHorizontal size={19} />}
                    </button>
                  </div>
                  <div className="world-bottom">
                    <div className="world-stat">
                      <Users size={18} />
                      <span>
                        <b>{cityPopulation(data.stats).commonAgents?.toLocaleString() ?? "—"}</b>
                        <small>Common agents</small>
                      </span>
                    </div>
                    <div className="world-stat">
                      <Building2 size={18} />
                      <span>
                        <b>
                          {api.kind === "demo"
                            ? buildings.length
                            : data.stats.buildings}
                        </b>
                        <small>
                          Buildings
                        </small>
                      </span>
                    </div>
                    <div className="world-stat">
                      <Blocks size={18} />
                      <span>
                        <b>{data.stats.communities}</b>
                        <small>Communities</small>
                      </span>
                    </div>
                    <div className="world-stat">
                      <ShieldCheck size={18} />
                      <span>
                        <b title="Completed virtual work tasks; excludes social stories and on-chain transactions.">{data.stats.verifiedTasks.toLocaleString()}</b>
                        <small>
                          City activities
                        </small>
                      </span>
                    </div>
                    <button
                      className="pause-button"
                      aria-label={
                        paused
                          ? "Resume city animation"
                          : "Pause city animation"
                      }
                      onClick={() => setPaused(!paused)}
                    >
                      {paused ? <Play size={16} /> : <Pause size={16} />}
                      <span>{paused ? "Paused" : "City in motion"}</span>
                    </button>
                  </div>
                  <div className="world-footer">
                    {import.meta.env.DEV && <span role="status" data-testid="connection-status">
                      {api.kind === "demo"
                        ? "Offline fixtures"
                        : `Backend demo · ${streamStatus} · Tick ${data.streamTick ?? data.stats.tick}`}
                    </span>}
                    <span className="camera-hint">
                      <MousePointer2 size={12} /> Drag to orbit · Right drag to pan · Scroll to zoom
                    </span>
                    {import.meta.env.DEV && <span>{metrics.chunks} visible chunks · {metrics.fps} FPS · {metrics.drawCalls} draw calls</span>}
                    {api.kind === "demo" && (
                      <button
                        onClick={() => setGrowth((n) => Math.min(540, n + 180))}
                        disabled={growth >= 540}
                      >
                        <Plus size={12} /> Preview population growth
                      </button>
                    )}
                  </div>
                  {overlay && (
                    <div className="overlay-key">
                      <b>Economy layer</b>
                      <span>
                        <i />
                        Delivering agents · amber
                      </span>
                      {api.kind === "http" && (
                        <span>Recorded routes · sage</span>
                      )}
                      <span>Gold ring · production</span>
                      <span>Green ring · useful service</span>
                      <span>Blue ring · maintenance</span>
                      <span>Clay ring · construction</span>
                    </div>
                  )}
                  {hover && hoveredNow && !selectedNow && !agentId && (
                    <div
                      className="building-tooltip"
                      style={{
                        left: Math.min(hover.x + 14, window.innerWidth - 260),
                        top: Math.max(10, hover.y - 65),
                      }}
                    >
                      <b>{hoveredNow.name}</b>
                      <span>
                        {readable(hoveredNow.sourceKind ?? hoveredNow.kind)}
                        {hoveredNow.status
                          ? ` · ${readable(hoveredNow.status)}`
                          : ""}
                      </span>
                      {hoveredNow.inventory && (
                        <small>
                          {Object.entries(hoveredNow.inventory)
                            .map(([resource, count]) => `${count} ${resource}`)
                            .join(" · ") || "No stock"}
                        </small>
                      )}
                    </div>
                  )}
                  {selectedNow && !agentId && (
                    <aside
                      className="selection-panel"
                      aria-label="Building details"
                      data-building-id={selectedNow.id}
                    >
                      <button
                        className="close"
                        aria-label="Close building details"
                        onClick={() => setSelected(null)}
                      >
                        <X size={20} />
                      </button>
                      <span className="eyebrow">
                        GENESIS / {selectedNow.chunkId}
                      </span>
                      <h2>{selectedNow.name}</h2>
                      {data?.communities.filter(c => c.headquartersBuildingId === selectedNow.id).map(c => <p key={c.id}>Headquarters of <button className="text-button" onClick={() => openCommunity(c.id)}>{c.name} (${c.symbol})</button></p>)}
                      <span className="tag">
                        {readable(selectedNow.sourceKind ?? selectedNow.kind)} ·{" "}
                        {isDemo ? "Demo building" : "Building"}
                      </span>
                      <div className="building-preview">
                        <Building2 size={60} strokeWidth={1} />
                      </div>
                      <dl className="detail-list">
                        {selectedNow.status && (
                          <div>
                            <dt>Status</dt>
                            <dd>{readable(selectedNow.status)}</dd>
                          </div>
                        )}
                        {selectedNow.condition !== undefined && (
                          <div>
                            <dt>Condition</dt>
                            <dd>{selectedNow.condition.toFixed(0)}%</dd>
                          </div>
                        )}
                        {selectedNow.inventory && (
                          <div>
                            <dt>City inventory</dt>
                            <dd data-testid="building-stock">
                              {Object.entries(selectedNow.inventory)
                                .map(
                                  ([resource, count]) => `${count} ${resource}`,
                                )
                                .join(", ") || "Empty"}
                            </dd>
                          </div>
                        )}

                        <div>
                          <dt>Footprint</dt>
                          <dd>
                            {selectedNow.width.toFixed(1)} ×{" "}
                            {selectedNow.depth.toFixed(1)} cells
                          </dd>
                        </div>
                        <div>
                          <dt>Floors</dt>
                          <dd>{selectedNow.floors}</dd>
                        </div>
                        <div>
                          <dt>Roof</dt>
                          <dd>{selectedNow.roofStyle}</dd>
                        </div>
                        <div>
                          <dt>Seed</dt>
                          <dd>{selectedNow.seed}</dd>
                        </div>
                      </dl>
                      <p className="small muted">
                        Geometry is generated from persisted configuration and a
                        deterministic seed.
                      </p>
                      <button
                        className="primary wide"
                        onClick={() => go("economy")}
                      >
                        Explore resource flows <ArrowRight size={16} />
                      </button>
                    </aside>
                  )}
                </>
              )}
              {page !== "world" && page !== "about" && page !== "roadmap" && (
                <div hidden={worldVisible} key={page} className={`page-content ${page === "communities" || page === "explore" ? "discovery-page" : ""}`}>
                  <div className="page-overlay-controls">
                    <OverlayClose onClose={closePage} />
                  </div>
                  {page === "communities" && (
                    <Communities api={api} selectedId={communityId} onSelect={setCommunityId} onCloseWorld={closePage} data={data} onExplore={exploreCommunity} onAgent={setAgentId} onToken={openToken}/>
                  )}{" "}
                  {page === "explore" && <Explore api={api} data={data} mint={tokenMint}
                    onToken={openToken} onBack={() => go("explore")} onWorld={exploreCommunity}
                    onAgent={setAgentId} onCommunity={openCommunity}/>}
                  {page === "studio" && (
                    <Studio
                      data={data}
                      api={api}
                      onAgent={setAgentId}
                      onRefresh={refresh}
                    />
                  )}{" "}
                  {page === "economy" && <Economy data={data} onViewBuilding={viewWorkplace} onViewAgent={watchAgent} onHighlight={setWorkplaceHighlights}/>}{" "}
                  {page === "treasury" && <Treasury data={data} />}{" "}
                  {page === "launchpad" && <Launchpad />}
                  <CityActivityInfo stats={data.stats} />
                  <footer className="page-footer">
                    <OfficialTokenAddress />
                    <span>Agentic Economy · A World That Works</span><ProjectLinks /><a href={routeUrl("about")} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); go("about"); }}>About the world <ArrowRight size={13} aria-hidden="true" /></a>
                    <span>
                      {isDemo
                        ? "Demo preview · No real financial actions"
                        : "Treasury payouts disabled"}{" "}
                      · City Credits are virtual and non-withdrawable.
                    </span>
                  </footer>
                </div>
              )}
              {agentId && (
                <AgentPanel
                  id={agentId}
                  api={api}
                  onClose={() => setAgentId(null)}
                  onRefresh={refresh}
                  data={data}
                  following={followingAgentId === agentId}
                  onViewBuilding={viewWorkplace}
                  liveActions={data.actions}
                  onFollow={(x, z) => {
                    const id = agentId;
                    if (!go("world")) return;
                    setAgentId(id);
                    if (followingAgentId === id) city.current?.follow(null);
                    else { city.current?.focus(x, z, 7); city.current?.follow(id); }
                  }}
                />
              )}
            </>
          )
        ))}
      </main>
      {worldVisible && <footer className="official-world-footer"><OfficialTokenAddress /></footer>}
    </div>
  );
}
function CheckMark() {
  return <span className="check-mark">✓</span>;
}
