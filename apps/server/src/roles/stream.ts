import { WS_PROTOCOL_VERSION, type ServerEventOf, type ServerEventType } from "@agentic-economy/shared";
import type { Coordinator, StreamDraft } from "../coord/types.js";

/**
 * Build a durable stream record. `key` must be deterministic for the producer so that retries,
 * re-runs after failover and re-indexing never create duplicate stream entries.
 * The stored payload is the envelope without `seq` (assigned by the database).
 */
export function streamDraft<T extends ServerEventType>(key: string, type: T, tick: number, data: ServerEventOf<T>["data"] | Record<string, unknown>): StreamDraft {
  return { key, type, tick, payload: JSON.stringify({ v: WS_PROTOCOL_VERSION, type, tick, ts: new Date().toISOString(), data }) };
}

/** Publish from non-simulation producers (API, indexer). Delivery to WebSocket clients happens via the hub. */
export function publishDurable<T extends ServerEventType>(coord: Coordinator, key: string, type: T, tick: number, data: ServerEventOf<T>["data"]) {
  return coord.appendStream([streamDraft(key, type, tick, data)]);
}
