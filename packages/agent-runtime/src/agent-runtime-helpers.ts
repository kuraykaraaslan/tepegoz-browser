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
 * Localized plain-language sentence for each way a run can stop WITHOUT the agent having written its
 * own summary — so the Console says what happened instead of showing a raw enum code ("Finished:
 * max_steps"). Only the reasons that reach the generic branch below need one; `completed` carries the
 * agent's summary, and `aborted` / `handoff` / `plan_rejected` / `egress_blocked` are messaged at
 * their own call sites. Injected by the host from its own dictionary (`AgentRunDeps.stopReasonStrings`),
 * so this package stays string-free.
 */
export interface StopReasonStrings {
  maxSteps: string;
  loopDetected: string;
  toolError: string;
  policyDenied: string;
  selectorStale: string;
  navigationTimeout: string;
  pageChanged: string;
  modelMalformed: string;
  transientError: string;
  /** Any stop reason not in the list above (an unknown/new enum value). */
  generic: string;
}

/** Enum stop reason → the `StopReasonStrings` key that describes it. */
const STOP_REASON_KEYS: Record<string, keyof StopReasonStrings> = {
  max_steps: 'maxSteps',
  loop_detected: 'loopDetected',
  tool_error: 'toolError',
  policy_denied: 'policyDenied',
  selector_stale: 'selectorStale',
  navigation_timeout: 'navigationTimeout',
  page_changed: 'pageChanged',
  model_malformed: 'modelMalformed',
  transient_error: 'transientError',
};

/** The terminal Console line for a finished run: the agent's own summary if any, else a distinct
 *  reason for a security stop (Egress Firewall), else a plain-language reason, else a generic line. */
export function terminalMessageFor(
  stoppedReason: string,
  summary: string | undefined,
  failure: AgentFailure | undefined,
  strings: StopReasonStrings,
): string {
  if (summary !== undefined && summary.length > 0) return summary;
  if (failure?.kind === 'egress_blocked' && failure.message.length > 0) return failure.message;
  const key = STOP_REASON_KEYS[stoppedReason];
  const base = key !== undefined ? strings[key] : strings.generic;
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
