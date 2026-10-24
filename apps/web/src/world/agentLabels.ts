import * as THREE from "three";
import { agentIdentity, type IdentityAgent, type AuthoritativeIdentity } from "../api/agentIdentity";

export const AGENT_LABELS = { interval: 1 / 30, headHeight: 1.7, bodyRadius: 1, gap: 6, estimatedCharacterWidth: 6.2 } as const;
export interface LabelAgent { id: string; name: string; ownerWallet?: string | null;
  identity?: AuthoritativeIdentity; displayName?: string; demoName?: boolean; x: number; z: number; elevation?: number; state: string;
  selected?: boolean; hovered?: boolean; important?: boolean; activity?: string; visualOnly?: boolean; }
export interface LabelExclusion { left: number; top: number; width: number; height: number }
export interface LabelCandidate extends LabelAgent { screenX: number; screenY: number; labelName?: string; screenBounds?: LabelExclusion }
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
const intersects = (a: LabelExclusion, b: LabelExclusion) => a.left < b.left + b.width + AGENT_LABELS.gap && a.left + a.width + AGENT_LABELS.gap > b.left && a.top < b.top + b.height + 3 && a.top + a.height + 3 > b.top;
export interface LabelOffset { dx: number; dy: number }

/** Always show every rendered on-screen identity. Choose a small offset once, then retain it
 * across camera/motion/priority changes. Crowding may overlap labels, never remove them. */
export function chooseAgentLabels(agents: LabelCandidate[], width: number, height: number,
  blocked: readonly LabelExclusion[] = [], remembered = new Map<string, LabelOffset>()) {
  // Spatial buckets keep initial crowd placement local rather than comparing every pair.
  const grid = new Map<string, LabelExclusion[]>(), cell = 96;
  const keys = (box: LabelExclusion) => {
    const result: string[] = [];
    for (let x = Math.floor((box.left - AGENT_LABELS.gap) / cell); x <= Math.floor((box.left + box.width + AGENT_LABELS.gap) / cell); x++)
      for (let y = Math.floor((box.top - 3) / cell); y <= Math.floor((box.top + box.height + 3) / cell); y++) result.push(`${x}:${y}`);
    return result;
  };
  const occupy = (box: LabelExclusion) => { for (const key of keys(box)) { const bucket = grid.get(key) ?? []; bucket.push(box); grid.set(key, bucket); } };
  blocked.forEach(occupy);
  const placed: (LabelCandidate & { width: number; height: number; labelX: number; labelY: number })[] = [];
  for (const agent of [...agents].sort((a, b) => a.id.localeCompare(b.id))) {
    const body = agent.screenBounds ?? { left: agent.screenX, top: agent.screenY, width: 0, height: 0 };
    if (body.left + body.width < 0 || body.left > width || body.top + body.height < 0 || body.top > height) continue;
    const focused = !!(agent.selected || agent.hovered), name = agent.labelName ?? agentLabelName(agent);
    const labelWidth = Math.max(1, Math.min(width - 12, focused ? 300 : 240, name.length * AGENT_LABELS.estimatedCharacterWidth + (focused ? 180 : 14)));
    const labelHeight = focused ? 76 : Math.max(20, Math.ceil(name.length * AGENT_LABELS.estimatedCharacterWidth / Math.max(1, labelWidth - 12)) * 14 + 4);
    const position = ({ dx, dy }: LabelOffset) => {
      const x = Math.max(labelWidth / 2 + 6, Math.min(width - labelWidth / 2 - 6, agent.screenX + dx));
      const y = Math.max(labelHeight + 4, Math.min(height - 4, agent.screenY + dy));
      return { left: x - labelWidth / 2, top: y - labelHeight, width: labelWidth, height: labelHeight };
    };
    let offset = remembered.get(agent.id);
    if (!offset) {
      const choices = [{ dx: 0, dy: 0 }, { dx: 0, dy: -14 }, { dx: -24, dy: -28 }, { dx: 24, dy: -28 }, { dx: 0, dy: -42 }];
      offset = choices.find(candidate => { const box = position(candidate); return !keys(box).some(key => grid.get(key)?.some(other => intersects(box, other))); })
        ?? choices[placed.length % choices.length]!;
      remembered.set(agent.id, offset);
    }
    const box = position(offset); occupy(box);
    placed.push({ ...agent, width: labelWidth, height: labelHeight, labelX: box.left + box.width / 2, labelY: box.top + box.height });
  }
  return placed;
}

export function createAgentLabels(host: HTMLElement, select: (id: string) => void,
  hover: (id: string | null) => void) {
  const layer = document.createElement("div"); layer.className = "agent-world-labels"; layer.setAttribute("aria-label", "Agents in view"); host.appendChild(layer);
  const nodes = new Map<string, HTMLButtonElement>(), names = new Map<string, string>();
  const offsets = new Map<string, LabelOffset>();
  let roster: Set<string> | undefined;
  const point = new THREE.Vector3(); let last = -Infinity, lastLayout = -Infinity, lastReport = -Infinity, ui: LabelExclusion[] = [];
  return {
    identities(agents: IdentityAgent[]) { uniqueAgentLabelNames(agents, names); roster = new Set(agents.map(a => a.id)); },
    update(seconds: number, camera: THREE.OrthographicCamera, agents: LabelAgent[], width: number, height: number, blocked: readonly LabelExclusion[] = []) {
      if (seconds - last < AGENT_LABELS.interval) return; last = seconds;
      uniqueAgentLabelNames(agents, names);
      if (seconds - lastLayout > .2) {
        const hostBox = host.getBoundingClientRect();
        ui = [...(host.closest('.app')?.querySelectorAll('.world-header, .activity-panel, .world-bottom, .camera-tools, .world-view-toggle, .selection-panel, .official-world-address') ?? [])]
          .filter(node => node instanceof HTMLElement && node.offsetWidth > 0).map(node => { const r = node.getBoundingClientRect(); return { left: r.left - hostBox.left, top: r.top - hostBox.top, width: r.width, height: r.height }; });
        lastLayout = seconds;
      }
      const radiusX = AGENT_LABELS.bodyRadius * camera.zoom * width / (camera.right - camera.left);
      const radiusY = AGENT_LABELS.bodyRadius * camera.zoom * height / (camera.top - camera.bottom);
      const candidates = agents.flatMap(agent => {
        point.set(agent.x, .6 + (agent.elevation ?? 0), agent.z).project(camera);
        const depthRadius = 2 * AGENT_LABELS.bodyRadius / (camera.far - camera.near);
        if (point.z < -1 - depthRadius || point.z > 1 + depthRadius) return [];
        const screenBounds = { left: (point.x + 1) * width / 2 - radiusX, top: (1 - point.y) * height / 2 - radiusY, width: 2 * radiusX, height: 2 * radiusY };
        point.set(agent.x, AGENT_LABELS.headHeight + (agent.elevation ?? 0), agent.z).project(camera);
        return [{ ...agent, labelName: names.get(agent.id), screenX: (point.x + 1) * width / 2, screenY: (1 - point.y) * height / 2 - 9, screenBounds }];
      });
      if (import.meta.env.DEV && seconds - lastReport > .25) {
        host.dataset.agentLabelPositions = JSON.stringify(candidates.map(a => {
          point.set(a.x, .73 + (a.elevation ?? 0), a.z).project(camera);
          return { id: a.id, x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 };
        })); lastReport = seconds;
      }
      const shown = chooseAgentLabels(candidates, width, height, [...ui, ...blocked], offsets);
      const ids = new Set(shown.map(a => a.id)), active = roster ?? new Set(agents.map(a => a.id));
      for (const [id, node] of nodes) { if (node.hidden === ids.has(id)) node.hidden = !ids.has(id); if (!active.has(id)) { node.remove(); nodes.delete(id); } }
      for (const id of offsets.keys()) if (!active.has(id)) offsets.delete(id);
      for (const a of shown) {
        let node = nodes.get(a.id);
        if (!node) {
          node = document.createElement('button'); node.type = 'button'; node.className = 'agent-world-label'; node.append(document.createElement('span'), document.createElement('small'));
          node.addEventListener('click', () => select(a.id)); node.addEventListener('pointerenter', () => hover(a.id));
          node.addEventListener('pointerleave', e => { if (!(e.relatedTarget instanceof HTMLCanvasElement)) hover(null); }); node.addEventListener('focus', () => hover(a.id)); node.addEventListener('blur', () => hover(null));
          layer.appendChild(node); nodes.set(a.id, node);
        }
        if (node.hidden) node.hidden = false;
        const identity = agentIdentity(a), focused = !!(a.selected || a.hovered);
        const wallet = 'observedWallet' in identity ? identity.observedWallet : identity.owner;
        // Most identity text is immutable. Avoid rebuilding text nodes/attributes at 30 Hz.
        if (node.firstElementChild!.textContent !== a.labelName) node.firstElementChild!.textContent = a.labelName!;
        const secondary = [wallet, a.id].filter(Boolean).join(' · '), title = fullAgentIdentity(a);
        if (node.lastElementChild!.textContent !== secondary) node.lastElementChild!.textContent = secondary;
        if (node.title !== title) { node.setAttribute('aria-label', `Inspect agent ${title}`); node.title = title; }
        for (const [key, value] of Object.entries({ agentId: a.id, displayName: a.labelName!, state: a.state,
          selected: String(!!a.selected), focused: String(focused) })) if (node.dataset[key] !== value) node.dataset[key] = value;
        node.dataset.anchorX = a.screenX.toFixed(2); node.dataset.anchorY = a.screenY.toFixed(2);
        node.style.width = focused ? `${a.width}px` : ''; node.style.maxWidth = `${a.width}px`;
        node.style.transform = `translate3d(${a.labelX.toFixed(2)}px,${a.labelY.toFixed(2)}px,0) translate(-50%,-100%)`;
        node.style.setProperty('--agent-label-stem', `${Math.hypot(a.screenX - a.labelX, a.screenY - a.labelY)}px`);
        node.style.setProperty('--agent-label-stem-angle', `${-Math.atan2(a.screenX - a.labelX, a.screenY - a.labelY)}rad`);
      }
      host.dataset.agentLabels = String(shown.length); host.dataset.agentOcclusionQueries = '0';
    },
    dispose() { layer.remove(); nodes.clear(); offsets.clear(); names.clear(); },
  };
}
