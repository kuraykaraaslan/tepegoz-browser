import type { Macro, Step } from '@tepegoz/shared-types';
import type { MacroHost, MacroPolicyStepKind } from './host';
import { VariableStore } from './variables';
import { evalPredicate } from './predicate';
import { MacroAborted, MacroError } from './errors';
import type { MacroValue } from './value';

/** Default auto-wait for element-targeting steps (`waitFor` with no explicit timeout). */
const DEFAULT_WAIT_MS = 10_000;
/** Runaway guard: total leaf steps executed across all loops (answers iMacros infinite-loop hangs). */
const DEFAULT_MAX_STEPS = 100_000;
/** Minimum gap enforced AFTER every browser operation, so a run is never faster than this floor. */
const DEFAULT_MIN_STEP_INTERVAL_MS = 50;

/** Step kinds that perform a real browser operation — the ones the pacing floor applies to. */
const PACED_KINDS = new Set<Step['kind']>(['navigate', 'click', 'fill', 'press', 'scroll', 'extract']);

/** State-changing step kinds — the ones `host.checkPolicy` re-gates once per attempt, before dispatch. */
const POLICY_GATED_KINDS = new Set<Step['kind']>(['navigate', 'click', 'fill', 'press', 'scroll']);

/** Does this step's own argument (URL/fill value) reference a variable last set by `extract`? */
function stepIsTainted(step: Step, vars: VariableStore): boolean {
  if (step.kind === 'navigate') return vars.isTemplateTainted(step.url);
  if (step.kind === 'fill') return vars.isTemplateTainted(step.value);
  return false;
}

export interface RunOptions {
  /** Initial variable bindings (e.g. from the agent / UI). */
  variables?: Record<string, string> | undefined;
  /** Cooperative cancellation. */
  signal?: { readonly aborted: boolean } | undefined;
  onProgress?: ((ev: RunProgress) => void) | undefined;
  defaultWaitMs?: number | undefined;
  maxSteps?: number | undefined;
  /** Minimum ms enforced after each browser operation (floor speed). Default 50ms; clamped to ≥50. */
  minStepIntervalMs?: number | undefined;
}

export type RunProgress =
  | { phase: 'started'; total: number }
  | { phase: 'step'; path: number[]; kind: string }
  | { phase: 'done' }
  | { phase: 'failed'; path: number[]; kind: string; detail: string };

export interface RunResult {
  ok: boolean;
  aborted: boolean;
  stepsRun: number;
  variables: Record<string, MacroValue>;
  error?: { where: string; message: string; path: readonly number[] };
}

/**
 * Execute a validated {@link Macro} deterministically (no model calls). Walks the step tree, keeping a
 * variable store + CSV cursor, evaluating control flow, and driving the injected {@link MacroHost}.
 * Failures surface as a located {@link MacroError} naming the exact step (never an opaque code).
 */
export async function runMacro(
  macro: Macro,
  host: MacroHost,
  opts: RunOptions = {},
): Promise<RunResult> {
  const vars = new VariableStore();
  // Declared defaults first, then caller-supplied overrides.
  for (const decl of macro.variables) {
    vars.set(decl.name, decl.initial === undefined ? '' : vars.evaluate(decl.initial));
  }
  for (const [k, v] of Object.entries(opts.variables ?? {})) vars.set(k, v);

  const waitMs = opts.defaultWaitMs ?? DEFAULT_WAIT_MS;
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  // Floor pacing: never below 50ms, even if a caller passes something smaller (the user's "minimum
  // operation speed ≥ 0.05s" rule).
  const minStepIntervalMs = Math.max(
    DEFAULT_MIN_STEP_INTERVAL_MS,
    opts.minStepIntervalMs ?? DEFAULT_MIN_STEP_INTERVAL_MS,
  );
  const signal = opts.signal;
  let stepsRun = 0;

  const checkAbort = (): void => {
    if (signal?.aborted === true) throw new MacroAborted();
  };

  const executeSteps = async (steps: readonly Step[], path: number[]): Promise<void> => {
    for (let i = 0; i < steps.length; i++) {
      await executeStep(steps[i]!, [...path, i]);
    }
  };

  const executeStep = async (step: Step, path: number[]): Promise<void> => {
    checkAbort();
    stepsRun++;
    if (stepsRun > maxSteps) {
      throw new MacroError(`Exceeded step budget (${maxSteps})`, path, step.kind);
    }
    opts.onProgress?.({ phase: 'step', path, kind: step.kind });

    // Per-step Policy Kernel re-pass (L8), BEFORE the retry loop below: a rejection here is never
    // retried or skipped by the step's own `onError` policy — that config governs page-interaction
    // flakiness, not security decisions.
    if (host.checkPolicy && POLICY_GATED_KINDS.has(step.kind)) {
      try {
        await host.checkPolicy(step.kind as MacroPolicyStepKind, stepIsTainted(step, vars));
      } catch (err) {
        throw new MacroError(err instanceof Error ? err.message : String(err), path, step.kind);
      }
    }

    // Per-step error policy (answers iMacros' !ERRORIGNORE/FAIL_IF_FOUND): stop | skip | retry(N).
    const onError = 'onError' in step ? (step.onError ?? 'stop') : 'stop';
    const maxRetries = 'retries' in step && typeof step.retries === 'number' ? step.retries : 0;
    for (let attempt = 0; ; attempt++) {
      try {
        await dispatch(step, path);
        break;
      } catch (err) {
        if (err instanceof MacroAborted) throw err;
        const macroErr =
          err instanceof MacroError
            ? err
            : new MacroError(err instanceof Error ? err.message : String(err), path, step.kind);
        if (onError === 'retry' && attempt < maxRetries) {
          opts.onProgress?.({ phase: 'step', path, kind: `${step.kind}:retry` });
          await host.sleep(minStepIntervalMs);
          continue;
        }
        if (onError === 'skip') {
          opts.onProgress?.({ phase: 'step', path, kind: `${step.kind}:skipped` });
          break; // swallow the failure and continue the run
        }
        throw macroErr; // 'stop' (default), or retries exhausted
      }
    }
    // Enforce the minimum inter-operation gap after any real browser action (floor speed).
    if (PACED_KINDS.has(step.kind)) await host.sleep(minStepIntervalMs);
  };

  const dispatch = async (step: Step, path: number[]): Promise<void> => {
    switch (step.kind) {
      case 'navigate':
        await host.navigate(vars.interpolate(step.url));
        return;
      case 'click':
        await host.click(step.target);
        return;
      case 'fill':
        await host.fill(step.target, vars.interpolate(step.value));
        return;
      case 'press':
        await host.press(step.key);
        return;
      case 'scroll':
        await host.scroll(step.direction, step.amount);
        return;
      case 'extract': {
        const value = await host.extract(step.target, step.attr);
        if (step.append === true) vars.append(step.into, value);
        else vars.set(step.into, value);
        // Read from the live page — untrusted web content (L8 taint), even though the macro author
        // fully controls the SELECTOR that produced it.
        vars.taint(step.into);
        return;
      }
      case 'waitFor': {
        const found = await host.waitFor(step.target, step.timeoutMs ?? waitMs);
        if (!found) throw new MacroError('waitFor: element never appeared', path, step.kind);
        return;
      }
      case 'waitLoad':
        await host.waitForLoad(step.timeoutMs ?? waitMs);
        return;
      case 'waitMs':
        await host.sleep(step.ms);
        return;
      case 'setVar':
        vars.set(step.name, vars.evaluate(step.expr));
        return;
      case 'assert': {
        const ok = await evalPredicate(step.predicate, host, vars);
        if (!ok && step.severity === 'hard') {
          throw new MacroError(step.message ?? 'assertion failed', path, step.kind);
        }
        return;
      }
      case 'if': {
        const branch = (await evalPredicate(step.cond, host, vars)) ? step.then : (step.else ?? []);
        await executeSteps(branch, path);
        return;
      }
      case 'repeat': {
        if (step.count !== undefined) {
          for (let k = 0; k < step.count; k++) await executeSteps(step.body, path);
        } else if (step.while !== undefined) {
          while (await evalPredicate(step.while, host, vars)) {
            checkAbort();
            if (stepsRun > maxSteps) {
              throw new MacroError(`Exceeded step budget (${maxSteps})`, path, step.kind);
            }
            await executeSteps(step.body, path);
          }
        }
        return;
      }
      case 'forEachRow': {
        const rows = await host.readCsv(step.csvBlobHash);
        if (rows.length === 0) return;
        const cap = step.maxRows ?? rows.length;
        const limit = step.onEnd === 'restart' ? cap : Math.min(cap, rows.length);
        for (let iter = 0; iter < limit; iter++) {
          const row = rows[iter % rows.length]!;
          for (const [col, val] of Object.entries(row)) vars.set(col, val);
          vars.set(step.as, String(iter + 1));
          await executeSteps(step.body, path);
        }
        return;
      }
    }
  };

  opts.onProgress?.({ phase: 'started', total: macro.steps.length });
  try {
    await executeSteps(macro.steps, []);
    opts.onProgress?.({ phase: 'done' });
    return { ok: true, aborted: false, stepsRun, variables: vars.snapshot() };
  } catch (err) {
    if (err instanceof MacroAborted) {
      return { ok: false, aborted: true, stepsRun, variables: vars.snapshot() };
    }
    if (err instanceof MacroError) {
      opts.onProgress?.({ phase: 'failed', path: [...err.stepPath], kind: err.stepKind, detail: err.message });
      return {
        ok: false,
        aborted: false,
        stepsRun,
        variables: vars.snapshot(),
        error: { where: err.where, message: err.message, path: err.stepPath },
      };
    }
    throw err;
  }
}
