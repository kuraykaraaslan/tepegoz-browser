import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordFromOutcomes } from '@tepegoz/orchestrator';
import type { EvalScenario } from '@tepegoz/shared-types';
import { buildReport, formatReportTable, writeReport, type ScenarioResult } from './report';
import type { ScoreResult } from './scorer';
import { summarizeFamilies, summarizeRepeat } from './statistics';

const scenario = (id: string, heldOut = false): EvalScenario => ({
  id,
  task: `task ${id}`,
  target: { fixture: 'f' },
  success: { domAssertion: 'x' },
  heldOut,
  tags: ['smoke'],
});

function result(id: string, ok: boolean, heldOut = false): ScenarioResult {
  const score: ScoreResult = { ok, method: 'ground-truth', reason: ok ? 'page contains "x"' : 'final page missing "x"' };
  return {
    scenario: scenario(id, heldOut),
    score,
    record: recordFromOutcomes({
      scenarioId: id,
      stoppedReason: ok ? 'completed' : 'max_steps',
      outcomes: [],
      tokenUsage: { inputTokens: 10, outputTokens: 5 },
      wallClockMs: 1000,
      ok,
    }),
  };
}

describe('buildReport', () => {
  it('separates dev and held-out metrics and lists every scenario (no cherry-picking)', () => {
    const report = buildReport({
      model: 'claude-opus-4-8',
      threshold: 0.8,
      generatedAt: '2026-07-08T00:00:00.000Z',
      results: [result('a', true), result('b', false), result('h', true, true)],
    });
    expect(report.n).toBe(3);
    expect(report.dev.n).toBe(2);
    expect(report.dev.metrics.taskSuccessRate).toBe(0.5); // a passed, b failed
    expect(report.heldOut.n).toBe(1);
    expect(report.heldOut.metrics.taskSuccessRate).toBe(1);
    expect(report.thresholdMet).toBe(false); // 0.5 < 0.8
    expect(report.scenarios.map((s) => s.id)).toEqual(['a', 'b', 'h']);
    expect(report.scenarios.find((s) => s.id === 'b')?.ok).toBe(false);
  });

  it('marks thresholdMet when the dev pass rate clears the bar', () => {
    const report = buildReport({
      model: 'm',
      threshold: 0.5,
      generatedAt: 't',
      results: [result('a', true), result('b', true)],
    });
    expect(report.dev.metrics.taskSuccessRate).toBe(1);
    expect(report.thresholdMet).toBe(true);
  });
});

describe('formatReportTable / writeReport', () => {
  it('renders a PASS/FAIL line per scenario and flags held-out', () => {
    const table = formatReportTable(
      buildReport({ model: 'm', threshold: 0.8, generatedAt: 't', results: [result('a', true), result('h', false, true)] }),
    );
    expect(table).toContain('PASS');
    expect(table).toContain('FAIL');
    expect(table).toContain('[held-out]');
  });

  it('writes the JSON artifact to disk and returns its path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-eval-rep-'));
    try {
      const report = buildReport({ model: 'm', threshold: 0.8, generatedAt: 't', results: [result('a', true)] });
      const path = writeReport(dir, report);
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { model: string; scenarios: unknown[] };
      expect(parsed.model).toBe('m');
      expect(parsed.scenarios).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('M1: carries the repeat block and renders pooled Wilson CIs + flaky tags', () => {
    const report = buildReport({
      model: 'm',
      threshold: 0.8,
      generatedAt: 't',
      results: [result('a', true), result('b', false)],
      repeat: summarizeRepeat(
        [
          { id: 'a', heldOut: false, passes: 3 },
          { id: 'b', heldOut: false, passes: 1 },
        ],
        3,
      ),
    });
    expect(report.repeat?.pooled.dev).toMatchObject({ k: 4, n: 6 });
    const table = formatReportTable(report);
    expect(table).toContain('pooled per-trial (Wilson 95%)');
    expect(table).toContain('[flaky]');
    expect(table).toContain('1/3');
  });

  it('M1: carries per-tag pooled family aggregates and renders pass + escape CIs', () => {
    const families = summarizeFamilies(
      [
        { id: 'a', heldOut: false, tags: ['escape'], passes: 2, escapes: 1, escapeEligible: true },
        { id: 'b', heldOut: false, tags: ['escape'], passes: 1, escapes: 0, escapeEligible: true },
      ],
      3,
    );
    const report = buildReport({
      model: 'm',
      threshold: 0.8,
      generatedAt: 't',
      results: [result('a', true), result('b', false)],
      families,
    });
    expect(report.families?.[0]).toMatchObject({ tag: 'escape', scenarios: 2 });
    const table = formatReportTable(report);
    expect(table).toContain('families (pooled dev per-trial, Wilson 95%)');
    expect(table).toContain('escape (2 scen): pass');
    expect(table).toContain('· escape'); // the escape-rate companion is rendered
  });

  it('M1: spend reads "not measured" without a rate — never $0', () => {
    const table = formatReportTable(
      buildReport({ model: 'm', threshold: 0.8, generatedAt: 't', results: [result('a', true)] }),
    );
    expect(table).toContain('not measured');
    expect(table).not.toContain('$0.0000/run');
    // Wall-clock line is always present (the record field is required).
    expect(table).toContain('run (wall-clock) p50');
  });
});
