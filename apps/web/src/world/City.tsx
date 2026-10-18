import { workDescription, workPose } from "../api/agentWork";
import type { AgentWork, AgentSummary } from "../api/shared";
import { cityPalette } from "./palette";
import { clearAccidentalWorldSelection } from "./selection";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { createCitizens } from "./citizens";
import type { FrontierStyle } from "./frontier";
import { createFrontierScene } from "./frontierScene";
import { updateWaterFlow } from "./waterFlow";
import { defaultWorldFrame, overviewFrame, inspectionTarget, worldCameraOffset } from "./framing";
import { createAgentLabels, type LabelAgent } from "./agentLabels";
import { agentSeed, buildPathNetwork, createDemoWalkers, observedJourney, samplePath } from "./agentMotion";
import { createAmbientScene } from "./ambient";
import { CityReveal } from "./reveal";
import { prepareScenery, reviveScenery, type SceneryRequest, type SceneryMessage } from "./sceneryPlan";
import { excavateRailTerrain } from "./railExcavation";
import { pedestrianStreetPoint, planStreets } from "./streets";
import type { CityActivity } from "../api/state";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  createBatch,
  disposeGroup,
  geometryLibrary,
} from "./geometry";
import {
  generateWorld,
  WORLD_SEED,
  type BuildingVisual,
  type ChunkVisual,
} from "./layout";
/** Flush pending orbit/pan inertia before restoring the home pose. Temporarily
 * disabling damping consumes the accumulated deltas synchronously; normal
 * gestures retain their original damping and mapping.
 */
function finishCameraMotion(controls: OrbitControls) {
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = damping;
}

export interface AgentVisual extends Pick<LabelAgent, "identity" | "displayName"> {
  id: string;
  name: string;
  ownerWallet?: string;
  demoName?: boolean;
  x: number;
  z: number;
  paused: boolean;
  state?: AgentSummary["state"];
  work?: AgentWork;
}
export interface CityHandle {
  railway: () => void;
  zoom: (delta: number) => void;
  reset: () => void;
  focus: (x: number, z: number, zoom?: number) => void;
  rotate: () => void;
  follow: (id: string | null) => void;
}
interface CityProps {
  touchPan?: boolean;
  interactive?: boolean;
  background?: boolean;
  visualStill?: boolean;
  ambientEnabled?: boolean;
  selectedAgentId?: string | null;
  highlightBuildingIds?: string[];
  onFollowChange?: (id:string|null)=>void;
  importantAgentIds?: string[];
  inspection?: { id: string; x: number; z: number } | null;
  population: number;
  chunkCatalog?: { cx: number; cy: number }[];
  regions?: {
    id: string;
    name: string;
    theme: string;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
  }[];
  onRegionMarkers?: (
    markers: { id: string; name: string; x: number; y: number }[],
  ) => void;
  onHover?: (building: BuildingVisual | null, x: number, y: number) => void;
  tickMs?: number;
  agentTicks?: Record<string, number>;
  activity?: CityActivity[];
  seed?: number;
  chunks?: ChunkVisual[];
  agents?: AgentVisual[];
  demo: boolean;
  overlay: boolean;
  paused: boolean;
  onSelect: (building: BuildingVisual | null) => void;
  onAgentSelect: (id: string) => void;
  onViewChange?: (coords: { cx: number; cy: number }[]) => void;
  onMetrics: (metrics: {
    chunks: number;
    buildings: number;
    drawCalls: number;
    fps: number;
  }) => void;
}
export const City = forwardRef<CityHandle, CityProps>(
  function City(props, ref) {
    const host = useRef<HTMLDivElement>(null),
      runtime = useRef<{
        camera: THREE.OrthographicCamera;
        controls: OrbitControls;
        focus: THREE.Vector3 | null;
        home: THREE.Vector3;
        homeZoom: number;
        following: string | null;
      } | null>(null);
    const current = useRef(props);
    current.current = props;
    const [error, setError] = useState("");
    useImperativeHandle(
      ref,
      () => ({
        follow(id) {
          if (!runtime.current) return;
          runtime.current.following=id; runtime.current.focus=null;
          current.current.onFollowChange?.(id);
        },
        railway() {
          const report = JSON.parse(host.current?.dataset.railway ?? "null");
          if (!report?.tunnel || !runtime.current || !host.current) return;
          const r = runtime.current, { west, east } = report.tunnel;
          r.focus = new THREE.Vector3((west.x + east.x) / 2, 0, 38);
          r.camera.zoom = Math.min(1.1, 200 * host.current.clientWidth / host.current.clientHeight / 320);
          r.camera.updateProjectionMatrix();
        },
        zoom(delta) {
          const r = runtime.current;
          if (r) {
            r.camera.zoom = THREE.MathUtils.clamp(r.camera.zoom * delta, r.controls.minZoom, 22);
            r.camera.updateProjectionMatrix();
          }
        },
        reset() {
          const r = runtime.current;
          if (r) {
            r.following = null; current.current.onFollowChange?.(null);
            finishCameraMotion(r.controls);
            r.focus = r.home.clone();
            r.camera.zoom = r.homeZoom;
            r.camera.position
              .copy(r.controls.target)
              .add(worldCameraOffset().setLength(400 / r.controls.minZoom));
            r.camera.updateProjectionMatrix();
          }
        },
        focus(x, z, zoom = 6) {
          if (runtime.current) {
            runtime.current.focus = new THREE.Vector3(x, 0, z);
            runtime.current.camera.zoom = zoom;
            runtime.current.camera.updateProjectionMatrix();
          }
        },
        rotate() {
          const r = runtime.current;
          if (r) {
            r.following=null;current.current.onFollowChange?.(null);
            const relative = r.camera.position
              .clone()
              .sub(r.controls.target)
              .applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
            r.camera.position.copy(r.controls.target).add(relative);
          }
        },
      }),
      [],
    );
    useEffect(() => {
      if (!host.current) return;
      const container = host.current,
        scene = new THREE.Scene();
      scene.background = new THREE.Color(cityPalette.parchment);
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        });
      } catch {
        setError(
          "3D rendering is unavailable on this device. Use the building explorer below, or enable WebGL and reload.",
        );
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      // Keep pastel materials in the existing linear-light → sRGB pipeline.
      // No filmic curve, atmospheric fog, or additional render passes.
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.toneMappingExposure = 1;
      container.appendChild(renderer.domElement);
      renderer.domElement.setAttribute(
        "aria-label",
        "Interactive procedural Genesis city. Drag with one finger to orbit; use Pan with one finger to move the field. Two fingers rotate and pinch to zoom. Mouse drag orbits, right-drag pans, scroll zooms. Arrow keys pan, plus and minus zoom, Home resets.",
      );
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.tabIndex = 0;
      const camera = new THREE.OrthographicCamera(
        -100,
        100,
        100,
        -100,
        0.1,
        8000,
      );
      const initialFrame = defaultWorldFrame(current.current.chunks ?? generateWorld(current.current.seed ?? WORLD_SEED,
        current.current.population), container.clientWidth, container.clientHeight);
      camera.zoom = initialFrame.zoom;
      const controls = new OrbitControls(camera, renderer.domElement);
      const initialCenter = initialFrame.center;
      controls.target.copy(initialCenter);
      camera.position.copy(initialCenter).add(worldCameraOffset());
      controls.enableDamping = true;
      controls.dampingFactor = 0.09;
      controls.minZoom = 0.3;
      controls.maxZoom = 22;
      controls.minPolarAngle = 0.25;
      controls.maxPolarAngle = 1.2;
      controls.screenSpacePanning = false;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      controls.touches = {
        ONE: current.current.touchPan ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_ROTATE,
      };
      controls.update();
      const stopAutomaticFocus = () => { if (runtime.current) {
        runtime.current.focus = null;
        if(runtime.current.following) {runtime.current.following=null;current.current.onFollowChange?.(null);}
      } };
      controls.addEventListener("start", stopAutomaticFocus);
      runtime.current = {
        camera,
        controls,
        focus: null,
        home: initialCenter,
        homeZoom: camera.zoom,
        following: null,
      };
      // Reduce broad fill in favor of directional shading. Horizontal terrain keeps
      // the same illumination: 0.9 + 1.71 * sunDirection.y ≈ 1.2 + 1.35 * sunDirection.y.
      const fill = new THREE.HemisphereLight("#ffffff", "#e0d3b8", 0.9);
      scene.add(fill);
      const sun = new THREE.DirectionalLight("#fff6e7", 1.71);
      sun.position.set(-60, 100, 30);
      scene.add(sun);
      // Opt-in development benchmark: compare light constants within one live scene.
      const previewLighting = (event: Event) => {
        const value = (event as CustomEvent<{ fill: number; sun: number }>)
          .detail;
        if (!Number.isFinite(value?.fill) || !Number.isFinite(value?.sun))
          return;
        fill.intensity = THREE.MathUtils.clamp(value.fill, 0, 4);
        sun.intensity = THREE.MathUtils.clamp(value.sun, 0, 4);
      };
      if (
        import.meta.env.DEV &&
        new URLSearchParams(window.location.search).has("lightingBenchmark")
      )
        container.addEventListener("city-lighting-preview", previewLighting);
      const library = geometryLibrary(),
        shared = new Set(Object.values(library));
      const backdrop = new THREE.Mesh<THREE.BufferGeometry>(
        new THREE.PlaneGeometry(6000, 6000),
        new THREE.MeshLambertMaterial({ color: cityPalette.parchment }),
      );
      backdrop.rotation.x = -Math.PI / 2;
      backdrop.position.y = -0.5;
      scene.add(backdrop);
      const selection = new THREE.Mesh(
        new THREE.RingGeometry(3.6, 3.8, 48),
        new THREE.MeshBasicMaterial({
          color: "#54775d",
          side: THREE.DoubleSide,
        }),
      );
      selection.rotation.x = -Math.PI / 2;
      selection.position.y = 0.15;
      selection.visible = false;
      scene.add(selection);
      const workHighlightGeometry=new THREE.RingGeometry(.94,1,24).rotateX(-Math.PI/2);
      const workHighlightMaterial=new THREE.MeshBasicMaterial({color:"#9aaf70",transparent:true,opacity:.8,side:THREE.DoubleSide});
      const workHighlights=new THREE.InstancedMesh(workHighlightGeometry,workHighlightMaterial,256);
      workHighlights.count=0;scene.add(workHighlights);
      let highlightKey="";
      const chunks = new Map<
          string,
          { group: THREE.Group; data: ChunkVisual; signature: string }
        >(),
        buildings = new Map<string, BuildingVisual>();
      const frustum = new THREE.Frustum(),
        projection = new THREE.Matrix4();
      let version = "",
        lastStream = 0,
        lastMetrics = 0,
        frames = 0,
        renderFrame = 0,
        elapsed = 0,
        previous = 0;
      const clock = new THREE.Clock();
      let scenic: ReturnType<typeof createFrontierScene> | null = null,
        scenicKey = "",
        scenicDependencies: (string | undefined)[] = [],
        frontierRevision = 0,
        geometryBuilds = 0;
      let ambient: ReturnType<typeof createAmbientScene> | null = null, ambientTime = 0, railTime = 0;
      let railClockRate = 1;
      // Explicit development-only review clock/camera; absent from production.
      const railReview = import.meta.env.DEV && new URLSearchParams(window.location.search).has("railReview");
      const previewRail = (event: Event) => {
        const value = (event as CustomEvent<{ time?: number; rate?: number; focus?: { x: number; z: number; zoom: number; reverse?: boolean } }>).detail;
        if (Number.isFinite(value?.time)) railTime = Math.max(0, value.time!);
        if (Number.isFinite(value?.rate)) railClockRate = THREE.MathUtils.clamp(value.rate!, 0, 60);
        if (value?.focus && [value.focus.x, value.focus.z, value.focus.zoom].every(Number.isFinite)) {
          runtime.current!.focus = null;
          controls.target.set(value.focus.x, 0, value.focus.z);
          camera.position.copy(controls.target).add(new THREE.Vector3(value.focus.reverse ? -100 : 100, 90, 100).setLength(400 / controls.minZoom));
          camera.zoom = THREE.MathUtils.clamp(value.focus.zoom, .3, 22); camera.updateProjectionMatrix(); controls.update();
        }
      };
      if (railReview) container.addEventListener("city-rail-review", previewRail);
      const frontierStyle: FrontierStyle = new URLSearchParams(window.location.search)
        .get("frontierStyle") === "coastal" ? "coastal" : "frontier";
      const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
      let visibleKey = "",
        lastLOD = false;
      let waterElapsed = 0, lastWorkReport = -1;
      const citizens = createCitizens(512);
      citizens.meshes.forEach((mesh) => scene.add(mesh));
      const gait = new Map<string, { heading: number; phase: number }>();
      const agentMatrix = new THREE.Matrix4(),
        agentPositions = new Map<string, THREE.Vector2>();
      const motion = new Map<
        string,
        { from: THREE.Vector2; target: THREE.Vector2; path: THREE.Vector2[] | null; duration: number; network: typeof pathNetwork; at: number; tick: number }
      >();
      let pathNetwork = buildPathNetwork([], WORLD_SEED);
      let streets = planStreets([], WORLD_SEED);
      const streetPoint = new THREE.Vector2();
      let demoWalkers = createDemoWalkers(pathNetwork, []);
      let hoveredAgentId: string | null = null;
      const labels = createAgentLabels(container, (id) => current.current.onAgentSelect(id),
        (id) => { hoveredAgentId = id; });
      const pulseGeometry = new THREE.RingGeometry(0.8, 1, 24).rotateX(
        -Math.PI / 2,
      );
      const pulseMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const pulses = new THREE.InstancedMesh(pulseGeometry, pulseMaterial, 64);
      pulses.count = 0;
      scene.add(pulses);
      let displayAgentIds: string[] = [];
      const cargoGeometry = new THREE.BoxGeometry(0.4, 0.35, 0.4),
        cargoMaterial = new THREE.MeshLambertMaterial({ color: "#bdab87" }),
        cargo = new THREE.InstancedMesh(cargoGeometry, cargoMaterial, 512);
      cargo.count = 0;
      scene.add(cargo);
      const history = new Map<string, THREE.Vector2[]>(),
        trailPositions = new Float32Array(512 * 8 * 2 * 3);
      const trailGeometry = new THREE.BufferGeometry();
      trailGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(trailPositions, 3),
      );
      trailGeometry.setDrawRange(0, 0);
      const trailMaterial = new THREE.LineBasicMaterial({
        color: "#779687",
        transparent: true,
        opacity: 0.65,
      });
      const trails = new THREE.LineSegments(trailGeometry, trailMaterial);
      scene.add(trails);
      let pointerDown: { x: number; y: number } | null = null;
      const raycaster = new THREE.Raycaster(),
        pointer = new THREE.Vector2();
      const pick = (event: PointerEvent) => {
        if (current.current.interactive === false) return;
        if (
          !pointerDown ||
          Math.hypot(
            event.clientX - pointerDown.x,
            event.clientY - pointerDown.y,
          ) > 5
        )
          return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const pickables: THREE.Object3D[] = [...chunks.values()]
          .filter((c) => c.group.visible)
          .map((c) => c.group);
        pickables.push(...citizens.meshes.filter((mesh) => mesh.visible));
        const hits = raycaster.intersectObjects(pickables, true);
        const hit = hits.find(
          (h) => h.object.visible && !h.object.userData.revealHidden && (
            h.object.userData.citizenStride ||
            h.object.userData.buildingIds?.[h.instanceId ?? 0]),
        );
        if (hit?.object.userData.citizenStride) {
          const id =
            displayAgentIds[
              Math.floor(
                (hit.instanceId ?? 0) / hit.object.userData.citizenStride,
              )
            ];
          if (id) current.current.onAgentSelect(id);
          return;
        }
        const id = hit?.object.userData.buildingIds?.[hit.instanceId ?? 0],
          b = id ? buildings.get(id) : undefined;
        selection.visible = !!b;
        if (b) {
          selection.position.set(b.x, 0.15, b.z);
          selection.scale.setScalar(Math.max(b.width, b.depth) / 5);
        }
        current.current.onSelect(b ?? null);
      };
      const down = (e: PointerEvent) => {
        if (current.current.interactive === false) return;
        if (e.button === 0 || e.button === 2) clearAccidentalWorldSelection();
        current.current.onHover?.(null, 0, 0);
        pointerDown = { x: e.clientX, y: e.clientY };
      };
      renderer.domElement.addEventListener("pointerdown", down);
      renderer.domElement.addEventListener("pointerup", pick);
      const leave = () => { hoveredAgentId = null; current.current.onHover?.(null, 0, 0); };
      renderer.domElement.addEventListener("pointerleave", leave);
      let lastHover = 0;
      const move = (e: PointerEvent) => {
        if (current.current.interactive === false || e.buttons || performance.now() - lastHover < 100) return;
        lastHover = performance.now();
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster
          .intersectObjects(
            [...chunks.values()]
              .filter((c) => c.group.visible)
              .map((c) => c.group as THREE.Object3D).concat(citizens.meshes.filter((mesh) => mesh.visible)),
            true,
          )
          .find((h) => h.object.visible && !h.object.userData.revealHidden && (h.object.userData.citizenStride || h.object.userData.buildingIds?.[h.instanceId ?? 0]));
        hoveredAgentId = hit?.object.userData.citizenStride
          ? displayAgentIds[Math.floor((hit.instanceId ?? 0) / hit.object.userData.citizenStride)] ?? null : null;
        const id = hit?.object.userData.buildingIds?.[hit.instanceId ?? 0];
        renderer.domElement.style.cursor = id || hoveredAgentId ? "pointer" : "grab";
        current.current.onHover?.(
          id ? (buildings.get(id) ?? null) : null,
          e.clientX - rect.left,
          e.clientY - rect.top,
        );
      };
      renderer.domElement.addEventListener("pointermove", move);
      const key = (e: KeyboardEvent) => {
        if (current.current.interactive === false) return;
        if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","+","=","-"].includes(e.key) && runtime.current?.following) {
          runtime.current.following=null;runtime.current.focus=null;current.current.onFollowChange?.(null);
        }
        const delta = new THREE.Vector3();
        const step = 12 / camera.zoom;
        if (e.key === "ArrowLeft") delta.x = -step;
        if (e.key === "ArrowRight") delta.x = step;
        if (e.key === "ArrowUp") delta.z = -step;
        if (e.key === "ArrowDown") delta.z = step;
        if (delta.length()) {
          e.preventDefault();
          controls.target.add(delta);
          camera.position.add(delta);
        }
        if (e.key === "+" || e.key === "=")
          camera.zoom = Math.min(22, camera.zoom * 1.15);
        if (e.key === "-") camera.zoom = Math.max(controls.minZoom, camera.zoom / 1.15);
        if (e.key === "Home") {
          e.preventDefault();
          finishCameraMotion(controls);
          runtime.current!.focus = runtime.current!.home.clone();
          camera.position.copy(controls.target).add(worldCameraOffset().setLength(400 / controls.minZoom));
          camera.zoom = runtime.current!.homeZoom;
        }
        if (e.key === "Escape") {
          selection.visible = false;
          current.current.onSelect(null);
        }
        camera.updateProjectionMatrix();
      };
      renderer.domElement.addEventListener("keydown", key);
      let firstSize = true, sizeRevision = 0;
      const resize = () => {
        const w = container.clientWidth,
          h = container.clientHeight;
        if (!w || !h) return;
        const r = runtime.current!;
        const wasOverview = Math.abs(camera.zoom - r.homeZoom) < 0.02 &&
          controls.target.distanceTo(r.home) < 1;
        const frameChunks = current.current.chunks ?? generateWorld(current.current.seed ?? WORLD_SEED, current.current.population);
        const frame = defaultWorldFrame(frameChunks, w, h);
        r.home.copy(frame.center);
        r.homeZoom = frame.zoom;
        controls.minZoom = Math.min(1, overviewFrame(frameChunks, w, h).zoom * 0.65);
        // Orthographic scale is independent of eye distance. Keep the near
        // plane behind foreground terrain, even at portrait overview zoom.
        camera.position.sub(controls.target).setLength(400 / controls.minZoom).add(controls.target);
        if (firstSize || wasOverview) {
          const delta = frame.center.clone().sub(controls.target);
          controls.target.add(delta); camera.position.add(delta);
          camera.zoom = frame.zoom;
        }
        firstSize = false;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
        renderer.setSize(w, h);
        sizeRevision++;
        camera.left = (-100 * w) / h;
        camera.right = (100 * w) / h;
        camera.top = 100;
        camera.bottom = -100;
        camera.updateProjectionMatrix();
        const inspection = current.current.inspection;
        if (inspection) r.focus = inspectionTarget(inspection.x, inspection.z, camera, w, h);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(container);
      window.addEventListener("resize", resize);
      resize();
      const onLost = (e: Event) => {
        e.preventDefault();
        setError(
          "The 3D graphics context was lost. Reload to restore the city, or use the building explorer.",
        );
      };
      renderer.domElement.addEventListener("webglcontextlost", onLost);
      let alive = true, animation = 0;
      const reveal = new CityReveal(motionPreference.matches);
      const revealReview = import.meta.env.DEV && new URLSearchParams(window.location.search).has("revealReview");
      let reviewTime: number | null = revealReview ? 0 : null;
      const revealNow = () => reviewTime ?? clock.getElapsedTime();
      const previewReveal = (event: Event) => {
        const time = (event as CustomEvent<{ time: number }>).detail?.time;
        if (Number.isFinite(time)) reviewTime = Math.max(0, time);
      };
      if (revealReview) container.addEventListener("city-reveal-review", previewReveal);
      let scenicRevision = 0, preparing = false, sceneryReady = false;
      let worker: Worker | null = null;
      let latestRequest: SceneryRequest | null = null;
      const acceptScenery = (raw: SceneryMessage) => {
        if (!alive || raw.revision !== scenicRevision) return;
        const message = reviveScenery(raw);
        if (message.kind === "error") {
          preparing = false; container.dataset.sceneryError = message.error; return;
        }
        if (message.kind === "roads") {
          pathNetwork = message.pathNetwork; streets = message.streets;
          container.dataset.streetConstraints = JSON.stringify(streets.constraints);
          container.dataset.lakeChannel = JSON.stringify(message.channel);
          if (current.current.demo) demoWalkers = createDemoWalkers(pathNetwork, current.current.chunks?.flatMap((c) => c.buildings) ?? []);
        }
        if (message.kind === "chunk") {
          const chunk = message.chunk;
          let group: THREE.Group;
          reveal.jobs.push(() => {
            if (!alive || message.revision !== scenicRevision) return;
            group = createBatch([...chunk.landscape, ...(streets.parts.get(chunk.data.id) ?? [])], library);
            group.userData.treeCount = chunk.landscape.filter((part) => part.role === "tree-trunk").length;
            reveal.register(`land:${chunk.data.id}`, group, chunk.rank, revealNow());
            if (!chunks.has(chunk.data.id)) {
              chunks.set(chunk.data.id, { group, data: chunk.data, signature: "pending" }); scene.add(group);
            }
          });
          reveal.jobs.push(() => {
            if (!group) return;
            if (!alive || message.revision !== scenicRevision) {
              if (!group.parent) { reveal.forget(group); disposeGroup(group, shared); }
              return;
            }
            const architecture = createBatch(chunk.architecture, library);
            reveal.register(`buildings:${chunk.data.id}`, architecture, chunk.rank, revealNow(), "buildings");
            group.add(architecture);
            group.traverse((o) => { if (o.userData.detail) o.visible = camera.zoom > 2.3 && !o.userData.revealHidden; });
            const old = chunks.get(chunk.data.id);
            if (old && old.group !== group) {
              reveal.forget(old.group); scene.remove(old.group); disposeGroup(old.group, shared);
              old.data.buildings.forEach((b) => buildings.delete(b.id));
            }
            chunks.set(chunk.data.id, { group, data: chunk.data, signature: chunk.signature });
            chunk.data.buildings.forEach((b) => buildings.set(b.id, b)); scene.add(group); geometryBuilds++;
          });
        }
        if (message.kind === "scenery") {
          reveal.jobs.push(() => {
            if (!alive || message.revision !== scenicRevision) return;
            const { frontier, composition } = message;
            if (ambient) { reveal.forget(ambient.group); scene.remove(ambient.group); disposeGroup(ambient.group, shared); }
            ambient = createAmbientScene(message.ambient, library);
            ambient.update(ambientTime, current.current.ambientEnabled !== false, railTime);
            reveal.register("infrastructure", ambient.group, 1, revealNow(), "environment"); scene.add(ambient.group);
            container.dataset.ambientActors = JSON.stringify(ambient.counts);
            container.dataset.railway = JSON.stringify(ambient.railway);
            container.dataset.mirroredRailway = JSON.stringify(ambient.mirroredRailway);
            container.dataset.railFrame = "-1";
            container.dataset.composition = JSON.stringify({ edgeSegments: composition.edgeSegments, railGardens: composition.railGardens, outskirts: composition.outskirts });
            if (scenic) { reveal.forget(scenic.group); scene.remove(scenic.group); disposeGroup(scenic.group, shared); }
            scenic = createFrontierScene({ ...frontier, parts: [...frontier.parts.filter((_, i) => !ambient!.clearedFrontierParts.has(i)), ...composition.parts] }, library, ambient.cuts);
            reveal.register("frontier", scenic.group, 1, revealNow());
            const ground = excavateRailTerrain([-3000, -.5, -3000, -3000, -.5, 3000, 3000, -.5, 3000,
              -3000, -.5, -3000, 3000, -.5, 3000, 3000, -.5, -3000], [], ambient.cuts);
            backdrop.geometry.dispose(); backdrop.geometry = new THREE.BufferGeometry();
            backdrop.geometry.setAttribute("position", new THREE.Float32BufferAttribute(ground.positions, 3));
            backdrop.geometry.computeVertexNormals(); backdrop.rotation.set(0, 0, 0); backdrop.position.y = 0;
            scene.add(scenic.group);
            container.dataset.frontierStyle = frontierStyle;
            container.dataset.frontierRevision = String(++frontierRevision);
            container.dataset.frontierShimmers = String(frontier.shimmer.length);
            preparing = false; sceneryReady = true;
          });
        }
      };
      try {
        worker = new Worker(new URL("./scenery.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<SceneryMessage>) => acceptScenery(event.data);
        worker.onerror = () => {
          worker?.terminate(); worker = null; container.dataset.sceneryWorker = "fallback";
          if (latestRequest) { const request = latestRequest; setTimeout(() => { if (alive && request.revision === scenicRevision) prepareScenery(request, acceptScenery); }, 0); }
        };
      } catch { container.dataset.sceneryWorker = "unavailable"; }
      container.dataset.sceneryWorker = worker ? "active" : "fallback";
      let inspectionKey = "", lastBackgroundFrame = 0, wasInteractive = true,
        wasStill = false, renderedSizeRevision = -1, initialSlowRender = false, lastInitialRenderEnd = 0;
      const render = () => {
        if (!alive) return;
        animation = requestAnimationFrame(render);
        const presentation = current.current;
        const now = performance.now();
        if (presentation.background && now - lastBackgroundFrame < 1000 / 24) return;
        lastBackgroundFrame = now;
        const interactive = presentation.interactive !== false;
        controls.touches.ONE = presentation.touchPan ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
        controls.enabled = interactive;
        renderer.domElement.tabIndex = interactive ? 0 : -1;
        if (!interactive && wasInteractive) { runtime.current!.focus = null; hoveredAgentId = null; }
        wasInteractive = interactive;
        const t = clock.getElapsedTime(),
          frameSeconds = t - previous,
          dt = Math.min(0.05, frameSeconds);
        previous = t;
        const p = current.current;
        const nextInspection = p.inspection?.id ?? "";
        if (nextInspection !== inspectionKey) {
          inspectionKey = nextInspection;
          if (p.inspection) runtime.current!.focus = inspectionTarget(p.inspection.x, p.inspection.z,
            camera, container.clientWidth, container.clientHeight);
        }
        if (!p.paused) elapsed += dt;
        if (!p.paused && !motionPreference.matches && p.ambientEnabled !== false) {
          ambientTime += dt;
        }
        // The rail service uses uncapped real elapsed seconds, independently of
        // cosmetic actors, simulation ticks, background throttling and navigation.
        railTime += Math.max(0, frameSeconds) * railClockRate;
        ambient?.update(ambientTime, p.ambientEnabled !== false, railTime);
        if (ambient && Math.floor(railTime * 4) !== Number(container.dataset.railFrame)) {
          container.dataset.railFrame = String(Math.floor(railTime * 4));
          container.dataset.railService = JSON.stringify(ambient.railState());
          container.dataset.railSeconds = String(railTime);
          container.dataset.railClockRate = String(railClockRate);
        }
        container.dataset.ambientTime = String(ambientTime);
        scenic?.update(elapsed, !p.paused && !motionPreference.matches);
        const r=runtime.current!;
        if(r.following) {
          const followed=agentPositions.get(r.following);
          if(p.selectedAgentId!==r.following || !p.agents?.some(a=>a.id===r.following)) {
            r.following=null;r.focus=null;p.onFollowChange?.(null);
          } else if(followed) r.focus=inspectionTarget(followed.x,followed.y,camera,container.clientWidth,container.clientHeight);
        }
        const nextHighlightKey=(p.highlightBuildingIds??[]).join(":")+":"+chunks.size;
        if(highlightKey!==nextHighlightKey) {
          highlightKey=nextHighlightKey;
          const ids=new Set(p.highlightBuildingIds);
          const places=p.chunks?.flatMap(c=>c.buildings).filter(b=>ids.has(b.id)).slice(0,256)??[];
          places.forEach((b,i)=>{agentMatrix.makeScale(Math.max(b.width,b.depth)*.7,1,Math.max(b.width,b.depth)*.7);agentMatrix.setPosition(b.x,(b.elevation??0)+.18,b.z);workHighlights.setMatrixAt(i,agentMatrix);});
          workHighlights.count=places.length;workHighlights.instanceMatrix.needsUpdate=true;workHighlights.computeBoundingSphere();
        }
        if (runtime.current?.focus) {
          const delta = runtime.current.focus
            .clone()
            .sub(controls.target)
            .multiplyScalar(1 - Math.exp(-6 * Math.min(0.5, frameSeconds)));
          controls.target.add(delta);
          camera.position.add(delta);
          if (controls.target.distanceTo(runtime.current.focus) < 0.02) {
            camera.position.add(runtime.current.focus.clone().sub(controls.target));
            controls.target.copy(runtime.current.focus);runtime.current.focus=null;
          }
        }
        if (interactive) controls.update();
        camera.updateMatrixWorld();
        if (!p.paused && !motionPreference.matches) waterElapsed += dt;
        updateWaterFlow(waterElapsed, camera);
        container.dataset.waterFlowTime = String(waterElapsed);
        container.dataset.waterFlowDirection = "screen-right";
        projection.multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse,
        );
        frustum.setFromProjectionMatrix(projection);
        const nextVersion = p.chunks
          ? `remote:${p.seed}`
          : `${p.seed ?? WORLD_SEED}:${p.population}`;
        if (nextVersion !== version) {
          version = nextVersion;
          for (const c of chunks.values()) {
            scene.remove(c.group);
            disposeGroup(c.group, shared);
          }
          chunks.clear();
          buildings.clear();
          scenicKey = "";
        }
        if (t - lastStream > .25 || (!chunks.size && !preparing)) {
          lastStream = t;
          const all = p.chunks ?? generateWorld(p.seed ?? WORLD_SEED, p.population);
          const nextScenicKey = (p.chunkCatalog ?? all.map((c) => ({ cx: c.x, cy: c.z }))).map((c) => `${c.cx}:${c.cy}`).join(",");
          const nextScenicDependencies = [...all].sort((a, b) => a.id.localeCompare(b.id)).flatMap((c) => [c.id, c.geometryKey]);
          const wanted = all.filter((chunk) => frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(chunk.x * 32 + 16, 2, chunk.z * 32 + 16), 26))).map((c) => c.id);
          if (scenicKey !== nextScenicKey || scenicDependencies.length !== nextScenicDependencies.length ||
            scenicDependencies.some((key, i) => key !== nextScenicDependencies[i]) ||
            (!preparing && wanted.some((id) => !chunks.has(id)))) {
            scenicKey = nextScenicKey; scenicDependencies = nextScenicDependencies;
            const request: SceneryRequest = { revision: ++scenicRevision, chunks: all, seed: p.seed ?? WORLD_SEED,
              catalog: p.chunkCatalog, style: frontierStyle, center: { x: runtime.current!.home.x, z: runtime.current!.home.z },
              wanted, known: Object.fromEntries([...chunks].map(([id, c]) => [id, c.signature])) };
            latestRequest = request; preparing = true; sceneryReady = false;
            if (worker) worker.postMessage(request);
            else setTimeout(() => { if (alive && request.revision === scenicRevision) prepareScenery(request, acceptScenery); }, 0);
          }
          for (const chunk of all) {
            const cached = chunks.get(chunk.id);
            if (cached && cached.data.geometryKey === chunk.geometryKey) {
              cached.data = chunk;
              if (cached.signature !== "pending") chunk.buildings.forEach((building) => buildings.set(building.id, building));
            }
          }
          for (const [id, c] of chunks) {
            c.group.visible = frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(c.data.x * 32 + 16, 2, c.data.z * 32 + 16), 26));
            if (!c.group.visible && Math.hypot(c.data.x * 32 + 16 - controls.target.x, c.data.z * 32 + 16 - controls.target.z) > 220 / camera.zoom + 100) {
              reveal.forget(c.group); scene.remove(c.group); disposeGroup(c.group, shared); chunks.delete(id);
              c.data.buildings.forEach((b) => buildings.delete(b.id));
            }
          }
        }
        reveal.work();
        reveal.setReady(sceneryReady); reveal.setReduced(motionPreference.matches);
        reveal.update(reviewTime ?? t, revealReview ? 0 : frameSeconds * 1000, camera.zoom > 2.3);
        container.dataset.revealStage = reveal.stage;
        container.dataset.revealTime = String(reviewTime ?? t);
        container.dataset.revealVisible = JSON.stringify(reveal.counts);
        container.dataset.revealPending = String(reveal.jobs.length);
        container.dataset.revealSceneryReady = String(sceneryReady);
        const actorsReady = reveal.actorsVisible;
        ambient?.setActorsVisible(actorsReady);
        citizens.meshes.forEach((mesh) => { mesh.visible = actorsReady; });
        cargo.visible = actorsReady; pulses.visible = actorsReady;
        const visible = (
          p.chunkCatalog ??
          [...chunks.values()].map((c) => ({ cx: c.data.x, cy: c.data.z }))
        ).filter((c) =>
          frustum.intersectsSphere(
            new THREE.Sphere(
              new THREE.Vector3(c.cx * 32 + 16, 2, c.cy * 32 + 16),
              26,
            ),
          ),
        );
        const newVisibleKey = visible.map((c) => `${c.cx}:${c.cy}`).join(",");
        if (newVisibleKey !== visibleKey) {
          visibleKey = newVisibleKey;
          p.onViewChange?.(visible);
        }
        if (lastLOD !== camera.zoom > 2.3) {
          lastLOD = camera.zoom > 2.3;
          for (const c of chunks.values())
            c.group.traverse((o) => {
              if (o.userData.detail) o.visible = lastLOD && !o.userData.revealHidden;
            });
        }
        const agentData = p.agents ?? [];
        const activeAgentIds = new Set(agentData.map((a) => a.id));
        const labelAgents: LabelAgent[] = [];
        const importantAgents = new Set(p.importantAgentIds);
        displayAgentIds = [];
        let count = 0,
          cargoCount = 0;
        for (let i = 0; i < Math.min(512, agentData.length); i++) {
          const a = agentData[i]!;
          let x = a.x,
            z = a.z;
          if (p.demo) {
            const visual = demoWalkers.position(a.id, x, z, elapsed, dt, a.paused || p.paused);
            x = visual.x; z = visual.y;
          }
          if (!isFinite(x) || !isFinite(z)) continue;
          const target = new THREE.Vector2(x, z),
            position = agentPositions.get(a.id) ?? target.clone();
          const oldX = position.x,
            oldZ = position.y;
          if (p.demo) {
            position.copy(target);
          } else {
            const tick = p.agentTicks?.[a.id] ?? 0,
              prior = motion.get(a.id);
            if (!prior || !prior.target.equals(target) || prior.network !== pathNetwork) {
              const samples =
                !prior ||
                tick - prior.tick > 3 ||
                target.distanceTo(prior.target) > 3
                  ? []
                  : (history.get(a.id) ?? []);
              samples.push(target.clone());
              history.set(a.id, samples.slice(-9));
              const journey = observedJourney(pathNetwork, position, target, p.tickMs ?? 500);
              motion.set(a.id, {
                from: position.clone(),
                target,
                path: journey?.path ?? null,
                duration: journey?.duration ?? (p.tickMs ?? 500),
                network: pathNetwork,
                at: performance.now(),
                tick,
              });
            }
            const sample = motion.get(a.id)!;
            if (!p.paused) {
              if (sample.path) samplePath(sample.path, Math.min(1,
                (performance.now() - sample.at) / sample.duration), position);
            }
          }
          agentPositions.set(a.id, position);
          pedestrianStreetPoint(position, agentSeed(a.id), streets, streetPoint);
          const dx = position.x - oldX,
            dz = position.y - oldZ;
          const distance = Math.hypot(dx, dz);
          const walking = !p.paused && !a.paused && distance > 0.0001;
          const pose = gait.get(a.id) ?? { heading: 0, phase: agentSeed(a.id) % 628 / 100 };
          if (walking) {
            pose.heading = Math.atan2(dx, dz);
            pose.phase =
              (pose.phase + Math.min(distance, 0.2) * 12) % (Math.PI * 2);
          }
          const workAgent = { id: a.id, state: a.paused ? "paused" as const : (a.state ?? "idle"), work: a.work };
          const poseKind = !walking && !p.demo ? workPose(workAgent, position.x, position.y) : null;
          const interacting = !!poseKind && !a.paused;
          const carrying = !p.demo && Object.values(a.work?.cargo ?? {}).some(q => (q ?? 0) > 0);
          if (interacting && !p.paused) pose.phase += dt * 1.8;
          gait.set(a.id, pose);
          if (
            !frustum.containsPoint(
              new THREE.Vector3(position.x, 0.6, position.y),
            )
          )
            continue;
          citizens.set(
            count,
            streetPoint.x,
            streetPoint.y,
            pose.heading,
            pose.phase,
            walking,
            a.paused
              ? "#b9b3a6"
              : p.overlay && a.state === "delivering"
                ? "#b68e70"
                : a.state === "working"
                  ? "#a4a05e"
                  : "#789684",
            carrying,
            interacting,
            poseKind ?? undefined,
          );
          labelAgents.push({ id: a.id, name: a.name, ownerWallet: a.ownerWallet,
            identity: a.identity, displayName: a.displayName,
            demoName: a.demoName ?? p.demo, x: streetPoint.x, z: streetPoint.y,
            state: a.paused ? "paused" : walking ? "walking" : interacting ? "interacting" : "idle",
            activity: p.demo ? a.state : workDescription(workAgent), visualOnly: p.demo,
            selected: p.selectedAgentId === a.id, hovered: hoveredAgentId === a.id,
            important: importantAgents.has(a.id) });
          if (carrying) {
            agentMatrix.makeTranslation(
              streetPoint.x + Math.sin(pose.heading) * 0.29,
              0.72,
              streetPoint.y + Math.cos(pose.heading) * 0.29,
            );
            cargo.setMatrixAt(cargoCount++, agentMatrix);
          }
          displayAgentIds.push(a.id);
          count++;
        }
        citizens.finish(count);
        labels.update(t, camera, actorsReady ? labelAgents : [], container.clientWidth, container.clientHeight);
        container.dataset.agentVisualStates = JSON.stringify(labelAgents.reduce<Record<string, number>>((states, agent) => {
          states[agent.state] = (states[agent.state] ?? 0) + 1; return states;
        }, {}));
        if(t-lastWorkReport>.25) {lastWorkReport=t;container.dataset.agentWork = JSON.stringify(agentData.map(a => ({ id:a.id, taskId:a.work?.task?.id ?? null,
          destination:a.work?.destination?.id ?? null, state:a.state, tick:a.work?.tick,
          x:agentPositions.get(a.id)?.x, z:agentPositions.get(a.id)?.y,
          working:!!workPose({id:a.id,state:(a.state??"idle"),work:a.work},agentPositions.get(a.id)?.x??Infinity,agentPositions.get(a.id)?.y??Infinity) })));
        }
        demoWalkers.prune(activeAgentIds);
        for (const id of gait.keys())
          if (!activeAgentIds.has(id)) {
            gait.delete(id);
            agentPositions.delete(id);
            motion.delete(id);
            history.delete(id);
          }
        cargo.count = cargoCount;
        cargo.instanceMatrix.needsUpdate = true;
        cargo.computeBoundingSphere();
        let trailOffset = 0;
        for (const samples of history.values())
          for (let i = 1; i < samples.length; i++) {
            if (trailOffset + 6 > trailPositions.length) break;
            const from = samples[i - 1]!,
              to = samples[i]!;
            trailPositions.set(
              [from.x, 0.21, from.y, to.x, 0.21, to.y],
              trailOffset,
            );
            trailOffset += 6;
          }
        trailGeometry.setDrawRange(0, trailOffset / 3);
        trailGeometry.getAttribute("position").needsUpdate = true;
        trailGeometry.computeBoundingSphere();
        trails.visible = actorsReady && p.overlay && !p.demo;
        let pulseCount = 0;
        const colors = {
          production: "#c1a456",
          delivery: "#729e85",
          construction: "#b78a65",
          maintenance: "#8ba8b9",
        };
        for (const effect of p.activity ?? []) {
          const age = (Date.now() - effect.receivedAt) / 1000;
          if (age < 0 || age > 6 || pulseCount >= 64) continue;
          const building = buildings.get(effect.buildingId);
          if (!building) continue;
          const scale = 1.5 + age * 0.4;
          agentMatrix.compose(
            new THREE.Vector3(
              building.x,
              (building.elevation ?? 0) +
                building.height +
                2 +
                (p.paused ? 0 : Math.sin(age * 2) * 0.2),
              building.z,
            ),
            new THREE.Quaternion(),
            new THREE.Vector3(scale, 1, scale),
          );
          pulses.setMatrixAt(pulseCount, agentMatrix);
          pulses.setColorAt(pulseCount, new THREE.Color(colors[effect.kind]));
          pulseCount++;
        }
        pulses.count = pulseCount;
        pulses.instanceMatrix.needsUpdate = true;
        if (pulses.instanceColor) pulses.instanceColor.needsUpdate = true;
        pulses.computeBoundingSphere();
        container.dataset.activeEffects = String(pulseCount);
        container.dataset.drawCalls = String(renderer.info.render.calls);
        container.dataset.geometryBuilds = String(geometryBuilds);
        container.dataset.deliveryMarkers = String(cargoCount);
        container.dataset.lastEffect = p.activity?.[0]
          ? `${p.activity[0].kind}:${p.activity[0].buildingId}`
          : "";
        container.dataset.renderedBuildings = String(buildings.size);
        container.dataset.renderedTrees = String([...chunks.values()]
          .filter((c) => c.group.visible)
          .reduce((count, c) => count + Number(c.group.userData.treeCount ?? 0), 0));
        container.dataset.camera = JSON.stringify({
          position: camera.position.toArray(),
          target: controls.target.toArray(),
          zoom: camera.zoom,
        });
        container.dataset.triangles = String(renderer.info.render.triangles);
        container.dataset.frameMs = String(frameSeconds * 1000);
        container.dataset.frameNumber = String(renderFrame++);
        container.dataset.renderedAgent = displayAgentIds[0]
          ? `${displayAgentIds[0]}:${agentPositions.get(displayAgentIds[0])?.toArray().join(":")}`
          : "";
        // Treasury holds the last visual frame while authoritative data still updates.
        const yieldRevealFrame = !reveal.complete && initialSlowRender && reveal.jobs.length > 0 && performance.now() - lastInitialRenderEnd < 120;
        if (!yieldRevealFrame && (!p.visualStill || !wasStill || renderedSizeRevision !== sizeRevision || !reveal.complete)) {
          const renderStarted = performance.now();
          renderer.render(scene, camera); renderedSizeRevision = sizeRevision;
          lastInitialRenderEnd = performance.now();
          if (!reveal.complete && lastInitialRenderEnd - renderStarted > 80) {
            initialSlowRender = true;
            if (!revealReview) reveal.accelerate();
          }
          container.dataset.revealRenderedTime = String(reviewTime ?? t);
        }
        wasStill = !!p.visualStill;
        frames++;
        if (t - lastMetrics > 1) {
          const markers = (p.regions ?? [])
            .filter((region) => ["civic", "industrial"].includes(region.theme))
            .map((region) => {
              const landmark = [...buildings.values()].find(
                (b) =>
                  b.kind ===
                  (region.theme === "civic" ? "town-hall" : "factory"),
              );
              const point = new THREE.Vector3(
                landmark?.x ?? (region.bounds.minX + region.bounds.maxX) / 2,
                0.2,
                landmark?.z ?? (region.bounds.minY + region.bounds.maxY) / 2,
              ).project(camera);
              return {
                id: region.id,
                name: region.name,
                x: ((point.x + 1) * container.clientWidth) / 2,
                y: ((1 - point.y) * container.clientHeight) / 2,
              };
            })
            .filter(
              (marker) =>
                marker.x > 90 &&
                marker.x < container.clientWidth - 270 &&
                marker.y > 210 &&
                marker.y < container.clientHeight - 150,
            );
          p.onRegionMarkers?.(markers);
          p.onMetrics({
            chunks: [...chunks.values()].filter((c) => c.group.visible).length,
            buildings: [...chunks.values()]
              .filter((c) => c.group.visible)
              .reduce((sum, c) => sum + c.data.buildings.length, 0),
            drawCalls: renderer.info.render.calls,
            fps: Math.round(frames / (t - lastMetrics)),
          });
          lastMetrics = t;
          frames = 0;
        }
      };
      render();
      return () => {
        alive = false;
        cancelAnimationFrame(animation);
        worker?.terminate(); reveal.jobs.length = 0;
        controls.removeEventListener("start", stopAutomaticFocus);
        container.removeEventListener("city-reveal-review", previewReveal);
        observer.disconnect();
        labels.dispose();
        if (ambient) { scene.remove(ambient.group); disposeGroup(ambient.group, shared); }
        window.removeEventListener("resize", resize);
        renderer.domElement.removeEventListener("pointerdown", down);
        renderer.domElement.removeEventListener("pointerup", pick);
        renderer.domElement.removeEventListener("pointermove", move);
        renderer.domElement.removeEventListener("pointerleave", leave);
        renderer.domElement.removeEventListener("keydown", key);
        renderer.domElement.removeEventListener("webglcontextlost", onLost);
        controls.dispose();
        container.removeEventListener("city-lighting-preview", previewLighting);
        container.removeEventListener("city-rail-review", previewRail);
        runtime.current = null;
        chunks.forEach((c) => {
          scene.remove(c.group);
          disposeGroup(c.group, shared);
        });
        citizens.dispose();
        scene.remove(trails);
        trailGeometry.dispose();
        trailMaterial.dispose();
        scene.remove(cargo);
        cargoGeometry.dispose();
        cargoMaterial.dispose();
        cargo.dispose();
        scene.remove(pulses);
        pulseGeometry.dispose();
        pulseMaterial.dispose();
        pulses.dispose();
        scene.remove(workHighlights);workHighlightGeometry.dispose();workHighlightMaterial.dispose();workHighlights.dispose();
        disposeGroup(scene, shared);
        Object.values(library).forEach((g) => g.dispose());
        renderer.dispose();
        renderer.forceContextLoss();
        container.removeChild(renderer.domElement);
      };
    }, []);
    return (
      <>
        <div ref={host} className="city-canvas" data-testid="city-canvas" />
        {error && (
          <div role="alert" className="graphics-error">
            {error}
          </div>
        )}
      </>
    );
  },
);
