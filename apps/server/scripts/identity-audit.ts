/**
 * Read-only legacy-identity audit for the 0.3.0 agent identity upgrade. Run it BEFORE deploying 0.3.0 to an
 * environment: it reports what the deterministic v1 → v2 simulation-state upgrade will do to existing agents,
 * without changing anything.
 *
 *   pnpm --filter @agentic-economy/server identity:audit -- --api https://agentic-economy-staging.up.railway.app
 *   pnpm --filter @agentic-economy/server identity:audit -- --database postgres:///some_db?host=/var/run/postgresql
 *
 * --api reads GET /api/v1/world/agents (agents in simulation order). --database reads the latest snapshot plus
 * any unapplied pre-0.3.0 creates in a READ ONLY transaction (exact, including queued agents).
 * Output: JSON with each agent's proposed legacy name and the duplicate-wallet / duplicate-mint / duplicate-name
 * findings. Nothing is reassigned: duplicates stay with their recorded owners as `legacy` agents.
 */
import pg from "pg";
import { legacyName } from "../src/sim/identity.js";

interface LegacyAgent {
  id: string;
  name: string;
  ownerWallet: string;
  communityId: string;
  queued?: boolean;
}

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function fromApi(base: string): Promise<{ agents: LegacyAgent[]; alreadyUpgraded: boolean }> {
  let res: Response | null = null;
  for (let attempt = 1; !res; attempt++) {
    try {
      res = await fetch(new URL("/api/v1/world/agents", base));
    } catch (e) {
      if (attempt >= 4) throw e; // transient DNS/network failures: retry a few times
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  if (!res.ok) throw new Error(`GET /world/agents → ${res.status}`);
  const body = (await res.json()) as { agents: Array<LegacyAgent & { identity?: unknown }> };
  return { agents: body.agents.map(({ id, name, ownerWallet, communityId }) => ({ id, name, ownerWallet, communityId })), alreadyUpgraded: body.agents.some((a) => a.identity) };
}

async function fromDatabase(url: string): Promise<{ agents: LegacyAgent[]; alreadyUpgraded: boolean }> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const snap = (await client.query("SELECT tick, state FROM sim_snapshots ORDER BY tick DESC LIMIT 1")).rows[0];
    const state = snap ? (JSON.parse(snap.state) as { version: number; agentOrder: string[]; agents: Record<string, LegacyAgent> }) : null;
    const agents: LegacyAgent[] = state ? state.agentOrder.map((id) => state.agents[id]!).map(({ id, name, ownerWallet, communityId }) => ({ id, name, ownerWallet, communityId })) : [];
    // Creates logged after the snapshot, or still queued, are named after it, in log/queue order.
    const later = await client.query(
      `SELECT command FROM sim_commands WHERE tick >= $1 UNION ALL SELECT command FROM sim_command_inbox WHERE applied_seq IS NULL ORDER BY 1`,
      [snap ? Number(snap.tick) : 0],
    );
    const seen = new Set(agents.map((a) => a.id));
    for (const r of later.rows) {
      const c = JSON.parse(r.command) as { type: string; agentId: string; name: string; ownerWallet: string; communityId: string };
      if (c.type !== "agent.create" || seen.has(c.agentId)) continue;
      seen.add(c.agentId);
      agents.push({ id: c.agentId, name: c.name, ownerWallet: c.ownerWallet, communityId: c.communityId, queued: true });
    }
    await client.query("ROLLBACK");
    return { agents, alreadyUpgraded: state?.version === 2 };
  } finally {
    await client.end();
  }
}

const groups = <K extends keyof LegacyAgent>(agents: LegacyAgent[], key: K) => {
  const m = new Map<string, string[]>();
  for (const a of agents) m.set(String(a[key]), [...(m.get(String(a[key])) ?? []), a.id]);
  return Object.fromEntries([...m].filter(([, ids]) => ids.length > 1));
};

const api = arg("--api");
const database = arg("--database");
if (!api === !database) {
  console.error("usage: identity-audit (--api <base url> | --database <postgres url>)");
  process.exit(2);
}
const { agents, alreadyUpgraded } = api ? await fromApi(api) : await fromDatabase(database!);
const taken = new Set<string>();
const mapping = agents.map((a) => {
  const proposed = legacyName(a.id, taken);
  taken.add(proposed);
  return { ...a, proposedName: proposed, kind: "legacy" as const };
});

console.log(
  JSON.stringify(
    {
      source: api ? { api } : { database: database!.replace(/\/\/[^@/]*@/, "//***@") },
      alreadyUpgraded,
      agents: mapping.length,
      // Several agents per wallet / per token are kept as legacy with their recorded owners; never reassigned.
      duplicates: {
        walletsWithSeveralAgents: groups(agents, "ownerWallet"),
        communitiesWithSeveralAgents: groups(agents, "communityId"),
        repeatedFreeTextNames: groups(agents, "name"),
      },
      mapping,
    },
    null,
    2,
  ),
);
