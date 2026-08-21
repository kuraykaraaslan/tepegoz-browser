import { ToolGateway, type InvokeContext } from '@tepegoz/capability-plane';
import type { Plan, PlanStep, ToolError } from '@tepegoz/shared-types';

/**
 * L3 sequential executor. Runs a {@link Plan}'s steps in order through the single ToolGateway PEP
 * (which applies the Policy Kernel + HITL). Phase 1a safeguards: a hard `MAX_AGENT_STEPS` cap and a
 * Loop Detector (an identical tool+args action repeated `loopThreshold` times stops the run, credit
 * preserved). Halts on the first tool error (e.g. a policy denial). Parallel DAG branches are Phase 1b.
 */
export interface StepOutcome {
  stepId: string;
  tool: string;
  args?: unknown;
  ok: boolean;
  result?: unknown;
  error?: ToolError;
  /**
   * Wall-clock milliseconds spent inside the ToolGateway for this step (policy evaluation + any HITL
   * wait + the handler itself). Recorded here because this is the only place that brackets a single
   * tool call; without it the eval harness can report *what* the agent did but never *how long* it
   * took, which is half of a competence number.
   */
  durationMs: number;
}

export type StopReason =
  | 'completed'
  | 'tool_error'
  | 'policy_denied'
  | 'selector_stale'
  | 'navigation_timeout'
  | 'page_changed'
  | 'model_malformed'
  | 'transient_error'
  | 'loop_detected'
  | 'max_steps'
  | 'aborted'
  | 'handoff'
  // The Egress Firewall stopped the run: a possible secret in the outbound model request was not
  // sent (either the user declined the HITL prompt or no send was allowed). Credit preserved.
  | 'egress_blocked';

export interface RunResult {
  outcomes: StepOutcome[];
  stoppedReason: StopReason;
}

export interface RunOptions {
  maxSteps?: number;
  loopThreshold?: number;
  ctx?: InvokeContext;
  /**
   * Per-step context override (targetUrl for the sensitive-site lockout, taintedArgs for
   * injection containment). Called just before each step; its result is passed to the ToolGateway
   * for that step. Falls back to `ctx` when omitted. This is how the Policy Kernel actually receives
   * the site + taint of each concrete tool call.
   */
  ctxFor?: (step: PlanStep) => InvokeContext;
  /** Cooperative cancellation, checked before each step (AbortSignal is structurally compatible). */
  signal?: { readonly aborted: boolean };
  /** Injectable clock for step timing — lets tests assert durations deterministically. */
  now?: () => number;
  /** Live progress hooks (Agent Console). Called before/after each step. */
  onStepStart?: (step: PlanStep) => void;
  onStepEnd?: (outcome: StepOutcome) => void;
  /**
   * Post-step guard (Human Handoff Controller): inspect a *successful* step's outcome and return a
   * {@link StopReason} to halt the run gracefully — e.g. `'handoff'` when a CAPTCHA/2FA challenge is
   * detected in the perceived page (the agent must NOT try to solve it). Returning `null` continues.
   */
  guard?: (outcome: StepOutcome) => StopReason | null;
}

function isToolError(v: unknown): v is ToolError {
  return typeof v === 'object' && v !== null && (v as { isError?: unknown }).isError === true;
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

export default class Executor {
  static async run(plan: Plan, options: RunOptions = {}): Promise<RunResult> {
    const maxSteps = options.maxSteps ?? 25;
    const loopThreshold = options.loopThreshold ?? 3;
    const ctx = options.ctx ?? {};
    const outcomes: StepOutcome[] = [];
    const signatureCounts = new Map<string, number>();

    for (const step of plan.steps) {
      if (options.signal?.aborted === true) {
        return { outcomes, stoppedReason: 'aborted' };
      }
      if (outcomes.length >= maxSteps) {
        return { outcomes, stoppedReason: 'max_steps' };
      }

      const signature = `${step.tool}:${stableStringify(step.args)}`;
      const count = (signatureCounts.get(signature) ?? 0) + 1;
      signatureCounts.set(signature, count);
      if (count >= loopThreshold) {
        return { outcomes, stoppedReason: 'loop_detected' };
      }

      options.onStepStart?.(step);
      const stepCtx = options.ctxFor ? options.ctxFor(step) : ctx;
      const startedAt = options.now?.() ?? Date.now();
      const result = await ToolGateway.invoke(step.tool, step.args, stepCtx);
      // Measured even on the error path — a step that fails SLOWLY (a timeout, a long policy wait) is
      // exactly the case a latency metric needs to surface.
      const durationMs = Math.max(0, (options.now?.() ?? Date.now()) - startedAt);
      const outcome: StepOutcome = isToolError(result)
        ? {
            stepId: step.id,
            tool: step.tool,
            args: step.args,
            ok: false,
            error: result,
            durationMs,
          }
        : { stepId: step.id, tool: step.tool, args: step.args, ok: true, result, durationMs };
      outcomes.push(outcome);
      options.onStepEnd?.(outcome);
      if (!outcome.ok) {
        return { outcomes, stoppedReason: 'tool_error' };
      }
      const halt = options.guard?.(outcome);
      if (halt != null) {
        return { outcomes, stoppedReason: halt };
      }
    }

    return { outcomes, stoppedReason: 'completed' };
  }
}
