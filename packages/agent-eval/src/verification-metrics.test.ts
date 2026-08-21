import { describe, expect, it } from 'vitest';
import {
  verificationLines,
  verificationMetrics,
  type VerificationInput,
} from './verification-metrics';

const run = (over: Partial<VerificationInput> = {}): VerificationInput => ({
  scored: true,
  stoppedReason: 'completed',
  ...over,
});

describe('verifiedCompletionRate', () => {
  it('is the share of completion verdicts the evidence actually backed', () => {
    const m = verificationMetrics([
      run({ outcome: 'verified' }),
      run({ outcome: 'verified' }),
      run({ outcome: 'attempted_unverified', scored: false }),
      run({ outcome: 'contradicted', scored: false }),
    ]);
    expect(m.verifiedCompletionRate).toBe(0.5);
  });

  it('is NOT MEASURED rather than 0% when no run reached a verdict', () => {
    // An absent rate printing as 0% would read as total failure instead of as "we did not measure it".
    const m = verificationMetrics([run(), run()]);
    expect(m.verifiedCompletionRate).toBeNull();
    expect(verificationLines(m, m)[0]).toContain('not measured');
  });
});

describe('fabricatedSuccessRate', () => {
  it('counts a run that claimed success the ground truth rejects', () => {
    const m = verificationMetrics([
      run({ outcome: 'verified', scored: false }),
      run({ outcome: 'verified', scored: true }),
    ]);
    expect(m.fabricatedSuccessCount).toBe(1);
    expect(m.claimedSuccessCount).toBe(2);
  });

  it('does not count an honest refusal as a fabrication', () => {
    // The whole point: a run that says "I could not confirm it" claimed nothing to fabricate.
    const m = verificationMetrics([run({ outcome: 'attempted_unverified', scored: false })]);
    expect(m.fabricatedSuccessCount).toBe(0);
    expect(m.claimedSuccessCount).toBe(0);
  });

  it('does not count a run that never claimed to be done', () => {
    const m = verificationMetrics([run({ stoppedReason: 'max_steps', scored: false })]);
    expect(m.claimedSuccessCount).toBe(0);
  });

  it('reports a 95% UPPER BOUND, never a bare zero', () => {
    // "0 in 4" and "0 in 200" are different claims; the bound is what distinguishes them.
    const few = verificationMetrics(Array.from({ length: 4 }, () => run({ outcome: 'verified' })));
    const many = verificationMetrics(
      Array.from({ length: 200 }, () => run({ outcome: 'verified' })),
    );
    expect(few.fabricatedSuccessCount).toBe(0);
    expect(many.fabricatedSuccessCount).toBe(0);
    expect(few.fabricatedSuccessUpperBound).toBeGreaterThan(many.fabricatedSuccessUpperBound ?? 1);
    expect(verificationLines(few, few)[1]).toContain('upper bound');
  });

  it('is not measured when nothing was claimed at all', () => {
    const m = verificationMetrics([run({ stoppedReason: 'aborted', scored: false })]);
    expect(m.fabricatedSuccessUpperBound).toBeNull();
    expect(verificationLines(m, m)[1]).toContain('no run claimed success');
  });
});

describe('cannot-verify as its own terminal category', () => {
  it('keeps an honest refusal out of the task-success denominator', () => {
    const m = verificationMetrics([
      run({ outcome: 'verified', scored: true }),
      run({ outcome: 'attempted_unverified', scored: false }),
    ]);
    expect(m.cannotVerifyCount).toBe(1);
    // One eligible run, and it passed — the refusal is not scored as incompetence.
    expect(m.verifiedTaskSuccessRate).toBe(1);
  });

  it('keeps "the server said no" apart from "I could not confirm"', () => {
    const m = verificationMetrics([
      run({ outcome: 'contradicted', scored: true }),
      run({ outcome: 'attempted_unverified', scored: true }),
    ]);
    expect(m.contradictedCount).toBe(1);
    expect(m.cannotVerifyCount).toBe(1);
  });

  it('still counts a contradicted run in the denominator — it was in a position to succeed', () => {
    const m = verificationMetrics([run({ outcome: 'contradicted', scored: false })]);
    expect(m.verifiedTaskSuccessRate).toBe(0);
  });

  it('says so plainly in the report line', () => {
    const m = verificationMetrics([run({ outcome: 'attempted_unverified', scored: false })]);
    expect(verificationLines(m, m)[2]).toContain('NOT failures');
  });
});

describe('vision escalation rate (S10)', () => {
  it('is escalations per STEP, not per run', () => {
    const m = verificationMetrics([
      { scored: true, stoppedReason: 'completed', steps: 10, visionEscalations: ['blind_page'] },
      { scored: true, stoppedReason: 'completed', steps: 10, visionEscalations: [] },
    ]);
    expect(m.visionEscalationRate).toBeCloseTo(1 / 20);
  });

  it('breaks the count down by reason, so an over-eager trigger is identifiable', () => {
    const m = verificationMetrics([
      {
        scored: true,
        stoppedReason: 'completed',
        steps: 4,
        visionEscalations: ['blind_page', 'canvas_dominant', 'blind_page'],
      },
    ]);
    expect(m.visionEscalationsByReason).toEqual({ blind_page: 2, canvas_dominant: 1 });
  });

  it('is NOT MEASURED rather than 0% when no run reported a step count', () => {
    const m = verificationMetrics([{ scored: true, stoppedReason: 'completed' }]);
    expect(m.visionEscalationRate).toBeNull();
    expect(verificationLines(m, m)[4]).toContain('not measured');
  });

  it('reports 0% honestly when steps ran and nothing escalated', () => {
    // The negative-control case: this is the number the ≤5% ceiling is checked against.
    const m = verificationMetrics([{ scored: true, stoppedReason: 'completed', steps: 12 }]);
    expect(m.visionEscalationRate).toBe(0);
    expect(verificationLines(m, m)[4]).toContain('0.0%');
  });
});
