import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { ClientMessage, WS_PROTOCOL_VERSION, type ChunkCoord, type ServerEvent } from "@agentic-economy/shared";
import type { AppContext } from "../context.js";
import { marketQuotes } from "../sim/view.js";

const HEARTBEAT_MS = 15_000;
const MAX_BUFFERED_BYTES = 2 * 1024 * 1024;
export const WS_PATH = "/api/v1/ws";

/**
 * WebSocket gateway (protocol v1, see contracts/events.md). Events come from the durable stream via the
 * EventHub, so `resume` works across API restarts and between API replicas (seq is global in Postgres).
 * - On connect: `world.snapshot` (reason "join").
 * - `subscribe {chunks}` limits agent.moved / world.chunk.updated to visible chunks.
 * - `resume {lastSeq}` replays from the durable stream, or sends a fresh snapshot if the gap was pruned.
 * - Heartbeat every 15 s; slow consumers are disconnected (code 1013) instead of buffering unboundedly.
 */
export function registerWebSocket(app: FastifyInstance, ctx: AppContext) {
  const { runtime } = ctx;
  const hub = runtime.hub!;
  const sockets = new Set<WebSocket>();
  let simRunning = false;

  const heartbeat = setInterval(async () => {
    const st = await ctx.coord.simStatus().catch(() => null);
    simRunning = Boolean(st?.heartbeatAt && Date.now() - new Date(st.heartbeatAt).getTime() < 10_000);
    const raw = JSON.stringify({ v: WS_PROTOCOL_VERSION, type: "system.heartbeat", seq: hub.currentSeq, tick: runtime.tick, ts: new Date().toISOString(), data: { simRunning } });
    for (const s of sockets) if (s.readyState === s.OPEN) s.send(raw);
  }, HEARTBEAT_MS);
  heartbeat.unref();
  app.addHook("onClose", async () => {
    clearInterval(heartbeat);
    for (const s of sockets) s.close(1001, "server shutting down");
  });

  app.get(WS_PATH, { websocket: true }, (socket: WebSocket) => {
    sockets.add(socket);
    ctx.wsStats.connections += 1;
    let chunks: Set<string> | null = null;
    const key = (c: ChunkCoord) => `${c.cx},${c.cy}`;
    const visible = (pos: { x: number; y: number }) => chunks === null || chunks.has(key(runtime.chunkOf(pos)));

    const send = (msg: unknown) => {
      if (socket.readyState !== socket.OPEN) return;
      if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
        socket.close(1013, "client too slow; reconnect and resume");
        return;
      }
      socket.send(JSON.stringify(msg));
    };
    const notice = (code: string, message: string, level: "info" | "warning" | "incident" = "warning") =>
      send({ v: WS_PROTOCOL_VERSION, type: "system.notice", seq: hub.currentSeq, tick: runtime.tick, ts: new Date().toISOString(), data: { level, code, message } });

    const filter = (e: ServerEvent): ServerEvent | null => {
      if (chunks === null) return e;
      if (e.type === "agent.moved") {
        const moves = e.data.moves.filter((m) => visible(m.pos));
        return moves.length ? { ...e, data: { moves } } : null;
      }
      if (e.type === "world.chunk.updated") return chunks.has(key(e.data.chunk.coord)) ? e : null;
      return e;
    };

    const snapshot = (reason: "join" | "resume_gap" | "subscription_changed" | "server_restart") => {
      if (!runtime.reader.available) return notice("state_unavailable", "simulation state is not available yet; retry shortly");
      send({
        v: WS_PROTOCOL_VERSION,
        type: "world.snapshot",
        seq: hub.currentSeq,
        tick: runtime.tick,
        ts: new Date().toISOString(),
        data: {
          mode: ctx.config.mode,
          worldId: runtime.layout.worldId,
          seed: runtime.layout.seed,
          reason,
          subscribedChunks: chunks === null ? null : [...chunks].map((k) => ({ cx: Number(k.split(",")[0]), cy: Number(k.split(",")[1]) })),
          agents: runtime.agentSummaries().filter((a) => visible(a.pos)),
          quotes: marketQuotes(runtime.state),
          chunkVersions: runtime.chunkVersionList().filter((c) => chunks === null || chunks.has(key(c.coord))),
        },
      });
    };

    // While a resume replay is in flight, buffer live events so ordering is preserved.
    let replaying: ServerEvent[] | null = null;
    const unsubscribe = hub.subscribe((e) => {
      if (replaying) return void replaying.push(e);
      const f = filter(e);
      if (f) send(f);
    });
    snapshot("join");

    socket.on("message", async (raw) => {
      let msg: ClientMessage;
      try {
        msg = ClientMessage.parse(JSON.parse(String(raw)));
      } catch {
        return notice("bad_message", "unrecognised client message (expected subscribe | resume | ping, v=1)");
      }
      if (msg.type === "ping") return send({ v: WS_PROTOCOL_VERSION, type: "pong", nonce: msg.nonce, ts: new Date().toISOString() });
      if (msg.type === "subscribe") {
        chunks = msg.chunks === null ? null : new Set(msg.chunks.map(key));
        return snapshot("subscription_changed");
      }
      // resume
      replaying = [];
      try {
        const missed = await hub.since(msg.lastSeq);
        if (missed === "ahead") snapshot("server_restart");
        else if (missed === "gap") snapshot("resume_gap");
        else {
          let last = msg.lastSeq;
          for (const e of missed) {
            last = e.seq;
            const f = filter(e);
            if (f) send(f);
          }
          for (const e of replaying.filter((x) => x.seq > last)) {
            const f = filter(e);
            if (f) send(f);
          }
        }
      } catch {
        snapshot("resume_gap");
      } finally {
        replaying = null;
      }
    });

    socket.on("close", () => {
      unsubscribe();
      sockets.delete(socket);
      ctx.wsStats.connections -= 1;
    });
  });
}
