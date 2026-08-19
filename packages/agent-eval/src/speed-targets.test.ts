import { describe, expect, it } from 'vitest';
import {
  COMPLETION_EQUIVALENCE_MARGIN_PP,
  COST_TARGET_REDUCTION,
  S0_BASELINE_UNMEASURED,
  WALL_CLOCK_TARGET_REDUCTION,
  meetsSpeedGate,
  speedLines,
  speedVerdict,
  type SpeedBaseline,
} from './speed-targets';

const measured: SpeedBaseline = {
  p50WallClockMs: 100_000,
  dollarsPerTask: 1,
  verifiedCompletionRate: 0.6,
};

describe('the pre-registered targets', () => {
  it('are frozen at the numbers the phase states', () => {
    // If this test needs editing, the exam is being rewritten — which is the thing pre-registration
    // exists to make visible.
    expect(WALL_CLOCK_TARGET_REDUCTION).toBe(0.4);
    expect(COST_TARGET_REDUCTION).toBe(0.3);
    expect(COMPLETION_EQUIVALENCE_MARGIN_PP).toBe(5);
  });
});

describe('the missing baseline is a mechanical guard, not a note', () => {
  it('cannot produce a verdict from the UNMEASURED baseline, however good the after-numbers look', () => {
    const verdict = speedVerdict(S0_BASELINE_UNMEASURED, {
      p50WallClockMs: 1,
      dollarsPerTask: 0.001,
      verifiedCompletionRate: 0.99,
    });
    expect(verdict.wallClock).toBe('unmeasured');
    expect(verdict.cost).toBe('unmeasured');
    expect(verdict.completionEquivalence).toBe('unmeasured');
    expect(meetsSpeedGate(verdict)).toBe(false);
  });

  it('reports "not measured" rather than 0%, which would read as a measured failure', () => {
    const lines = speedLines(speedVerdict(S0_BASELINE_UNMEASURED, null)).join('\n');
    expect(lines).toContain('not measured');
    expect(lines).not.toContain('0.0%');
  });

  it('does not pass the gate on a partial baseline', () => {
    const half: SpeedBaseline = { ...measured, dollarsPerTask: null };
    const verdict = speedVerdict(half, {
      p50WallClockMs: 40_000,
      dollarsPerTask: 0.1,
      verifiedCompletionRate: 0.6,
    });
    expect(verdict.wallClock).toBe('met');
    expect(verdict.cost).toBe('unmeasured');
    expect(meetsSpeedGate(verdict)).toBe(false);
  });
});

describe('with a real baseline', () => {
  it('passes only when all three targets are met at once', () => {
    const verdict = speedVerdict(measured, {
      p50WallClockMs: 55_000, // 45% faster
      dollarsPerTask: 0.65, // 35% cheaper
      verifiedCompletionRate: 0.58, // -2pp, inside the margin
    });
    expect(meetsSpeedGate(verdict)).toBe(true);
  });

  it('FAILS on a speed win bought with a reliability loss', () => {
    // The guardrail is the point of the phase: an agent that is fast and wrong is not faster.
    const verdict = speedVerdict(measured, {
      p50WallClockMs: 20_000,
      dollarsPerTask: 0.2,
      verifiedCompletionRate: 0.5, // -10pp
    });
    expect(verdict.wallClock).toBe('met');
    expect(verdict.completionEquivalence).toBe('missed');
    expect(meetsSpeedGate(verdict)).toBe(false);
  });

  it('counts a reliability IMPROVEMENT outside the margin as non-equivalent too', () => {
    // Equivalence is two-sided on purpose. A large jump means the two arms differed in more than speed,
    // so the comparison is not measuring what it claims to.
    const verdict = speedVerdict(measured, {
      p50WallClockMs: 55_000,
      dollarsPerTask: 0.65,
      verifiedCompletionRate: 0.75,
    });
    expect(verdict.completionEquivalence).toBe('missed');
  });

  it('misses the wall-clock target on a reduction that falls short', () => {
    const verdict = speedVerdict(measured, {
      p50WallClockMs: 70_000, // 30% — short of 40%
      dollarsPerTask: 0.65,
      verifiedCompletionRate: 0.6,
    });
    expect(verdict.wallClock).toBe('missed');
  });
});
