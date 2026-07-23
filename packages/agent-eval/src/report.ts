import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  summarizeAcceptanceRuns,
  type AcceptanceMetrics,
  type AcceptanceRunRecord,
} from '@tepegoz/orchestrator';
import type { EvalScenario } from '@tepegoz/shared-types';
import type { ScoreResult } from './scorer';
import type { Agreement } from './calibration';

/** One scenario's full outcome: the record fed to the metrics + the ground-truth score. */
export interface ScenarioResult {
  scenario: EvalScenario;
  record: AcceptanceRunRecord;
  score: ScoreResult;
}

export interface ReportInput {
  /** The model id that produced the run (headline honesty: which model, how many, what bar). */
  model: string;
  /** Pass-rate bar for the dev set — informational; the live tier's signal is the trend, not a hard gate. */
  threshold: number;
  results: ScenarioResult[];
  /** ISO timestamp; injected so the pure builder stays deterministic in tests. */
  generatedAt: string;
  /** LLM-judge↔human agreement over the calibration sample (live tier only). Recorded so a drifting
   *  judge is visible rather than silently trusted. */
  judgeAgreement?: Agreement;
}

export interface TierReport {
  n: number;
  metrics: AcceptanceMetrics;
}

export interface EvalReport {
  model: string;
  generatedAt: string;
  threshold: number;
  n: number;
  thresholdMet: boolean;
  /** The development set (drives the headline pass rate). */
  dev: TierReport;
  /** The held-out set — reported SEPARATELY and never used while developing a fix. */
  heldOut: TierReport;
  /** Judge↔human agreement (live tier), when a calibration sample was scored. */
  judge?: { agreementRate: number; n: number; disagreements: string[] };
  scenarios: Array<{
    id: string;
    heldOut: boolean;
    ok: boolean;
    method: ScoreResult['method'];
    reason: string;
    stoppedReason: string;
    tags: string[];
    totalTokens: number;
    /** AI-7: the run left the on-page route (off-site nav / web_search) — surfaced so an escape is visible
     *  even when the scenario still passed. */
    escaped: boolean;
  }>;
}

function tier(results: ScenarioResult[]): TierReport {
  return { n: results.length, metrics: summarizeAcceptanceRuns(results.map((r) => r.record)) };
}

/**
 * Aggregate every run into the machine-readable report: the dev + held-out {@link AcceptanceMetrics}
 * (held-out kept separate), the full per-scenario pass/fail list (no cherry-picking — a wrong answer
 * MUST show as a fail), and the model id + N + threshold for honest headline reporting. Pure.
 */
export function buildReport(input: ReportInput): EvalReport {
  const dev = input.results.filter((r) => !r.scenario.heldOut);
  const heldOut = input.results.filter((r) => r.scenario.heldOut);
  const devTier = tier(dev);
  return {
    model: input.model,
    generatedAt: input.generatedAt,
    threshold: input.threshold,
    n: input.results.length,
    thresholdMet: devTier.metrics.taskSuccessRate >= input.threshold,
    dev: devTier,
    heldOut: tier(heldOut),
    ...(input.judgeAgreement !== undefined
      ? {
          judge: {
            agreementRate: input.judgeAgreement.rate,
            n: input.judgeAgreement.n,
            disagreements: input.judgeAgreement.disagreements,
          },
        }
      : {}),
    scenarios: input.results.map((r) => ({
      id: r.scenario.id,
      heldOut: r.scenario.heldOut,
      ok: r.score.ok,
      method: r.score.method,
      reason: r.score.reason,
      stoppedReason: r.record.stoppedReason,
      tags: r.scenario.tags,
      totalTokens: r.record.tokenUsage.totalTokens,
      escaped: r.record.escaped,
    })),
  };
}

/** A human-readable summary table (full pass/fail list — the eval must be able to show a fail). */
export function formatReportTable(report: EvalReport): string {
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  const ms = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n).toString()}ms`);
  const rows = report.scenarios.map(
    (s) =>
      `  ${s.ok ? 'PASS' : 'FAIL'}  ${s.heldOut ? '[held-out] ' : ''}${s.id}${s.escaped ? ' [escaped]' : ''} — ${s.reason}`,
  );
  const judgeLine =
    report.judge !== undefined
      ? [`judge↔human agreement: ${pct(report.judge.agreementRate)} (${String(report.judge.n)} labelled)`]
      : [];
  return [
    `agent-eval · model=${report.model} · N=${String(report.n)} · threshold=${pct(report.threshold)}`,
    `dev task-success: ${pct(report.dev.metrics.taskSuccessRate)} (${String(report.dev.n)} scenarios)` +
      ` · held-out: ${pct(report.heldOut.metrics.taskSuccessRate)} (${String(report.heldOut.n)})`,
    `escape rate (AI-7, lower=better): dev ${pct(report.dev.metrics.escapeRate)}` +
      ` · held-out: ${pct(report.heldOut.metrics.escapeRate)}`,
    `first-attempt success (no tool error, no recovery): dev ${pct(report.dev.metrics.firstAttemptSuccessRate)}` +
      ` · held-out: ${pct(report.heldOut.metrics.firstAttemptSuccessRate)}`,
    `dev cost: ${report.dev.metrics.avgToolCallsPerRun.toFixed(1)} actions/run` +
      ` · ${Math.round(report.dev.metrics.avgTokensPerRun).toString()} tokens/run`,
    `dev latency: step p50 ${ms(report.dev.metrics.stepLatencyP50Ms)} · p95 ${ms(report.dev.metrics.stepLatencyP95Ms)}` +
      ` · run (sum-of-steps) p50 ${ms(report.dev.metrics.runDurationP50Ms)}`,
    `threshold ${report.thresholdMet ? 'met' : 'NOT met'}`,
    ...judgeLine,
    ...rows,
  ].join('\n');
}

/** Write the JSON artifact and return its path. */
export function writeReport(dir: string, report: EvalReport, fileName = 'agent-eval-report.json'): string {
  const path = join(dir, fileName);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return path;
}
