import type { AgentSimState, TaskState } from "./types.js";

export interface TaskCandidate {
  task: TaskState;
  /** Estimated ticks to complete (travel + work). */
  durationTicks: number;
  /** True if the destination is a demand sink or a community headquarters (cooperative preference). */
  communal: boolean;
}

export interface AgentView {
  agent: Readonly<AgentSimState>;
  tick: number;
  candidates: readonly TaskCandidate[];
}

export type Proposal =
  | { kind: "claim_task"; taskId: string; reason: string; utility: number }
  | { kind: "stroll"; reason: string; utility: number }
  | { kind: "wait"; reason: string; utility: number };

/**
 * Planning interface. Implementations PROPOSE; the engine validates every proposal against
 * authoritative rules before applying it. An LLM-backed planner may implement this interface later,
 * but must run with a time/token budget, fall back to the rule planner on timeout, and its output is
 * treated exactly like this one: an untrusted proposal (never a database or blockchain command).
 */
export interface Planner {
  readonly name: string;
  propose(view: AgentView): Proposal;
}

const MAX_DURATION_BY_RISK = { low: 120, medium: 220, high: Number.POSITIVE_INFINITY } as const;

/** Deterministic utility-based planner (rule layer). */
export class UtilityPlanner implements Planner {
  readonly name = "utility-v1";

  propose({ agent, candidates }: AgentView): Proposal {
    const s = agent.strategy;
    const maxDuration = MAX_DURATION_BY_RISK[s.risk];
    const avgReward = candidates.length ? candidates.reduce((n, c) => n + c.task.rewardCredits, 0) / candidates.length : 0;

    let best: { c: TaskCandidate; u: number; why: string[] } | null = null;
    for (const c of candidates) {
      if (c.durationTicks > maxDuration) continue;
      const why: string[] = [];
      const perTick = c.task.rewardCredits / Math.max(1, c.durationTicks);
      let u = perTick;
      if (s.objective === "reliability") {
        u *= c.durationTicks < 80 ? 1.3 : 0.7;
        why.push(c.durationTicks < 80 ? "short, dependable job" : "long job (reliability penalty)");
      } else if (s.objective === "expansion") {
        u *= 1 + c.task.points / 20;
        why.push("builds verified track record");
      } else {
        why.push(`${perTick.toFixed(1)} mCC/tick`);
      }
      if (s.temperament === "cooperative" && c.communal) {
        u *= 1.15;
        why.push("serves residents/community");
      }
      if (s.temperament === "competitive" && c.task.rewardCredits > avgReward) {
        u *= 1.15;
        why.push("above-average pay");
      }
      if (c.task.resource && s.preferredResources.includes(c.task.resource)) {
        u *= 1.2;
        why.push(`prefers ${c.task.resource}`);
      }
      // Deterministic tie-break on task id.
      if (!best || u > best.u || (u === best.u && c.task.id < best.c.task.id)) best = { c, u, why };
    }

    if (best && best.u > 0) {
      return {
        kind: "claim_task",
        taskId: best.c.task.id,
        utility: Math.round(best.u * 100) / 100,
        reason: `${best.c.task.kind} ${best.c.task.resource ?? ""} (~${best.c.durationTicks} ticks): ${best.why.join(", ")}`.replace(/\s+/g, " "),
      };
    }
    if (candidates.length > 0) return { kind: "wait", utility: 0, reason: `no task within ${s.risk}-risk duration limit` };
    return { kind: "stroll", utility: 0, reason: "no open tasks for my profession; walking the neighbourhood" };
  }
}
