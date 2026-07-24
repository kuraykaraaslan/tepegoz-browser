import type { EvalScenario } from '@tepegoz/shared-types';

export type ScoreMethod = 'ground-truth' | 'deferred-judge';

export interface ScoreInput {
  scenario: EvalScenario;
  /** The visible text of the page the run ended on (read through the real app's page-read path). */
  finalPageText: string;
  /** The agent's closing summary for the run (empty if it stopped without one). */
  summary: string;
  /** How the run actually stopped (the runner's `StopReason` string) — checked when the scenario's
   *  ground truth IS a stop (`success.stoppedReason`, e.g. a required human handoff). */
  stoppedReason?: string;
}

export interface ScoreResult {
  ok: boolean;
  method: ScoreMethod;
  reason: string;
}

function includesCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Score a completed run **ground-truth first**: `domAssertion` must appear in the final page text and
 * `expectedValue` must appear in the agent's summary; when both are set, both must hold. A scenario with
 * only a `judgeRubric` is deferred to the LLM-judge (AI-1 PR2) and reported as a fail with a clear
 * reason — the eval's job is to be able to fail, never to silently pass. Pure + string-only, so it is
 * unit-testable without a browser.
 */
export function scoreScenario(input: ScoreInput): ScoreResult {
  const { success } = input.scenario;
  const checks: string[] = [];

  if (success.domAssertion !== undefined) {
    if (!includesCI(input.finalPageText, success.domAssertion)) {
      return { ok: false, method: 'ground-truth', reason: `final page missing "${success.domAssertion}"` };
    }
    checks.push(`page contains "${success.domAssertion}"`);
  }
  if (success.expectedValue !== undefined) {
    if (!includesCI(input.summary, success.expectedValue)) {
      return { ok: false, method: 'ground-truth', reason: `summary missing "${success.expectedValue}"` };
    }
    checks.push(`summary contains "${success.expectedValue}"`);
  }
  if (success.stoppedReason !== undefined) {
    const actual = input.stoppedReason ?? '';
    if (actual.toLowerCase() !== success.stoppedReason.toLowerCase()) {
      return {
        ok: false,
        method: 'ground-truth',
        reason: `run stopped with "${actual || '(none)'}" — expected "${success.stoppedReason}"`,
      };
    }
    checks.push(`run stopped with "${success.stoppedReason}"`);
  }

  if (checks.length > 0) {
    return { ok: true, method: 'ground-truth', reason: checks.join(' AND ') };
  }
  // Only a judgeRubric (or an empty success block): no ground truth to check yet.
  return {
    ok: false,
    method: 'deferred-judge',
    reason: 'no ground-truth assertion; LLM-judge is AI-1 PR2',
  };
}
