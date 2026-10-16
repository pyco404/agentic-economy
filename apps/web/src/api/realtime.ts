import { PongMessage, ServerEvent, type ChunkCoord } from "./shared";
export type StreamStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline";
const knownTypes = new Set(
  ServerEvent.options.map((event) => event.shape.type.value),
);
export class WorldStream {
  private socket: WebSocket | null = null;
  private lastSeq = 0;
  private attempts = 0;
  private stopped = false;
  private lastSeen = Date.now();
  private retry: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private chunks: ChunkCoord[] | null = null;
  private joined = false;
  private replayTarget: number | null = null;
  private resumeCursor = 0;
  private replayed = 0;
  constructor(
    private url: string,
    private onEvent: (event: ServerEvent) => void,
    private onStatus: (status: StreamStatus) => void,
    private onRecovery: () => void,
  ) {}
  get sequence() {
    return this.lastSeq;
  }
  get replayCount() {
    return this.replayed;
  }
  connect() {
    if (this.stopped) return;
    this.joined = false;
    this.resumeCursor = this.lastSeq;
    this.replayTarget = null;
    this.onStatus(this.lastSeq ? "reconnecting" : "connecting");
    const socket = new WebSocket(this.url);
    this.socket = socket;
    const sendSubscription = () =>
      socket.send(
        JSON.stringify({ v: 1, type: "subscribe", chunks: this.chunks }),
      );
    socket.onopen = () => {
      this.lastSeen = Date.now();
      // Wait for the server's mandatory join snapshot before choosing resume vs initial subscribe.
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastSeen >= 45000) {
          socket.close();
          return;
        }
        if (socket.readyState === WebSocket.OPEN)
          socket.send(
            JSON.stringify({ v: 1, type: "ping", nonce: String(Date.now()) }),
          );
      }, 15000);
    };
    socket.onmessage = (message) => {
      if (this.stopped || this.socket !== socket) return;
      let raw: unknown;
      try {
        raw = JSON.parse(String(message.data));
      } catch {
        this.onRecovery();
        return;
      }
      if (PongMessage.safeParse(raw).success) {
        this.lastSeen = Date.now();
        return;
      }
      if (
        typeof raw === "object" &&
        raw &&
        "v" in raw &&
        raw.v === 1 &&
        "type" in raw &&
        typeof raw.type === "string" &&
        !knownTypes.has(raw.type as ServerEvent["type"])
      ) {
        this.lastSeen = Date.now();
        return;
      }
      const parsed = ServerEvent.safeParse(raw);
      if (!parsed.success) {
        this.onRecovery();
        return;
      }
      this.lastSeen = Date.now();
      const event = parsed.data;
      if (event.type === "system.heartbeat" || event.type === "system.notice") {
        this.onEvent(event);
        if (
          event.type === "system.notice" &&
          event.data.code === "state_unavailable"
        )
          this.onRecovery();
        return; // Control messages are not durable events and do not advance the replay cursor.
      }
      if (event.type === "world.snapshot") {
        if (event.data.reason === "join") {
          this.joined = true;
          this.attempts = 0;
          this.onEvent(event);
          if (this.resumeCursor > 0) {
            this.replayTarget = event.seq;
            socket.send(
              JSON.stringify({
                v: 1,
                type: "resume",
                lastSeq: this.resumeCursor,
              }),
            );
            if (this.resumeCursor === event.seq) {
              this.replayTarget = null;
              sendSubscription();
              this.onStatus("connected");
            }
          } else {
            this.lastSeq = event.seq;
            sendSubscription();
            this.onStatus("connected");
          }
        } else if (
          event.data.reason === "resume_gap" ||
          event.data.reason === "server_restart"
        ) {
          this.lastSeq = event.seq;
          this.replayTarget = null;
          this.onEvent(event);
          this.onRecovery();
          sendSubscription();
          this.onStatus("connected");
        } else {
          this.onEvent(event);
          if (this.replayTarget === null)
            this.lastSeq = Math.max(this.lastSeq, event.seq);
        }
        return;
      }
      if (event.seq <= this.lastSeq) return;
      if (this.replayTarget !== null && event.seq <= this.replayTarget)
        this.replayed++;
      this.lastSeq = event.seq;
      this.onEvent(event);
      if (this.replayTarget !== null && event.seq >= this.replayTarget) {
        this.replayTarget = null;
        sendSubscription();
        this.onStatus("connected");
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      clearInterval(this.heartbeat);
      if (this.stopped || this.socket !== socket) return;
      this.joined = false;
      this.onStatus("reconnecting");
      this.retry = setTimeout(
        () => this.connect(),
        Math.min(30000, 1000 * 2 ** this.attempts++) + Math.random() * 300,
      );
    };
  }
  subscribe(chunks: ChunkCoord[] | null) {
    const next =
      chunks?.slice(0, 64).sort((a, b) => a.cx - b.cx || a.cy - b.cy) ?? null;
    if (JSON.stringify(next) === JSON.stringify(this.chunks)) return;
    this.chunks = next;
    if (
      this.joined &&
      this.replayTarget === null &&
      this.socket?.readyState === WebSocket.OPEN
    )
      this.socket.send(
        JSON.stringify({ v: 1, type: "subscribe", chunks: this.chunks }),
      );
  }
  dispose() {
    this.stopped = true;
    clearTimeout(this.retry);
    clearInterval(this.heartbeat);
    this.socket?.close();
    this.onStatus("offline");
  }
}
