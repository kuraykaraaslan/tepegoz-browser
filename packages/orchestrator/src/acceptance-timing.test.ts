import { describe, expect, it } from 'vitest';
import {
  estimateCostUsd,
  recordFromOutcomes,
  summarizeAcceptanceRuns,
  type AcceptanceRunRecord,
} from './acceptance-eval';
import type { StepOutcome, StopReason } from './executor';

function step(tool: string, durationMs: number, ok = true): StepOutcome {
  return ok
    ? { stepId: tool, tool, ok: true, result: {}, durationMs }
    : {
        stepId: tool,
        tool,
        ok: false,
        error: { isError: true, code: 'INTERNAL_ERROR', message: 'x', retryable: false },
        durationMs,
      };
}

function record(over: {
  id?: string;
  outcomes?: StepOutcome[];
  stoppedReason?: StopReason;
  ok?: boolean;
  recovered?: boolean;
  tokens?: { inputTokens: number; outputTokens: number };
} = {}): AcceptanceRunRecord {
  return recordFromOutcomes({
    scenarioId: over.id ?? 's',
    stoppedReason: over.stoppedReason ?? 'completed',
    outcomes: over.outcomes ?? [],
    ...(over.ok !== undefined ? { ok: over.ok } : {}),
    ...(over.recovered !== undefined ? { recovered: over.recovered } : {}),
    ...(over.tokens !== undefined ? { tokenUsage: over.tokens } : {}),
  });
}

describe('step timing on the run record', () => {
  it('sums step durations into the run total', () => {
    const rec = record({ outcomes: [step('a', 100), step('b', 250)] });
    expect(rec.stepDurationMs).toBe(350);
    expect(rec.stepDurationsMs).toEqual([100, 250]);
  });

  it('counts a FAILED step’s duration too — a slow failure is the case latency must surface', () => {
    const rec = record({ outcomes: [step('slow', 5_000, false)], stoppedReason: 'tool_error', ok: false });
    expect(rec.stepDurationMs).toBe(5_000);
  });

  it('is zero for a run that never executed a step', () => {
    expect(record().stepDurationMs).toBe(0);
  });
});

describe('latency + cost metrics', () => {
  it('reports median and p95 single-step latency across every run', () => {
    const metrics = summarizeAcceptanceRuns([
      record({ outcomes: [step('a', 10), step('b', 20)] }),
      record({ outcomes: [step('c', 30), step('d', 1_000)] }),
    ]);
    expect(metrics.stepLatencyP50Ms).toBe(25); // median of 10,20,30,1000
    expect(metrics.stepLatencyP95Ms).toBe(1_000); // the slow tail is visible, not averaged away
  });

  it('reports median run duration', () => {
    const metrics = summarizeAcceptanceRuns([
      record({ outcomes: [step('a', 100)] }),
      record({ outcomes: [step('b', 300)] }),
      record({ outcomes: [step('c', 500)] }),
    ]);
    expect(metrics.runDurationP50Ms).toBe(300);
  });

  it('reports average actions and tokens per run', () => {
    const metrics = summarizeAcceptanceRuns([
      record({ outcomes: [step('a', 1), step('b', 1)], tokens: { inputTokens: 100, outputTokens: 50 } }),
      record({ outcomes: [step('c', 1)], tokens: { inputTokens: 200, outputTokens: 50 } }),
    ]);
    expect(metrics.avgToolCallsPerRun).toBe(1.5);
    expect(metrics.avgTokensPerRun).toBe(200); // (150 + 250) / 2
  });

  it('is all zeros for an empty record set rather than NaN', () => {
    const metrics = summarizeAcceptanceRuns([]);
    expect(metrics.stepLatencyP50Ms).toBe(0);
    expect(metrics.stepLatencyP95Ms).toBe(0);
    expect(metrics.runDurationP50Ms).toBe(0);
    expect(metrics.avgToolCallsPerRun).toBe(0);
    expect(metrics.avgTokensPerRun).toBe(0);
    expect(metrics.firstAttemptSuccessRate).toBe(0);
  });
});

describe('firstAttemptSuccessRate', () => {
  it('counts a clean pass', () => {
    expect(summarizeAcceptanceRuns([record({ outcomes: [step('a', 1)] })]).firstAttemptSuccessRate).toBe(1);
  });

  it('excludes a run that only passed after a tool error', () => {
    const messy = record({ outcomes: [step('a', 1, false), step('b', 1)], ok: true });
    expect(summarizeAcceptanceRuns([messy]).firstAttemptSuccessRate).toBe(0);
    expect(summarizeAcceptanceRuns([messy]).taskSuccessRate).toBe(1); // still a success, just not first-attempt
  });

  it('excludes a run that needed recovery', () => {
    const recovered = record({ outcomes: [step('a', 1)], ok: true, recovered: true });
    expect(summarizeAcceptanceRuns([recovered]).firstAttemptSuccessRate).toBe(0);
  });

  it('excludes a failed run', () => {
    const failed = record({ outcomes: [step('a', 1)], ok: false, stoppedReason: 'max_steps' });
    expect(summarizeAcceptanceRuns([failed]).firstAttemptSuccessRate).toBe(0);
  });
});

describe('estimateCostUsd', () => {
  it('returns undefined without a rate — an unknown price must never read as $0.00', () => {
    expect(estimateCostUsd({ inputTokens: 1_000, outputTokens: 1_000 })).toBeUndefined();
  });

  it('prices input and output tokens separately', () => {
    const cost = estimateCostUsd(
      { inputTokens: 1_000_000, outputTokens: 500_000 },
      { inputPerMillion: 3, outputPerMillion: 15 },
    );
    expect(cost).toBeCloseTo(3 + 7.5, 6);
  });

  it('is zero for a run that spent no tokens', () => {
    expect(estimateCostUsd({ inputTokens: 0, outputTokens: 0 }, { inputPerMillion: 3, outputPerMillion: 15 })).toBe(0);
  });
});
