import { isDev } from '@tepegoz/libs';
import { type EffortLevel } from '@tepegoz/model-gateway';
import { Planner, classifyRuntimeError, type AgentFailure } from '@tepegoz/orchestrator';
import type { Plan } from '@tepegoz/shared-types';

/** The reasoning-effort preset (Agent panel) maps to a per-call max output-token budget: higher effort
 *  allows longer reasoning/summaries. Kept within Claude 4.x output limits. Applied to both the planning
 *  and the reactive-execution calls; the Anthropic adapter also receives the matching `output_config.effort`. */
export const EFFORT_MAX_TOKENS: Record<EffortLevel, number> = {
  low: 2048,
  medium: 4096,
  high: 8192,
  xhigh: 16384,
  max: 32768,
};

/**
 * Run the Planner, converting an Egress-Firewall block during PLANNING into a terminal failure
 * (symmetric with the reactor path, which already catches it) instead of throwing out of the run — so
 * the run lifecycle/journal stays consistent regardless of WHEN the block trips. Other planning errors
 * keep their existing behavior (surface at the IPC boundary).
 */
export async function planOrEgressStop(
  input: Parameters<typeof Planner.plan>[0],
): Promise<{ plan: Plan } | { egressFailure: AgentFailure }> {
  try {
    return { plan: await Planner.plan(input) };
  } catch (err) {
    const failure = classifyRuntimeError(err);
    if (failure.kind === 'egress_blocked') return { egressFailure: failure };
    throw err;
  }
}

/** The terminal Console line for a finished run: the agent's own summary if any, else a distinct
 *  reason for a security stop (Egress Firewall), else a generic finished line. */
export function terminalMessageFor(
  stoppedReason: string,
  summary: string | undefined,
  failure: AgentFailure | undefined,
): string {
  if (summary !== undefined && summary.length > 0) return summary;
  if (failure?.kind === 'egress_blocked' && failure.message.length > 0) return failure.message;
  const base = `Finished: ${stoppedReason}`;
  // In development, surface the underlying failure detail (tool + error code + message) instead of the
  // opaque stop reason, so the Console shows *why* a run stopped. Never in production — the raw message
  // can carry page/tool internals and is noise for end users.
  if (isDev && failure !== undefined) {
    const detail = [
      failure.tool !== undefined ? `tool=${failure.tool}` : undefined,
      failure.code !== undefined ? `code=${failure.code}` : undefined,
      failure.message.length > 0 ? failure.message : undefined,
    ]
      .filter((part): part is string => part !== undefined)
      .join(' ');
    if (detail.length > 0) return `${base} — ${detail}`;
  }
  return base;
}
