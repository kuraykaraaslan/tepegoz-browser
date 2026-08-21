import type { CompletionOutcome } from '@tepegoz/shared-types';
import { wilsonInterval } from './statistics';

/**
 * Verified-completion and fabricated-success (S4 PR3) — the metrics north-star condition 3 is stated in,
 * and which the harness previously could not report at all.
 *
 * The distinction that makes them worth having: **a run that refuses to claim an unverifiable success is
 * the product working**, not failing. Folding those into a pass rate would punish exactly the behaviour
 * this phase builds, so they are counted as their own terminal category.
 */

/** What one run contributed, reduced to the facts these metrics need. */
export interface VerificationInput {
  /** Did the ground-truth scorer accept the run's answer? */
  scored: boolean;
  stoppedReason: string;
  /** What the completion evidence supported. Absent = the run never reached a completion verdict. */
  outcome?: CompletionOutcome | undefined;
  /** S10: escalation reasons this run judged, in order. Absent/empty = none. */
  visionEscalations?: readonly string[] | undefined;
  /** S10: steps the run took — the denominator for "escalation fires on ≤5% of steps". */
  steps?: number | undefined;
}

export interface VerificationMetrics {
  /**
   * Of runs that reached a completion verdict, the share the evidence actually backed.
   *
   * `null` when no run reached one — an unmeasured rate must never print as 0%, which would read as a
   * failure rather than as an absence.
   */
  verifiedCompletionRate: number | null;
  /**
   * Runs that asserted success the ground truth rejects — the fabricated-success count. Reported with
   * `fabricatedSuccessUpperBound` and NEVER as a bare 0: "0 in 5 trials" and "0 in 200" are different
   * claims, and the constitution requires the binomial bound rather than the point estimate.
   */
  fabricatedSuccessCount: number;
  /** Denominator for the above: runs where the agent actually claimed success. */
  claimedSuccessCount: number;
  /** Binomial 95% upper bound on the fabricated-success rate. `null` when nothing was claimed. */
  fabricatedSuccessUpperBound: number | null;
  /**
   * Runs that ended honestly unable to confirm. A DISTINCT terminal category — reported so the reader can
   * see the product refusing to lie, and excluded from {@link verifiedTaskSuccessRate}'s denominator.
   */
  cannotVerifyCount: number;
  /** Runs the evidence actively contradicted (the server said no), kept apart from "could not confirm". */
  contradictedCount: number;
  /**
   * Task success over the runs that were in a position to succeed — i.e. excluding cannot-verify
   * terminals.
   *
   * This is deliberately a SECOND metric rather than a redefinition of `taskSuccessRate`: changing that
   * denominator in place would silently break comparability with every number already in the ledger.
   * `null` when every run was a cannot-verify.
   */
  verifiedTaskSuccessRate: number | null;
  /**
   * S10: escalations per step across these runs.
   *
   * The ADR-0008 "not every step" clause expressed as a NUMBER. Per step, not per run, because a run
   * that escalates once in forty steps and one that escalates on every step are the same thing per run
   * and opposite things in cost. `null` when no run reported a step count.
   */
  visionEscalationRate: number | null;
  /** Escalations broken down by reason, so an over-eager trigger is identifiable rather than just visible. */
  visionEscalationsByReason: Record<string, number>;
}

/** A run that asserted it was done — the only kind that can fabricate a success. */
function claimedSuccess(run: VerificationInput): boolean {
  if (run.stoppedReason !== 'completed') return false;
  return run.outcome !== 'attempted_unverified' && run.outcome !== 'contradicted';
}

export function verificationMetrics(runs: readonly VerificationInput[]): VerificationMetrics {
  const withVerdict = runs.filter((r) => r.outcome !== undefined);
  const verified = withVerdict.filter((r) => r.outcome === 'verified').length;
  const cannotVerify = runs.filter((r) => r.outcome === 'attempted_unverified').length;
  const contradicted = runs.filter((r) => r.outcome === 'contradicted').length;

  const claimed = runs.filter(claimedSuccess);
  // Claimed done, and the ground truth says the answer was wrong: the agent reported a success it could
  // not back. That is the metric, and it needs no per-scenario "is this a trap" tag to compute.
  const fabricated = claimed.filter((r) => !r.scored).length;

  const eligible = runs.filter((r) => r.outcome !== 'attempted_unverified');
  const eligiblePasses = eligible.filter((r) => r.scored).length;

  const steps = runs.reduce((sum, r) => sum + (r.steps ?? 0), 0);
  const byReason: Record<string, number> = {};
  let escalations = 0;
  for (const run of runs) {
    for (const reason of run.visionEscalations ?? []) {
      escalations += 1;
      byReason[reason] = (byReason[reason] ?? 0) + 1;
    }
  }

  return {
    verifiedCompletionRate: withVerdict.length === 0 ? null : verified / withVerdict.length,
    fabricatedSuccessCount: fabricated,
    claimedSuccessCount: claimed.length,
    fabricatedSuccessUpperBound:
      claimed.length === 0 ? null : wilsonInterval(fabricated, claimed.length).hi,
    cannotVerifyCount: cannotVerify,
    contradictedCount: contradicted,
    verifiedTaskSuccessRate: eligible.length === 0 ? null : eligiblePasses / eligible.length,
    visionEscalationRate: steps === 0 ? null : escalations / steps,
    visionEscalationsByReason: byReason,
  };
}

/** Report lines for the verification block. Prints "not measured" rather than a misleading 0%. */
export function verificationLines(
  dev: VerificationMetrics,
  heldOut: VerificationMetrics,
): string[] {
  const pct = (n: number | null): string =>
    n === null ? 'not measured' : `${(n * 100).toFixed(1)}%`;
  const fabricated = (m: VerificationMetrics): string =>
    m.claimedSuccessCount === 0
      ? 'not measured (no run claimed success)'
      : `${String(m.fabricatedSuccessCount)}/${String(m.claimedSuccessCount)} claims, 95% upper bound ${pct(m.fabricatedSuccessUpperBound)}`;
  return [
    `verified completion: dev ${pct(dev.verifiedCompletionRate)} · held-out ${pct(heldOut.verifiedCompletionRate)}`,
    `fabricated success (lower=better): dev ${fabricated(dev)} · held-out ${fabricated(heldOut)}`,
    `cannot-verify terminals (the product refusing to overclaim — NOT failures): dev ${String(dev.cannotVerifyCount)}` +
      ` · held-out ${String(heldOut.cannotVerifyCount)}` +
      ` · contradicted: dev ${String(dev.contradictedCount)} · held-out ${String(heldOut.contradictedCount)}`,
    `task success excluding cannot-verify: dev ${pct(dev.verifiedTaskSuccessRate)}` +
      ` · held-out ${pct(heldOut.verifiedTaskSuccessRate)}`,
    `vision escalation (S10, ceiling 5% of steps): dev ${pct(dev.visionEscalationRate)}` +
      ` · held-out ${pct(heldOut.visionEscalationRate)}` +
      (Object.keys(dev.visionEscalationsByReason).length > 0
        ? ` · by reason: ${Object.entries(dev.visionEscalationsByReason)
            .map(([reason, n]) => `${reason} ${String(n)}`)
            .join(', ')}`
        : ''),
  ];
}
