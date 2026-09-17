import { describe, expect, it } from 'vitest';
import { buildRunReport, renderRunReportMarkdown, type RunReport } from './run-report';
import type { EventRecord } from '@tepegoz/shared-types';

const ev = (over: Partial<EventRecord> = {}): EventRecord => ({
  lsn: 1,
  id: '00000000-0000-4000-8000-000000000001',
  type: 'AgentStepExecuted',
  ts: 1000,
  actor: 'agent',
  correlationId: 'run-1',
  payload: { kind: 'step_ok', message: 'Opened https://example.com' },
  redacted: true,
  deviceId: 'device-1',
  ...over,
});

describe('buildRunReport', () => {
  it('drops events from a different correlationId rather than trusting the caller’s slice', () => {
    const report = buildRunReport({
      runId: 'run-1',
      goal: 'Book a table',
      generatedAt: 5000,
      events: [ev({ lsn: 1 }), ev({ lsn: 2, correlationId: 'run-2' })],
    });
    expect(report.steps).toHaveLength(1);
  });

  it('orders steps by lsn, not by the order events were handed in, and computes latency between them', () => {
    const report = buildRunReport({
      runId: 'run-1',
      goal: 'Book a table',
      generatedAt: 5000,
      events: [
        ev({ lsn: 2, ts: 1500, id: 'b', payload: { kind: 'step_ok', message: 'second' } }),
        ev({ lsn: 1, ts: 1000, id: 'a', payload: { kind: 'step_start', message: 'first' } }),
      ],
    });
    expect(report.steps.map((s) => s.message)).toEqual(['first', 'second']);
    expect(report.steps[0]!.latencyMs).toBeNull();
    expect(report.steps[1]!.latencyMs).toBe(500);
  });

  it('extracts message/detail from the {kind,message,detail} shape journaled agent events carry', () => {
    const report = buildRunReport({
      runId: 'run-1',
      goal: 'x',
      generatedAt: 0,
      events: [
        ev({
          type: 'PolicyBlocked',
          payload: { kind: 'step_error', message: 'blocked', detail: 'destructive tier' },
        }),
      ],
    });
    expect(report.steps[0]).toMatchObject({ message: 'blocked', detail: 'destructive tier' });
  });

  it('falls back to a compact JSON preview for a payload shape with no message field (e.g. CheckpointWritten)', () => {
    const report = buildRunReport({
      runId: 'run-1',
      goal: 'x',
      generatedAt: 0,
      events: [ev({ type: 'CheckpointWritten', payload: { plan: 'p1', lastStep: 3 } })],
    });
    expect(report.steps[0]!.message).toContain('"plan":"p1"');
    expect(report.steps[0]!.detail).toBeUndefined();
  });

  it('truncates an oversized unrecognized payload rather than embedding it whole', () => {
    const report = buildRunReport({
      runId: 'run-1',
      goal: 'x',
      generatedAt: 0,
      events: [ev({ type: 'CheckpointWritten', payload: { blob: 'x'.repeat(1000) } })],
    });
    expect(report.steps[0]!.message.length).toBeLessThan(450);
    expect(report.steps[0]!.message.endsWith('…')).toBe(true);
  });

  it('reports terminal:known:false when no TaskSucceeded/TaskFailed event was journaled', () => {
    const report = buildRunReport({
      runId: 'run-1',
      goal: 'x',
      generatedAt: 0,
      events: [ev({ lsn: 1 })],
    });
    expect(report.terminal).toEqual({ known: false });
    expect(report.endedAt).toBe(1000);
  });

  it('reports the LAST terminal event as the outcome, and ends the run at its timestamp', () => {
    const report = buildRunReport({
      runId: 'run-1',
      goal: 'x',
      generatedAt: 0,
      events: [
        ev({ lsn: 1, ts: 1000 }),
        ev({
          lsn: 2,
          ts: 2000,
          type: 'TaskSucceeded',
          payload: { kind: 'done', message: 'Task complete' },
        }),
      ],
    });
    expect(report.terminal).toEqual({
      known: true,
      outcome: 'succeeded',
      message: 'Task complete',
      ts: 2000,
    });
    expect(report.endedAt).toBe(2000);
  });

  it('reports a failed terminal event as failed', () => {
    const report = buildRunReport({
      runId: 'run-1',
      goal: 'x',
      generatedAt: 0,
      events: [ev({ lsn: 1, type: 'TaskFailed', payload: { kind: 'error', message: 'boom' } })],
    });
    expect(report.terminal).toMatchObject({ known: true, outcome: 'failed' });
  });

  it('carries token usage through when the caller supplies it, and omits the field otherwise', () => {
    const withTokens = buildRunReport({
      runId: 'run-1',
      goal: 'x',
      generatedAt: 0,
      events: [],
      tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
    expect(withTokens.tokenUsage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });

    const without = buildRunReport({ runId: 'run-1', goal: 'x', generatedAt: 0, events: [] });
    expect(without.tokenUsage).toBeUndefined();
  });

  it('is null-safe start/end for a run with no events at all', () => {
    const report = buildRunReport({ runId: 'run-1', goal: 'x', generatedAt: 0, events: [] });
    expect(report.startedAt).toBeNull();
    expect(report.endedAt).toBeNull();
    expect(report.steps).toEqual([]);
  });
});

describe('renderRunReportMarkdown', () => {
  const base: RunReport = {
    runId: 'run-1',
    goal: 'Book a table for two',
    generatedAt: 3000,
    startedAt: 1000,
    endedAt: 2000,
    steps: [
      { lsn: 1, ts: 1000, type: 'AgentStepExecuted', message: 'Opened OpenTable', latencyMs: null },
      {
        lsn: 2,
        ts: 1500,
        type: 'PolicyBlocked',
        message: 'blocked',
        detail: 'destructive tier requires approval',
        latencyMs: 500,
      },
    ],
    terminal: { known: true, outcome: 'succeeded', message: 'Reservation confirmed', ts: 2000 },
    tokenUsage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
  };

  it('always labels itself as not a proof — the whole point of shipping it before the Notary is wired', () => {
    const md = renderRunReportMarkdown(base);
    expect(md).toContain('Not a proof');
  });

  it('includes the goal, run id, outcome and token usage in the header', () => {
    const md = renderRunReportMarkdown(base);
    expect(md).toContain('Book a table for two');
    expect(md).toContain('run-1');
    expect(md).toContain('Outcome: succeeded');
    expect(md).toContain('140 total (100 in / 40 out)');
  });

  it('numbers every step and inlines its latency and detail', () => {
    const md = renderRunReportMarkdown(base);
    expect(md).toContain('1. [');
    expect(md).toContain('start');
    expect(md).toContain('+500ms');
    expect(md).toContain('destructive tier requires approval');
  });

  it('says the outcome is unknown, without inventing one, when no terminal event was journaled', () => {
    const md = renderRunReportMarkdown({ ...base, terminal: { known: false } });
    expect(md).toContain('Outcome: unknown (no terminal event recorded)');
    expect(md).not.toContain('## Terminal');
  });

  it('says so, rather than rendering an empty section, when a run journaled no steps at all', () => {
    const md = renderRunReportMarkdown({ ...base, steps: [] });
    expect(md).toContain('No events were journaled for this run');
  });
});
