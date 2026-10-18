import { useCallback, useEffect, useRef, useState } from "react";
import {
  HttpAdapter,
  illustrativeActivity,
  type ApiAdapter,
  type Dashboard,
} from "./adapter";
import { applyServerEvent, mergeDashboard } from "./state";
import { WorldStream, type StreamStatus } from "./realtime";
export function useWorld(api: ApiAdapter, paused: boolean) {
  const [data, setData] = useState<Dashboard | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [status, setStatus] = useState<StreamStatus>("offline"),
    [notice, setNotice] = useState(""),
    [diagnostics, setDiagnostics] = useState({ sequence: 0, replayed: 0 });
  const state = useRef(data);
  state.current = data;
  const stream = useRef<WorldStream | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const incoming = await api.load(signal);
        if (signal?.aborted) return;
        setData((d) => mergeDashboard(d, incoming));
        setError("");
      } catch (e) {
        if (!signal?.aborted)
          setError(e instanceof Error ? e.message : "Backend unavailable");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [api],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const ready = !!data;
  useEffect(() => {
    if (!(api instanceof HttpAdapter) || !ready) return;
    const controller = new AbortController(),
      pendingChunks = new Set<string>();
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    const recovery = () => {
      clearTimeout(recoveryTimer);
      recoveryTimer = setTimeout(() => void load(controller.signal), 500);
    };
    const ws = new WorldStream(
      import.meta.env.VITE_WS_URL ?? api.webSocketUrl,
      (event) => {
        if (controller.signal.aborted) return;
        if (event.type === "system.notice") setNotice(event.data.message);
        if (event.type === "system.heartbeat")
          setNotice(
            event.data.simRunning
              ? ""
              : "Simulation paused; displaying the last published state.",
          );
        setData((d) => (d ? applyServerEvent(d, event) : d));
        setDiagnostics({ sequence: ws.sequence, replayed: ws.replayCount });
        if (event.type === "world.snapshot") {
          const mismatch = event.data.chunkVersions
            .filter(
              (v) =>
                !state.current?.worldChunks?.some(
                  (c) =>
                    c.coord.cx === v.coord.cx &&
                    c.coord.cy === v.coord.cy &&
                    c.version === v.version,
                ),
            )
            .filter((v) => !pendingChunks.has(`${v.coord.cx}:${v.coord.cy}`));
          mismatch.forEach((v) =>
            pendingChunks.add(`${v.coord.cx}:${v.coord.cy}`),
          );
          if (mismatch.length)
            void api
              .getChunks(
                mismatch.map((v) => v.coord),
                controller.signal,
              )
              .then((chunks) => {
                if (controller.signal.aborted) return;
                setData((d) =>
                  chunks.reduce(
                    (result, chunk) =>
                      result
                        ? applyServerEvent(result, {
                            v: 1,
                            type: "world.chunk.updated",
                            seq: event.seq,
                            tick: event.tick,
                            ts: event.ts,
                            data: { chunk },
                          })
                        : result,
                    d,
                  ),
                );
              })
              .catch((e) => {
                if (!controller.signal.aborted) setError(String(e));
              })
              .finally(() =>
                mismatch.forEach((v) =>
                  pendingChunks.delete(`${v.coord.cx}:${v.coord.cy}`),
                ),
              );
        }
        if (
          event.type === "treasury.updated" ||
          (event.type === "activity.created" &&
            ["agent.activated", "agent.paused", "agent.resumed"].includes(
              event.data.event.type,
            ))
        )
          recovery();
      },
      (next) => {
        setStatus(next);
        setDiagnostics({ sequence: ws.sequence, replayed: ws.replayCount });
      },
      recovery,
    );
    stream.current = ws;
    ws.connect();
    let polling = false;
    const summaryTimer = setInterval(() => {
      if (polling) return;
      polling = true;
      void api
        .refreshSummary(controller.signal)
        .then((summary) => {
          if (controller.signal.aborted) return;
          setData((d) =>
            d
              ? {
                  ...d,
                  stats:
                    summary.stats.tick >= d.stats.tick
                      ? summary.stats
                      : d.stats,
                  tasks: summary.tasks,
                  receipts: summary.receipts,
                  agents: summary.agents.map((a) => (d.agentTicks?.[a.id] ?? 0) > summary.agentTick ? d.agents.find((prior) => prior.id === a.id) ?? a : a),
                  agentTicks: Object.fromEntries(summary.agents.map((a) => [a.id, Math.max(d.agentTicks?.[a.id] ?? 0, summary.agentTick)])),
                }
              : d,
          );
          setError("");
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(String(e));
        })
        .finally(() => (polling = false));
    }, 3000);
    const syncTimer = setInterval(() => void load(controller.signal), 20000);
    return () => {
      controller.abort();
      clearInterval(summaryTimer);
      clearInterval(syncTimer);
      clearTimeout(recoveryTimer);
      ws.dispose();
      stream.current = null;
    };
  }, [api, ready, load]);
  useEffect(() => {
    if (api.kind !== "demo" || paused) return;
    let seq = 100;
    const timer = setInterval(
      () =>
        setData((d) =>
          d
            ? {
                ...d,
                activities: [
                  illustrativeActivity(seq++),
                  ...d.activities,
                ].slice(0, 16),
              }
            : d,
        ),
      7000,
    );
    return () => clearInterval(timer);
  }, [api, paused]);
  const subscribe = useCallback(
    (coords: { cx: number; cy: number }[]) => {
      stream.current?.subscribe(coords);
      if (!(api instanceof HttpAdapter)) return;
      const missing = coords.filter(
        (coord) =>
          !state.current?.worldChunks?.some(
            (chunk) =>
              chunk.coord.cx === coord.cx && chunk.coord.cy === coord.cy,
          ),
      );
      if (missing.length)
        void api
          .getChunks(missing)
          .then((chunks) =>
            setData((d) =>
              chunks.reduce(
                (result, chunk) =>
                  result
                    ? applyServerEvent(result, {
                        v: 1,
                        type: "world.chunk.updated",
                        seq: stream.current?.sequence ?? 0,
                        tick: result.stats.tick,
                        ts: new Date().toISOString(),
                        data: { chunk },
                      })
                    : result,
                d,
              ),
            ),
          )
          .catch((e) => setError(String(e)));
    },
    [api],
  );

  return {
    data,
    error,
    loading,
    status,
    notice,
    diagnostics,
    subscribe,
    refresh: () => void load(),
  };
}
