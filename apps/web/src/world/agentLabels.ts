import * as THREE from "three";
import { agentIdentity, type AuthoritativeIdentity } from "../api/agentIdentity";

export const AGENT_LABELS = { farZoom: 1.2, closeZoom: 3.6,
  farLimit: 4, mediumLimit: 18, closeLimit: 48, interval: 1 / 30,
  headHeight: 1.7, gap: 8, estimatedCharacterWidth: 6.2 } as const;
export interface LabelAgent { id: string; name: string; ownerWallet?: string;
  identity?: AuthoritativeIdentity; displayName?: string; demoName?: boolean; x: number; z: number; elevation?: number; state: string;
  selected?: boolean; hovered?: boolean; important?: boolean; activity?: string; visualOnly?: boolean; }
export interface LabelExclusion { left: number; top: number; width: number; height: number }
export interface LabelCandidate extends LabelAgent { screenX: number; screenY: number; }

export function agentLabelName(agent: Pick<LabelAgent, "id" | "name" | "ownerWallet" | "demoName" | "identity" | "displayName">) {
  return agentIdentity(agent).primary;
}
/** Bounded collision packing using estimated text bounds, never DOM measurements. */
export function chooseAgentLabels(agents: LabelCandidate[], zoom: number, width: number, height: number, blocked: readonly LabelExclusion[] = []) {
  const far = zoom < AGENT_LABELS.farZoom;
  const limit = Math.min(far ? AGENT_LABELS.farLimit : zoom < AGENT_LABELS.closeZoom
    ? AGENT_LABELS.mediumLimit : AGENT_LABELS.closeLimit, Math.max(2, Math.floor(width * height / 18000)));
  const rank = (a: LabelCandidate) => (a.selected ? 100 : 0) + (a.hovered ? 80 : 0) + (a.important ? 10 : 0);
  const eligible = agents.filter((a) => !far || rank(a) > 0).sort((a, b) => rank(b) - rank(a) ||
    Math.hypot(a.screenX - width / 2, a.screenY - height / 2) -
    Math.hypot(b.screenX - width / 2, b.screenY - height / 2) || a.id.localeCompare(b.id));
  const placed: (LabelCandidate & { width: number })[] = [];
  for (const agent of eligible) {
    if (placed.length >= limit) break;
    const identity = agentIdentity(agent);
    const labelWidth = Math.min(176, identity.primary.length * AGENT_LABELS.estimatedCharacterWidth + 14);
    if (blocked.some(b => agent.screenX + labelWidth / 2 + 4 > b.left && agent.screenX - labelWidth / 2 - 4 < b.left + b.width && agent.screenY > b.top && agent.screenY - 24 < b.top + b.height)) continue;
    if (agent.screenX < labelWidth / 2 + 5 || agent.screenX > width - labelWidth / 2 - 5 ||
      agent.screenY < 20 || agent.screenY > height - 28) continue;
    if (placed.some((other) => Math.abs(other.screenX - agent.screenX) <
      (other.width + labelWidth) / 2 + AGENT_LABELS.gap && Math.abs(other.screenY - agent.screenY) < 24)) continue;
    placed.push({ ...agent, width: labelWidth });
  }
  return placed;
}

export function createAgentLabels(host: HTMLElement, select: (id: string) => void,
  hover: (id: string | null) => void) {
  const layer = document.createElement("div");
  layer.className = "agent-world-labels";
  layer.setAttribute("aria-label", "Citizens in view");
  host.appendChild(layer);
  const nodes = new Map<string, HTMLButtonElement>();
  const point = new THREE.Vector3();
  let last = -Infinity;
  return {
    update(seconds: number, camera: THREE.OrthographicCamera, agents: LabelAgent[], width: number, height: number, blocked: readonly LabelExclusion[] = []) {
      if (seconds - last < AGENT_LABELS.interval) return;
      last = seconds;
      const candidates = agents.map((agent) => {
        point.set(agent.x, AGENT_LABELS.headHeight + (agent.elevation ?? 0), agent.z);
        point.project(camera);
        return { ...agent, screenX: (point.x + 1) * width / 2,
          screenY: (1 - point.y) * height / 2 - 9 };
      });
      const shown = chooseAgentLabels(candidates, camera.zoom, width, height, blocked);
      const ids = new Set(shown.map((a) => a.id));
      for (const [id, node] of nodes) {
        node.hidden = !ids.has(id);
        if (!agents.some((a) => a.id === id)) { node.remove(); nodes.delete(id); }
      }
      for (const agent of shown) {
        let node = nodes.get(agent.id);
        if (!node) {
          node = document.createElement("button");
          node.className = "agent-world-label";
          node.append(document.createElement("span"));
          node.addEventListener("click", () => select(agent.id));
          node.addEventListener("pointerenter", () => hover(agent.id));
          node.addEventListener("pointerleave", () => hover(null));
          layer.appendChild(node); nodes.set(agent.id, node);
        }
        node.hidden = false;
        const identity = agentIdentity(agent);
        const name = identity.displayName;
        if (node.firstElementChild!.textContent !== identity.primary) node.firstElementChild!.textContent = identity.primary;
        node.setAttribute("aria-label", `Inspect agent ${name}`);
        node.title = `${agent.name} · ${agent.state} · ${agent.visualOnly ? "fixture motion only" : `backend: ${agent.activity ?? agent.state}`}`;
        node.dataset.agentId = agent.id;
        node.dataset.displayName = name;
        node.dataset.state = agent.state;
        node.dataset.selected = String(!!agent.selected);
        node.style.transform = `translate3d(${agent.screenX.toFixed(2)}px,${agent.screenY.toFixed(2)}px,0) translate(-50%,-100%)`;
      }
      host.dataset.agentLabels = String(shown.length);
    },
    dispose() { layer.remove(); nodes.clear(); },
  };
}
