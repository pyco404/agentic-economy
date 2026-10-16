import { describe, it, expect, vi, afterEach } from "vitest";
import { WorldStream } from "./realtime";
class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 1;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((data: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.onopen?.();
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}
const snapshot = (seq: number, reason = "join") => ({
  v: 1,
  type: "world.snapshot",
  seq,
  tick: 100,
  ts: new Date().toISOString(),
  data: {
    mode: "demo",
    worldId: "genesis",
    seed: "42",
    reason,
    subscribedChunks: null,
    agents: [],
    quotes: [],
    chunkVersions: [],
  },
});
const event = (seq: number) => ({
  v: 1,
  type: "activity.created",
  seq,
  tick: 100,
  ts: new Date().toISOString(),
  data: {
    event: {
      id: `evt_demo${String(seq).padStart(4, "0")}`,
      seq,
      tick: 100,
      at: new Date().toISOString(),
      type: "production.completed",
      summary: "Test production",
      agentId: null,
      buildingId: null,
      communityId: null,
      data: {},
    },
  },
});
function setup() {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  const onEvent = vi.fn(),
    status = vi.fn(),
    recovery = vi.fn();
  const stream = new WorldStream(
    "ws://localhost/api/v1/ws",
    onEvent,
    status,
    recovery,
  );
  stream.connect();
  const socket = FakeSocket.instances[0]!;
  socket.open();
  socket.message(snapshot(1));
  onEvent.mockClear();
  return { stream, socket, onEvent, status, recovery };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("durable WebSocket lifecycle", () => {
  it("deduplicates durable events and accepts subscription-filtered sequence gaps", () => {
    const { stream, socket, onEvent, recovery } = setup();
    socket.message(event(10));
    socket.message(event(10));
    socket.message(event(20));
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(recovery).not.toHaveBeenCalled();
    stream.dispose();
  });
  it("does not skip replay when reconnect join is ahead of the saved cursor", () => {
    const { stream, socket, onEvent } = setup();
    stream.subscribe([{ cx: 1, cy: 2 }]);
    socket.message(event(15));
    socket.close();
    vi.advanceTimersByTime(1400);
    const next = FakeSocket.instances[1]!;
    next.open();
    next.message(snapshot(30));
    expect(stream.sequence).toBe(15);
    expect(next.sent.map((s) => JSON.parse(s))).toContainEqual({
      v: 1,
      type: "resume",
      lastSeq: 15,
    });
    expect(next.sent.some((s) => JSON.parse(s).type === "subscribe")).toBe(
      false,
    );
    next.message(event(18));
    next.message(event(30));
    expect(stream.sequence).toBe(30);
    expect(stream.replayCount).toBe(2);
    expect(
      onEvent.mock.calls.filter((c) => c[0].type === "activity.created"),
    ).toHaveLength(3);
    expect(next.sent.map((s) => JSON.parse(s))).toContainEqual({
      v: 1,
      type: "subscribe",
      chunks: [{ cx: 1, cy: 2 }],
    });
    stream.dispose();
  });
  it("control notices at the current seq remain visible, and unknown additive events are ignored", () => {
    const { stream, socket, onEvent, recovery } = setup();
    socket.message(event(20));
    socket.message({
      v: 1,
      type: "system.notice",
      seq: 20,
      tick: 100,
      ts: new Date().toISOString(),
      data: { level: "warning", code: "state_unavailable", message: "Retry" },
    });
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(recovery).toHaveBeenCalledOnce();
    socket.message({ v: 1, type: "new.additive_type", seq: 25 });
    expect(recovery).toHaveBeenCalledOnce();
    expect(stream.sequence).toBe(20);
    stream.dispose();
  });
  it("resets the cursor on database reset and requests snapshot recovery", () => {
    const { stream, socket, recovery } = setup();
    socket.message(event(20));
    socket.message(snapshot(4, "server_restart"));
    expect(stream.sequence).toBe(4);
    expect(recovery).toHaveBeenCalledOnce();
    stream.dispose();
  });
  it("recovers malformed envelopes, drops silent connections and disposes timers", () => {
    const { stream, socket, recovery } = setup();
    socket.message({ untrusted: true });
    expect(recovery).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(45000);
    expect(socket.readyState).toBe(3);
    stream.dispose();
    vi.advanceTimersByTime(120000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
