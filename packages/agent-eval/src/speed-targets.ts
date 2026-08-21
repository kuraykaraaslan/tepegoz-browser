/**
 * Pre-registered speed targets (S7 PR1).
 *
 * The phase asks for the targets to be frozen *before* any capability code, so the exam cannot be
 * rewritten around the answer. The relative targets below are frozen here. The **baselines they are
 * relative to are not measured yet** — S0's full-registry sweep needs a funded key — and that absence is
 * the interesting part of this file.
 *
 * The phase doc guarded that with a sentence ("PR2+ may not merge until this block is filled from real
 * S0 numbers"). A sentence is not a guard; someone in a hurry reads past it, and a floating target is
 * exactly the failure the rule exists to prevent. So the guard is mechanical instead: **there is no way
 * to obtain a speed verdict without supplying a real baseline number.** `speedVerdict` takes the
 * baseline as a required argument and returns `unmeasured` for a null one. Nothing in this module can
 * produce "target met" from thin air, and nothing prints a 0% that would read as a measured result.
 */

/** p50 wall-clock per task must fall by at least this much vs the S0 baseline. Program gate G7. */
export const WALL_CLOCK_TARGET_REDUCTION = 0.4;
/** `$` per task must fall by at least this much vs the S0 baseline. */
export const COST_TARGET_REDUCTION = 0.3;
/**
 * Verified-completion may move by at most this much in either direction. An equivalence margin, not a
 * "did not obviously break": a speed win bought with a reliability loss is not a win, and the measured
 * failure mode is on-page errors — precisely what a skipped validation pass would let through.
 */
export const COMPLETION_EQUIVALENCE_MARGIN_PP = 5;

/**
 * The S0 baseline this phase is measured against.
 *
 * `null` means UNMEASURED, not zero. Filling these in is S0's sweep, not S7's — and until they are
 * filled, {@link speedVerdict} refuses to return a pass or a fail.
 */
export interface SpeedBaseline {
  /** p50 wall-clock per task on the acceptance family, in ms. */
  p50WallClockMs: number | null;
  /** Mean `$` per task on the acceptance family. */
  dollarsPerTask: number | null;
  /** Verified-completion rate on the pooled families, 0–1. */
  verifiedCompletionRate: number | null;
}

export const S0_BASELINE_UNMEASURED: SpeedBaseline = {
  p50WallClockMs: null,
  dollarsPerTask: null,
  verifiedCompletionRate: null,
};

export interface SpeedMeasurement {
  p50WallClockMs: number;
  dollarsPerTask: number;
  verifiedCompletionRate: number;
}

export type TargetStatus = 'met' | 'missed' | 'unmeasured';

export interface SpeedVerdict {
  wallClock: TargetStatus;
  cost: TargetStatus;
  /** The guardrail. `missed` here blocks the phase regardless of how good the other two look. */
  completionEquivalence: TargetStatus;
  /** Observed reductions, 0–1. Null while unmeasured. */
  wallClockReduction: number | null;
  costReduction: number | null;
  completionDeltaPp: number | null;
}

const reduction = (before: number, after: number): number =>
  before <= 0 ? 0 : (before - after) / before;

/**
 * Compare a measurement against the pre-registered targets.
 *
 * Every branch that lacks a real baseline returns `unmeasured`. There is deliberately no default
 * baseline, no "assume the old value", and no overload that takes only the after-numbers: a verdict
 * without a baseline is not a weaker claim, it is not a claim at all.
 */
export function speedVerdict(
  baseline: SpeedBaseline,
  after: SpeedMeasurement | null,
): SpeedVerdict {
  if (after === null) {
    return {
      wallClock: 'unmeasured',
      cost: 'unmeasured',
      completionEquivalence: 'unmeasured',
      wallClockReduction: null,
      costReduction: null,
      completionDeltaPp: null,
    };
  }
  const wallBase = baseline.p50WallClockMs;
  const costBase = baseline.dollarsPerTask;
  const rateBase = baseline.verifiedCompletionRate;

  const wallClockReduction = wallBase === null ? null : reduction(wallBase, after.p50WallClockMs);
  const costReduction = costBase === null ? null : reduction(costBase, after.dollarsPerTask);
  const completionDeltaPp =
    rateBase === null ? null : (after.verifiedCompletionRate - rateBase) * 100;

  const status = (value: number | null, met: (v: number) => boolean): TargetStatus =>
    value === null ? 'unmeasured' : met(value) ? 'met' : 'missed';

  return {
    wallClock: status(wallClockReduction, (v) => v >= WALL_CLOCK_TARGET_REDUCTION),
    cost: status(costReduction, (v) => v >= COST_TARGET_REDUCTION),
    completionEquivalence: status(
      completionDeltaPp,
      (v) => Math.abs(v) <= COMPLETION_EQUIVALENCE_MARGIN_PP,
    ),
    wallClockReduction,
    costReduction,
    completionDeltaPp,
  };
}

/** True only when all three pre-registered targets are met. An `unmeasured` anywhere is not a pass. */
export function meetsSpeedGate(verdict: SpeedVerdict): boolean {
  return (
    verdict.wallClock === 'met' && verdict.cost === 'met' && verdict.completionEquivalence === 'met'
  );
}

/** Ledger lines. Prints "not measured" and never a 0% that would read as a measured result. */
export function speedLines(verdict: SpeedVerdict): string[] {
  const pct = (n: number | null): string =>
    n === null ? 'not measured' : `${(n * 100).toFixed(1)}%`;
  return [
    `wall-clock p50 reduction (target ≥${String(WALL_CLOCK_TARGET_REDUCTION * 100)}%): ` +
      `${pct(verdict.wallClockReduction)} — ${verdict.wallClock}`,
    `$/task reduction (target ≥${String(COST_TARGET_REDUCTION * 100)}%): ` +
      `${pct(verdict.costReduction)} — ${verdict.cost}`,
    `verified-completion delta (must stay within ±${String(COMPLETION_EQUIVALENCE_MARGIN_PP)}pp): ` +
      `${verdict.completionDeltaPp === null ? 'not measured' : `${verdict.completionDeltaPp.toFixed(1)}pp`}` +
      ` — ${verdict.completionEquivalence}`,
  ];
}
