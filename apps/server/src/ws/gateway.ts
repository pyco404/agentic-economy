import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { ClientMessage, WS_PROTOCOL_VERSION, type ChunkCoord, type ServerEvent } from "@agentic-economy/shared";
import type { AppContext } from "../context.js";
import { marketQuotes } from "../sim/view.js";

const HEARTBEAT_MS = 15_000;
const MAX_BUFFERED_BYTES = 2 * 1024 * 1024;
export const WS_PATH = "/api/v1/ws";

/**
 * WebSocket gateway (protocol v1, see contracts/events.md).
 * - On connect: `world.snapshot` (reason "join").
 * - `subscribe {chunks}` limits agent.moved / world.chunk.updated to visible chunks.
 * - `resume {lastSeq}` replays buffered events, or sends a fresh snapshot if the gap is too old.
 * - Heartbeat every 15 s; slow consumers are disconnected (code 1013) instead of buffering unboundedly.
 */
export function registerWebSocket(app: FastifyInstance, ctx: AppContext) {
  const { runtime } = ctx;
  const sockets = new Set<WebSocket>();

  const heartbeat = setInterval(() => {
    const env = { v: WS_PROTOCOL_VERSION, type: "system.heartbeat", seq: runtime.currentSeq, tick: runtime.engine.tick, ts: new Date().toISOString(), data: { simRunning: runtime.running } };
    const raw = JSON.stringify(env);
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
      send({
        v: WS_PROTOCOL_VERSION,
        type: "world.snapshot",
        seq: runtime.currentSeq,
        tick: runtime.engine.tick,
        ts: new Date().toISOString(),
        data: {
          mode: ctx.config.mode,
          worldId: runtime.layout.worldId,
          seed: runtime.layout.seed,
          reason,
          subscribedChunks: chunks === null ? null : [...chunks].map((k) => ({ cx: Number(k.split(",")[0]), cy: Number(k.split(",")[1]) })),
          agents: runtime.agentSummaries().filter((a) => visible(a.pos)),
          quotes: marketQuotes(runtime.engine.state),
          chunkVersions: runtime.chunkVersionList().filter((c) => chunks === null || chunks.has(key(c.coord))),
        },
      });
    };

    const unsubscribe = runtime.subscribe((e) => {
      const f = filter(e);
      if (f) send(f);
    });
    snapshot("join");

    socket.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = ClientMessage.parse(JSON.parse(String(raw)));
      } catch {
        send({ v: WS_PROTOCOL_VERSION, type: "system.notice", seq: runtime.currentSeq, tick: runtime.engine.tick, ts: new Date().toISOString(), data: { level: "warning", code: "bad_message", message: "unrecognised client message (expected subscribe | resume | ping, v=1)" } });
        return;
      }
      if (msg.type === "ping") send({ v: WS_PROTOCOL_VERSION, type: "pong", nonce: msg.nonce, ts: new Date().toISOString() });
      else if (msg.type === "subscribe") {
        chunks = msg.chunks === null ? null : new Set(msg.chunks.map(key));
        snapshot("subscription_changed");
      } else if (msg.type === "resume") {
        if (msg.lastSeq > runtime.currentSeq) return snapshot("server_restart");
        const missed = runtime.eventsSince(msg.lastSeq);
        if (missed === null) return snapshot("resume_gap");
        for (const e of missed) {
          const f = filter(e);
          if (f) send(f);
        }
      }
    });

    socket.on("close", () => {
      unsubscribe();
      sockets.delete(socket);
      ctx.wsStats.connections -= 1;
    });
  });
}
