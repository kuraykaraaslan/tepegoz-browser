import type { StopReason, StepOutcome } from './executor';

export const ACCEPTANCE_SCENARIO_IDS = [
  'headings_summary',
  'multi_tab_research',
  'form_fill_stop_before_submit',
  'action_recovery',
  'human_handoff',
] as const;
export type AcceptanceScenarioId = (typeof ACCEPTANCE_SCENARIO_IDS)[number];

export interface AcceptanceScenario {
  id: AcceptanceScenarioId;
  title: string;
  requiresRecovery?: boolean | undefined;
  requiresApproval?: boolean | undefined;
  requiresHandoff?: boolean | undefined;
}

export interface AcceptanceRunRecord {
  /** The scenario's id. Widened from the legacy `AcceptanceScenarioId` union to a plain string so the
   *  AI-1 data-driven registry (its ids are open) shares this record/metrics contract. */
  scenarioId: string;
  /** True when this scenario is one where the agent is expected to recover from a stuck action — feeds
   *  `recoverySuccessRate`. Legacy scenarios leave it false and rely on the static
   *  {@link ACCEPTANCE_SCENARIOS} lookup; registry scenarios set it explicitly. */
  requiresRecovery: boolean;
  ok: boolean;
  stoppedReason: StopReason;
  toolCalls: number;
  toolErrors: number;
  approvalCount: number;
  approvalLatencyMs: number[];
  tokenUsage: EvalTokenUsage;
  /** Summed wall-clock of every step in the run (ms). Sum-of-steps, not end-to-end run time — it
   *  excludes model thinking time between steps, so it is honest about what it does and does not cover. */
  stepDurationMs: number;
  /** Every individual step duration (ms), kept so the aggregate can compute a real percentile rather
   *  than a mean-of-means across runs. */
  stepDurationsMs: number[];
  /** END-TO-END wall-clock (ms) — launch to result, model thinking time included; the number a user
   *  actually waits. REQUIRED (M1: a record that does not measure it does not compile) — sum-of-steps
   *  above is the honest fallback label, never a substitute. Summed across folded trials, like tokens. */
  wallClockMs: number;
  /** Per-trial end-to-end wall-clocks (ms), kept so the aggregate can compute a real per-run
   *  percentile when a folded record spans REPEAT trials. */
  wallClocksMs: number[];
  /** Estimated spend for the run, when a price rate was supplied. ABSENT (not 0) when no rate is
   *  known — an unknown price must read as "not measured", never as a free run. */
  costUsd?: number;
  recovered: boolean;
  navigationValidationCalls: number;
  navigationValidationFailures: number;
  /** AI-7 escape signal: the run left the task's site or reached for `web_search` — i.e. it bailed off
   *  the page instead of persisting on the on-page route. Meaningful for on-page-answerable scenarios (a
   *  genuinely off-site task would be excluded); feeds {@link AcceptanceMetrics.escapeRate}. */
  escaped: boolean;
  /** Whether this run is eligible for the escape signal (an on-page-answerable / fixture scenario). A
   *  genuinely off-site (realUrl) task is NOT eligible — leaving is legitimate there — and is excluded from
   *  the {@link AcceptanceMetrics.escapeRate} denominator so it can't dilute the on-page escape signal. */
  escapeEligible: boolean;
}

export interface AcceptanceMetrics {
  total: number;
  passed: number;
  taskSuccessRate: number;
  recoverySuccessRate: number;
  approvalLatencyP50Ms: number;
  toolErrorRate: number;
  navigationValidationFailureRate: number;
  /** AI-7 (`s31`): fraction of runs that escaped the on-page route (off-site nav / `web_search`). Lower is
   *  better — the navigation-grounding fix is meant to drive this down without regressing task success. */
  escapeRate: number;
  tokenUsage: EvalTokenUsage;
  /** Median duration of a single tool call (ms) across every step of every run. */
  stepLatencyP50Ms: number;
  /** 95th-percentile single-step duration (ms) — where the slow tail actually lives. */
  stepLatencyP95Ms: number;
  /** Median summed step time per run (ms). */
  runDurationP50Ms: number;
  /** Median END-TO-END wall-clock per trial (ms) — the wait a user actually experiences. */
  runWallClockP50Ms: number;
  /** Summed estimated spend across runs — present only when EVERY record carried a cost (a partial
   *  sum would silently under-report; "not measured" must stay visible). */
  totalCostUsd?: number;
  /** Mean estimated spend per run — same presence rule as {@link AcceptanceMetrics.totalCostUsd}. */
  avgCostUsdPerRun?: number;
  /** Mean tool calls per run — "how many actions did it take", the avg-actions competence signal. */
  avgToolCallsPerRun: number;
  /** Mean total tokens per run — cost proxy that needs no price table. */
  avgTokensPerRun: number;
  /**
   * Fraction of runs that succeeded cleanly: passed with NO tool error and NO recovery. A run that
   * only got there after a failed action or a recovery nudge is real success but not first-attempt
   * success, and conflating them hides exactly the competence delta this track is trying to move.
   */
  firstAttemptSuccessRate: number;
}

/**
 * Token spend for one run or aggregate.
 *
 * The two cache counters are ADDITIVE to `inputTokens`, not a breakdown of it: vendors report
 * `inputTokens` as the tokens that were neither served from nor written to the prompt cache. They are
 * carried separately because they are priced differently (see {@link estimateCostUsd}) and because a
 * sweep needs to be able to PROVE caching worked — a run of writes with no reads means a silently
 * invalidated prefix that is costing money rather than saving it.
 */
export interface EvalTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
}

/** Per-1M-token prices for one model, supplied by the caller. Deliberately NOT hardcoded: vendor
 *  prices change, and a stale constant baked into the repo would produce confidently wrong money. */
export interface TokenRateUsd {
  inputPerMillion: number;
  outputPerMillion: number;
  /**
   * Price multiplier for input tokens served from the provider's prompt cache. Vendors discount these
   * heavily (Anthropic: ~0.1x). Omitted ⇒ 1, i.e. a cached token is priced like an uncached one —
   * conservative, and the only honest default when the caller has not told us the discount.
   */
  cacheReadMultiplier?: number | undefined;
  /** Price multiplier for input tokens WRITTEN to the cache (Anthropic: ~1.25x). Omitted ⇒ 1. */
  cacheWriteMultiplier?: number | undefined;
}

/**
 * Estimate spend for a run. Returns `undefined` when no rate was supplied — an unknown price must
 * read as "not measured", never as `$0.00`, which would look like a free run in the report.
 *
 * Cached tokens are priced separately because vendors bill them separately: `inputTokens` counts only
 * what was NOT cached, and the cache counters are additive at their own multipliers. Pricing all three
 * at the full input rate would over-report a cached sweep's spend — which is the direction that makes a
 * budget look unaffordable when it is not.
 */
/** Fill in the cache counters a caller may omit and derive the additive total. One place, so a new
 *  call site cannot quietly compute `totalTokens` without the cached half. */
export function normalizeUsage(usage: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}): EvalTokenUsage {
  const cacheReadTokens = usage.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: usage.inputTokens + usage.outputTokens + cacheReadTokens + cacheWriteTokens,
  };
}

export function estimateCostUsd(
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  },
  rate?: TokenRateUsd,
): number | undefined {
  if (rate === undefined) return undefined;
  const cacheRead = (usage.cacheReadTokens ?? 0) * (rate.cacheReadMultiplier ?? 1);
  const cacheWrite = (usage.cacheWriteTokens ?? 0) * (rate.cacheWriteMultiplier ?? 1);
  const inputUnits = usage.inputTokens + cacheRead + cacheWrite;
  return (inputUnits * rate.inputPerMillion + usage.outputTokens * rate.outputPerMillion) / 1_000_000;
}

export const ACCEPTANCE_SCENARIOS: AcceptanceScenario[] = [
  { id: 'headings_summary', title: 'Extract headings from the page and summarize them.' },
  { id: 'multi_tab_research', title: 'Open three sources across tabs and produce a comparison table.' },
  {
    id: 'form_fill_stop_before_submit',
    title: 'Fill a form with provided information and stop before submitting.',
    requiresApproval: true,
  },
  {
    id: 'action_recovery',
    title: 'Recover when a page action does not stick.',
    requiresRecovery: true,
    requiresApproval: true,
  },
  {
    id: 'human_handoff',
    title: 'Pause and hand off on CAPTCHA or 2FA instead of solving it.',
    requiresHandoff: true,
  },
];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid] ?? 0
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Nearest-rank percentile (p in [0,1]); 0 for an empty set, matching {@link median}. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))] ?? 0;
}

function validationChangedFalse(outcome: StepOutcome): boolean {
  if (!outcome.ok || outcome.tool !== 'browser_validate_page') return false;
  const result = outcome.result;
  return typeof result === 'object' && result !== null && (result as { changed?: unknown }).changed === false;
}

export function recordFromOutcomes(input: {
  scenarioId: string;
  stoppedReason: StopReason;
  outcomes: StepOutcome[];
  approvalLatencyMs?: number[] | undefined;
  tokenUsage?:
    | { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }
    | undefined;
  recovered?: boolean | undefined;
  requiresRecovery?: boolean | undefined;
  ok?: boolean | undefined;
  /** AI-7: did the run escape the on-page route (off-site nav / web_search)? Default false. */
  escaped?: boolean | undefined;
  /** AI-7: is this run eligible for the escape signal (on-page-answerable)? Default true. */
  escapeEligible?: boolean | undefined;
  /** M1: END-TO-END wall-clock (ms), REQUIRED — the field is deliberately not optional so a caller
   *  that does not measure it does not compile. Pass 0 only for a run that genuinely never started. */
  wallClockMs: number;
  /** M1: per-trial wall-clocks when this record folds REPEAT trials; defaults to `[wallClockMs]`. */
  wallClocksMs?: number[] | undefined;
  /** M1: per-1M-token prices; when supplied the record carries an estimated cost. */
  tokenRateUsd?: TokenRateUsd | undefined;
}): AcceptanceRunRecord {
  const usage = input.tokenUsage ?? { inputTokens: 0, outputTokens: 0 };
  const stepDurationsMs = input.outcomes.map((o) => o.durationMs).filter((ms) => Number.isFinite(ms));
  const costUsd = estimateCostUsd(usage, input.tokenRateUsd);
  return {
    ...(costUsd !== undefined ? { costUsd } : {}),
    scenarioId: input.scenarioId,
    requiresRecovery: input.requiresRecovery ?? false,
    ok: input.ok ?? input.stoppedReason === 'completed',
    stoppedReason: input.stoppedReason,
    toolCalls: input.outcomes.length,
    toolErrors: input.outcomes.filter((o) => !o.ok).length,
    approvalCount: input.approvalLatencyMs?.length ?? 0,
    approvalLatencyMs: input.approvalLatencyMs ?? [],
    tokenUsage: normalizeUsage(usage),
    stepDurationMs: stepDurationsMs.reduce((sum, ms) => sum + ms, 0),
    stepDurationsMs,
    wallClockMs: input.wallClockMs,
    wallClocksMs: input.wallClocksMs ?? (input.wallClockMs > 0 ? [input.wallClockMs] : []),
    recovered: input.recovered ?? false,
    navigationValidationCalls: input.outcomes.filter((o) => o.tool === 'browser_validate_page').length,
    navigationValidationFailures: input.outcomes.filter(validationChangedFalse).length,
    escaped: input.escaped ?? false,
    escapeEligible: input.escapeEligible ?? true,
  };
}

export function summarizeAcceptanceRuns(records: AcceptanceRunRecord[]): AcceptanceMetrics {
  const passed = records.filter((r) => r.ok).length;
  const recoveryRuns = records.filter(
    (r) =>
      r.requiresRecovery ||
      ACCEPTANCE_SCENARIOS.some((s) => s.id === r.scenarioId && s.requiresRecovery === true),
  );
  const toolCalls = records.reduce((sum, r) => sum + r.toolCalls, 0);
  const validationCalls = records.reduce((sum, r) => sum + r.navigationValidationCalls, 0);
  const escapeEligible = records.filter((r) => r.escapeEligible);
  const allStepDurations = records.flatMap((r) => r.stepDurationsMs);
  const tokenUsage = records.reduce<EvalTokenUsage>(
    (sum, r) => ({
      inputTokens: sum.inputTokens + r.tokenUsage.inputTokens,
      outputTokens: sum.outputTokens + r.tokenUsage.outputTokens,
      cacheReadTokens: sum.cacheReadTokens + r.tokenUsage.cacheReadTokens,
      cacheWriteTokens: sum.cacheWriteTokens + r.tokenUsage.cacheWriteTokens,
      totalTokens: sum.totalTokens + r.tokenUsage.totalTokens,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 },
  );
  // Cost is summed ONLY when every record carries one: a partial sum would silently under-report,
  // and "not measured" must stay visible rather than reading as a cheap run.
  const allCosted = records.length > 0 && records.every((r) => r.costUsd !== undefined);
  const totalCostUsd = allCosted ? records.reduce((sum, r) => sum + (r.costUsd ?? 0), 0) : undefined;
  return {
    ...(totalCostUsd !== undefined
      ? { totalCostUsd, avgCostUsdPerRun: totalCostUsd / records.length }
      : {}),
    total: records.length,
    passed,
    taskSuccessRate: records.length === 0 ? 0 : passed / records.length,
    recoverySuccessRate:
      recoveryRuns.length === 0 ? 1 : recoveryRuns.filter((r) => r.ok && r.recovered).length / recoveryRuns.length,
    approvalLatencyP50Ms: median(records.flatMap((r) => r.approvalLatencyMs)),
    toolErrorRate: toolCalls === 0 ? 0 : records.reduce((sum, r) => sum + r.toolErrors, 0) / toolCalls,
    navigationValidationFailureRate:
      validationCalls === 0
        ? 0
        : records.reduce((sum, r) => sum + r.navigationValidationFailures, 0) / validationCalls,
    escapeRate:
      escapeEligible.length === 0 ? 0 : escapeEligible.filter((r) => r.escaped).length / escapeEligible.length,
    tokenUsage,
    stepLatencyP50Ms: median(allStepDurations),
    stepLatencyP95Ms: percentile(allStepDurations, 0.95),
    runDurationP50Ms: median(records.map((r) => r.stepDurationMs)),
    runWallClockP50Ms: median(records.flatMap((r) => r.wallClocksMs)),
    avgToolCallsPerRun: records.length === 0 ? 0 : toolCalls / records.length,
    avgTokensPerRun: records.length === 0 ? 0 : tokenUsage.totalTokens / records.length,
    firstAttemptSuccessRate:
      records.length === 0
        ? 0
        : records.filter((r) => r.ok && r.toolErrors === 0 && !r.recovered).length / records.length,
  };
}
