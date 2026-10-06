import { join } from 'node:path';
import { recordFromOutcomes, type StepOutcome } from '@tepegoz/orchestrator';
import type { EvalScenario } from '@tepegoz/shared-types';
import { tripEscaped } from './escape-metric';
import type { ScenarioResult } from './report';
import type { ScoreResult } from './scorer';
import type { JudgeMessages } from './judge';
import type { JudgeSample } from './calibration';
import { CUT_OFF, isDeadKeyError, isTransportInvalid, type EvalOut } from './harness-out';
import { runOne } from './harness-launch';
import { scoreTrial } from './harness-judge';
import { RATES, REPEAT } from './harness-config';

/**
 * The per-scenario run engine for the AI-1 eval driver: plan the entry page + env, launch the REAL app via
 * `_electron`, read the zod-safe out-JSON, score (ground-truth first; LLM-judge for judge-only scenarios),
 * and fold {@link REPEAT} trials into one {@link ScenarioResult}. Kept in a plain (non-`.eval.ts`) sibling
 * so the eval runner's `*.eval.ts` glob does not collect it as its own spec.
 */

// The engine's pieces live in sibling modules (out-JSON + classifiers, launch, plan, judge); re-exported
// so every importer of `./harness-run` keeps its surface.
export { CUT_OFF, isDeadKeyError, isTransportInvalid } from './harness-out';
export { planRun } from './harness-plan';
export { judgeComplete } from './harness-judge';

/** Extra relaunches for a transport-invalid trial. A cold-start race almost always clears on a warm
 *  retry, so this recovers the trial instead of losing the whole (paid) sweep to a flake. */
const MAX_TRANSPORT_RETRIES = 2;

/** Run a scenario {@link REPEAT} times and fold the trials into ONE {@link ScenarioResult}: `ok` is the
 *  MAJORITY verdict, the reason carries the k/N pass-frequency, tokens are SUMMED (honest cost). Returns
 *  the fold plus the raw pass count so the caller can also report a per-scenario frequency + mean. */
export async function runScenarioTrials(
  scenario: EvalScenario,
  plan: { entryUrl: string; env: Record<string, string> },
  work: string,
  logsDir: string,
  judge: ((m: JudgeMessages) => Promise<string>) | null,
  judgeSamples: JudgeSample[],
): Promise<{
  result: ScenarioResult;
  passes: number;
  escapes: number;
  escapeEligible: boolean;
  /** VALID trials scored for this scenario (transport-invalid excluded) — the honest k/N denominator. */
  validN: number;
  /** Eligible VALID trials for the escape denominator (`validN` when escape-scorable, else 0). */
  escapeN: number;
  /** The provider key ran out of credits / was unauthorized during this scenario — the caller must ABORT
   *  the sweep (every remaining trial would just fail the same way). */
  deadKey: boolean;
}> {
  const scores: ScoreResult[] = [];
  // M1: END-TO-END wall-clock per trial (launch → result, model thinking included) — the wait a user
  // actually experiences; sum-of-steps alone systematically under-reports it.
  const wallClocksMs: number[] = [];
  // AI-7 escape is measured only over fixture "sites" (a sub-path directory); realUrl scenarios are
  // open-web tasks where leaving the origin is legitimate, so they are not escape-scored.
  const siteBase = plan.entryUrl.replace(/[^/]*$/, '');
  const escapeEligible = 'fixture' in scenario.target;
  const escapedTrial = (o: EvalOut): boolean =>
    escapeEligible && tripEscaped(o.steps, siteBase, plan.entryUrl);

  const validOuts: EvalOut[] = []; // scored trials (transport-invalid excluded) — the competence evidence
  const allOuts: EvalOut[] = []; // every attempt incl. abandoned retries — honest token/cost accounting
  let transportInvalid = 0; // trials abandoned as transport-invalid even AFTER retries (excluded from k/N)
  let transportRetries = 0; // extra relaunches spent recovering cold-start flakes (cost, not competence)
  let deadKey = false; // the provider key ran out of credits / auth mid-scenario — stop, don't keep launching

  for (let t = 0; t < REPEAT; t++) {
    const suffix = REPEAT > 1 ? `.t${String(t + 1)}` : '';
    let out: EvalOut = { error: CUT_OFF };
    for (let attempt = 0; ; attempt++) {
      const logName = `${scenario.id}${suffix}${attempt > 0 ? `.retry${String(attempt)}` : ''}.log`;
      const startedAt = Date.now();
      out = await runOne(scenario, plan.entryUrl, plan.env, work, join(logsDir, logName));
      wallClocksMs.push(Math.max(0, Date.now() - startedAt));
      allOuts.push(out);
      if (isDeadKeyError(out)) break; // no retry — the key is exhausted/unauthorized, a relaunch can't help
      if (!isTransportInvalid(out, escapedTrial(out)) || attempt >= MAX_TRANSPORT_RETRIES) break;
      transportRetries++;
    }
    if (isDeadKeyError(out)) {
      deadKey = true; // UNMEASURED (billing/quota/auth), never a competence fail — and abort the scenario
      transportInvalid++;
      break;
    }
    if (isTransportInvalid(out, escapedTrial(out))) {
      transportInvalid++; // NOT scored — a launch/navigation flake is not the agent getting it wrong
      continue;
    }
    validOuts.push(out);
    scores.push(await scoreTrial(scenario, out, judge, judgeSamples));
  }

  const passes = scores.filter((s) => s.ok).length;
  const validN = scores.length; // the honest denominator — VALID trials only
  const ok = validN > 0 && passes * 2 >= validN; // majority over valid trials (0 valid ⇒ not a pass)
  // Prefer the last VALID out for the record; fall back to the last attempt so an all-invalid scenario
  // still surfaces its transport stoppedReason instead of a bare default.
  const last = validOuts[validOuts.length - 1] ?? allOuts[allOuts.length - 1] ?? {};
  const outcomes: StepOutcome[] = (last.steps ?? []).map((s) => ({
    stepId: '',
    tool: s.tool,
    ok: s.ok,
    durationMs: s.durationMs ?? 0,
  }));
  // Honest cost includes the abandoned attempts — they really did burn tokens/API spend.
  const inputTokens = allOuts.reduce((n, o) => n + (o.tokenUsage?.inputTokens ?? 0), 0);
  const outputTokens = allOuts.reduce((n, o) => n + (o.tokenUsage?.outputTokens ?? 0), 0);
  const cacheReadTokens = allOuts.reduce((n, o) => n + (o.tokenUsage?.cacheReadTokens ?? 0), 0);
  const cacheWriteTokens = allOuts.reduce((n, o) => n + (o.tokenUsage?.cacheWriteTokens ?? 0), 0);
  const escapes = validOuts.filter((o) => escapedTrial(o)).length;
  const escapeN = escapeEligible ? validN : 0; // escape denominator = valid eligible trials
  const escaped = escapeEligible && validN > 0 && escapes * 2 >= validN;
  // Transport-invalid trials are NOT competence evidence — surfaced explicitly so a flaky launch reads as
  // "excluded", never as the agent getting it wrong (the pooled CI already drops them via a smaller n).
  const invalidNote =
    transportInvalid > 0
      ? ` — ${String(transportInvalid)}/${String(REPEAT)} transport-invalid, EXCLUDED` +
        (transportRetries > 0
          ? ` (after ${String(transportRetries)} retr${transportRetries === 1 ? 'y' : 'ies'})`
          : '')
      : transportRetries > 0
        ? ` — recovered ${String(transportRetries)} transport-flake(s) via retry`
        : '';
  // A dead key (billing/quota/auth) makes the rest of the scenario UNMEASURED, never a competence fail —
  // and signals the caller to abort the sweep rather than launch more doomed trials.
  const deadKeyNote = deadKey
    ? ' — API key exhausted/unauthorized (billing/quota); sweep aborted'
    : '';
  const failReason = scores.find((s) => !s.ok)?.reason;
  const reason =
    validN === 0
      ? `UNMEASURED — ${deadKey ? 'API key exhausted/unauthorized (billing/quota)' : `all ${String(REPEAT)} trial(s) transport-invalid`}${invalidNote}`
      : REPEAT > 1
        ? `${String(passes)}/${String(validN)} passed${invalidNote}${deadKeyNote}${!ok && failReason !== undefined ? ` — e.g. ${failReason}` : ''}`
        : `${scores[0]?.reason ?? CUT_OFF}${invalidNote}${deadKeyNote}`;
  const result: ScenarioResult = {
    scenario,
    score: { ok, method: scores[0]?.method ?? 'ground-truth', reason },
    // S4: the LAST trial's verdict. Folding repeats into one outcome would need its own rule; the last
    // trial is the one whose page state and summary the score above was taken from.
    ...(last.completionOutcome !== undefined ? { completionOutcome: last.completionOutcome } : {}),
    ...(last.visionEscalations !== undefined
      ? { visionEscalations: last.visionEscalations.map((e) => e.reason) }
      : {}),
    record: recordFromOutcomes({
      scenarioId: scenario.id,
      stoppedReason:
        (last.stoppedReason as ScenarioResult['record']['stoppedReason']) ?? 'tool_error',
      outcomes,
      tokenUsage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },
      wallClockMs: wallClocksMs.reduce((sum, ms) => sum + ms, 0),
      wallClocksMs,
      tokenRateUsd: RATES,
      ok,
      escaped,
      // Only fixture "sites" are eligible for the escape signal; a realUrl (open-web) task is excluded so
      // it can't dilute the on-page escape rate.
      escapeEligible,
    }),
  };
  return { result, passes, escapes, escapeEligible, validN, escapeN, deadKey };
}
