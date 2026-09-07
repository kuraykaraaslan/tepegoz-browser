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

/**
 * A plain-language sentence for each way a run can stop WITHOUT the agent having written its own
 * summary — so the Console says what happened instead of showing a raw enum code ("Finished:
 * max_steps"). Only the reasons that reach the generic branch below are listed; `completed` carries the
 * agent's summary, and `aborted` / `handoff` / `plan_rejected` / `egress_blocked` are messaged at their
 * own call sites.
 *
 * English only, like the rest of this module — the terminal-message path has no localizer injected yet;
 * translating it is tracked as a separate item (S8 "localized to the same bar").
 */
const STOP_REASON_MESSAGES: Record<string, string> = {
  max_steps:
    'The run reached its step limit before finishing. It may have needed more steps, or it got stuck — check the last few steps above.',
  loop_detected:
    'The run stopped because it was repeating the same action without making progress.',
  tool_error: 'The run stopped after a tool call failed and could not be recovered.',
  policy_denied: 'The run stopped because an action it needed was not permitted.',
  selector_stale:
    'The run lost track of an element on the page (it changed underneath the agent) and could not continue.',
  navigation_timeout: 'The run stopped waiting for a page that never finished loading.',
  page_changed:
    'The page changed unexpectedly mid-action, so the run stopped rather than act on the wrong page.',
  model_malformed: 'The run stopped after the model returned a response it could not act on.',
  transient_error:
    'The run stopped after a temporary error it could not get past — trying again may work.',
};

/** The terminal Console line for a finished run: the agent's own summary if any, else a distinct
 *  reason for a security stop (Egress Firewall), else a plain-language reason, else a generic line. */
export function terminalMessageFor(
  stoppedReason: string,
  summary: string | undefined,
  failure: AgentFailure | undefined,
): string {
  if (summary !== undefined && summary.length > 0) return summary;
  if (failure?.kind === 'egress_blocked' && failure.message.length > 0) return failure.message;
  const base = STOP_REASON_MESSAGES[stoppedReason] ?? `Finished: ${stoppedReason}`;
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
