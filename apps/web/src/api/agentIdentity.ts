import type { AgentSummary, EconomicEvent } from "./shared";

/** Identity fields from a validated backend response. Owner records alone are not activation evidence.
 * Optional fields retain compatibility with the deployed 0.2.0 contract. */
export type AuthoritativeIdentity =
  | { kind: "token_linked"; activatingWallet: string; tokenMint: string; activationId: string }
  | { kind: "house"; syntheticName: string }
  | { kind: "legacy"; syntheticName: string; legacyOwnerWallet: string };
export type IdentityAgent = Pick<AgentSummary, "id" | "name"> &
  { ownerWallet?: string | null; identity?: AuthoritativeIdentity; displayName?: string };
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
  const houseName = (identity?.kind === "house" || identity?.kind === "legacy") && /^[A-Z][a-z]{1,15}_[0-9]{3,6}$/.test(identity.syntheticName)
    ? identity.syntheticName : generated;
  const owner = linked ? identity.activatingWallet : null;
  // The server may extend the shortened wallet name to resolve collisions.
  const parts = agent.displayName?.split("...");
  const walletNameMatches = owner && parts?.length === 2 && parts[0]!.length >= 4 &&
    parts[0]!.length === parts[1]!.length && agent.displayName!.length < owner.length &&
    owner.startsWith(parts[0]!) && owner.endsWith(parts[1]!);
  const persistedWalletName = owner && (agent.displayName === owner || walletNameMatches) ? agent.displayName : null;
  const primary = owner ? persistedWalletName ?? `${owner.slice(0, 4)}...${owner.slice(-4)}` : houseName;
  const persisted = identity?.kind === "house" || identity?.kind === "legacy" || linked;
  // The fixed ID tag makes legacy house aliases unambiguous even if their short
  // hash collides. Never renumber or change a name based on the current roster.
  const tag = owner ? owner : agent.id.replace(/^agt_/, "");
  return { primary, tag, displayName: persisted ? primary : `${primary} · ${tag}`,
    canonicalId: agent.id, givenName: agent.name, owner,
    kind: linked ? "token_linked" : identity?.kind === "house" ? "house" : identity?.kind === "legacy" ? "legacy" : "unclassified" };
}
export const displayAgentName = (agent: IdentityAgent) => agentIdentity(agent).displayName;

/** Format attribution without editing the persisted historical summary. */
export function displayActivity(event: Pick<EconomicEvent, "summary" | "agentId"> & Partial<Pick<EconomicEvent, "type">>, agents: IdentityAgent[]) {
  // Normalize only our exact historical confirmed-launch template, never token/user content.
  // The authoritative event, signature and confirmation status remain untouched.
  if (!event.agentId) return event.type === "launch.confirmed"
    ? event.summary.replace(/^(.* \(\$[^()\r\n]+\)) launched on Pump\.fun through Agentic Economy\.?$/, "$1 launched on Agentic Economy.")
    : event.summary;
  const agent = agents.find((a) => a.id === event.agentId);
  const name = displayAgentName(agent ?? { id: event.agentId, name: "Agent" });
  return agent?.name && event.summary.includes(agent.name)
    ? event.summary.replace(agent.name, name) : `${event.summary} · ${name}`;
}
