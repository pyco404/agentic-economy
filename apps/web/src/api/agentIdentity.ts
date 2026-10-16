import type { AgentSummary, EconomicEvent } from "./shared";

/** Normalized authoritative identity. No current endpoint supplies this record yet.
 * Populate only from a validated backend activation/house identity contract. */
export type AuthoritativeIdentity =
  | { kind: "token_linked"; activatingWallet: string; tokenMint: string; activationId: string }
  | { kind: "house"; syntheticName: string };
export type IdentityAgent = Pick<AgentSummary, "id" | "name"> &
  Partial<Pick<AgentSummary, "ownerWallet">> & { identity?: AuthoritativeIdentity };
const roots = ["Bow", "Fern", "Kestrel", "Vesper", "Stonecrop", "Willow", "Rowan", "Ovenkeeper", "Courier", "Linden"];
const publicKey = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function agentIdentity(agent: IdentityAgent) {
  const identity = agent.identity;
  // An owner record or token balance alone is never activation evidence.
  const linked = identity?.kind === "token_linked" && publicKey.test(identity.activatingWallet) &&
    publicKey.test(identity.tokenMint) && !!identity.activationId;
  const hash = [...agent.id].reduce((value, letter) => Math.imul(value ^ letter.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const code = String(hash % 1000).padStart(3, "0");
  const generated = `${roots[Math.floor(hash / 1000) % roots.length]}_${code}`;
  const houseName = identity?.kind === "house" && /^[A-Za-z][A-Za-z ]*_\d+$/.test(identity.syntheticName)
    ? identity.syntheticName : generated;
  const owner = linked ? identity.activatingWallet : null;
  const primary = owner ? `${owner.slice(0, 4)}...${owner.slice(-4)}` : houseName;
  // The fixed ID tag makes legacy house aliases unambiguous even if their short
  // hash collides. Never renumber or change a name based on the current roster.
  const tag = owner ? owner : agent.id.replace(/^agt_/, "");
  return { primary, tag, displayName: owner ? primary : `${primary} · ${tag}`,
    canonicalId: agent.id, givenName: agent.name, owner,
    kind: linked ? "token_linked" : identity?.kind === "house" ? "house" : "unclassified" };
}
export const displayAgentName = (agent: IdentityAgent) => agentIdentity(agent).displayName;

/** Format attribution without editing the persisted historical summary. */
export function displayActivity(event: Pick<EconomicEvent, "summary" | "agentId">, agents: IdentityAgent[]) {
  if (!event.agentId) return event.summary;
  const agent = agents.find((a) => a.id === event.agentId);
  const name = displayAgentName(agent ?? { id: event.agentId, name: "Agent" });
  return agent?.name && event.summary.includes(agent.name)
    ? event.summary.replace(agent.name, name) : `${event.summary} · ${name}`;
}
