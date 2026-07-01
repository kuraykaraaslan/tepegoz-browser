import { ToolGateway, type InvokeContext } from '@tepegoz/capability-plane';
import type { Plan, ToolError } from '@tepegoz/shared-types';

/**
 * L3 sequential executor. Runs a {@link Plan}'s steps in order through the single ToolGateway PEP
 * (which applies the Policy Kernel + HITL). Phase 1a safeguards: a hard `MAX_AGENT_STEPS` cap and a
 * Loop Detector (an identical tool+args action repeated `loopThreshold` times stops the run, credit
 * preserved). Halts on the first tool error (e.g. a policy denial). Parallel DAG branches are Phase 1b.
 */
export interface StepOutcome {
  stepId: string;
  tool: string;
  ok: boolean;
  result?: unknown;
  error?: ToolError;
}

export type StopReason = 'completed' | 'tool_error' | 'loop_detected' | 'max_steps' | 'aborted';

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
  ctxFor?: (step: { id: string; tool: string; args: unknown }) => InvokeContext;
  /** Cooperative cancellation, checked before each step (AbortSignal is structurally compatible). */
  signal?: { readonly aborted: boolean };
  /** Live progress hooks (Agent Console). Called before/after each step. */
  onStepStart?: (step: { id: string; tool: string }) => void;
  onStepEnd?: (outcome: StepOutcome) => void;
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

      options.onStepStart?.({ id: step.id, tool: step.tool });
      const stepCtx = options.ctxFor
        ? options.ctxFor({ id: step.id, tool: step.tool, args: step.args })
        : ctx;
      const result = await ToolGateway.invoke(step.tool, step.args, stepCtx);
      const outcome: StepOutcome = isToolError(result)
        ? { stepId: step.id, tool: step.tool, ok: false, error: result }
        : { stepId: step.id, tool: step.tool, ok: true, result };
      outcomes.push(outcome);
      options.onStepEnd?.(outcome);
      if (!outcome.ok) {
        return { outcomes, stoppedReason: 'tool_error' };
      }
    }

    return { outcomes, stoppedReason: 'completed' };
  }
}
