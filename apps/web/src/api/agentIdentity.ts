import type { AgentSummary, EconomicEvent } from "./shared";

/** Identity fields from a validated backend response. Owner records alone are not activation evidence.
 * Optional fields retain compatibility with the deployed 0.2.0 contract. */
export type AuthoritativeIdentity =
  | { kind: "token_linked"; activatingWallet: string; tokenMint: string; activationId: string }
  | { kind: "aeco_observed"; wallet: string; tokenMint: string; network: "devnet" | "mainnet-beta"; balanceRaw: string; decimals: number; observedSlot: number }
  | { kind: "house"; syntheticName: string }
  | { kind: "legacy"; syntheticName: string; legacyOwnerWallet: string };
export type IdentityAgent = Pick<AgentSummary, "id" | "name"> &
  { ownerWallet?: string | null; identity?: AuthoritativeIdentity; displayName?: string };
const publicKey = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function agentIdentity(agent: IdentityAgent) {
  const identity = agent.identity;
  if (identity?.kind === "aeco_observed" && publicKey.test(identity.wallet) && publicKey.test(identity.tokenMint)) {
    const parts = agent.displayName?.split("...");
    const expanded = parts?.length === 2 && parts[0]!.length >= 4 && parts[0]!.length === parts[1]!.length &&
      agent.displayName!.length < identity.wallet.length && identity.wallet.startsWith(parts[0]!) && identity.wallet.endsWith(parts[1]!);
    const primary = expanded ? agent.displayName! : `${identity.wallet.slice(0, 4)}...${identity.wallet.slice(-4)}`;
    return { primary, tag: agent.id, displayName: primary, canonicalId: agent.id, givenName: "Common Agent", owner: null, observedWallet: identity.wallet, kind: "aeco_observed" as const };
  }
  // An owner record or token balance alone is never activation evidence.
  const linked = identity?.kind === "token_linked" && publicKey.test(identity.activatingWallet) &&
    publicKey.test(identity.tokenMint) && !!identity.activationId;
  const houseName = (identity?.kind === "house" || identity?.kind === "legacy") && /^[A-Z][a-z]{1,15}_[0-9]{3,6}$/.test(identity.syntheticName)
    ? identity.syntheticName : agent.id;
  const owner = linked ? identity.activatingWallet : null;
  // The server may extend the shortened wallet name to resolve collisions.
  const parts = agent.displayName?.split("...");
  const walletNameMatches = owner && parts?.length === 2 && parts[0]!.length >= 4 &&
    parts[0]!.length === parts[1]!.length && agent.displayName!.length < owner.length &&
    owner.startsWith(parts[0]!) && owner.endsWith(parts[1]!);
  const persistedWalletName = owner && (agent.displayName === owner || walletNameMatches) ? agent.displayName : null;
  const primary = owner ? persistedWalletName ?? `${owner.slice(0, 4)}...${owner.slice(-4)}` : houseName;
  // Preserve the authoritative ID alongside the public name; do not generate identities.
  const tag = owner ? owner : agent.id.replace(/^agt_/, "");
  return { primary, tag, displayName: primary,
    canonicalId: agent.id, givenName: agent.name, owner,
    kind: linked ? "token_linked" : identity?.kind === "house" ? "house" : identity?.kind === "legacy" ? "legacy" : "unclassified" };
}
export const displayAgentName = (agent: IdentityAgent) => agentIdentity(agent).displayName;

/** Format attribution without editing the persisted historical summary. */
export function displayActivity(event: Pick<EconomicEvent, "summary" | "agentId"> & Partial<Pick<EconomicEvent, "type">>, agents: IdentityAgent[]) {
  // Normalize only our exact historical confirmed-launch template, never token/user content.
  // The authoritative event, signature and confirmation status remain untouched.
  if (event.type?.startsWith("social.")) return event.summary;
  if (!event.agentId && event.type === "task.created") return event.summary.replace(/^production shift posted: /, "Work shift available: ");
  if (!event.agentId) return event.type === "launch.confirmed"
    ? event.summary.replace(/^(.* \(\$[^()\r\n]+\)) launched on Pump\.fun through Agentic Economy\.?$/, "$1 launched on Agentic Economy.")
    : event.summary;
  const summary = event.type === "task.created" ? event.summary.replace(/^production shift posted: /, "Work shift available: ")
    : event.type === "task.claimed" ? event.summary.replace(/ took production shift for /, " accepted a work shift at ")
    : event.type === "task.verified" ? event.summary.replace(/ completed production shift for /, " completed a work shift at ")
    : event.summary;
  const agent = agents.find((a) => a.id === event.agentId);
  const name = displayAgentName(agent ?? { id: event.agentId, name: "Agent" });
  return agent?.name && summary.includes(agent.name)
    ? summary.replace(agent.name, name) : `${summary} · ${name}`;
}
