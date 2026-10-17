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
  Navigation,
  Pause,
  Play,
  Plus,
  Rocket,
  RotateCw,
  Search,
  ShieldCheck,
  Users,
  Wallet,
  Wind,
  TrainFront,
  X,
} from "lucide-react";
import { createAdapter, numericSeed } from "./api/adapter";
import { displayActivity } from "./api/agentIdentity";
import { useWorld } from "./api/useWorld";
import { readRoute, routeUrl, type Page } from "./navigation/routes";
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
import "./about.css";
import { MobileNavigation } from "./components/MobileNavigation";
import "./mobile-navigation.css";
const pages = [
  { id: "explore", label: "Explore", icon: Search },
  { id: "communities", label: "Communities", icon: Users },
  { id: "studio", label: "Agent Studio", icon: Blocks },
  { id: "economy", label: "Economy", icon: ChartNoAxesCombined },
  { id: "treasury", label: "Treasury", icon: ShieldCheck },
  { id: "launchpad", label: "Launchpad", icon: Rocket },
] as const;
export default function App() {
  useDraftUnloadGuard();
  const api = useMemo(createAdapter, []),
    [page, setPage] = useState<Page>(() => readRoute(window.location).page),
    [tokenMint, setTokenMint] = useState<string | null>(() => readRoute(window.location).mint),
    [pageOpen, setPageOpen] = useState(true),
    [menu, setMenu] = useState(false),
    [touchPan, setTouchPan] = useState(false),
    [paused, setPaused] = useState(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [overlay, setOverlay] = useState(false),
    [explorer, setExplorer] = useState(false),
    [immersive, setImmersive] = useState(false),
    [ambientEnabled, setAmbientEnabled] = useState(true),
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
    [growth, setGrowth] = useState(0),
    [metrics, setMetrics] = useState({
      chunks: 0,
      buildings: 0,
      drawCalls: 0,
      fps: 0,
    });
  const [roadmapRequest, setRoadmapRequest] = useState(0);
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
      if (route.page === "world" || window.location.pathname === "/world")
        window.history.replaceState(null, "", routeUrl(route.page, route.mint));
      setPage(route.page); setPageOpen(true); setTokenMint(route.mint);
      setSelected(null); setHover(null); setAgentId(null); setMenu(false); setImmersive(false);
    };
    if (readRoute(window.location).page === "world" || window.location.pathname === "/world")
      window.history.replaceState(null, "", routeUrl(readRoute(window.location).page, readRoute(window.location).mint));
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); };
  }, []);
  useEffect(() => {
    document.getElementById("main")?.scrollTo(0, 0);
    // The destination receives focus without moving the camera or scrolling the page.
    const frame = requestAnimationFrame(() => {
      if (worldVisible) document.querySelector<HTMLCanvasElement>(".global-world-layer canvas")?.focus({ preventScroll: true });
      else (document.querySelector<HTMLButtonElement>(".community-dialog .page-close") ?? document.querySelector<HTMLButtonElement>(".page-close"))?.focus({ preventScroll: true });
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
  const population = (data?.stats.activeAgents ?? 156) + growth,
    seed = data ? numericSeed(data.bootstrap.seed) : WORLD_SEED;
  const chunks = useMemo(
    () => data?.chunks ?? generateWorld(seed, population),
    [data?.chunks, seed, population],
  );
  const buildings = useMemo(() => chunks.flatMap((c) => c.buildings), [chunks]);
  const focus = (b: BuildingVisual) => {
    setSelected(b);
    setAgentId(null);
    city.current?.focus(b.x, b.z);
  };
  const exploreCommunity = (id: string) => {
    if (!go("world")) return;
    const c = data?.communities.find((c) => c.id === id);
    const b =
      buildings.find((b) => b.id === c?.headquartersBuildingId) ??
      (api.kind === "demo"
        ? buildings.filter((b) => b.kind === "headquarters")[
            data?.communities.findIndex((c) => c.id === id) ?? 0
          ]
        : undefined);
    if (b) {
      setTimeout(() => focus(b), 100);
    } else {
      setExplorer(true);
    }
  };
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
  const isDemo = data?.mode === "demo" || api.kind === "demo";
  return (
    <div
      className="app"
      data-route={worldVisible ? "world" : page}
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
          <a href={routeUrl("about")} className={`about-nav-link${!worldVisible && page === "about" ? " is-current" : ""}`}
            aria-label="About Agentic Economy" title="About Agentic Economy" aria-current={!worldVisible && page === "about" ? "page" : undefined}
            onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); go("about"); }}>
            <Info size={18} aria-hidden="true" /><span>About</span></a>
          <span className="demo-badge">
            <i />
            {isDemo ? "Demo Mode" : `${data?.mode ?? "API"} · ${streamStatus}`}
          </span>
          <button
            className="wallet-button"
            disabled
            title="Wallet integration awaits backend verification"
          >
            <Wallet size={15} />
            <span>Connect wallet</span>
          </button>
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
      {menu && <MobileNavigation items={pages} active={worldVisible ? null : page} onNavigate={go} onClose={closeMenu}
        modeLabel={isDemo ? "Demo Mode" : `${data?.mode ?? "API"} · ${streamStatus}`} />}
      {data && <div className="global-world-layer" data-testid="global-world" data-interactive={worldVisible}
        inert={!worldVisible} aria-hidden={!worldVisible}>
                  <City
                    ref={city}
                    touchPan={touchPan}
                    seed={seed}
                    population={population}
                    chunks={data.chunks}
                    agents={data.agents.map((a) => ({
                      id: a.id,
                      name: a.name,
                      ownerWallet: a.ownerWallet,
                      demoName: api.kind === "demo",
                      x: a.pos.x,
                      z: a.pos.y,
                      paused: a.status === "paused",
                      state: a.state,
                    }))}
                    demo={api.kind === "demo"}
                    selectedAgentId={agentId}
                    ambientEnabled={ambientEnabled}
                    importantAgentIds={data.actions?.slice(0, 3).map((action) => action.agentId)}
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
                    regions={data.bootstrap.regions}
                    onRegionMarkers={regionUpdate}
                    chunkCatalog={
                      api.kind === "http" ? data.bootstrap.chunks : undefined
                    }
                    onHover={hovered}
                    tickMs={data.bootstrap.sim.tickMs}
                    activity={data.cityActivity}
                    agentTicks={data.agentTicks}
                    inspection={!worldVisible ? null : selectedNow ? { id: selectedNow.id, x: selectedNow.x, z: selectedNow.z }
                      : inspectedAgent ? { id: inspectedAgent.id, x: inspectedAgent.pos.x,
                          z: inspectedAgent.pos.y } : null}
                  />
      </div>}
      <div className="world-atmosphere" aria-hidden="true" />
      {worldVisible && page !== "world" && <button className="page-reopen" type="button" aria-label="Show page"
        onClick={() => { setPageOpen(true); setAgentId(null); setSelected(null); setImmersive(false); }}>
        <Layers size={16} /><span>Show page<small>{page === "about" ? "About" : pages.find((p) => p.id === page)?.label}</small></span>
      </button>}
      <main
        id="main"
        tabIndex={-1}
        className={worldVisible ? `world-main${immersive ? " is-immersive" : ""}` : "page-main"}
      >
        {page === "about" && <div hidden={worldVisible} className="page-content about-shell">
          <div className="page-overlay-controls"><OverlayClose onClose={closePage} /></div>
          <About onNavigate={go} roadmapRequest={roadmapRequest} source={api.kind} mode={data?.mode} connected={!!data && !error && streamStatus === "connected"} />
          <footer className="page-footer"><span>Agentic Economy</span><span>One living world. Every page built above it.</span></footer>
        </div>}
        {(page !== "about" || worldVisible) && (loading ? (
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
            <p>{error}</p>
            <button
              className="primary"
              onClick={() => {
                refresh();
              }}
            >
              Try again
            </button>
            <p className="small muted">
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
            </button>
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
                        A World That Works. A persistent AI-powered economy on Solana.
                      </p>
                      <button
                        className="world-cta"
                        onClick={() => go("studio")}
                      >
                        Find your place in the city <ArrowRight size={16} />
                      </button>
                      <p className="world-vision-note">Token communities and useful work today in demo. Holder-access Common Agents, rentable Super Agents, and funded $AECO rewards are planned.</p>
                      <div className="world-vision-actions"><button onClick={() => go("economy")}>Explore Economy</button><button onClick={() => go("launchpad")}>Launchpad</button><button onClick={() => { if (go("about")) setRoadmapRequest((n) => n + 1); }}>View Roadmap</button></div>
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
                        <div className="activity-filters">
                          <div className="feed-label">
                            <i />
                            {api.kind === "demo"
                              ? "Offline fixture activity"
                              : "Backend simulation activity"}
                          </div>
                          <select
                            className="world-filter"
                            aria-label="Filter city activity"
                            value={activityFilter}
                            onChange={(e) => setActivityFilter(e.target.value)}
                          >
                            <option value="all">All economic activity</option>
                            <option value="production.completed">
                              Production
                            </option>
                            <option value="task.verified">
                              Verified services
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
                                activityFilter === "all" ||
                                a.type === activityFilter,
                            )
                            .map((a) => (
                              <div className="feed-item" key={a.id} data-event-id={a.id}>
                                <span className="feed-icon" data-kind={a.type}>
                                  {a.type === "task.verified" ? (
                                    <CheckMark />
                                  ) : (
                                    <Activity size={14} />
                                  )}
                                </span>
                                <div>
                                  <p>{displayActivity(a, data.agents)}</p>
                                  <small>
                                    {api.kind === "demo"
                                      ? "Fixture event"
                                      : `Simulation tick ${a.tick}`}
                                  </small>
                                </div>
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
                  <div className="camera-tools" aria-label="Camera controls">
                    <button className="touch-pan-control" aria-label="Pan with one finger"
                      aria-pressed={touchPan} title={touchPan ? "Pan mode on · tap to restore one-finger rotation" : "Pan with one finger · tap to enable"}
                      onClick={() => setTouchPan((enabled) => !enabled)}>
                      <Move size={18} /><span>{touchPan ? "Orbit" : "Pan"}</span>
                    </button>
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
                    <span />
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
                  <div className="world-bottom">
                    <div className="world-stat">
                      <Users size={18} />
                      <span>
                        <b>{population.toLocaleString()}</b>
                        <small>
                          {growth ? "Demo capacity preview" : "Active agents"}
                        </small>
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
                          {api.kind === "demo"
                            ? "Generated buildings"
                            : "Persisted buildings"}
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
                        <b>{data.stats.verifiedTasks.toLocaleString()}</b>
                        <small>
                          {isDemo ? "Demo services" : "Verified services"}
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
                    <span role="status" data-testid="connection-status">
                      {api.kind === "demo"
                        ? "Offline fixtures"
                        : `Backend demo · ${streamStatus} · Tick ${data.streamTick ?? data.stats.tick}`}
                    </span>
                    <span>
                      <MousePointer2 size={12} /> Drag to orbit · Right drag to pan · Scroll to zoom
                    </span>
                    <span>
                      <Navigation size={12} /> {metrics.chunks} visible chunks ·{" "}
                      {metrics.fps} FPS · {metrics.drawCalls} draw calls
                    </span>
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
                      <span className="tag">
                        {readable(selectedNow.sourceKind ?? selectedNow.kind)} ·{" "}
                        {isDemo ? "Demo building" : "Server building"}
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
                            <dt>Stock (simulation)</dt>
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
              {page !== "world" && page !== "about" && (
                <div hidden={worldVisible} key={page} className={`page-content ${page === "communities" || page === "explore" ? "discovery-page" : ""}`}>
                  <div className="page-overlay-controls">
                    <OverlayClose onClose={closePage} />
                  </div>
                  {page === "communities" && (
                    <Communities onCloseWorld={closePage} data={data} onExplore={exploreCommunity} onAgent={setAgentId} onToken={openToken}/>
                  )}{" "}
                  {page === "explore" && <Explore api={api} data={data} mint={tokenMint}
                    onToken={openToken} onBack={() => go("explore")} onWorld={exploreCommunity}
                    onAgent={setAgentId} onCommunity={() => go("communities")}/>}
                  {page === "studio" && (
                    <Studio
                      data={data}
                      api={api}
                      onAgent={setAgentId}
                      onRefresh={refresh}
                    />
                  )}{" "}
                  {page === "economy" && <Economy data={data} />}{" "}
                  {page === "treasury" && <Treasury data={data} />}{" "}
                  {page === "launchpad" && <Launchpad />}
                  <footer className="page-footer">
                    <span>Agentic Economy</span><a href={routeUrl("about")} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); go("about"); }}>About the world <ArrowRight size={13} aria-hidden="true" /></a>
                    <span>
                      {isDemo
                        ? "Demo preview · No real financial actions"
                        : "Server data · Financial actions disabled"}{" "}
                      · City Credits are simulated.
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
                  liveActions={data.actions}
                  onFollow={(x, z) => {
                    const id = agentId;
                    if (!go("world")) return;
                    setAgentId(id);
                    setTimeout(() => city.current?.focus(x, z, 7), 100);
                  }}
                />
              )}
            </>
          )
        ))}
      </main>
    </div>
  );
}
function CheckMark() {
  return <span className="check-mark">✓</span>;
}
