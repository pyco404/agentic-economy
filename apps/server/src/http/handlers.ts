import type { RouteName } from "@agentic-economy/shared";
import type { AppContext } from "../context.js";
import { economySummary, marketQuotes, toTask, worldStats } from "../sim/view.js";
import { decodeCursor, encodeCursor } from "../store/types.js";
import { AppError } from "../util/errors.js";
import type { Handler } from "./app.js";

type Register = <N extends RouteName>(name: N, handler: Handler<N>) => void;

/** Offset pagination over in-memory simulation lists (stable within a tick). */
function pageArray<T>(items: T[], cursor: string | undefined, limit: number) {
  const start = decodeCursor(cursor ?? null) ?? 0;
  const slice = items.slice(start, start + limit);
  return { items: slice, nextCursor: start + limit < items.length ? encodeCursor(start + limit) : null };
}

export function registerHandlers(ctx: AppContext, register: Register) {
  const { runtime, config } = ctx;
  const mode = config.mode;
  const state = () => runtime.state;

  /* ---------------- world ---------------- */

  register("worldBootstrap", async () => runtime.bootstrap());

  register("worldChunks", async ({ query }) => {
    const chunks = [];
    for (let cy = query.y - query.radius; cy <= query.y + query.radius; cy++)
      for (let cx = query.x - query.radius; cx <= query.x + query.radius; cx++) {
        const c = runtime.chunk({ cx, cy });
        if (c) chunks.push(c);
      }
    return { mode, chunks };
  });

  register("worldStats", async () => worldStats(mode, state()));
  register("worldAgents", async () => ({ mode, tick: runtime.tick, agents: runtime.agentSummaries() }));

  /* ---------------- economy ---------------- */

  register("activities", async ({ query }) => ({ mode, ...(await ctx.store.listEvents(query.cursor ?? null, query.limit)) }));

  register("markets", async () => {
    const s = state();
    const listings = s.buildingOrder.flatMap((id) => {
      const b = s.buildings[id]!;
      if (b.kind !== "market" && b.kind !== "bakery" && b.kind !== "mill" && b.kind !== "warehouse") return [];
      return Object.entries(b.stock)
        .map(([r, lots]) => ({ resource: r as keyof typeof s.market, qty: lots!.reduce((n, l) => n + l.qty, 0) }))
        .filter((x) => x.qty > 0)
        .map((x) => ({ buildingId: b.id, resource: x.resource, side: "sell" as const, quantity: x.qty, price: s.market[x.resource].price }));
    });
    return { mode, tick: s.tick, currency: "CITY_CREDIT_MILLI" as const, quotes: marketQuotes(s), listings };
  });

  register("economySummary", async () => economySummary(mode, state()));

  register("tasks", async ({ query }) => {
    const tasks = Object.values(state().tasks)
      .filter((t) => !query.status || t.status === query.status)
      .sort((a, b) => (a.id < b.id ? 1 : -1))
      .map(toTask);
    return { mode, ...pageArray(tasks, query.cursor, query.limit) };
  });

  register("receipts", async ({ query }) => ({ mode, ...(await ctx.store.listReceipts(query.cursor ?? null, query.limit)) }));
  register("rewards", async ({ query }) => ({ mode, ...(await ctx.store.listRewards(query.cursor ?? null, query.limit)) }));

  /* ---------------- communities ---------------- */

  register("communities", async ({ query }) => {
    const page = await ctx.store.listCommunities(query.cursor ?? null, query.limit);
    return { mode, items: page.items.map((c) => ctx.communities.decorate(c)), nextCursor: page.nextCursor };
  });
  register("community", async ({ params }) => ({ mode, community: await ctx.communities.get(params.id) }));
  register("communityAgents", async ({ params, query }) => {
    await ctx.communities.get(params.id);
    return { mode, ...pageArray(runtime.agentSummaries().filter((a) => a.communityId === params.id), query.cursor, query.limit) };
  });
  register("communityEligibility", async ({ params, wallet }) => ctx.eligibility.check(wallet, params.id));

  /* ---------------- agents ---------------- */

  register("agent", async ({ params }) => ({ mode, agent: ctx.agents.get(params.id) }));
  // createAgent (POST /agents) is retired: http/app.ts answers 410 for it.
  register("activateAgent", async ({ body, wallet, idempotencyKey }) => ({ mode, ...(await ctx.agents.activate(wallet, body, idempotencyKey!)) }));
  register("createHouseAgent", async ({ body, wallet, idempotencyKey }) => ({ mode, agent: await ctx.agents.createHouse(wallet, body, idempotencyKey!) }));
  register("myActivation", async ({ wallet }) => ({ mode, ...(await ctx.agents.myActivation(wallet)) }));
  register("patchAgent", async ({ params, body, wallet, idempotencyKey }) => ({ mode, agent: await ctx.agents.update(wallet, params.id, body, idempotencyKey) }));
  register("agentActivity", async ({ params, query }) => {
    ctx.agents.get(params.id);
    return { mode, ...(await ctx.store.listAgentActions(params.id, query.cursor ?? null, query.limit)) };
  });

  /* ---------------- treasury ---------------- */

  const launchCount = async () => (await ctx.store.allTreasuryEntries()).filter((e) => e.stream === "launch_fee" && e.supersedes === null).length;
  register("treasury", async () => ctx.treasury.summary(await launchCount()));
  register("treasurySummary", async () => ctx.treasury.summary(await launchCount()));
  register("treasuryEntries", async ({ query }) => ({ mode, ...(await ctx.store.listTreasuryEntries(query.cursor ?? null, query.limit)) }));

  /* ---------------- auth ---------------- */

  register("authChallenge", async ({ body, req }) => ctx.auth.challenge(body.wallet, req.headers.origin));
  register("authVerify", async ({ body, req }) => ctx.auth.verify(body.wallet, body.nonce, body.signature, req.headers.origin));
  register("authSession", async ({ wallet, sessionExpiresAt }) => ({ wallet, sessionExpiresAt }));

  /* ---------------- launches ---------------- */

  register("prepareLaunch", async ({ body, wallet }) => ctx.launches.prepare(wallet, body.draft));
  register("confirmLaunch", async ({ body, wallet }) => ({ launch: await ctx.launches.confirm(wallet, body.launchId, body.signature) }));
  register("launch", async ({ params }) => {
    const launch=await ctx.launches.get(params.id);
    if(launch.execution&&launch.status!=="confirmed")throw new AppError("not_found","Unconfirmed preparations are available only through the authenticated launch workspace");
    return {launch};
  });

  register("demoSignLaunch", async ({ params, body, wallet }) => {
    if (mode !== "demo") throw new AppError("not_found", "demo only");
    const signature = await ctx.launches.demoSign(wallet, params.id, body.outcome);
    return { signature, note: "DEMO MODE: simulated signature on the mock chain. Now call POST /api/v1/launches/confirm with it." };
  });
}
