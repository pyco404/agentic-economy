import type { Dashboard } from "./adapter";
import { worldChunkToVisual } from "./adapter";
import type { ServerEvent } from "./shared";
export interface CityActivity {
  id: string;
  buildingId: string;
  kind: "production" | "delivery" | "construction" | "maintenance";
  receivedAt: number;
  tick: number;
}
const uniqueById = <T extends { id: string }>(items: T[]) => [
  ...new Map(items.map((item) => [item.id, item])).values(),
];
export function mergeDashboard(
  current: Dashboard | null,
  incoming: Dashboard,
): Dashboard {
  if (!current || current.bootstrap.worldId !== incoming.bootstrap.worldId)
    return incoming;
  const agents = incoming.agents.map((a) => {
    const existing = current.agents.find((e) => e.id === a.id);
    return existing &&
      (current.agentTicks?.[a.id] ?? 0) >
        (incoming.agentTicks?.[a.id] ?? incoming.stats.tick)
      ? { ...a, pos: existing.pos, state: existing.state }
      : a;
  });
  const byCoord = new Map(
    (incoming.worldChunks ?? []).map((c) => [`${c.coord.cx}:${c.coord.cy}`, c]),
  );
  for (const chunk of current.worldChunks ?? []) {
    const key = `${chunk.coord.cx}:${chunk.coord.cy}`,
      prior = byCoord.get(key);
    if (!prior || chunk.version > prior.version) byCoord.set(key, chunk);
  }
  return {
    ...incoming,
    stats:
      incoming.stats.tick >= current.stats.tick
        ? incoming.stats
        : current.stats,
    agents,
    agentTicks: { ...incoming.agentTicks, ...current.agentTicks },
    worldChunks: [...byCoord.values()],
    chunks: incoming.chunks
      ? [...byCoord.values()].map(worldChunkToVisual)
      : undefined,
    activities: uniqueById([...current.activities, ...incoming.activities])
      .sort((a, b) => b.seq - a.seq)
      .slice(0, 50),
    actions: current.actions,
    cityActivity: current.cityActivity,
    streamTick: Math.max(current.streamTick ?? 0, incoming.stats.tick),
  };
}
export function applyServerEvent(
  data: Dashboard,
  event: ServerEvent,
  receivedAt = Date.now(),
): Dashboard {
  if (
    event.type === "world.snapshot" &&
    event.data.reason === "server_restart"
  ) {
    // A database reset can reuse the world seed while lowering both tick and chunk versions.
    data = {
      ...data,
      worldChunks: [],
      chunks: [],
      agentTicks: {},
      streamTick: 0,
      stats: { ...data.stats, tick: 0 },
      markets: { ...data.markets, tick: 0 },
      activities: [],
      actions: [],
      cityActivity: [],
    };
  }
  let next: Dashboard = {
    ...data,
    streamTick: Math.max(data.streamTick ?? 0, event.tick),
  };
  switch (event.type) {
    case "world.snapshot": {
      const ticks = { ...data.agentTicks };
      const map = new Map(data.agents.map((a) => [a.id, a]));
      if (event.data.subscribedChunks === null) map.clear();
      for (const agent of event.data.agents) {
        map.set(agent.id, agent);
        ticks[agent.id] = event.tick;
      }
      next = {
        ...next,
        agents: [...map.values()],
        bootstrap: {
          ...data.bootstrap,
          worldId: event.data.worldId,
          seed: event.data.seed,
        },
        agentTicks: ticks,
        markets: {
          ...data.markets,
          tick: event.tick,
          quotes: event.data.quotes,
        },
      };
      break;
    }
    case "agent.moved": {
      const ticks = { ...data.agentTicks };
      const moves = new Map(event.data.moves.map((m) => [m.id, m]));
      next = {
        ...next,
        agents: data.agents.map((a) => {
          const move = moves.get(a.id);
          if (!move || event.tick < (ticks[a.id] ?? 0)) return a;
          ticks[a.id] = event.tick;
          return {
            ...a,
            pos: move.pos,
            state: move.state,
            status: move.state === "paused" ? "paused" : "active",
          };
        }),
        agentTicks: ticks,
      };
      break;
    }
    case "world.chunk.updated": {
      const chunk = event.data.chunk,
        key = `${chunk.coord.cx}:${chunk.coord.cy}`;
      const previous = data.worldChunks?.find(
        (c) => `${c.coord.cx}:${c.coord.cy}` === key,
      );
      if (previous && previous.version > chunk.version) break;
      const worldChunks = [
        ...(data.worldChunks ?? []).filter(
          (c) => `${c.coord.cx}:${c.coord.cy}` !== key,
        ),
        chunk,
      ];
      next = {
        ...next,
        worldChunks,
        chunks: worldChunks.map(worldChunkToVisual),
      };
      break;
    }
    case "economy.price_updated":
      if (event.tick >= data.markets.tick)
        next = {
          ...next,
          markets: {
            ...data.markets,
            tick: event.tick,
            quotes: event.data.quotes,
          },
        };
      break;
    case "agent.action":
      next = {
        ...next,
        actions: uniqueById([event.data.action, ...(data.actions ?? [])]).slice(
          0,
          100,
        ),
      };
      break;
    case "activity.created": {
      const activity = event.data.event,
        duplicate = data.activities.some((a) => a.id === activity.id);
      next = {
        ...next,
        activities: uniqueById([activity, ...data.activities])
          .sort((a, b) => b.seq - a.seq)
          .slice(0, 50),
      };
      const kind: CityActivity["kind"] | null =
        activity.type === "production.completed"
          ? "production"
          : activity.type === "building.placed"
            ? "construction"
            : activity.type === "maintenance.completed"
              ? "maintenance"
              : activity.type === "task.verified"
                ? "delivery"
                : null;
      if (
        kind &&
        activity.buildingId &&
        !duplicate &&
        Date.now() - Date.parse(activity.at) < 15000
      )
        next.cityActivity = [
          {
            id: activity.id,
            buildingId: activity.buildingId,
            kind,
            tick: activity.tick,
            receivedAt,
          },
          ...(data.cityActivity ?? []),
        ].slice(0, 64);
      break;
    }
    case "community.updated":
      next = {
        ...next,
        communities: uniqueById([...data.communities, event.data.community]),
      };
      break;
    case "treasury.updated":
      next = {
        ...next,
        treasury: {
          ...data.treasury,
          recentEntries: uniqueById([
            event.data.entry,
            ...data.treasury.recentEntries,
          ])
            .sort((a, b) => b.seq - a.seq)
            .slice(0, 20),
        },
      };
      break;
  }
  return next;
}
