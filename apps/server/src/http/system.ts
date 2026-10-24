import { CONTRACT_VERSION, type routes } from "@agentic-economy/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";

type Health = z.infer<(typeof routes)["health"]["response"]>;
type Readiness = z.infer<(typeof routes)["readiness"]["response"]>;

const SIM_STALE_MS = 10_000;

export async function health(ctx: AppContext): Promise<Health> {
  const { runtime, config } = ctx;
  const st = await ctx.coord.simStatus().catch(() => null);
  const age = st?.heartbeatAt ? Date.now() - new Date(st.heartbeatAt).getTime() : null;
  const simRunning = age !== null && age < SIM_STALE_MS;
  return {
    status: (await ctx.coord.ping()) && (simRunning || !config.simAutostart) ? "ok" : "degraded",
    mode: config.mode,
    role: config.role,
    contractVersion: CONTRACT_VERSION,
    tick: runtime.tick,
    simRunning,
    store: ctx.store.kind,
    financialFeaturesEnabled: config.financialFeaturesEnabled,
    simLeader: { localLeader: runtime.sim?.isLeader ?? false, epoch: st?.epoch ?? 0, lastTick: st?.lastTick ?? 0, heartbeatAgeMs: age },
  };
}

/**
 * Readiness = this process can do its job. Database reachability is required for every role.
 * Missing simulation state is reported but does not block API readiness, so the API can still deploy
 * (and serve auth, launches, treasury, communities) while the simulation worker is restarting.
 */
export async function readiness(ctx: AppContext): Promise<Readiness> {
  const { runtime, config } = ctx;
  const checks: Readiness["checks"] = [];
  const db = await ctx.coord.ping();
  checks.push({ name: "database", ok: db, detail: db ? ctx.store.kind : "unreachable" });
  if (config.role === "api" || config.role === "all")
    checks.push({ name: "state_view", ok: true, detail: runtime.reader.available ? `tick ${runtime.tick}` : "no simulation state published yet (degraded, non-blocking)" });
  if (runtime.sim) checks.push({ name: "sim_leadership", ok: true, detail: runtime.sim.isLeader ? `leader (epoch ${runtime.sim.epoch})` : "standby" });
  if (ctx.indexer) checks.push({ name: "indexer_lease", ok: true, detail: ctx.indexer.isActive ? "active" : "standby" });
  return { ready: checks.every((c) => c.ok), role: config.role, checks };
}

export function metrics(ctx: AppContext, http: { requests: number; errors: number }): string {
  const sim = ctx.runtime.sim?.metrics;
  const idx = ctx.indexer?.metrics;
  const market=ctx.tokenMarket.telemetry(),rpc=ctx.backgroundRpc;
  const g = (name: string, v: number | boolean | undefined, type = "gauge") => (v === undefined ? [] : [`# TYPE ${name} ${type}`, `${name} ${typeof v === "boolean" ? Number(v) : v}`]);
  let agents: number | undefined;
  try {
    agents = ctx.runtime.reader.available ? ctx.runtime.state.agentOrder.length : undefined;
  } catch {
    agents = undefined;
  }
  return (
    [
      ...g("ae_sim_tick", ctx.runtime.tick),
      ...g("ae_sim_leader", ctx.runtime.sim?.isLeader),
      ...g("ae_sim_ticks_total", sim?.ticks, "counter"),
      ...g("ae_sim_tick_errors_total", sim?.tickErrors, "counter"),
      ...g("ae_sim_tick_ms", sim ? Number(sim.avgTickMs.toFixed(3)) : undefined),
      ...g("ae_sim_leader_acquisitions_total", sim?.acquisitions, "counter"),
      ...g("ae_sim_leader_losses_total", sim?.losses, "counter"),
      ...g("ae_indexer_active", ctx.indexer?.isActive),
      ...g("ae_indexer_runs_total", idx?.runs, "counter"),
      ...g("ae_indexer_errors_total", idx?.errors, "counter"),
      ...g("ae_indexer_entries_inserted_total", idx?.inserted, "counter"),
      ...g('ae_indexer_last_success_unixtime',idx?idx.lastSuccess/1000:undefined),
      ...g('ae_indexer_consecutive_failures',idx?.consecutiveFailures),
      ...g('ae_market_live_lag_seconds',market.lagMs/1000),
      ...g('ae_market_stale_cursors',market.stale),
      ...g('ae_market_backfill_pending_cursors',market.backfillPending),
      ...g('ae_market_stalled_cursors',market.stalled),
      ...g('ae_market_consecutive_failures',market.consecutiveFailures),
      ...g('ae_market_last_success_unixtime',market.lastSuccess/1000),
      ...g('ae_market_snapshot_age_seconds',market.snapshotAgeMs/1000),
      ...g('ae_market_refresh_errors_total',market.refreshErrors,'counter'),
      ...g('ae_market_pages_total',market.pages,'counter'),
      ...g('ae_market_signatures_total',market.signatures,'counter'),
      ...g('ae_market_events_seen_total',market.events,'counter'),
      ...g('ae_market_page_errors_total',market.errors,'counter'),
      ...g('ae_market_cursor_conflicts_total',market.conflicts,'counter'),
      ...g('ae_rpc_requests_total',rpc?.metrics.requests,'counter'),
      ...g('ae_rpc_retries_total',rpc?.metrics.retries,'counter'),
      ...g('ae_rpc_rate_limited_total',rpc?.metrics.rateLimited,'counter'),
      ...g('ae_rpc_failures_total',rpc?.metrics.failures,'counter'),
      ...g('ae_rpc_deadlines_total',rpc?.metrics.timeouts,'counter'),
      ...g('ae_rpc_queue_rejected_total',rpc?.metrics.queueRejected,'counter'),
      ...g('ae_rpc_queued',rpc?.pending),
      ...g('ae_rpc_active',rpc?.inFlight),
      ...g('ae_rpc_cooldown_seconds',rpc?rpc.cooldownMs/1000:undefined),
      ...g('ae_rpc_attempt_seconds_total',rpc?rpc.metrics.latencyMs/1000:undefined,'counter'),
      ...[...(rpc?.methodMetrics??[])].flatMap(([method,m])=>[
       `ae_rpc_method_requests_total{method="${method}"} ${m.requests}`,
       `ae_rpc_method_retries_total{method="${method}"} ${m.retries}`,
       `ae_rpc_method_failures_total{method="${method}"} ${m.failures}`]),
      ...g("ae_stream_seq", ctx.runtime.hub?.currentSeq),
      ...g("ae_http_requests_total", http.requests, "counter"),
      ...g("ae_http_errors_total", http.errors, "counter"),
      ...g("ae_ws_connections", ctx.wsStats.connections),
      ...g("ae_agents", agents),
    ].join("\n") + "\n"
  );
}
