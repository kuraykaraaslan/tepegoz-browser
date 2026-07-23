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
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
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
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
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
  tokenUsage?: { inputTokens: number; outputTokens: number } | undefined;
  recovered?: boolean | undefined;
  requiresRecovery?: boolean | undefined;
  ok?: boolean | undefined;
  /** AI-7: did the run escape the on-page route (off-site nav / web_search)? Default false. */
  escaped?: boolean | undefined;
  /** AI-7: is this run eligible for the escape signal (on-page-answerable)? Default true. */
  escapeEligible?: boolean | undefined;
}): AcceptanceRunRecord {
  const usage = input.tokenUsage ?? { inputTokens: 0, outputTokens: 0 };
  return {
    scenarioId: input.scenarioId,
    requiresRecovery: input.requiresRecovery ?? false,
    ok: input.ok ?? input.stoppedReason === 'completed',
    stoppedReason: input.stoppedReason,
    toolCalls: input.outcomes.length,
    toolErrors: input.outcomes.filter((o) => !o.ok).length,
    approvalCount: input.approvalLatencyMs?.length ?? 0,
    approvalLatencyMs: input.approvalLatencyMs ?? [],
    tokenUsage: { ...usage, totalTokens: usage.inputTokens + usage.outputTokens },
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
  const tokenUsage = records.reduce(
    (sum, r) => ({
      inputTokens: sum.inputTokens + r.tokenUsage.inputTokens,
      outputTokens: sum.outputTokens + r.tokenUsage.outputTokens,
      totalTokens: sum.totalTokens + r.tokenUsage.totalTokens,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
  return {
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
  };
}
