import * as THREE from "three";
import { agentIdentity, type IdentityAgent, type AuthoritativeIdentity } from "../api/agentIdentity";

export const AGENT_LABELS = { farZoom: 1.2, closeZoom: 3.6,
  farLimit: 6, mediumLimit: 32, closeLimit: 160, interval: 1 / 30,
  headHeight: 1.7, occlusionHeight: 1.12, gap: 6, estimatedCharacterWidth: 6.2 } as const;
export interface LabelAgent { id: string; name: string; ownerWallet?: string | null;
  identity?: AuthoritativeIdentity; displayName?: string; demoName?: boolean; x: number; z: number; elevation?: number; state: string;
  selected?: boolean; hovered?: boolean; important?: boolean; activity?: string; visualOnly?: boolean; }
export interface LabelExclusion { left: number; top: number; width: number; height: number }
export interface LabelCandidate extends LabelAgent { screenX: number; screenY: number; labelName?: string }
export const agentLabelName = (agent: Pick<LabelAgent, "id" | "name" | "ownerWallet" | "demoName" | "identity" | "displayName">) => agentIdentity(agent).primary;
export const fullAgentIdentity = (a: LabelAgent) => {
  const i = agentIdentity(a), wallet = 'observedWallet' in i ? i.observedWallet : i.owner;
  const token = a.identity && 'tokenMint' in a.identity ? a.identity.tokenMint : null;
  return [i.primary, `ID: ${a.id}`, wallet ? `Wallet: ${wallet}` : null, token ? `Token: ${token}` : null, a.activity ?? a.state].filter(Boolean).join(' · ');
};

/** Expand actual wallet text on collisions; never manufacture a name or wallet association.
 * Retain choices for the lifetime of the world so labels do not shrink when a neighbour leaves view. */
export function uniqueAgentLabelNames(agents: IdentityAgent[], remembered = new Map<string, string>()) {
  const used = new Set<string>();
  for (const a of [...agents].sort((a, b) => Number(remembered.has(b.id)) - Number(remembered.has(a.id)) || a.id.localeCompare(b.id))) {
    let name = remembered.get(a.id) ?? agentLabelName(a);
    const identity = agentIdentity(a), wallet = 'observedWallet' in identity ? identity.observedWallet : identity.owner;
    if (used.has(name) && wallet) {
      for (let k = 5; used.has(name) && k * 2 + 3 < wallet.length; k++) name = `${wallet.slice(0, k)}...${wallet.slice(-k)}`;
      if (used.has(name)) name = wallet;
    }
    if (used.has(name)) name = `${name} · ${a.id}`;
    remembered.set(a.id, name); used.add(name);
  }
  return remembered;
}
const relevance = (a: LabelCandidate) => (a.hovered ? 2000 : 0) + (a.selected ? 1000 : 0) +
  (a.important ? 100 : 0) + (['working', 'interacting', 'delivering'].includes(a.state) ? 10 : 0);
const intersects = (a: LabelExclusion, b: LabelExclusion) => a.left < b.left + b.width + AGENT_LABELS.gap && a.left + a.width + AGENT_LABELS.gap > b.left && a.top < b.top + b.height + 3 && a.top + a.height + 3 > b.top;

/** Screen-space packing with small anchored offsets; close zoom is limited by readable space,
 * rather than an arbitrary 48-agent ceiling. Hover/selection always outrank routine labels. */
export function chooseAgentLabels(agents: LabelCandidate[], zoom: number, width: number, height: number, blocked: readonly LabelExclusion[] = []) {
  const close = zoom >= AGENT_LABELS.closeZoom;
  const limit = Math.min(zoom < AGENT_LABELS.farZoom ? AGENT_LABELS.farLimit : close ? AGENT_LABELS.closeLimit : AGENT_LABELS.mediumLimit,
    Math.max(2, Math.floor(width * height / (close ? 3200 : 12000))));
  const eligible = [...agents].sort((a, b) => relevance(b) - relevance(a) ||
    Math.hypot(a.screenX - width / 2, a.screenY - height / 2) - Math.hypot(b.screenX - width / 2, b.screenY - height / 2) || a.id.localeCompare(b.id));
  const placed: (LabelCandidate & { width: number; height: number; labelX: number; labelY: number })[] = [];
  const occupied: LabelExclusion[] = [...blocked];
  for (const agent of eligible) {
    const focused = !!(agent.selected || agent.hovered);
    if (placed.length >= limit && !focused) continue;
    if (agent.screenX < 0 || agent.screenX > width || agent.screenY < 0 || agent.screenY > height) continue;
    const labelWidth = Math.min(width - 16, focused ? 300 : 240, (agent.labelName ?? agentLabelName(agent)).length * AGENT_LABELS.estimatedCharacterWidth + (focused ? 180 : 14));
    const labelHeight = focused ? 76 : Math.max(20, Math.ceil((agent.labelName ?? agentLabelName(agent)).length * AGENT_LABELS.estimatedCharacterWidth / Math.max(1, labelWidth - 12)) * 14 + 4);
    const offsets = focused ? [[0, 0], [0, 92], [-150, 0], [150, 0], [-150, 92], [150, 92], [0, -92]] : close ? [[0, 0], [0, -24], [-36, -24], [36, -24], [0, -48], [-60, -48], [60, -48]] : [[0, 0]];
    for (const [dx, dy] of offsets) {
      const x = Math.max(labelWidth / 2 + 6, Math.min(width - labelWidth / 2 - 6, agent.screenX + dx!));
      const y = focused ? Math.max(labelHeight + 4, Math.min(height - 12, agent.screenY + dy!)) : agent.screenY + dy!;
      if (y < labelHeight + 4 || y > height - 12) continue;
      const box = { left: x - labelWidth / 2, top: y - labelHeight, width: labelWidth, height: labelHeight };
      if (occupied.some(other => intersects(box, other))) continue;
      placed.push({ ...agent, width: labelWidth, height: labelHeight, labelX: x, labelY: y }); occupied.push(box); break;
    }
  }
  return placed;
}

export function createAgentLabels(host: HTMLElement, select: (id: string) => void,
  hover: (id: string | null) => void, occluded: (point: THREE.Vector3, camera: THREE.OrthographicCamera) => boolean = () => false) {
  const layer = document.createElement("div"); layer.className = "agent-world-labels"; layer.setAttribute("aria-label", "Agents in view"); host.appendChild(layer);
  const nodes = new Map<string, HTMLButtonElement>(), names = new Map<string, string>();
  const cache = new Map<string, { at: number; x: number; z: number; camera: string; hidden: boolean }>();
  const point = new THREE.Vector3(); let last = -Infinity, lastLayout = -Infinity, lastReport = -Infinity, ui: LabelExclusion[] = [];
  return {
    identities(agents: IdentityAgent[]) { uniqueAgentLabelNames(agents, names); },
    update(seconds: number, camera: THREE.OrthographicCamera, agents: LabelAgent[], width: number, height: number, blocked: readonly LabelExclusion[] = []) {
      if (seconds - last < AGENT_LABELS.interval) return; last = seconds;
      uniqueAgentLabelNames(agents, names);
      if (seconds - lastLayout > .2) {
        const hostBox = host.getBoundingClientRect();
        ui = [...(host.closest('.app')?.querySelectorAll('.world-header, .activity-panel, .world-bottom, .camera-tools, .world-view-toggle, .selection-panel') ?? [])]
          .filter(node => node instanceof HTMLElement && node.offsetWidth > 0).map(node => { const r = node.getBoundingClientRect(); return { left: r.left - hostBox.left, top: r.top - hostBox.top, width: r.width, height: r.height }; });
        lastLayout = seconds;
      }
      // Orthographic occlusion depends on view direction, not pan or zoom. Reuse those queries
      // while following a moving agent instead of starving names outside the first query batch.
      const cameraKey = camera.quaternion.toArray().map(n => n.toFixed(3)).join(',');
      let queries = 0;
      const candidates = agents.map(agent => {
        point.set(agent.x, AGENT_LABELS.headHeight + (agent.elevation ?? 0), agent.z).project(camera);
        return { ...agent, labelName: names.get(agent.id), screenX: (point.x + 1) * width / 2, screenY: (1 - point.y) * height / 2 - 9, depth: point.z };
      }).filter(a => a.depth >= -1 && a.depth <= 1 && a.screenX >= 0 && a.screenX <= width && a.screenY >= 0 && a.screenY <= height)
        .sort((a, b) => relevance(b) - relevance(a) || Math.hypot(a.screenX - width / 2, a.screenY - height / 2) - Math.hypot(b.screenX - width / 2, b.screenY - height / 2))
        .filter(a => {
          let saved = cache.get(a.id);
          if (!saved || seconds - saved.at > .25 || saved.camera !== cameraKey || Math.hypot(a.x - saved.x, a.z - saved.z) > .3) {
            if (queries >= 16 && !a.selected && !a.hovered) return false;
            point.set(a.x, AGENT_LABELS.occlusionHeight + (a.elevation ?? 0), a.z);
            saved = { at: seconds, x: a.x, z: a.z, camera: cameraKey, hidden: occluded(point, camera) }; cache.set(a.id, saved); queries++;
          }
          return !saved.hidden;
        });
      if (import.meta.env.DEV && seconds - lastReport > .25) {
        host.dataset.agentLabelPositions = JSON.stringify(candidates.map(a => {
          point.set(a.x, .73 + (a.elevation ?? 0), a.z).project(camera);
          return { id: a.id, x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 };
        })); lastReport = seconds;
      }
      const shown = chooseAgentLabels(candidates, camera.zoom, width, height, [...ui, ...blocked]);
      const ids = new Set(shown.map(a => a.id)), active = new Set(agents.map(a => a.id));
      for (const [id, node] of nodes) { node.hidden = !ids.has(id); if (!active.has(id)) { node.remove(); nodes.delete(id); } }
      for (const id of cache.keys()) if (!active.has(id)) cache.delete(id);
      for (const a of shown) {
        let node = nodes.get(a.id);
        if (!node) {
          node = document.createElement('button'); node.type = 'button'; node.className = 'agent-world-label'; node.append(document.createElement('span'), document.createElement('small'));
          node.addEventListener('click', () => select(a.id)); node.addEventListener('pointerenter', () => hover(a.id));
          node.addEventListener('pointerleave', e => { if (!(e.relatedTarget instanceof HTMLCanvasElement)) hover(null); }); node.addEventListener('focus', () => hover(a.id)); node.addEventListener('blur', () => hover(null));
          layer.appendChild(node); nodes.set(a.id, node);
        }
        node.hidden = false; const identity = agentIdentity(a), focused = !!(a.selected || a.hovered);
        const wallet = 'observedWallet' in identity ? identity.observedWallet : identity.owner;
        node.firstElementChild!.textContent = a.labelName!;
        node.lastElementChild!.textContent = [wallet, a.id].filter(Boolean).join(' · ');
        node.setAttribute('aria-label', `Inspect agent ${fullAgentIdentity(a)}`); node.title = fullAgentIdentity(a);
        node.dataset.agentId = a.id; node.dataset.displayName = a.labelName; node.dataset.state = a.state;
        node.dataset.selected = String(!!a.selected); node.dataset.focused = String(focused);
        node.dataset.anchorX = a.screenX.toFixed(2); node.dataset.anchorY = a.screenY.toFixed(2);
        node.style.width = focused ? `${a.width}px` : ''; node.style.maxWidth = `${a.width}px`;
        node.style.transform = `translate3d(${a.labelX.toFixed(2)}px,${a.labelY.toFixed(2)}px,0) translate(-50%,-100%)`;
        node.style.setProperty('--agent-label-stem', `${Math.hypot(a.screenX - a.labelX, a.screenY - a.labelY)}px`);
        node.style.setProperty('--agent-label-stem-angle', `${-Math.atan2(a.screenX - a.labelX, a.screenY - a.labelY)}rad`);
      }
      host.dataset.agentLabels = String(shown.length); host.dataset.agentOcclusionQueries = String(queries);
    },
    dispose() { layer.remove(); nodes.clear(); cache.clear(); names.clear(); },
  };
}
