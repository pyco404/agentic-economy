import * as THREE from 'three';
import type { AgentSocial } from '../api/shared';
import { agentLabelName, type LabelAgent, type LabelExclusion } from './agentLabels';

export const SPEECH_BUDGET = { desktop: 4, mobile: 2, interval: .25, maxSeconds: 8 } as const;
export interface SpeechAgent extends LabelAgent { social?: AgentSocial }
export interface SpeechCandidate extends SpeechAgent { screenX: number; screenY: number }
export function chooseSpeech(agents: SpeechCandidate[], width: number, height: number, zoom: number) {
  const limit = width < 700 ? SPEECH_BUDGET.mobile : SPEECH_BUDGET.desktop;
  const chosen: SpeechCandidate[] = [], events = new Set<string>();
  const bubbleWidth = width < 700 ? 165 : 190;
  const sorted = agents.filter(a => a.social?.current && a.social.current.untilTick > a.social.tick)
    .sort((a, b) => Number(!!b.selected) - Number(!!a.selected) || Number(b.social?.current?.reaction === 'cheer') - Number(a.social?.current?.reaction === 'cheer') || a.id.localeCompare(b.id));
  for (const a of sorted) {
    const event = a.social!.current!;
    if (events.has(event.eventId) || a.screenX < bubbleWidth / 2 + 8 || a.screenX > width - bubbleWidth / 2 - 8 || a.screenY < 80 || a.screenY > height - 100) continue;
    if (chosen.some(b => Math.abs(a.screenX - b.screenX) < bubbleWidth + 8 && Math.abs(a.screenY - b.screenY) < 75)) continue;
    chosen.push(a); events.add(event.eventId);
    if (chosen.length >= Math.min(limit, zoom < 1 ? 1 : limit)) break;
  }
  return chosen;
}

/** At most four DOM bubbles, updated at 4 Hz. No text geometry, new materials or frame-time dialogue. */
export function createSocialBubbles(host: HTMLElement, select: (id: string) => void) {
  const layer = document.createElement('div'); layer.className = 'social-bubbles';
  layer.setAttribute('aria-label', 'City World conversations'); host.appendChild(layer);
  const nodes = new Map<string, HTMLButtonElement>(), deadlines = new Map<string, number>(), observedTicks = new Map<string, number>();
  const point = new THREE.Vector3(); let last = -Infinity, shownIds = new Set<string>(), bounds: LabelExclusion[] = [];
  return {
    update(seconds: number, camera: THREE.OrthographicCamera, agents: SpeechAgent[], width: number, height: number, tickMs: number) {
      if (seconds - last < SPEECH_BUDGET.interval) return shownIds;
      last = seconds;
      const box = host.getBoundingClientRect();
      const blocked = [...(host.closest('.app')?.querySelectorAll('.world-header, .activity-panel, .world-bottom, .camera-tools, .world-view-toggle, .selection-panel') ?? [])]
        .filter(node => node instanceof HTMLElement && node.offsetWidth > 0).map(node => node.getBoundingClientRect());
      const candidates = agents.filter(a => {
        const current = a.social?.current; if (!current) return false;
        const key = `${a.id}:${current.eventId}`;
        const gathering = ['performance', 'market', 'festival'].includes(current.kind);
        // A compact gathering marker persists while fresh authoritative updates arrive.
        // Ordinary speech remains brief; disconnected/stale gatherings disappear within four seconds.
        if (!deadlines.has(key) || gathering && observedTicks.get(key) !== a.social!.tick) {
          deadlines.set(key, seconds + Math.min(gathering ? 4 : SPEECH_BUDGET.maxSeconds, (current.untilTick - a.social!.tick) * tickMs / 1000));
          observedTicks.set(key, a.social!.tick);
        }
        return seconds < deadlines.get(key)!;
      }).map(a => {
        point.set(a.x, 2.3 + (a.elevation ?? 0), a.z).project(camera);
        return { ...a, screenX: (point.x + 1) * width / 2, screenY: (1 - point.y) * height / 2 };
      }).filter(a => !blocked.some(b => a.screenX + box.left + 95 > b.left && a.screenX + box.left - 95 < b.right && a.screenY + box.top > b.top && a.screenY + box.top - 75 < b.bottom));
      const chosen = chooseSpeech(candidates, width, height, camera.zoom);
      shownIds = new Set(chosen.map(a => a.id));
      const bubbleWidth = width < 700 ? 165 : 190;
      bounds = chosen.map(a => ({ left: a.screenX - bubbleWidth / 2, top: a.screenY - 80, width: bubbleWidth, height: 80 }));
      for (const [id, node] of nodes) if (!shownIds.has(id)) { node.remove(); nodes.delete(id); }
      for (const a of chosen) {
        let node = nodes.get(a.id);
        if (!node) {
          node = document.createElement('button'); node.type = 'button'; node.className = 'social-bubble';
          node.append(document.createElement('span'), document.createElement('small'));
          node.addEventListener('click', () => select(a.id)); layer.append(node); nodes.set(a.id, node);
        }
        const current = a.social!.current!;
        const gathering = ['performance', 'market', 'festival'].includes(current.kind);
        node.classList.toggle('is-gathering', gathering);
        const text = camera.zoom < 1.2 || gathering && camera.zoom < 2.5 ? `${current.kind} · ${current.partnerIds.length + 1} neighbours` : current.speech;
        node.firstElementChild!.textContent = text;
        node.lastElementChild!.textContent = gathering ? "City gathering · inspect" : `${agentLabelName(a)} · City World`;
        node.setAttribute('aria-label', `${agentLabelName(a)}: ${text}. Virtual city activity. Inspect agent.`);
        node.style.transform = `translate3d(${a.screenX.toFixed(1)}px,${a.screenY.toFixed(1)}px,0) translate(-50%,-100%)`;
      }
      // Bound stale packet bookkeeping even during long-running sessions.
      for (const [key, until] of deadlines) if (until < seconds - 60) { deadlines.delete(key); observedTicks.delete(key); }
      host.dataset.socialBubbles = String(chosen.length);
      return shownIds;
    },
    bounds() { return bounds; },
    dispose() { layer.remove(); nodes.clear(); deadlines.clear(); observedTicks.clear(); },
  };
}
