import { createHash, randomInt } from "node:crypto";
import type { AgentIdentity } from "@agentic-economy/shared";
import type { AgentSimState, SimState } from "./types.js";

/**
 * Agent naming (contract 0.3.0). Two disjoint namespaces, so the two allocators can never collide:
 * - legacy agents: `Word_NNNN` (4 digits), assigned by the simulation, a pure function of the agent ID
 *   and the names already in state, so snapshot upgrades and command replay always agree;
 * - house agents: `Word_NNN` (3 digits), reserved by the API in the database before the create command
 *   is queued, then carried in the command.
 * Token-linked agents are named after their activating wallet (`CMYx...6Wec`), a different shape again.
 */
export const NAME_WORDS = [
  "Alder", "Anvil", "Badger", "Barrow", "Birch", "Bow", "Bramble", "Cedar",
  "Clover", "Cobble", "Copper", "Ember", "Fern", "Finch", "Flint", "Fox",
  "Hare", "Hazel", "Heron", "Juniper", "Kestrel", "Kettle", "Lantern", "Lark",
  "Linden", "Maple", "Marten", "Moss", "Otter", "Plover", "Quill", "Reed",
  "Robin", "Rowan", "Sage", "Slate", "Sorrel", "Spindle", "Swift", "Tansy",
  "Teal", "Thistle", "Tinder", "Vesper", "Vole", "Willow", "Wren", "Yarrow",
] as const;

const LEGACY_MIN = 1000;
const LEGACY_SPAN = 9000; // 1000..9999

/** Deterministic legacy name for `agentId`, skipping names already in `taken`. */
export function legacyName(agentId: string, taken: ReadonlySet<string>): string {
  const h = createHash("sha256").update(`agentic-economy:legacy-name:${agentId}`).digest();
  const word = NAME_WORDS[h.readUInt32BE(0) % NAME_WORDS.length]!;
  const start = h.readUInt32BE(4) % LEGACY_SPAN;
  for (let i = 0; i < LEGACY_SPAN; i++) {
    const name = `${word}_${LEGACY_MIN + ((start + i) % LEGACY_SPAN)}`;
    if (!taken.has(name)) return name;
  }
  throw new Error(`no free legacy name for ${word}`); // 9,000 names per word; unreachable in practice
}

/** Random house-name candidates (`Word_NNN`); the database picks the first one that is free. */
export function houseNameCandidates(n = 12): string[] {
  return Array.from({ length: n }, () => `${NAME_WORDS[randomInt(NAME_WORDS.length)]}_${randomInt(100, 1000)}`);
}

/** `CMYx...6Wec`, then progressively longer forms on collision, ending with the full address. */
export function walletNameCandidates(wallet: string): string[] {
  const out: string[] = [];
  for (let k = 4; 2 * k + 3 < wallet.length; k++) out.push(`${wallet.slice(0, k)}...${wallet.slice(-k)}`);
  out.push(wallet);
  return out;
}

/** The wallet with owner controls (pause/strategy): never set for house agents. */
export function ownerOf(identity: AgentIdentity): string | null {
  return identity.kind === "token_linked" ? identity.activatingWallet : identity.kind === "legacy" ? identity.legacyOwnerWallet : null;
}

export function takenNames(s: SimState): Set<string> {
  return new Set(s.agentOrder.map((id) => s.agents[id]!.displayName));
}

/** Identity for an agent created by a pre-0.3.0 `agent.create` command (from the log or a v1 snapshot). */
export function legacyIdentity(agentId: string, ownerWallet: string, taken: ReadonlySet<string>): Pick<AgentSimState, "identity" | "displayName"> {
  const syntheticName = legacyName(agentId, taken);
  return { identity: { kind: "legacy", syntheticName, legacyOwnerWallet: ownerWallet }, displayName: syntheticName };
}

/** Pre-0.3.0 state shape: agents have no identity and always have an owner wallet. */
export type SimStateV1 = Omit<SimState, "version" | "agents"> & {
  version: 1;
  agents: Record<string, Omit<AgentSimState, "identity" | "displayName"> & { ownerWallet: string }>;
};

/**
 * v1 → v2: every existing agent becomes `legacy` with a deterministic synthetic name, in `agentOrder`.
 * Pure and deterministic: it touches no RNG, counters, ledger or simulation fields, so the economy
 * evolves exactly as before and every process that upgrades the same snapshot gets the same names.
 * IDs, free-text names, ownership and history are unchanged. Idempotent on v2 input.
 */
export function upgradeState(input: SimState | SimStateV1): SimState {
  if (input.version === 2) return input;
  if (input.version !== 1) throw new Error(`unknown simulation state version ${(input as { version: unknown }).version}`);
  const taken = new Set<string>();
  const agents: SimState["agents"] = {};
  for (const id of input.agentOrder) {
    const a = input.agents[id]!;
    const ident = legacyIdentity(id, a.ownerWallet, taken);
    taken.add(ident.displayName);
    agents[id] = { ...a, ...ident };
  }
  return { ...input, version: 2, agents };
}
