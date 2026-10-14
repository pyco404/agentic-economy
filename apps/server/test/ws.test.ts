import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { ServerEvent } from "@agentic-economy/shared";
import { seedDemo } from "../src/demo-seed.js";
import { makeEnv, type TestEnv } from "./helpers.js";

let env: TestEnv;
let base: string;

beforeAll(async () => {
  env = await makeEnv();
  await seedDemo(env.ctx);
  await env.app.listen({ host: "127.0.0.1", port: 0 });
  const addr = env.app.server.address();
  base = `ws://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/api/v1/ws`;
});
afterAll(async () => env.close());

function connect() {
  const ws = new WebSocket(base);
  const inbox: Array<Record<string, unknown>> = [];
  const waiters: Array<() => void> = [];
  ws.on("message", (raw) => {
    inbox.push(JSON.parse(String(raw)));
    waiters.splice(0).forEach((w) => w());
  });
  const next = async (pred: (m: Record<string, unknown>) => boolean, timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = inbox.findIndex(pred);
      if (i >= 0) return inbox.splice(i, 1)[0]!;
      if (Date.now() > deadline) throw new Error("timeout waiting for message");
      await new Promise<void>((r) => {
        waiters.push(r);
        setTimeout(r, 50);
      });
    }
  };
  return { ws, inbox, next, open: new Promise((r) => ws.once("open", r)), send: (m: unknown) => ws.send(JSON.stringify(m)) };
}

describe("websocket gateway", () => {
  it("sends a snapshot on join and streams valid, sequenced events", async () => {
    const c = connect();
    await c.open;
    const snap = await c.next((m) => m.type === "world.snapshot");
    expect(ServerEvent.safeParse(snap).success).toBe(true);
    expect((snap.data as { reason: string }).reason).toBe("join");
    for (let i = 0; i < 12; i++) await env.ctx.runtime.tickOnce();
    const moved = await c.next((m) => m.type === "agent.moved");
    expect(ServerEvent.safeParse(moved).success).toBe(true);
    const seqs = c.inbox.filter((m) => m.type !== "pong").map((m) => m.seq as number);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]!).toBeGreaterThan(seqs[i - 1]!);
    c.ws.close();
  });

  it("filters agent movement by subscribed chunks", async () => {
    const c = connect();
    await c.open;
    await c.next((m) => m.type === "world.snapshot");
    c.send({ v: 1, type: "subscribe", chunks: [{ cx: 3, cy: 3 }] });
    const snap = await c.next((m) => m.type === "world.snapshot" && (m.data as { reason: string }).reason === "subscription_changed");
    expect((snap.data as { subscribedChunks: unknown[] }).subscribedChunks).toEqual([{ cx: 3, cy: 3 }]);
    for (let i = 0; i < 15; i++) await env.ctx.runtime.tickOnce();
    await new Promise((r) => setTimeout(r, 100));
    for (const m of c.inbox.filter((m) => m.type === "agent.moved"))
      for (const mv of (m.data as { moves: Array<{ pos: { x: number; y: number } }> }).moves) {
        expect(Math.floor(mv.pos.x / 32)).toBe(3);
        expect(Math.floor(mv.pos.y / 32)).toBe(3);
      }
    c.ws.close();
  });

  it("replays missed events on resume and answers pings", async () => {
    const c = connect();
    await c.open;
    const snap = await c.next((m) => m.type === "world.snapshot");
    const lastSeq = snap.seq as number;
    c.ws.close();
    for (let i = 0; i < 5; i++) await env.ctx.runtime.tickOnce();

    const c2 = connect();
    await c2.open;
    await c2.next((m) => m.type === "world.snapshot");
    c2.send({ v: 1, type: "resume", lastSeq });
    const replayed = await c2.next((m) => typeof m.seq === "number" && (m.seq as number) === lastSeq + 1);
    expect(replayed).toBeDefined();
    c2.send({ v: 1, type: "ping", nonce: "abc" });
    expect((await c2.next((m) => m.type === "pong")).nonce).toBe("abc");
    c2.send({ v: 1, type: "resume", lastSeq: 10 ** 9 });
    expect(((await c2.next((m) => m.type === "world.snapshot")).data as { reason: string }).reason).toBe("server_restart");
    c2.send("not json");
    expect(((await c2.next((m) => m.type === "system.notice")).data as { code: string }).code).toBe("bad_message");
    c2.ws.close();
  });

  it("emits community.updated when a community's agents do verified work", async () => {
    const c = connect();
    await c.open;
    await c.next((m) => m.type === "world.snapshot");
    for (let i = 0; i < 120 && !c.inbox.some((m) => m.type === "community.updated"); i++) await env.ctx.runtime.tickOnce();
    const ev = await c.next((m) => m.type === "community.updated");
    expect(ServerEvent.safeParse(ev).success).toBe(true);
    c.ws.close();
  });
});
